import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ReactComponent as SearchIcon } from '../../assets/Search.svg';
import { ReactComponent as TrashIcon } from '../../assets/Trash can.svg';
import { ReactComponent as PencilIcon } from '../../assets/pencil-ai.svg';
import { ReactComponent as ExpandIcon } from '../../assets/expand.svg';
import * as chatService from '../../services/chatService';
import DeleteConfirmationModal from '../library/DeleteConfirmationModal';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useAuth } from '../../context/AuthContext';

/**
 * ChatGPT-like sidebar behavior:
 * ✅ No "ephemeral" new-chat row in history
 * ✅ Title is NOT character-streamed in sidebar
 * ✅ Cmd/Ctrl+K opens search
 * ✅ Arrow navigation + Enter selects inside search
 * ✅ Escape closes search
 * ✅ Hover reveals delete on items
 * ✅ Lightweight caching for instant first paint
 */

const MAX_CACHED_CONVERSATIONS = 50;

const safeSessionStorage = {
  setItem: (key, value) => {
    try {
      if (key === 'koda_chat_conversations') {
        try {
          let parsed = JSON.parse(value);
          if (Array.isArray(parsed) && parsed.length > MAX_CACHED_CONVERSATIONS) {
            parsed = parsed.slice(0, MAX_CACHED_CONVERSATIONS);
            value = JSON.stringify(parsed);
          }
        } catch {}
      }
      sessionStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  },
  getItem: (key) => {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  removeItem: (key) => {
    try {
      sessionStorage.removeItem(key);
    } catch {}
  },
};

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function groupByDate(convs) {
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

  for (const conv of convs) {
    const d = new Date(conv.updatedAt || conv.createdAt || Date.now());
    d.setHours(0, 0, 0, 0);
    const key =
      d.getTime() === today.getTime()
        ? 'Today'
        : d.getTime() === yesterday.getTime()
          ? 'Yesterday'
          : d.getTime() === twoDaysAgo.getTime()
            ? '2 days ago'
            : 'Older';
    grouped[key].push(conv);
  }

  return grouped;
}

function normalizeTitle(conv) {
  const t = (conv?.title ?? '').trim();
  if (!t) return 'New chat';
  return t.length > 60 ? t.slice(0, 60) + '…' : t;
}

function normalizeConversations(raw) {
  const arr = Array.isArray(raw) ? raw : raw?.conversations ?? [];
  // Drop invalid IDs; keep empty titles as "New chat"
  return arr
    .filter((c) => c && c.id)
    .map((c) => ({
      ...c,
      title: normalizeTitle(c),
      updatedAt: c.updatedAt || c.createdAt || new Date().toISOString(),
    }));
}

const ChatHistory = ({
  onSelectConversation,
  currentConversation,
  onNewChat,
  onConversationUpdate,
}) => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { isAuthenticated } = useAuth();

  // Sidebar open/closed (ChatGPT collapsible)
  const [isExpanded, setIsExpanded] = useState(false);

  // Swipe-to-close state for mobile drawer
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwipingDrawer, setIsSwipingDrawer] = useState(false);
  const swipeStartRef = useRef({ x: 0, y: 0 });
  const drawerRef = useRef(null);

  // Body scroll lock when drawer is open on mobile
  useEffect(() => {
    if (isMobile && isExpanded) {
      document.body.style.overflow = 'hidden';
      document.body.classList.add('drawer-open');
    } else {
      document.body.style.overflow = '';
      document.body.classList.remove('drawer-open');
    }
    return () => {
      document.body.style.overflow = '';
      document.body.classList.remove('drawer-open');
    };
  }, [isMobile, isExpanded]);

  // Swipe-to-close gesture handler for mobile drawer
  const handleDrawerTouchStart = useCallback((e) => {
    if (!isMobile || !isExpanded) return;

    const touch = e.touches[0];
    // Don't capture if starting from extreme left edge (Safari back gesture)
    if (touch.clientX < 16) return;

    swipeStartRef.current = { x: touch.clientX, y: touch.clientY };
    setIsSwipingDrawer(false);
  }, [isMobile, isExpanded]);

  const handleDrawerTouchMove = useCallback((e) => {
    if (!isMobile || !isExpanded) return;

    const touch = e.touches[0];
    const deltaX = swipeStartRef.current.x - touch.clientX;
    const deltaY = Math.abs(swipeStartRef.current.y - touch.clientY);

    // Only trigger horizontal swipe if horizontal > vertical
    if (deltaX > 10 && deltaX > deltaY) {
      setIsSwipingDrawer(true);
      // Limit swipe to left (close) direction only
      const offset = Math.min(Math.max(0, deltaX), 300);
      setSwipeOffset(offset);
    }
  }, [isMobile, isExpanded]);

  const handleDrawerTouchEnd = useCallback(() => {
    if (!isMobile || !isSwipingDrawer) {
      setSwipeOffset(0);
      setIsSwipingDrawer(false);
      return;
    }

    // Close if swiped more than 80px
    if (swipeOffset > 80) {
      setIsExpanded(false);
    }
    setSwipeOffset(0);
    setIsSwipingDrawer(false);
  }, [isMobile, isSwipingDrawer, swipeOffset]);

  // Conversations list
  const [conversations, setConversations] = useState(() => {
    const cached = safeSessionStorage.getItem('koda_chat_conversations');
    if (!cached) return [];
    try {
      return normalizeConversations(JSON.parse(cached));
    } catch {
      return [];
    }
  });

  // Hover state for showing actions
  const [hoveredId, setHoveredId] = useState(null);

  // Search modal
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Search keyboard highlight
  const [activeIndex, setActiveIndex] = useState(0);
  const searchInputRef = useRef(null);
  const searchListRef = useRef(null);

  // Delete modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);

  // Load conversations (API) - skip for unauthenticated users (guest mode)
  const loadConversations = useCallback(async () => {
    // Skip API calls for unauthenticated users (guest mode on mobile)
    if (!isAuthenticated) return;

    try {
      const data = await chatService.getConversations();
      const normalized = normalizeConversations(data);

      setConversations((prev) => {
        // Preserve any locally known currentConversation if API is behind
        let merged = normalized;
        if (currentConversation?.id) {
          const has = merged.some((c) => c.id === currentConversation.id);
          if (!has) merged = [currentConversation, ...merged].map((c) => ({ ...c, title: normalizeTitle(c) }));
        }
        safeSessionStorage.setItem('koda_chat_conversations', JSON.stringify(merged));
        return merged;
      });
    } catch (e) {
      // keep cached view; no UI copy here
      console.error('ChatHistory loadConversations error', e);
    }
  }, [currentConversation?.id, isAuthenticated]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Ensure currentConversation stays in list (ChatGPT behavior: new chats appear once real id exists)
  useEffect(() => {
    if (!currentConversation?.id) return;

    setConversations((prev) => {
      const idx = prev.findIndex((c) => c.id === currentConversation.id);
      const newTitle = normalizeTitle(currentConversation);
      const newUpdatedAt = currentConversation.updatedAt || new Date().toISOString();

      if (idx === -1) {
        const updated = [{ ...currentConversation, title: newTitle, updatedAt: newUpdatedAt }, ...prev];
        safeSessionStorage.setItem('koda_chat_conversations', JSON.stringify(updated));
        return updated;
      }

      // Bail out if nothing actually changed (prevents unnecessary re-renders)
      const existing = prev[idx];
      if (existing.title === newTitle && existing.updatedAt === newUpdatedAt) {
        return prev;
      }

      const next = [...prev];
      next[idx] = {
        ...next[idx],
        ...currentConversation,
        title: newTitle,
        updatedAt: newUpdatedAt,
      };
      safeSessionStorage.setItem('koda_chat_conversations', JSON.stringify(next));
      return next;
    });
  }, [currentConversation?.id, currentConversation?.title, currentConversation?.updatedAt]);

  // Expose list update callback (optional, if parent wants to push updates)
  useEffect(() => {
    if (!onConversationUpdate) return;
    onConversationUpdate((updatedConversation) => {
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === updatedConversation.id);
        if (idx === -1) {
          const next = [{ ...updatedConversation, title: normalizeTitle(updatedConversation) }, ...prev];
          safeSessionStorage.setItem('koda_chat_conversations', JSON.stringify(next));
          return next;
        }
        const next = [...prev];
        next[idx] = {
          ...next[idx],
          ...updatedConversation,
          title: normalizeTitle(updatedConversation),
          updatedAt: updatedConversation.updatedAt || new Date().toISOString(),
        };
        safeSessionStorage.setItem('koda_chat_conversations', JSON.stringify(next));
        return next;
      });
    });
  }, [onConversationUpdate]);

  // Cmd/Ctrl+K to open search modal (ChatGPT-like)
  useEffect(() => {
    const onKeyDown = (e) => {
      const isK = e.key.toLowerCase() === 'k';
      const isCmdK = (e.metaKey || e.ctrlKey) && isK;

      if (isCmdK) {
        e.preventDefault();
        setSearchOpen(true);
        setIsExpanded(true);
        return;
      }

      if (e.key === 'Escape') {
        if (searchOpen) setSearchOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [searchOpen]);

  // Focus search input when opened
  useEffect(() => {
    if (!searchOpen) return;
    setTimeout(() => searchInputRef.current?.focus?.(), 0);
  }, [searchOpen]);

  // Filtered list for search (flat list, ordered by updatedAt desc)
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const base = [...conversations].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
    if (!q) return base;
    return base.filter((c) => (c.title || '').toLowerCase().includes(q));
  }, [conversations, searchQuery]);

  // Keep activeIndex valid
  useEffect(() => {
    setActiveIndex((i) => clamp(i, 0, Math.max(0, (filtered?.length ?? 0) - 1)));
  }, [filtered?.length ?? 0]);

  // Grouped list for sidebar (ChatGPT uses date-ish grouping)
  const grouped = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const base = [...conversations]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .filter((c) => !q || (c.title || '').toLowerCase().includes(q));
    return groupByDate(base);
  }, [conversations, searchQuery]);

  // Hover prefetch — pre-loads conversation messages into sessionStorage
  // so switching is instant. Uses the same cache keys as ChatInterface.
  const preloadConversation = useCallback(async (conversationId) => {
    // Skip invalid IDs (must be a valid UUID, not "new" or other placeholder)
    if (!conversationId || conversationId === 'new' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(conversationId)) return;
    const cacheKey = `koda_chat_messages_${conversationId}`;
    const tsKey = `${cacheKey}_timestamp`;

    const cached = safeSessionStorage.getItem(cacheKey);
    const ts = safeSessionStorage.getItem(tsKey);

    if (cached && ts) {
      const age = Date.now() - parseInt(ts, 10);
      if (age < 60_000) return; // fresh enough
    }

    try {
      const conversation = await chatService.getConversation(conversationId);
      const messages = conversation.messages || [];
      if (safeSessionStorage.setItem(cacheKey, JSON.stringify(messages))) {
        safeSessionStorage.setItem(tsKey, String(Date.now()));
      }
    } catch (e) {
      console.error('preloadConversation failed', e);
    }
  }, []);

  // Actions
  const handleNewChat = useCallback(() => {
    // ChatGPT-like: do not insert a fake row; main view resets, server creates thread later.
    setSearchOpen(false);
    setSearchQuery('');
    setActiveIndex(0);
    onNewChat?.();
  }, [onNewChat]);

  const handleSelectConversation = useCallback(
    (conv) => {
      if (!conv?.id) return;
      setSearchOpen(false);
      onSelectConversation?.(conv);
    },
    [onSelectConversation]
  );

  const handleDeleteConversation = useCallback(
    (conversationId, e) => {
      e?.stopPropagation?.();
      const conv = conversations.find((c) => c.id === conversationId);
      setItemToDelete({
        type: 'conversation',
        id: conversationId,
        name: conv?.title || 'this chat',
      });
      setShowDeleteModal(true);
    },
    [conversations]
  );

  const handleDeleteAll = useCallback(() => {
    setItemToDelete({ type: 'all' });
    setShowDeleteModal(true);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!itemToDelete) return;

    try {
      if (itemToDelete.type === 'all') {
        await chatService.deleteAllConversations();
        setConversations([]);
        safeSessionStorage.removeItem('koda_chat_conversations');

        // Clear message caches
        for (let i = sessionStorage.length - 1; i >= 0; i--) {
          const k = sessionStorage.key(i);
          if (k?.startsWith('koda_chat_messages_')) safeSessionStorage.removeItem(k);
        }

        onNewChat?.();
      } else if (itemToDelete.type === 'conversation') {
        await chatService.deleteConversation(itemToDelete.id);

        setConversations((prev) => {
          const next = prev.filter((c) => c.id !== itemToDelete.id);
          safeSessionStorage.setItem('koda_chat_conversations', JSON.stringify(next));
          return next;
        });

        safeSessionStorage.removeItem(`koda_chat_messages_${itemToDelete.id}`);

        if (currentConversation?.id === itemToDelete.id) onNewChat?.();
      }
    } catch (e) {
      console.error('delete failed', e);
    } finally {
      setShowDeleteModal(false);
      setItemToDelete(null);
    }
  }, [itemToDelete, currentConversation?.id, onNewChat]);

  // Search keyboard navigation (ChatGPT-like)
  const onSearchKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setSearchOpen(false);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => clamp(i + 1, 0, Math.max(0, filtered.length - 1)));
      scrollActiveIntoView();
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => clamp(i - 1, 0, Math.max(0, filtered.length - 1)));
      scrollActiveIntoView();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const pick = filtered[activeIndex];
      if (pick) handleMobileSelectConversation(pick);
    }
  };

  const scrollActiveIntoView = () => {
    const root = searchListRef.current;
    if (!root) return;
    const el = root.querySelector(`[data-search-index="${activeIndex}"]`);
    if (!el) return;
    el.scrollIntoView({ block: 'nearest' });
  };

  /* --------------------- styles (keep yours, but cleaner) --------------------- */

  const scrollbarStyles = `
    .chat-history-scrollbar::-webkit-scrollbar { width: 8px; }
    .chat-history-scrollbar::-webkit-scrollbar-track { background: transparent; }
    .chat-history-scrollbar::-webkit-scrollbar-thumb { background: #E6E6EC; border-radius: 4px; }
    .chat-history-scrollbar::-webkit-scrollbar-thumb:hover { background: #D0D0D6; }
    .chat-history-scrollbar::-webkit-scrollbar-thumb:active { background: #B8B8C0; }

    @keyframes drawerSlideIn {
      from { transform: translateX(-100%); }
      to { transform: translateX(0); }
    }
    @keyframes drawerSlideOut {
      from { transform: translateX(0); }
      to { transform: translateX(-100%); }
    }
    @keyframes drawerBackdropEnter {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes drawerBackdropExit {
      from { opacity: 1; }
      to { opacity: 0; }
    }
    @media (prefers-reduced-motion: reduce) {
      [data-drawer-panel="true"],
      [data-drawer-backdrop="true"] {
        animation-duration: 0.01ms !important;
        transition-duration: 0.01ms !important;
      }
    }
    /* Hide chat input and floating buttons when drawer is open on mobile */
    body.drawer-open .chat-input-area,
    body.drawer-open [data-mobile-upload-button="true"] {
      display: none !important;
    }
  `;

  /* --------------------- Search Modal --------------------- */

  const SearchModal = () => {
    if (!searchOpen) return null;

    return (
      <div
        role="dialog"
        aria-modal="true"
        onClick={() => setSearchOpen(false)}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.45)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-start',
          paddingTop: '10vh',
          zIndex: 2000,
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            width: 640,
            maxWidth: '92vw',
            background: '#fff',
            borderRadius: 16,
            boxShadow: '0 12px 30px rgba(0,0,0,0.18)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            maxHeight: '80vh',
          }}
        >
          {/* Search Input */}
          <div style={{ padding: 16, borderBottom: '1px solid #E6E6EC' }}>
            <div style={{ position: 'relative' }}>
              <SearchIcon style={{ width: 18, height: 18, position: 'absolute', left: 12, top: 13 }} />
              <input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={onSearchKeyDown}
                placeholder={t('chatHistory.searchChats')}
                style={{
                  width: '100%',
                  height: 44,
                  padding: '10px 12px 10px 38px',
                  background: '#F5F5F5',
                  border: '1px solid #E6E6EC',
                  borderRadius: 12,
                  outline: 'none',
                  fontFamily: 'Plus Jakarta Sans',
                  fontSize: 14,
                }}
              />
              <div style={{ position: 'absolute', right: 10, top: 10, display: 'flex', gap: 8 }}>
                <kbd
                  style={{
                    fontFamily: 'Plus Jakarta Sans',
                    fontSize: 12,
                    color: '#6C6B6E',
                    background: '#FFFFFF',
                    border: '1px solid #E6E6EC',
                    borderRadius: 8,
                    padding: '6px 8px',
                  }}
                >
                  Esc
                </kbd>
              </div>
            </div>
          </div>

          {/* Quick actions */}
          <div style={{ padding: 12, borderBottom: '1px solid #E6E6EC' }}>
            <button
              onClick={handleMobileNewChat}
              style={{
                width: '100%',
                height: 40,
                borderRadius: 10,
                border: '1px solid #E6E6EC',
                background: '#F5F5F5',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '0 12px',
                fontFamily: 'Plus Jakarta Sans',
                fontSize: 13,
                fontWeight: 600,
                color: '#1A1A1A',
              }}
            >
              <PencilIcon style={{ width: 16, height: 16 }} />
              {t('chatHistory.newChat')}
            </button>
          </div>

          {/* Results */}
          <div
            ref={searchListRef}
            className="chat-history-scrollbar"
            style={{ padding: 10, overflowY: 'auto' }}
          >
            {filtered.length === 0 ? (
              <div
                style={{
                  padding: 16,
                  textAlign: 'center',
                  color: '#6C6B6E',
                  fontFamily: 'Plus Jakarta Sans',
                  fontSize: 14,
                }}
              >
                {t('chatHistory.noConversationsYet')}
              </div>
            ) : (
              filtered.map((c, idx) => {
                const selected = idx === activeIndex;
                return (
                  <div
                    key={c.id}
                    data-search-index={idx}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => handleMobileSelectConversation(c)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 10,
                      cursor: 'pointer',
                      background: selected ? '#F5F5F5' : 'transparent',
                      color: selected ? '#32302C' : '#6C6B6E',
                      fontFamily: 'Plus Jakarta Sans',
                      fontSize: 14,
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                    }}
                  >
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                      {normalizeTitle(c)}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    );
  };

  /* --------------------- Sidebar UI --------------------- */

  // Close sidebar when selecting conversation on mobile
  const handleMobileSelectConversation = useCallback(
    (conv) => {
      handleSelectConversation(conv);
      if (isMobile) {
        setIsExpanded(false);
      }
    },
    [handleSelectConversation, isMobile]
  );

  // Close sidebar when creating new chat on mobile
  const handleMobileNewChat = useCallback(() => {
    handleNewChat();
    if (isMobile) {
      setIsExpanded(false);
    }
  }, [handleNewChat, isMobile]);

  return (
    <>
      <style>{scrollbarStyles}</style>

      {/* Mobile: Floating toggle button when sidebar is collapsed */}
      {isMobile && !isExpanded && (
        <div
          data-floating-button="true"
          onClick={() => setIsExpanded(true)}
          style={{
            position: 'fixed',
            top: 'max(16px, env(safe-area-inset-top))',
            left: 16,
            width: 44,
            height: 44,
            minWidth: 44,
            minHeight: 44,
            borderRadius: 12,
            background: '#fff',
            border: '1px solid #E6E6EC',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: 30, // --z-floating-buttons
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
          }}
        >
          <ExpandIcon style={{ width: 20, height: 20 }} />
        </div>
      )}

      {/* Mobile backdrop when expanded - rendered in portal for proper layering */}
      {isMobile && isExpanded && createPortal(
        <div
          data-drawer-backdrop="true"
          onClick={() => setIsExpanded(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'transparent',
            zIndex: 9998, // Above bottom nav (20), below modal overlay (10000)
          }}
        />,
        document.body
      )}

      {/* Sidebar - hidden on mobile when collapsed */}
      <div
        ref={drawerRef}
        data-drawer-panel="true"
        onTouchStart={handleDrawerTouchStart}
        onTouchMove={handleDrawerTouchMove}
        onTouchEnd={handleDrawerTouchEnd}
        style={{
          width: isExpanded ? 260 : 64,
          height: isMobile ? 'calc(100% - env(safe-area-inset-bottom) - 70px)' : '100%',
          padding: 20,
          background: '#fff',
          borderRight: '1px solid #E6E6EC',
          display: isMobile && !isExpanded ? 'none' : 'flex',
          flexDirection: 'column',
          gap: 16,
          transition: isSwipingDrawer ? 'none' : 'width 240ms ease, transform 240ms ease',
          overflow: 'hidden',
          // Mobile-specific: fixed position overlay when expanded - covers full page
          ...(isMobile && {
            position: 'fixed',
            top: 0,
            left: 0,
            zIndex: 9999, // Above backdrop (9998), above bottom nav (20)
            width: 280,
            height: '100dvh',
            paddingTop: 'max(20px, env(safe-area-inset-top))',
            paddingBottom: 'calc(var(--tabbar-h, 70px) + env(safe-area-inset-bottom) + 20px)',
            transform: swipeOffset > 0 ? `translateX(-${swipeOffset}px)` : 'translateX(0)',
            animation: !isSwipingDrawer && isExpanded ? 'drawerSlideIn 0.25s cubic-bezier(0.32, 0.72, 0, 1) forwards' : undefined,
            boxShadow: 'none',
          }),
        }}
      >
        {/* Collapsed */}
        {!isExpanded && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <IconButton
              label="Expand"
              onClick={() => setIsExpanded(true)}
              isMobile={isMobile}
            >
              <ExpandIcon style={{ width: 20, height: 20 }} />
            </IconButton>

            <IconButton label="New chat" onClick={handleMobileNewChat} isMobile={isMobile}>
              <PencilIcon style={{ width: 24, height: 24 }} />
            </IconButton>

            <IconButton
              label="Search"
              onClick={() => {
                setSearchOpen(true);
                setIsExpanded(true);
              }}
              isMobile={isMobile}
            >
              <SearchIcon style={{ width: 24, height: 24 }} />
            </IconButton>
          </div>
        )}

        {/* Expanded header */}
        {isExpanded && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div
              style={{
                color: '#32302C',
                fontFamily: 'Plus Jakarta Sans',
                fontSize: 20,
                fontWeight: 700,
                lineHeight: '30px',
              }}
            >
              {t('chatHistory.chat')}
            </div>

            <IconButton label="Collapse" onClick={() => setIsExpanded(false)} isMobile={isMobile}>
              <ExpandIcon style={{ width: 20, height: 20, transform: 'rotate(180deg)' }} />
            </IconButton>
          </div>
        )}

        {/* Expanded controls */}
        {isExpanded && (
          <>
            <button
              onClick={handleMobileNewChat}
              style={{
                width: '100%',
                minHeight: 40,
                height: 40,
                flexShrink: 0,
                borderRadius: 10,
                border: '1px solid #E6E6EC',
                background: '#F5F5F5',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                padding: '0 12px',
                fontFamily: 'Plus Jakarta Sans',
                fontSize: 13,
                fontWeight: 600,
                color: '#1A1A1A',
              }}
            >
              <PencilIcon style={{ width: 16, height: 16 }} />
              {t('chatHistory.newChat')}
            </button>

            <div style={{ position: 'relative' }}>
              <SearchIcon style={{ width: 18, height: 18, position: 'absolute', left: 12, top: 13 }} />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('chatHistory.searchConversation')}
                style={{
                  width: '100%',
                  height: 44,
                  padding: '10px 12px 10px 38px',
                  background: '#F5F5F5',
                  borderRadius: 12,
                  border: '1px solid #E6E6EC',
                  outline: 'none',
                  fontFamily: 'Plus Jakarta Sans',
                  fontSize: 14,
                }}
                onKeyDown={(e) => {
                  // ChatGPT-like: Enter opens search modal, Esc clears
                  if (e.key === 'Enter') setSearchOpen(true);
                  if (e.key === 'Escape') setSearchQuery('');
                }}
              />
            </div>
          </>
        )}

        {/* Conversation list */}
        {isExpanded && (
          <div className="chat-history-scrollbar" style={{ flex: '1 1 auto', overflowY: 'auto' }}>
            {Object.entries(grouped).map(([day, list]) => {
              if (!list.length) return null;
              return (
                <div key={day} style={{ marginBottom: 18 }}>
                  <div
                    style={{
                      color: '#32302C',
                      fontFamily: 'Plus Jakarta Sans',
                      fontSize: 12,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      marginBottom: 10,
                    }}
                  >
                    {day}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {list.map((c) => {
                      const selected = currentConversation?.id === c.id;
                      return (
                        <div
                          key={c.id}
                          data-testid="conversation-item"
                          data-conversation-id={c.id}
                          onClick={() => handleMobileSelectConversation(c)}
                          onPointerDown={() => preloadConversation(c.id)}
                          onMouseEnter={() => {
                            setHoveredId(c.id);
                            preloadConversation(c.id);
                          }}
                          onMouseLeave={() => setHoveredId(null)}
                          style={{
                            padding: '10px 12px',
                            borderRadius: 12,
                            cursor: 'pointer',
                            background: selected ? '#F5F5F5' : 'transparent',
                            color: selected ? '#32302C' : '#6C6B6E',
                            fontFamily: 'Plus Jakarta Sans',
                            fontSize: 14,
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 10,
                          }}
                        >
                          <div style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {normalizeTitle(c)}
                          </div>

                          {hoveredId === c.id && (
                            <div
                              onClick={(e) => handleDeleteConversation(c.id, e)}
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: 10,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.background = '#FEE4E2')}
                              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                            >
                              <TrashIcon style={{ width: 16, height: 16 }} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {conversations.length === 0 && (
              <div style={{ textAlign: 'center', color: '#6C6B6E', fontSize: 14, marginTop: 16 }}>
                {t('chatHistory.noConversationsYet')}
              </div>
            )}
          </div>
        )}

        {/* Delete All */}
        {isExpanded && conversations.length > 0 && (
          <div
            onClick={handleDeleteAll}
            style={{
              paddingTop: 12,
              borderTop: '1px solid #E6E6EC',
              textAlign: 'center',
              color: '#D92D20',
              fontFamily: 'Plus Jakarta Sans',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
            }}
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

        <SearchModal />
      </div>
    </>
  );
};

function IconButton({ label, onClick, children, isMobile }) {
  return (
    <div
      aria-label={label}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onClick?.();
      }}
      style={{
        width: 44,
        height: 44,
        borderRadius: 12,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        transition: 'background 160ms ease, transform 140ms ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = '#F5F5F5';
        if (!isMobile) e.currentTarget.style.transform = 'scale(1.06)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        if (!isMobile) e.currentTarget.style.transform = 'scale(1)';
      }}
    >
      {children}
    </div>
  );
}

const kbdStyle = {
  fontFamily: 'Plus Jakarta Sans',
  fontSize: 12,
  color: '#6C6B6E',
  background: '#FFFFFF',
  border: '1px solid #E6E6EC',
  borderRadius: 8,
  padding: '6px 8px',
};

export default ChatHistory;
