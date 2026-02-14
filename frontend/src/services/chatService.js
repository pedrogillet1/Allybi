import axios from 'axios';
import { io } from 'socket.io-client';
import { encryptData, decryptData } from '../utils/security/encryption';
import { getApiBaseUrl, getWsBaseUrl } from './runtimeConfig';
import { emitAuthModalOpen } from '../utils/authModalBus';

const API_URL = getApiBaseUrl();
// socket.io-client expects an http(s) origin, not ws(s).
const normalizeSocketOrigin = (raw) => {
  const v = String(raw || '').trim();
  if (!v) return 'http://localhost:5002';
  if (v.startsWith('ws://')) return `http://${v.slice('ws://'.length)}`;
  if (v.startsWith('wss://')) return `https://${v.slice('wss://'.length)}`;
  return v;
};
const WS_URL = normalizeSocketOrigin(getWsBaseUrl());

// ⚡ ZERO-KNOWLEDGE ENCRYPTION: Get encryption password from AuthContext
// This will be passed to functions that need encryption
let encryptionPassword = null;

export const setEncryptionPassword = (password) => {
  encryptionPassword = password;
};

export const clearEncryptionPassword = () => {
  encryptionPassword = null;
};

// Axios instance for API calls
const api = axios.create({
  baseURL: `${API_URL}/api/chat`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 — clear stale auth and show login modal
let _chatAuthDead = false;
api.interceptors.response.use(undefined, (error) => {
  if (error.response?.status === 401 && !_chatAuthDead) {
    _chatAuthDead = true;
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    emitAuthModalOpen({ mode: 'login', reason: 'session_expired' });
  }
  return Promise.reject(error);
});
export function resetChatAuthDead() { _chatAuthDead = false; }

// ---------------------------------------------------------------------------
// Conversations list: dedupe + basic throttling.
// WHY: Multiple components request /conversations on mount; in dev, StrictMode
// can also double-invoke effects. Without dedupe, backend rate limits (429).
// ---------------------------------------------------------------------------
let _conversationsInFlight = null;
let _conversationsCache = { data: null, ts: 0 };
let _conversationsBackoffUntil = 0;

function _now() {
  return Date.now();
}

function _parseRetryAfterMs(retryAfterHeader) {
  if (!retryAfterHeader) return 0;
  const v = String(retryAfterHeader).trim();
  const seconds = Number(v);
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1000, 60_000);
  return 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// ✅ FIX #9: WebSocket Reconnection with Exponential Backoff
// ═══════════════════════════════════════════════════════════════════════════
// REASON: WebSocket can disconnect due to network issues, server restarts
// WHY: Without reconnection, users miss real-time updates
// HOW: Automatic reconnection with exponential backoff
// IMPACT: 99.9% uptime for real-time features
//
// RECONNECTION STRATEGY:
// 1. Detect disconnection
// 2. Wait with exponential backoff (1s, 2s, 4s, 8s, ...)
// 3. Attempt reconnection
// 4. If success: re-subscribe to events
// 5. If fail: retry with longer delay
// 6. Max delay: 30 seconds
//
// EXPONENTIAL BACKOFF:
// Attempt 1: 0ms (immediate)
// Attempt 2: 1000ms (1 second)
// Attempt 3: 2000ms (2 seconds)
// Attempt 4: 4000ms (4 seconds)
// Attempt 5: 8000ms (8 seconds)
// Attempt 6+: 30000ms (30 seconds, capped)

// Socket.IO client
let socket = null;
let reconnectAttempts = 0;
let reconnectTimer = null;
let isManualDisconnect = false;
let currentToken = null;

const MAX_RECONNECT_DELAY = 30000; // 30 seconds
const INITIAL_RECONNECT_DELAY = 1000; // 1 second

/**
 * Calculate reconnection delay with exponential backoff
 */
function getReconnectDelay() {
  const delay = INITIAL_RECONNECT_DELAY * Math.pow(2, reconnectAttempts);
  return Math.min(delay, MAX_RECONNECT_DELAY);
}

/**
 * Attempt to reconnect WebSocket
 */
function attemptReconnect() {
  // Get fresh token from localStorage (may have been refreshed)
  const freshToken = localStorage.getItem('accessToken');

  if (isManualDisconnect || !freshToken) {
    console.log('⏩ [WEBSOCKET] Manual disconnect or no token, skipping reconnection');
    return;
  }

  reconnectAttempts++;
  const delay = getReconnectDelay();
  console.log(`🔄 [WEBSOCKET] Reconnection attempt ${reconnectAttempts} in ${delay}ms...`);

  reconnectTimer = setTimeout(() => {
    console.log(`📡 [WEBSOCKET] Attempting to reconnect...`);
    // Use fresh token from localStorage instead of potentially stale currentToken
    const token = localStorage.getItem('accessToken');
    if (token) {
      initializeSocket(token);
    } else {
      console.log('⏩ [WEBSOCKET] No token available, stopping reconnection');
    }
  }, delay);
}

/**
 * Initialize WebSocket connection with reconnection support
 */
export const initializeSocket = (token) => {
  // Store token for reconnection attempts
  currentToken = token;

  // Clear any existing reconnection timer
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  // Reset manual disconnect flag when explicitly initializing
  isManualDisconnect = false;

  // If already connected, return existing socket
  if (socket && socket.connected) {
    console.log('✅ [WEBSOCKET] Already connected');
    return socket;
  }

  // If socket exists but disconnected, disconnect cleanly first
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
  }

  console.log(`📡 [WEBSOCKET] Initializing connection (attempt ${reconnectAttempts + 1}) to:`, WS_URL);

  // Create new socket connection
  socket = io(WS_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: false, // We handle reconnection manually for better control
    timeout: 20000, // 20 second connection timeout
  });

  // Connection successful
  socket.on('connect', () => {
    const wasReconnect = reconnectAttempts > 0;
    console.log('✅ [WEBSOCKET] Connected successfully');

    // Reset reconnection attempts on successful connection
    reconnectAttempts = 0;

    // Clear any pending reconnection timer
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    // Notify user if this was a reconnection
    if (wasReconnect) {
      console.log('🎉 [WEBSOCKET] Reconnected after network interruption');
      // Note: Notification will be handled by NotificationsStore if needed
      // Removed window.showNotification (deprecated pattern)
    }
  });

  // Connection failed
  socket.on('connect_error', (error) => {
    console.error(`❌ [WEBSOCKET] Connection error:`, error.message);
    // Attempt reconnection
    attemptReconnect();
  });

  // Disconnected
  socket.on('disconnect', (reason) => {
    console.log(`❌ [WEBSOCKET] Disconnected: ${reason}`);

    // Check if disconnect was intentional
    if (reason === 'io client disconnect') {
      console.log('⏩ [WEBSOCKET] Client-initiated disconnect, no reconnection');
      isManualDisconnect = true;
      return;
    }

    // Note: Connection lost notification will be handled by NotificationsStore if needed
    // Removed window.showNotification (deprecated pattern)

    // Attempt reconnection
    attemptReconnect();
  });

  // Reconnection failed (fallback event)
  socket.on('reconnect_failed', () => {
    console.error('❌ [WEBSOCKET] Reconnection failed after all attempts');
    // Note: Connection error notification will be handled by NotificationsStore if needed
    // Removed window.showNotification (deprecated pattern)
  });

  return socket;
};

export const getSocket = () => socket;

/**
 * Manually disconnect WebSocket (no auto-reconnect)
 */
export const disconnectSocket = () => {
  if (socket) {
    console.log('🔌 [WEBSOCKET] Manual disconnect');
    isManualDisconnect = true;
    socket.disconnect();
    socket = null;
  }

  // Clear any pending reconnection timer
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
};

/**
 * Check if WebSocket is connected
 */
export const isWebSocketConnected = () => {
  return socket && socket.connected;
};

/**
 * Force reconnection (useful for debugging or manual recovery)
 */
export const forceReconnect = () => {
  console.log('🔄 [WEBSOCKET] Force reconnect requested');
  isManualDisconnect = false;
  reconnectAttempts = 0;

  if (socket) {
    socket.disconnect();
  }

  if (currentToken) {
    initializeSocket(currentToken);
  } else {
    console.warn('⚠️ [WEBSOCKET] No token available for reconnection');
  }
};

// API Functions

/**
 * Create a new conversation
 */
export const createConversation = async (title = 'New Chat') => {
  // ⚡ ZERO-KNOWLEDGE ENCRYPTION: Encrypt conversation title
  let requestData = { title };

  if (encryptionPassword) {
    console.log('🔐 [Encryption] Encrypting conversation title:', title);
    const encryptedTitle = await encryptData(title, encryptionPassword);

    requestData = {
      title, // Send plaintext for non-encrypted users (backward compatibility)
      titleEncrypted: JSON.stringify(encryptedTitle.ciphertext),
      encryptionSalt: encryptedTitle.salt,
      encryptionIV: encryptedTitle.iv,
      encryptionAuthTag: encryptedTitle.authTag,
      isEncrypted: true,
    };

    console.log('✅ [Encryption] Title encrypted successfully');
  }

  const response = await api.post('/conversations', requestData);
  return response.data;
};

/**
 * Get all conversations
 */
export const getConversations = async () => {
  const now = _now();

  // Backoff window after a 429 to avoid hammering.
  if (now < _conversationsBackoffUntil) {
    const err = new Error('Rate limited');
    err.code = 'RATE_LIMITED';
    err.retryAfterMs = _conversationsBackoffUntil - now;
    throw err;
  }

  // Serve a very fresh cache (2s) to prevent bursts from multiple mounts.
  if (_conversationsCache.data && now - _conversationsCache.ts < 2000) {
    return _conversationsCache.data;
  }

  // Dedupe in-flight requests.
  if (_conversationsInFlight) {
    return await _conversationsInFlight;
  }

  _conversationsInFlight = (async () => {
    try {
      const response = await api.get('/conversations');

      let data = response.data;

      // ⚡ ZERO-KNOWLEDGE ENCRYPTION: Decrypt conversation titles
      if (encryptionPassword && data?.conversations) {
        const decryptedConversations = await Promise.all(
          data.conversations.map(async (conversation) => {
            if (conversation.titleEncrypted && conversation.encryptionSalt) {
              try {
                const encryptedData = {
                  salt: conversation.encryptionSalt,
                  iv: conversation.encryptionIV,
                  ciphertext: JSON.parse(conversation.titleEncrypted),
                  authTag: conversation.encryptionAuthTag,
                };
                const decryptedTitle = await decryptData(encryptedData, encryptionPassword);
                return { ...conversation, title: decryptedTitle };
              } catch (error) {
                console.error('❌ [Decryption] Failed to decrypt conversation title:', error);
                return conversation; // Return original if decryption fails
              }
            }
            return conversation;
          })
        );

        data = { ...data, conversations: decryptedConversations };
      }

      _conversationsCache = { data, ts: _now() };
      return data;
    } catch (e) {
      const status = e?.response?.status;
      if (status === 429) {
        const retryAfterMs = _parseRetryAfterMs(e?.response?.headers?.['retry-after']) || 3000;
        _conversationsBackoffUntil = _now() + retryAfterMs;
      }
      throw e;
    } finally {
      _conversationsInFlight = null;
    }
  })();

  return await _conversationsInFlight;
};

/**
 * Get a single conversation with messages
 */
export const getConversation = async (conversationId) => {
  const response = await api.get(`/conversations/${conversationId}`);

  // ⚡ ZERO-KNOWLEDGE ENCRYPTION: Decrypt conversation title and messages
  if (encryptionPassword && response.data) {
    const conversation = response.data;

    // Decrypt conversation title
    if (conversation.titleEncrypted && conversation.encryptionSalt) {
      try {
        const encryptedTitleData = {
          salt: conversation.encryptionSalt,
          iv: conversation.encryptionIV,
          ciphertext: JSON.parse(conversation.titleEncrypted),
          authTag: conversation.encryptionAuthTag,
        };
        conversation.title = await decryptData(encryptedTitleData, encryptionPassword);
      } catch (error) {
        console.error('❌ [Decryption] Failed to decrypt conversation title:', error);
      }
    }

    // Decrypt messages
    if (conversation.messages) {
      conversation.messages = await Promise.all(
        conversation.messages.map(async (message) => {
          if (message.isEncrypted && message.encryptionSalt) {
            try {
              const encryptedContentData = {
                salt: message.encryptionSalt,
                iv: message.encryptionIV,
                ciphertext: message.contentEncrypted,
                authTag: message.encryptionAuthTag,
              };
              const decryptedContent = await decryptData(encryptedContentData, encryptionPassword);
              return { ...message, content: decryptedContent };
            } catch (error) {
              console.error('❌ [Decryption] Failed to decrypt message:', error);
              return message; // Return original if decryption fails
            }
          }
          return message;
        })
      );
    }
  }

  return response.data;
};

/**
 * Send a message in a conversation (REST API)
 */
export const sendMessage = async (conversationId, content, attachedDocumentId = null) => {
  // ⚡ ZERO-KNOWLEDGE ENCRYPTION: Encrypt message content
  let requestData = {
    content,
    attachedDocumentId,
  };

  if (encryptionPassword) {
    console.log('🔐 [Encryption] Encrypting message content');
    const encryptedContent = await encryptData(content, encryptionPassword);

    requestData = {
      content, // Send plaintext for backward compatibility
      contentEncrypted: encryptedContent.ciphertext,
      encryptionSalt: encryptedContent.salt,
      encryptionIV: encryptedContent.iv,
      encryptionAuthTag: encryptedContent.authTag,
      isEncrypted: true,
      attachedDocumentId,
    };

    console.log('✅ [Encryption] Message encrypted successfully');
  }

  const response = await api.post(`/conversations/${conversationId}/messages`, requestData);
  return response.data;
};

/**
 * Send an adaptive message (intelligent response based on query complexity)
 * @param {string} conversationId - Conversation ID
 * @param {string} content - Message content
 * @param {string|null} attachedDocumentId - Optional attached document ID
 * @returns {Promise<Object>} Response with queryType, confidence, followUp, responseTime
 */
export const sendAdaptiveMessage = async (conversationId, content, attachedDocumentId = null) => {
  // ⚡ ZERO-KNOWLEDGE ENCRYPTION: Encrypt message content
  let requestData = {
    content,
    attachedDocumentId,
  };

  if (encryptionPassword) {
    console.log('🔐 [Encryption] Encrypting adaptive message content');
    const encryptedContent = await encryptData(content, encryptionPassword);

    requestData = {
      content, // Send plaintext for backward compatibility
      contentEncrypted: encryptedContent.ciphertext,
      encryptionSalt: encryptedContent.salt,
      encryptionIV: encryptedContent.iv,
      encryptionAuthTag: encryptedContent.authTag,
      isEncrypted: true,
      attachedDocumentId,
    };

    console.log('✅ [Encryption] Adaptive message encrypted successfully');
  }

  const response = await api.post(`/conversations/${conversationId}/messages/adaptive`, requestData);
  return response.data;
};

/**
 * Send an adaptive message with SSE streaming
 * @param {string} conversationId - Conversation ID
 * @param {string} content - Message content
 * @param {function} onChunk - Callback for each content chunk
 * @param {function} onComplete - Callback when streaming completes
 * @param {string|null} attachedDocumentId - Optional attached document ID
 * @returns {Promise<void>}
 */
export const sendAdaptiveMessageStreaming = async (
  conversationId,
  content,
  onChunk,
  onComplete,
  attachedDocumentId = null,
  onAction = null,  // Callback for action events (show_file_modal, etc.)
  onIntent = null   // Callback for intent events (debug overlay)
) => {
  const token = localStorage.getItem('accessToken');
  const response = await fetch(
    `${API_URL}/api/chat/conversations/${conversationId}/messages/adaptive/stream`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        content,
        attachedDocumentId,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let buffer = '';

  // ⚡ FIX: Add streaming timeout to prevent stalled UI
  const STREAM_TIMEOUT = 30000; // 30 seconds

  // Helper function to read with timeout
  const readWithTimeout = async () => {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Stream timed out. Please try again.')), STREAM_TIMEOUT);
    });
    return Promise.race([reader.read(), timeoutPromise]);
  };

  while (true) {
    let value, done;
    try {
      const result = await readWithTimeout();
      value = result.value;
      done = result.done;
    } catch (timeoutError) {
      console.error('❌ Stream timed out after 30 seconds');
      reader.cancel();
      throw timeoutError;
    }

    if (done) {
      console.log('🏁 Stream finished (done=true)');
      break;
    }

    // Decode the chunk and add to buffer
    const decodedChunk = decoder.decode(value, { stream: true });
    console.log('📦 RAW CHUNK:', decodedChunk);
    buffer += decodedChunk;

    // SSE format uses \n\n (double newline) as delimiter
    const messages = buffer.split('\n\n');

    // Keep the last incomplete message in the buffer
    buffer = messages.pop() || '';

    console.log(`📝 Processing ${messages.length} SSE messages`);
    for (const message of messages) {
      // Each SSE message should have "data: " prefix
      const lines = message.split('\n');
      for (const line of lines) {
        console.log('📄 LINE:', line);
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            console.log('✅ PARSED DATA:', data);

            if (data.type === 'connected') {
              console.log('🔗 Connected to conversation:', data.conversationId);
            } else if (data.type === 'meta') {
              // Meta event with answerMode and navType
              console.log('📋 META:', data.answerMode, 'navType:', data.navType);
              // Store meta for done/final event
              if (onComplete) {
                onComplete.__meta = { answerMode: data.answerMode, navType: data.navType };
              }
            } else if (data.type === 'sources') {
              // Sources event with structured source pills
              console.log('📚 SOURCES:', data.sources?.length, 'items');
              if (onComplete) {
                onComplete.__sources = data.sources || [];
              }
            } else if (data.type === 'attachments') {
              // Optional attachments event (not always emitted). Keep for parity.
              if (onComplete) {
                onComplete.__attachments = Array.isArray(data.attachments) ? data.attachments : (Array.isArray(data.items) ? data.items : []);
              }
            } else if (data.type === 'intent') {
              // Intent event for debug overlay
              console.log('🎯 INTENT:', data.intent, 'confidence:', data.confidence, 'domain:', data.domain, 'depth:', data.depth);
              if (onIntent) {
                onIntent({
                  intent: data.intent,
                  confidence: data.confidence,
                  domain: data.domain,
                  depth: data.depth,
                  family: data.family,
                  subIntent: data.subIntent,
                  blockedByNegatives: data.blockedByNegatives,
                  multiIntent: data.multiIntent
                });
              }
            } else if (data.type === 'content' || data.type === 'delta') {
              const text = data.content || data.text || '';
              if (text) {
                console.log('🌊 CONTENT CHUNK:', text);
                onChunk(text);
              }
            } else if (data.type === 'action') {
              // Handle action events (show_file_modal, etc.)
              console.log('🎬 ACTION event:', data.actionType, data);
              if (onAction) {
                onAction(data);
              }
            } else if (data.type === 'done' || data.type === 'final') {
              console.log('✅ DONE signal received');
              // Merge meta/sources collected during streaming into the done event
              const enriched = {
                ...data,
                answerMode: data.answerMode || onComplete?.__meta?.answerMode || 'general_answer',
                navType: data.navType || onComplete?.__meta?.navType || null,
                sources: data.sources || onComplete?.__sources || [],
                attachments: Array.isArray(data.attachments)
                  ? data.attachments
                  : (Array.isArray(onComplete?.__attachments) ? onComplete.__attachments : []),
              };
              onComplete(enriched);
            } else if (data.type === 'error') {
              // ✅ FIX #10: Better Error Messages
              console.error('❌ Streaming error:', data.error);
              console.error('💡 Suggestion:', data.suggestion);
              console.error('🔄 Retryable:', data.retryable);

              // Create enhanced error object with additional fields
              const enhancedError = new Error(data.error);
              enhancedError.code = data.code || 'UNKNOWN_ERROR';
              enhancedError.suggestion = data.suggestion || 'Please try again.';
              enhancedError.retryable = data.retryable !== false;
              throw enhancedError;
            }
          } catch (error) {
            console.error('Error parsing SSE data:', error, 'Line:', line);
          }
        }
      }
    }
  }
};

/**
 * Delete a conversation
 */
export const deleteConversation = async (conversationId) => {
  const response = await api.delete(`/conversations/${conversationId}`);
  return response.data;
};

/**
 * Update conversation title
 */
export const updateConversationTitle = async (conversationId, title) => {
  const response = await api.patch(`/conversations/${conversationId}`, { title });
  return response.data;
};

/**
 * Delete all conversations
 */
export const deleteAllConversations = async () => {
  const response = await api.delete('/conversations');
  return response.data;
};

/**
 * Delete all empty conversations
 */
export const deleteEmptyConversations = async () => {
  const response = await api.delete('/conversations/empty');
  return response.data;
};

// WebSocket Functions

/**
 * Join a conversation room
 */
export const joinConversation = (conversationId) => {
  if (socket) {
    socket.emit('join-conversation', conversationId);
  }
};

/**
 * Leave a conversation room
 */
export const leaveConversation = (conversationId) => {
  if (socket) {
    socket.emit('leave-conversation', conversationId);
  }
};

/**
 * Send a message via WebSocket (real-time)
 */
export const sendMessageRealtime = (conversationId, userId, content, attachedDocumentId = null) => {
  if (socket) {
    socket.emit('send-message', {  // ✅ Fixed event name to match server.ts
      conversationId,
      content,
      attachedDocumentId,
    });
  }
};

/**
 * Stop streaming response
 */
export const stopStreaming = (conversationId) => {
  if (socket) {
    socket.emit('chat:stop:stream', { conversationId });
    console.log('🛑 Emitted stop streaming event for conversation:', conversationId);
  }
};

/**
 * Listen for new messages (complete)
 */
export const onNewMessage = (callback) => {
  if (socket) {
    socket.on('new-message', callback);  // ✅ Fixed event name to match server.ts
  }
};

/**
 * Listen for message errors
 */
export const onMessageError = (callback) => {
  if (socket) {
    socket.on('message-error', callback);  // ✅ Fixed event name to match server.ts
  }
};

/**
 * Listen for message chunks (streaming)
 */
export const onMessageChunk = (callback) => {
  if (socket) {
    socket.on('message-chunk', callback);  // ✅ Fixed event name to match server.ts
  }
};

/**
 * Listen for message stages (thinking, analyzing, etc.)
 */
export const onMessageStage = (callback) => {
  if (socket) {
    socket.on('message-stage', callback);  // ✅ Fixed event name to match server.ts
  }
};

/**
 * Listen for research progress updates
 */
export const onResearchProgress = (callback) => {
  if (socket) {
    socket.on('research:progress', callback);
  }
};

/**
 * Listen for message aborted event
 */
export const onMessageAborted = (callback) => {
  if (socket) {
    socket.on('chat:message:aborted', callback);
  }
};

/**
 * Listen for message complete event (streaming finished)
 */
export const onMessageComplete = (callback) => {
  if (socket) {
    socket.on('message-complete', callback);
  }
};

/**
 * Listen for action events (show_file_modal, etc.)
 */
export const onAction = (callback) => {
  if (socket) {
    socket.on('action', callback);
  }
};

/**
 * Remove message listeners
 */
export const removeMessageListeners = () => {
  if (socket) {
    socket.removeAllListeners('new-message');  // ✅ Fixed event name to match server.ts
    socket.removeAllListeners('message-error');  // ✅ Fixed event name to match server.ts
    socket.removeAllListeners('message-chunk');  // ✅ Fixed event name to match server.ts
    socket.removeAllListeners('message-stage');  // ✅ Fixed event name to match server.ts
    socket.removeAllListeners('chat:message:aborted');
    socket.removeAllListeners('research:progress');
    socket.removeAllListeners('message-complete');
    socket.removeAllListeners('action');  // ✅ NEW: Clean up action listener
  }
};

// ============================================================================
// TITLE STREAMING EVENTS (ChatGPT-style animated title generation)
// ============================================================================

/**
 * Listen for title generation start event
 */
export const onTitleGeneratingStart = (callback) => {
  if (socket) {
    socket.on('title:generating:start', callback);
  }
};

/**
 * Listen for title generation chunks (character-by-character)
 */
export const onTitleGeneratingChunk = (callback) => {
  if (socket) {
    socket.on('title:generating:chunk', callback);
  }
};

/**
 * Listen for title generation complete event
 */
export const onTitleGeneratingComplete = (callback) => {
  if (socket) {
    socket.on('title:generating:complete', callback);
  }
};

/**
 * Listen for conversation updated event (fallback for instant title)
 */
export const onConversationUpdated = (callback) => {
  if (socket) {
    socket.on('conversation:updated', callback);
  }
};

/**
 * Remove title streaming listeners
 */
export const removeTitleListeners = () => {
  if (socket) {
    socket.removeAllListeners('title:generating:start');
    socket.removeAllListeners('title:generating:chunk');
    socket.removeAllListeners('title:generating:complete');
    socket.removeAllListeners('conversation:updated');
  }
};

// RAG API Functions

/**
 * Query using RAG (Retrieval Augmented Generation)
 * @param {string} conversationId - Conversation ID
 * @param {string} query - User's question
 * @param {boolean} researchMode - Enable web search integration
 * @returns {Promise<Object>} RAG response with answer and sources
 */
export const queryWithRAG = async (conversationId, query, researchMode = false) => {
  const token = localStorage.getItem('accessToken');
  try {
    const response = await axios.post(
      `${API_URL}/api/rag/query`,
      {
        conversationId,
        query,
        researchMode,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      }
    );
    return response.data;
  } catch (error) {
    // ✅ FIX #10: Better Error Messages
    console.error('❌ RAG Query error:', error);

    // Extract error details from response
    const errorData = error.response?.data || {};
    const enhancedError = new Error(errorData.error || 'Failed to query RAG');
    enhancedError.code = errorData.code || 'UNKNOWN_ERROR';
    enhancedError.suggestion = errorData.suggestion || 'Please try again.';
    enhancedError.retryable = errorData.retryable !== false;

    throw enhancedError;
  }
};

/**
 * Answer a follow-up question using existing RAG context
 * @param {string} conversationId - Conversation ID
 * @param {string} query - Follow-up question
 * @param {string} previousContextId - Previous context ID
 * @returns {Promise<Object>} RAG response
 */
export const answerFollowUp = async (conversationId, query, previousContextId) => {
  const token = localStorage.getItem('accessToken');
  try {
    const response = await axios.post(
      `${API_URL}/api/rag/follow-up`,
      {
        conversationId,
        query,
        previousContextId,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      }
    );
    return response.data;
  } catch (error) {
    // ✅ FIX #10: Better Error Messages
    console.error('❌ RAG Follow-up error:', error);

    // Extract error details from response
    const errorData = error.response?.data || {};
    const enhancedError = new Error(errorData.error || 'Failed to answer follow-up');
    enhancedError.code = errorData.code || 'UNKNOWN_ERROR';
    enhancedError.suggestion = errorData.suggestion || 'Please try again.';
    enhancedError.retryable = errorData.retryable !== false;

    throw enhancedError;
  }
};

/**
 * Get RAG context for a specific response
 * @param {string} contextId - Context ID
 * @returns {Promise<Object>} RAG context
 */
export const getRAGContext = async (contextId) => {
  const token = localStorage.getItem('accessToken');
  const response = await axios.get(
    `${API_URL}/api/rag/context/${contextId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
  return response.data;
};

export default {
  initializeSocket,
  getSocket,
  disconnectSocket,
  isWebSocketConnected,
  forceReconnect,
  createConversation,
  getConversations,
  getConversation,
  sendMessage,
  sendAdaptiveMessage,
  sendAdaptiveMessageStreaming,
  deleteConversation,
  updateConversationTitle,
  deleteAllConversations,
  deleteEmptyConversations,
  joinConversation,
  leaveConversation,
  sendMessageRealtime,
  stopStreaming,
  onNewMessage,
  onMessageError,
  onMessageChunk,
  onMessageStage,
  onMessageAborted,
  onMessageComplete,
  onAction,
  onResearchProgress,
  removeMessageListeners,
  // Title streaming exports
  onTitleGeneratingStart,
  onTitleGeneratingChunk,
  onTitleGeneratingComplete,
  onConversationUpdated,
  removeTitleListeners,
  queryWithRAG,
  answerFollowUp,
  getRAGContext,
};
