import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ReactComponent as SearchIcon } from '../../assets/Search.svg';
import { ReactComponent as TrashIcon } from '../../assets/Trash can.svg';
import { ReactComponent as PencilIcon } from '../../assets/pencil-ai.svg';
import { ReactComponent as ExpandIcon } from '../../assets/expand.svg';
import * as chatService from '../../services/chatService';
import DeleteConfirmationModal from '../DeleteConfirmationModal';
import { useIsMobile } from '../../hooks/useIsMobile';

// CSS for blinking cursor animation
const titleAnimationStyles = `
    @keyframes blink {
        0%, 50% { opacity: 1; }
        51%, 100% { opacity: 0; }
    }
    .title-cursor {
        display: inline-block;
        width: 2px;
        height: 14px;
        background: #32302C;
        margin-left: 2px;
        animation: blink 0.8s infinite;
        vertical-align: middle;
    }
`;

// Maximum conversations to cache (prevents quota exceeded)
const MAX_CACHED_CONVERSATIONS = 50;

// Safe sessionStorage wrapper - handles quota exceeded errors gracefully
const safeSessionStorage = {
    setItem: (key, value) => {
        try {
            // For conversations, limit to prevent quota issues
            if (key === 'koda_chat_conversations') {
                try {
                    let parsed = JSON.parse(value);
                    if (Array.isArray(parsed) && parsed.length > MAX_CACHED_CONVERSATIONS) {
                        console.log(`📦 [ChatHistory] Trimming conversations cache from ${parsed.length} to ${MAX_CACHED_CONVERSATIONS}`);
                        parsed = parsed.slice(0, MAX_CACHED_CONVERSATIONS);
                        value = JSON.stringify(parsed);
                    }
                } catch (parseErr) {
                    // If parsing fails, continue with original value
                }
            }

            sessionStorage.setItem(key, value);
            return true;
        } catch (e) {
            if (e.name === 'QuotaExceededError') {
                console.warn('⚠️ SessionStorage quota exceeded in ChatHistory');

                // Step 1: Clear old chat message caches
                for (let i = sessionStorage.length - 1; i >= 0; i--) {
                    const k = sessionStorage.key(i);
                    if (k?.startsWith('koda_chat_messages_')) {
                        sessionStorage.removeItem(k);
                    }
                }

                // Step 2: For conversations, reduce to fewer items
                if (key === 'koda_chat_conversations') {
                    try {
                        let parsed = JSON.parse(value);
                        if (Array.isArray(parsed) && parsed.length > 20) {
                            console.log(`📦 [ChatHistory] Emergency trim to 20 conversations`);
                            parsed = parsed.slice(0, 20);
                            value = JSON.stringify(parsed);
                        }
                    } catch (parseErr) {
                        // If parsing fails, skip trimming
                    }
                }

                // Retry after cleanup
                try {
                    sessionStorage.setItem(key, value);
                    return true;
                } catch (e2) {
                    console.error('❌ Still cannot save to sessionStorage after cleanup');
                    // Last resort: clear this specific key and try again
                    sessionStorage.removeItem(key);
                    try {
                        sessionStorage.setItem(key, value);
                        return true;
                    } catch (e3) {
                        console.error('❌ Complete storage failure');
                        return false;
                    }
                }
            }
            return false;
        }
    }
};

const ChatHistory = ({ onSelectConversation, currentConversation, onNewChat, onConversationUpdate }) => {
    const { t } = useTranslation();
    const isMobile = useIsMobile();
    const [conversations, setConversations] = useState(() => {
        // Load from cache immediately for instant display
        const cached = sessionStorage.getItem('koda_chat_conversations');
        if (cached) {
            try {
                return JSON.parse(cached);
            } catch (e) {
                return [];
            }
        }
        return [];
    });
    const [searchQuery, setSearchQuery] = useState('');
    const [hoveredConversation, setHoveredConversation] = useState(null);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [itemToDelete, setItemToDelete] = useState(null);
    const [isExpanded, setIsExpanded] = useState(false);
    const [showSearchModal, setShowSearchModal] = useState(false);

    // ✅ NEW: Track if we should show the ephemeral "New Chat" placeholder
    const [showNewChatPlaceholder, setShowNewChatPlaceholder] = useState(true);

    // ✅ NEW: Track animated title generation (ChatGPT-style)
    const [animatingTitles, setAnimatingTitles] = useState({}); // { conversationId: { text: "...", isAnimating: true } }

    // Track if initial load is complete
    const initialLoadCompleteRef = useRef(false);
    // Track conversation IDs we just added via handleNewChat to prevent useEffect duplicates
    const justAddedIdRef = useRef(null);

    useEffect(() => {
        const doLoad = async () => {
            await loadConversations();
            initialLoadCompleteRef.current = true;
        };
        doLoad();
    }, []);

    // ✅ NEW: Listen for title streaming events (ChatGPT-style animated title)
    useEffect(() => {
        let retryTimer = null;
        let cleanupFn = null;

        const attachListeners = () => {
            const socket = chatService.getSocket();
            if (!socket) {
                // Retry after a short delay if socket not ready
                console.log('🔌 [ChatHistory] Socket not ready, retrying in 500ms...');
                retryTimer = setTimeout(attachListeners, 500);
                return;
            }

            console.log('🔌 [ChatHistory] Attaching title streaming listeners');

            // Title generation started
            const handleTitleStart = (data) => {
                console.log('🏷️ [ChatHistory] Title generation started:', data.conversationId);
                setAnimatingTitles(prev => ({
                    ...prev,
                    [data.conversationId]: { text: '', isAnimating: true }
                }));
            };

            // Title chunk received (character-by-character)
            const handleTitleChunk = (data) => {
                console.log('🏷️ [ChatHistory] Title chunk:', data.chunk);
                setAnimatingTitles(prev => ({
                    ...prev,
                    [data.conversationId]: {
                        text: (prev[data.conversationId]?.text || '') + data.chunk,
                        isAnimating: true
                    }
                }));
            };

            // Title generation complete
            const handleTitleComplete = (data) => {
                console.log('🏷️ [ChatHistory] Title generation complete:', data.title);

                // Stop animation
                setAnimatingTitles(prev => {
                    const updated = { ...prev };
                    delete updated[data.conversationId];
                    return updated;
                });

                // ✅ FIX: Validate title before updating
                const validTitle = data.title?.trim() || 'New Chat';
                if (!validTitle || validTitle === '') {
                    console.warn('⚠️ [ChatHistory] Invalid title received:', data.title);
                    return;
                }

                // Update the conversation in the list with final title
                setConversations(prevConversations => {
                    const existingIndex = prevConversations.findIndex(c => c.id === data.conversationId);

                    if (existingIndex !== -1) {
                        const updated = [...prevConversations];
                        updated[existingIndex] = {
                            ...updated[existingIndex],
                            title: validTitle,
                            updatedAt: data.updatedAt || new Date().toISOString()
                        };
                        safeSessionStorage.setItem('koda_chat_conversations', JSON.stringify(updated));
                        return updated;
                    }
                    return prevConversations;
                });

                // Also notify parent component
                if (onConversationUpdate) {
                    onConversationUpdate({
                        id: data.conversationId,
                        title: validTitle,
                        updatedAt: data.updatedAt
                    });
                }
            };

            // Attach listeners
            socket.on('title:generating:start', handleTitleStart);
            socket.on('title:generating:chunk', handleTitleChunk);
            socket.on('title:generating:complete', handleTitleComplete);

            // Store cleanup function
            cleanupFn = () => {
                socket.off('title:generating:start', handleTitleStart);
                socket.off('title:generating:chunk', handleTitleChunk);
                socket.off('title:generating:complete', handleTitleComplete);
            };
        };

        // Start attaching listeners
        attachListeners();

        // Cleanup
        return () => {
            if (retryTimer) clearTimeout(retryTimer);
            if (cleanupFn) cleanupFn();
        };
    }, [onConversationUpdate]);

    // ✅ FIX: Always ensure currentConversation is in the list
    // This runs when currentConversation changes
    // Uses functional update to avoid needing conversations in dependency array
    useEffect(() => {
        // Skip ephemeral conversations (id === 'new')
        if (currentConversation?.id === 'new' || currentConversation?.isEphemeral) {
            console.log('⏭️ [ChatHistory] Skipping useEffect - ephemeral conversation');
            return;
        }

        // Skip if this conversation was just added by handleNewChat
        if (currentConversation?.id && justAddedIdRef.current === currentConversation.id) {
            console.log('⏭️ [ChatHistory] Skipping useEffect - conversation just added by handleNewChat:', currentConversation.id);
            justAddedIdRef.current = null; // Reset for next time
            return;
        }

        if (currentConversation?.id && currentConversation?.title) {
            setConversations(prevConversations => {
                const existingIndex = prevConversations.findIndex(c => c.id === currentConversation.id);

                if (existingIndex === -1) {
                    // Conversation doesn't exist - add it at the top
                    console.log('➕ [ChatHistory] Adding currentConversation to list:', currentConversation.id, currentConversation.title);
                    const updated = [currentConversation, ...prevConversations];
                    safeSessionStorage.setItem('koda_chat_conversations', JSON.stringify(updated));
                    return updated;
                } else if (prevConversations[existingIndex].title !== currentConversation.title) {
                    // Conversation exists but title changed - update it
                    console.log('📝 [ChatHistory] Updating conversation title in list:', currentConversation.id,
                               `"${prevConversations[existingIndex].title}" → "${currentConversation.title}"`);
                    const updated = [...prevConversations];
                    updated[existingIndex] = {
                        ...updated[existingIndex],
                        ...currentConversation,
                        updatedAt: new Date().toISOString()
                    };
                    safeSessionStorage.setItem('koda_chat_conversations', JSON.stringify(updated));
                    return updated;
                }

                // No changes needed
                return prevConversations;
            });
        }
    }, [currentConversation?.id, currentConversation?.title]);

    // Update conversation in the list (used for title updates)
    // Use useCallback to prevent infinite loop
    const updateConversationInList = useCallback((updatedConversation) => {
        console.log('📝 ChatHistory: Updating conversation', updatedConversation);
        setConversations(prevConversations => {
            // ✅ FIX: Check if conversation exists before updating
            const existingIndex = prevConversations.findIndex(c => c.id === updatedConversation.id);

            if (existingIndex === -1) {
                // Conversation doesn't exist - add it at the beginning
                console.log('➕ Adding new conversation to list via update function:', updatedConversation.id);
                const updated = [updatedConversation, ...prevConversations];
                safeSessionStorage.setItem('koda_chat_conversations', JSON.stringify(updated));
                return updated;
            }

            // Conversation exists - update it
            const updated = prevConversations.map(conv =>
                conv.id === updatedConversation.id
                    ? { ...conv, ...updatedConversation, updatedAt: new Date().toISOString() }
                    : conv
            );

            // Update cache
            safeSessionStorage.setItem('koda_chat_conversations', JSON.stringify(updated));
            return updated;
        });
    }, []);

    // Expose the update function to parent component
    useEffect(() => {
        if (onConversationUpdate) {
            onConversationUpdate(updateConversationInList);
        }
    }, [onConversationUpdate, updateConversationInList]);

    const loadConversations = async (mergePending = false) => {
        try {
            console.log('📥 [ChatHistory] Loading conversations from API...');
            const data = await chatService.getConversations();
            let apiConversations = data.conversations || data;

            // ✅ FIX: Filter out conversations with empty/invalid titles
            apiConversations = apiConversations.filter(conv => {
                // Remove if title is empty, null, or only whitespace
                if (!conv.title || typeof conv.title !== 'string' || conv.title.trim() === '') {
                    console.warn('⚠️ [ChatHistory] Skipping conversation with invalid title:', conv.id);
                    return false;
                }
                return true;
            });

            console.log(`✅ [ChatHistory] Loaded ${apiConversations.length} valid conversations from API`);

            // ✅ FIX: Always preserve currentConversation if it exists
            // This handles the race condition where a conversation is auto-created before API fetch completes
            setConversations(prev => {
                let result = apiConversations;

                if (mergePending) {
                    // Merge mode: keep any conversations not in API response (recently created)
                    const apiIds = new Set(apiConversations.map(c => c.id));
                    const pendingConversations = prev.filter(c => !apiIds.has(c.id));

                    if (pendingConversations.length > 0) {
                        console.log(`📌 [ChatHistory] Keeping ${pendingConversations.length} pending conversations`);
                        result = [...pendingConversations, ...apiConversations];
                    }
                }

                // ✅ FIX: Always ensure currentConversation is in the list
                if (currentConversation?.id && currentConversation?.title) {
                    const hasCurrentConversation = result.some(c => c.id === currentConversation.id);
                    if (!hasCurrentConversation) {
                        console.log(`📌 [ChatHistory] Preserving currentConversation:`, currentConversation.id, currentConversation.title);
                        result = [currentConversation, ...result];
                    }
                }

                safeSessionStorage.setItem('koda_chat_conversations', JSON.stringify(result));
                return result;
            });
        } catch (error) {
            console.error('❌ [ChatHistory] Error loading conversations:', error);
        }
    };

    // ⚡ PERFORMANCE: Preload conversation messages on hover for instant switching
    const preloadConversation = async (conversationId) => {
        const cacheKey = `koda_chat_messages_${conversationId}`;
        const cacheTimestampKey = `${cacheKey}_timestamp`;

        // Skip if already cached and fresh (< 30 seconds old)
        const cached = sessionStorage.getItem(cacheKey);
        const cacheTimestamp = sessionStorage.getItem(cacheTimestampKey);

        if (cached && cacheTimestamp) {
            const cacheAge = Date.now() - parseInt(cacheTimestamp);
            if (cacheAge < 30 * 1000) {
                console.log(`⚡ Conversation ${conversationId} already preloaded`);
                return; // Already fresh in cache
            }
        }

        try {
            console.log(`⚡ Preloading conversation ${conversationId}...`);
            const conversation = await chatService.getConversation(conversationId);
            const messages = conversation.messages || [];

            // Cache the messages for instant display later
            if (safeSessionStorage.setItem(cacheKey, JSON.stringify(messages))) {
                sessionStorage.setItem(cacheTimestampKey, Date.now().toString());
            }

            console.log(`✅ Preloaded ${messages.length} messages for conversation ${conversationId}`);
        } catch (error) {
            console.error(`❌ Failed to preload conversation ${conversationId}:`, error);

            // If conversation doesn't exist (404), remove it from the list
            if (error.response?.status === 404) {
                console.log(`🗑️ Removing non-existent conversation ${conversationId} from list`);
                setConversations(prev => {
                    const updated = prev.filter(c => c.id !== conversationId);
                    safeSessionStorage.setItem('koda_chat_conversations', JSON.stringify(updated));
                    return updated;
                });
            }
        }
    };

    const handleNewChat = async () => {
        console.log('🔵 [ChatHistory] Creating new chat placeholder...');

        // ✅ NEW: Show the ephemeral placeholder (no API call yet)
        setShowNewChatPlaceholder(true);

        // Create ephemeral conversation object
        const ephemeralConversation = {
            id: 'new',
            title: 'New Chat',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            isEphemeral: true // Mark as ephemeral
        };

        // Notify parent component to switch to new chat
        onNewChat?.(ephemeralConversation);
    };

    const handleDeleteAll = async () => {
        setItemToDelete({ type: 'all' });
        setShowDeleteModal(true);
    };

    const handleDeleteConversation = async (conversationId, e) => {
        e.stopPropagation(); // Prevent conversation selection when clicking delete
        const conversation = conversations.find(c => c.id === conversationId);
        setItemToDelete({
            type: 'conversation',
            id: conversationId,
            name: conversation?.title || 'this conversation'
        });
        setShowDeleteModal(true);
    };

    const handleConfirmDelete = async () => {
        if (!itemToDelete) return;

        try {
            if (itemToDelete.type === 'all') {
                await chatService.deleteAllConversations();
                setConversations([]);
                // Clear cache
                sessionStorage.removeItem('koda_chat_conversations');
                // Clear all message caches
                Object.keys(sessionStorage).forEach(key => {
                    if (key.startsWith('koda_chat_messages_')) {
                        sessionStorage.removeItem(key);
                    }
                });
                // Create a new chat after deleting all
                onNewChat?.();
            } else if (itemToDelete.type === 'conversation') {
                await chatService.deleteConversation(itemToDelete.id);
                const updated = conversations.filter(c => c.id !== itemToDelete.id);
                setConversations(updated);
                // Update cache
                safeSessionStorage.setItem('koda_chat_conversations', JSON.stringify(updated));
                // Clear specific message cache
                sessionStorage.removeItem(`koda_chat_messages_${itemToDelete.id}`);

                // If deleting current conversation, create a new chat
                if (currentConversation?.id === itemToDelete.id) {
                    onNewChat?.();
                }
            }
        } catch (error) {
            console.error('Error deleting:', error);
        } finally {
            setShowDeleteModal(false);
            setItemToDelete(null);
        }
    };

    // ✅ NEW: Handle selecting a conversation - hide placeholder when selecting existing chat
    const handleSelectConversation = (conversation) => {
        // ✅ FIX: Validate conversation before selecting
        if (!conversation.id) {
            console.error('❌ [ChatHistory] Invalid conversation - missing ID');
            return;
        }

        // ✅ FIX: Validate and sanitize title
        let validatedConversation = conversation;
        if (!conversation.title || typeof conversation.title !== 'string' || conversation.title.trim() === '') {
            console.warn('⚠️ [ChatHistory] Conversation has invalid title:', conversation.id);
            // Still allow selection, but use default title
            validatedConversation = { ...conversation, title: conversation.title?.trim() || 'New Chat' };
        }

        console.log('📌 [ChatHistory] Selecting conversation:', validatedConversation.id);

        // Hide placeholder when selecting an existing chat (not the ephemeral 'new' one)
        if (validatedConversation.id !== 'new') {
            setShowNewChatPlaceholder(false);
        }

        onSelectConversation?.(validatedConversation);
    };

    // ✅ NEW: Build display list with ephemeral placeholder if needed
    const displayConversations = useMemo(() => {
        const list = [...conversations];

        // Add ephemeral "New Chat" at the top if it should be shown
        if (showNewChatPlaceholder && currentConversation?.id === 'new') {
            // ✅ FIX: Check if 'new' already exists to prevent duplicates
            const hasNewChat = list.some(c => c.id === 'new');

            if (!hasNewChat) {
                list.unshift({
                    id: 'new',
                    title: 'New Chat',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    isEphemeral: true
                });
            }
        }

        return list;
    }, [conversations, showNewChatPlaceholder, currentConversation?.id]);

    const groupConversationsByDate = (convList) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        const twoDaysAgo = new Date(today);
        twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

        const grouped = {
            Today: [],
            Yesterday: [],
            '2 days ago': [],
            Older: [],
        };

        convList
            .filter((conv) => {
                // ✅ SHOW empty conversations (they'll be cleaned up when user navigates away)
                // Only filter by search query
                const matchesSearch = (conv.title || 'New Chat')
                    .toLowerCase()
                    .includes(searchQuery.toLowerCase());

                return matchesSearch;
            })
            .forEach((conv) => {
                const convDate = new Date(conv.updatedAt);
                convDate.setHours(0, 0, 0, 0);

                if (convDate.getTime() === today.getTime()) {
                    grouped.Today.push(conv);
                } else if (convDate.getTime() === yesterday.getTime()) {
                    grouped.Yesterday.push(conv);
                } else if (convDate.getTime() === twoDaysAgo.getTime()) {
                    grouped['2 days ago'].push(conv);
                } else {
                    grouped.Older.push(conv);
                }
            });

        return grouped;
    };

    // ✅ NEW: Use displayConversations (includes ephemeral placeholder) for grouping
    const groupedConversations = useMemo(() => {
        return groupConversationsByDate(displayConversations);
    }, [displayConversations, searchQuery]);

    // Add custom scrollbar styles
    const scrollbarStyles = `
        .chat-history-scrollbar::-webkit-scrollbar {
            width: 8px;
        }

        .chat-history-scrollbar::-webkit-scrollbar-track {
            background: transparent;
        }

        .chat-history-scrollbar::-webkit-scrollbar-thumb {
            background: #E6E6EC;
            border-radius: 4px;
            transition: background 200ms ease-in-out;
        }

        .chat-history-scrollbar::-webkit-scrollbar-thumb:hover {
            background: #D0D0D6;
        }

        .chat-history-scrollbar::-webkit-scrollbar-thumb:active {
            background: #B8B8C0;
        }
    `;

    // Helper to render conversation title with animation (ChatGPT-style)
    const renderTitle = (convo) => {
        const animating = animatingTitles[convo.id];

        if (animating?.isAnimating) {
            // Show animated title with blinking cursor
            return (
                <span>
                    {animating.text || ''}
                    <span className="title-cursor" />
                </span>
            );
        }

        // ✅ FIX: Sanitize and validate title
        const title = convo.title?.trim() || 'New Chat';

        // Prevent showing empty or whitespace-only titles
        if (!title || title === '') {
            return 'New Chat';
        }

        // Limit title length to prevent overflow
        const maxLength = 50;
        if (title.length > maxLength) {
            return title.substring(0, maxLength) + '...';
        }

        return title;
    };

    // SearchModal Component
    const SearchModal = () => (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0, 0, 0, 0.5)',
                display: showSearchModal ? 'flex' : 'none',
                justifyContent: 'center',
                alignItems: 'flex-start',
                paddingTop: '10vh',
                zIndex: 1000,
            }}
            onClick={() => setShowSearchModal(false)}
        >
            <div
                style={{
                    width: 600,
                    maxHeight: '80vh',
                    background: 'white',
                    borderRadius: 16,
                    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Search Header */}
                <div style={{
                    padding: '20px 20px 16px',
                    borderBottom: '1px solid #E6E6EC',
                }}>
                    <div
                        style={{
                            position: 'relative',
                            transition: 'transform 0.15s ease',
                            cursor: 'text'
                        }}
                        onMouseEnter={(e) => { if (!isMobile) e.currentTarget.style.transform = 'scale(1.02)'; }}
                        onMouseLeave={(e) => { if (!isMobile) e.currentTarget.style.transform = 'scale(1)'; }}
                    >
                        <input
                            type="text"
                            placeholder={t('chatHistory.searchChats')}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            autoFocus
                            style={{
                                width: '100%',
                                height: 44,
                                padding: '10px 40px 10px 40px',
                                background: '#F5F5F5',
                                borderRadius: 100,
                                border: '1px solid #E6E6EC',
                                outline: 'none',
                                fontSize: 14,
                                fontFamily: 'Plus Jakarta Sans',
                                transition: 'box-shadow 0.15s ease, border-color 0.15s ease'
                            }}
                            onFocus={(e) => { e.target.style.boxShadow = '0 0 0 2px rgba(50, 48, 44, 0.1)'; e.target.style.borderColor = '#A2A2A7'; }}
                            onBlur={(e) => { e.target.style.boxShadow = 'none'; e.target.style.borderColor = '#E6E6EC'; }}
                        />
                        <SearchIcon style={{
                            width: 20,
                            height: 20,
                            color: '#32302C',
                            position: 'absolute',
                            left: 12,
                            top: 12
                        }} />
                        <div
                            onClick={() => setShowSearchModal(false)}
                            style={{
                                position: 'absolute',
                                right: 12,
                                top: 10,
                                width: 24,
                                height: 24,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                borderRadius: 4,
                                transition: 'background 200ms ease-in-out',
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = '#F5F5F5'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M13 1L1 13M1 1L13 13" stroke="#6C6B6E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                        </div>
                    </div>
                </div>

                {/* New Chat Button */}
                <div style={{padding: '16px 20px', borderBottom: '1px solid #E6E6EC'}}>
                    <button
                        onClick={() => {
                            handleNewChat();
                            setShowSearchModal(false);
                        }}
                        style={{
                            width: '100%',
                            height: 40,
                            padding: '8px 12px',
                            background: '#F5F5F5',
                            border: '1px solid #E0E0E0',
                            borderRadius: 8,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            cursor: 'pointer',
                            transition: 'background 200ms ease-in-out',
                            fontFamily: 'Plus Jakarta Sans',
                            fontSize: 13,
                            fontWeight: '500',
                            color: '#1A1A1A'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#EAEAEA'}
                        onMouseLeave={(e) => e.currentTarget.style.background = '#F5F5F5'}
                    >
                        <PencilIcon style={{width: 16, height: 16}} />
                        <span>{t('chatHistory.newChat')}</span>
                    </button>
                </div>

                {/* Conversations List */}
                <div className="chat-history-scrollbar" style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '16px 20px',
                }}>
                    {Object.entries(groupedConversations).map(([day, list]) => {
                        if (list.length === 0) return null;

                        return (
                            <div key={day} style={{marginBottom: 20}}>
                                <div style={{
                                    color: '#32302C',
                                    fontSize: 12,
                                    fontFamily: 'Plus Jakarta Sans',
                                    fontWeight: '700',
                                    textTransform: 'uppercase',
                                    marginBottom: 12
                                }}>
                                    {day}
                                </div>
                                <div>
                                    {list.map((convo) => (
                                        <div
                                            key={convo.id}
                                            onClick={() => {
                                                handleSelectConversation(convo);
                                                setShowSearchModal(false);
                                            }}
                                            style={{
                                                padding: '12px 14px',
                                                background: currentConversation?.id === convo.id ? '#F5F5F5' : 'transparent',
                                                borderRadius: 12,
                                                color: currentConversation?.id === convo.id ? '#32302C' : '#6C6B6E',
                                                fontSize: 14,
                                                fontFamily: 'Plus Jakarta Sans',
                                                fontWeight: '600',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                gap: 8,
                                                transition: 'background 200ms ease-in-out',
                                            }}
                                            onMouseEnter={(e) => {
                                                if (currentConversation?.id !== convo.id) {
                                                    e.currentTarget.style.background = '#F5F5F5';
                                                }
                                            }}
                                            onMouseLeave={(e) => {
                                                if (currentConversation?.id !== convo.id) {
                                                    e.currentTarget.style.background = 'transparent';
                                                }
                                            }}
                                        >
                                            <div style={{
                                                flex: 1,
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap'
                                            }}>
                                                {renderTitle(convo)}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                    {displayConversations.length === 0 && (
                        <div style={{
                            textAlign: 'center',
                            color: '#6C6B6E',
                            fontSize: 14,
                            marginTop: 20
                        }}>
                            {t('chatHistory.noConversationsYet')}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );

    return (
        <>
            {/* Inject custom scrollbar and title animation styles */}
            <style>{scrollbarStyles}</style>
            <style>{titleAnimationStyles}</style>

            <div style={{
                width: isExpanded ? 314 : 64,
                height: '100%',
                padding: 20,
                background: 'white',
                borderRight: '1px solid #E6E6EC',
                display: 'flex',
                flexDirection: 'column',
                gap: 20,
                transition: 'width 300ms ease-in-out',
                overflow: 'hidden'
            }}>
            {/* Collapsed sidebar icons */}
            {!isExpanded && (
                <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12}}>
                    {/* Expand Button */}
                    <div
                        onClick={() => setIsExpanded(true)}
                        style={{
                            width: 44,
                            height: 44,
                            borderRadius: 12,
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            cursor: 'pointer',
                            transition: 'background 200ms ease-in-out, transform 0.15s ease'
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = '#F5F5F5'; if (!isMobile) e.currentTarget.style.transform = 'scale(1.08)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; if (!isMobile) e.currentTarget.style.transform = 'scale(1)'; }}
                    >
                        <ExpandIcon style={{width: 20, height: 20}} />
                    </div>

                    {/* New Chat Icon */}
                    <div
                        data-testid="new-chat"
                        onClick={handleNewChat}
                        style={{
                            width: 44,
                            height: 44,
                            borderRadius: 12,
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            cursor: 'pointer',
                            transition: 'background 200ms ease-in-out, transform 0.15s ease'
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = '#F5F5F5'; if (!isMobile) e.currentTarget.style.transform = 'scale(1.08)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; if (!isMobile) e.currentTarget.style.transform = 'scale(1)'; }}
                    >
                        <PencilIcon style={{width: 20, height: 20}} />
                    </div>

                    {/* Search Icon */}
                    <div
                        onClick={() => setShowSearchModal(true)}
                        style={{
                            width: 44,
                            height: 44,
                            borderRadius: 12,
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            cursor: 'pointer',
                            transition: 'background 200ms ease-in-out, transform 0.15s ease'
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = '#F5F5F5'; if (!isMobile) e.currentTarget.style.transform = 'scale(1.08)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; if (!isMobile) e.currentTarget.style.transform = 'scale(1)'; }}
                    >
                        <SearchIcon style={{width: 20, height: 20}} />
                    </div>
                </div>
            )}

            {/* Expanded sidebar header */}
            {isExpanded && (
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                <div style={{color: '#32302C', fontSize: 20, fontFamily: 'Plus Jakarta Sans', fontWeight: '700', lineHeight: '30px', textShadow: '0 4px 8px rgba(0, 0, 0, 0.12), 0 2px 4px rgba(0, 0, 0, 0.08)'}}>{t('chatHistory.chat')}</div>
                {/* Collapse Button */}
                <div
                    onClick={() => setIsExpanded(false)}
                    style={{
                        width: 44,
                        height: 44,
                        borderRadius: 12,
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        cursor: 'pointer',
                        transition: 'background 200ms ease-in-out, transform 0.15s ease',
                        background: 'transparent',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#F5F5F5'; if (!isMobile) e.currentTarget.style.transform = 'scale(1.08)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; if (!isMobile) e.currentTarget.style.transform = 'scale(1)'; }}
                >
                    <ExpandIcon style={{width: 20, height: 20, transform: 'rotate(180deg)'}} />
                </div>
            </div>
            )}

            {isExpanded && (
                <>
                    {/* New Chat Button */}
                    <button
                        onClick={handleNewChat}
                        style={{
                            width: '100%',
                            height: 40,
                            padding: '8px 12px',
                            background: '#F5F5F5',
                            border: '1px solid #E0E0E0',
                            borderRadius: 8,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            cursor: 'pointer',
                            transition: 'background 200ms ease-in-out',
                            fontFamily: 'Plus Jakarta Sans',
                            fontSize: 13,
                            fontWeight: '500',
                            color: '#1A1A1A'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#EAEAEA'}
                        onMouseLeave={(e) => e.currentTarget.style.background = '#F5F5F5'}
                    >
                        <PencilIcon style={{width: 16, height: 16}} />
                        <span>{t('chatHistory.newChat')}</span>
                    </button>

                    <div
                        style={{
                            position: 'relative',
                            transition: 'transform 0.15s ease',
                            cursor: 'text'
                        }}
                        onMouseEnter={(e) => { if (!isMobile) e.currentTarget.style.transform = 'scale(1.02)'; }}
                        onMouseLeave={(e) => { if (!isMobile) e.currentTarget.style.transform = 'scale(1)'; }}
                    >
                        <input
                            type="text"
                            placeholder={t('chatHistory.searchConversation')}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{
                                width: '100%',
                                height: 44,
                                padding: '10px 12px 10px 40px',
                                background: '#F5F5F5',
                                borderRadius: 100,
                                border: '1px solid #E6E6EC',
                                outline: 'none',
                                fontSize: 14,
                                transition: 'box-shadow 0.15s ease, border-color 0.15s ease'
                            }}
                            onFocus={(e) => { e.target.style.boxShadow = '0 0 0 2px rgba(50, 48, 44, 0.1)'; e.target.style.borderColor = '#A2A2A7'; }}
                            onBlur={(e) => { e.target.style.boxShadow = 'none'; e.target.style.borderColor = '#E6E6EC'; }}
                        />
                        <SearchIcon style={{width: 20, height: 20, color: '#32302C', position: 'absolute', left: 12, top: 12}} />
                    </div>
                </>
            )}

            {isExpanded && (
            <div className="chat-history-scrollbar" style={{flex: '1 1 0', overflowY: 'auto'}}>
                {Object.entries(groupedConversations).map(([day, list]) => {
                    if (list.length === 0) return null;

                    return (
                        <div key={day} style={{marginBottom: 20}}>
                            <div style={{color: '#32302C', fontSize: 12, fontFamily: 'Plus Jakarta Sans', fontWeight: '700', textTransform: 'uppercase', marginBottom: 12}}>{day}</div>
                            <div>
                                {list.map((convo) => (
                                    <div
                                        key={convo.id}
                                        data-testid="conversation-item"
                                        data-conversation-id={convo.id}
                                        onClick={() => handleSelectConversation(convo)}
                                        onMouseEnter={() => {
                                            setHoveredConversation(convo.id);
                                            // Don't preload ephemeral conversations
                                            if (convo.id !== 'new') {
                                                preloadConversation(convo.id);
                                            }
                                        }}
                                        onMouseLeave={() => setHoveredConversation(null)}
                                        style={{
                                            padding: '12px 14px',
                                            background: currentConversation?.id === convo.id ? '#F5F5F5' : 'transparent',
                                            borderRadius: 12,
                                            color: currentConversation?.id === convo.id ? '#32302C' : '#6C6B6E',
                                            fontSize: 14,
                                            fontFamily: 'Plus Jakarta Sans',
                                            fontWeight: '600',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            gap: 8,
                                        }}
                                    >
                                        <div style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {renderTitle(convo)}
                                        </div>
                                        {/* Don't show delete button for ephemeral conversations */}
                                        {hoveredConversation === convo.id && convo.id !== 'new' && (
                                            <div
                                                onClick={(e) => handleDeleteConversation(convo.id, e)}
                                                style={{
                                                    width: 28,
                                                    height: 28,
                                                    borderRadius: 8,
                                                    display: 'flex',
                                                    justifyContent: 'center',
                                                    alignItems: 'center',
                                                    cursor: 'pointer',
                                                    flexShrink: 0,
                                                }}
                                                onMouseEnter={(e) => {
                                                    e.currentTarget.style.background = '#FEE4E2';
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.background = 'transparent';
                                                }}
                                            >
                                                <TrashIcon style={{ width: 16, height: 16, color: '#D92D20' }} />
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
                {displayConversations.length === 0 && (
                    <div style={{textAlign: 'center', color: '#6C6B6E', fontSize: 14, marginTop: 20}}>
                        {t('chatHistory.noConversationsYet')}
                    </div>
                )}
            </div>
            )}

            {/* Only show Delete All if there are real conversations (not just ephemeral) */}
            {isExpanded && conversations.length > 0 && (
                <div
                    onClick={handleDeleteAll}
                    style={{paddingTop: 12, borderTop: '1px solid #E6E6EC', textAlign: 'center', color: '#D92D20', fontSize: 14, fontFamily: 'Plus Jakarta Sans', fontWeight: '700', cursor: 'pointer'}}
                >
                    {t('chatHistory.deleteAll')}
                </div>
            )}

            <DeleteConfirmationModal
                isOpen={showDeleteModal}
                onClose={() => {
                    setShowDeleteModal(false);
                    setItemToDelete(null);
                }}
                onConfirm={handleConfirmDelete}
                itemName={itemToDelete?.type === 'all' ? 'all conversations' : (itemToDelete?.name || 'this chat')}
                itemType="chat"
            />

            {/* Search Modal */}
            <SearchModal />
            </div>
        </>
    );
};

export default ChatHistory;
