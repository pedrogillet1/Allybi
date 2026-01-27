/**
 * Message Utilities - Canonical Message Model
 *
 * CHATGPT PARITY: Every message in UI state must follow this structure:
 * - id: unique string (required)
 * - role: 'user' | 'assistant' (required)
 * - status: 'streaming' | 'done' | 'error' (required for UX)
 * - content: string (markdown, can be empty for button-only)
 * - attachments: array (normalized from sourceButtons, fileList, etc.)
 * - sources: array (optional, for citations)
 * - requestId: string (required for streaming integrity)
 * - conversationId: string (optional)
 */

/**
 * Normalize a message to the canonical format
 * Handles various backend response formats and normalizes to consistent structure
 *
 * @param {Object} rawMessage - Raw message from backend/SSE
 * @param {Object} options - Additional options (requestId, status, etc.)
 * @returns {Object} Normalized message
 */
export function normalizeMessage(rawMessage, options = {}) {
  const {
    requestId = null,
    status = 'done',
    conversationId = null,
  } = options;

  // Extract ID with fallbacks
  const id = rawMessage.id ||
             rawMessage.assistantMessageId ||
             rawMessage.messageId ||
             `msg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

  // Determine role
  const role = rawMessage.role || (rawMessage.assistantMessageId ? 'assistant' : 'user');

  // Normalize content - prefer formatted, fallback to fullAnswer, then content
  const content = rawMessage.formatted ||
                  rawMessage.fullAnswer ||
                  rawMessage.content ||
                  '';

  // Normalize attachments from various sources
  const attachments = normalizeAttachments(rawMessage);

  // Normalize sources (for DocumentSources component)
  const sources = normalizeSources(rawMessage);

  // Extract answerMode from multiple possible locations
  const answerMode = rawMessage.answerMode || rawMessage.meta?.answerMode || null;
  const attachmentNavMode = (rawMessage.attachments || []).some(a =>
    a?.type === 'source_buttons' && (a.answerMode === 'nav_pill' || a.answerMode === 'nav_pills')
  );
  const isNavPills = answerMode === 'nav_pill' || answerMode === 'nav_pills' || attachmentNavMode;

  // Build normalized message
  const normalized = {
    id,
    role,
    status,
    content,
    attachments,
    sources,
    requestId: requestId || rawMessage.requestId || null,
    conversationId: conversationId || rawMessage.conversationId || null,
    createdAt: rawMessage.createdAt || new Date().toISOString(),

    // answerMode + meta for MessageActions nav_pills detection
    answerMode,
    meta: { answerMode, isNavPills, hideActions: isNavPills },

    // Preserve additional metadata that components may need
    intent: rawMessage.intent || null,
    confidence: rawMessage.confidence || null,
    constraints: rawMessage.constraints || {},

    // Legacy fields for backward compatibility (will be deprecated)
    ragSources: sources, // Alias for legacy component support
    sourceButtons: rawMessage.sourceButtons || null, // Keep for direct access
    fileList: rawMessage.fileList || null,
    actions: rawMessage.actions || [],
  };

  return normalized;
}

/**
 * Normalize attachments from various backend formats
 * Merges sourceButtons, fileList, and attachments into a unified array
 *
 * @param {Object} rawMessage - Raw message with various attachment fields
 * @returns {Array} Normalized attachments array
 */
export function normalizeAttachments(rawMessage) {
  const attachments = [];

  // 1. Source buttons (CHATGPT-LIKE clickable pills)
  if (rawMessage.sourceButtons?.buttons?.length > 0) {
    attachments.push({
      type: 'source_buttons',
      buttons: rawMessage.sourceButtons.buttons.map(btn => ({
        documentId: btn.documentId,
        title: btn.title,
        mimeType: btn.mimeType,
        folderPath: btn.folderPath || null,
        folderSegments: btn.folderSegments || null,
        location: btn.location || null,
      })),
      seeAll: rawMessage.sourceButtons.seeAll || null,
    });
  }

  // 2. File list (inventory responses)
  if (rawMessage.fileList?.files?.length > 0) {
    attachments.push({
      type: 'file_list',
      files: rawMessage.fileList.files.map(f => ({
        id: f.id,
        filename: f.filename || f.name,
        mimeType: f.mimeType || f.type,
        folderPath: f.folderPath || null,
      })),
      totalCount: rawMessage.fileList.totalCount || rawMessage.fileList.files.length,
      hasMore: rawMessage.fileList.hasMore || false,
    });
  }

  // 3. Direct attachments array (file actions)
  if (rawMessage.attachments?.length > 0) {
    // Check if it's already normalized or raw
    const isNormalized = rawMessage.attachments[0]?.type;
    if (!isNormalized) {
      attachments.push({
        type: 'file_action',
        action: rawMessage.attachments.length === 1 ? 'SHOW_FILE' : 'SELECT_FILE',
        files: rawMessage.attachments.map(att => ({
          id: att.id || att.documentId,
          filename: att.name || att.filename,
          mimeType: att.mimeType || att.type,
          folderPath: att.folderPath || null,
        })),
      });
    } else {
      // Already normalized, just spread
      attachments.push(...rawMessage.attachments);
    }
  }

  // 4. Legacy metadata.files (older file action format)
  if (rawMessage.metadata?.files?.length > 0) {
    const existing = attachments.find(a => a.type === 'file_action');
    if (!existing) {
      attachments.push({
        type: 'file_action',
        action: rawMessage.metadata.action || 'SHOW_FILE',
        files: rawMessage.metadata.files.map(f => ({
          id: f.id,
          filename: f.filename,
          mimeType: f.mimeType,
          folderPath: f.folderPath,
        })),
      });
    }
  }

  return attachments;
}

/**
 * Normalize sources for citations/DocumentSources component
 *
 * @param {Object} rawMessage - Raw message with sources
 * @returns {Array} Normalized sources array
 */
export function normalizeSources(rawMessage) {
  // Prefer 'sources' field, fallback to 'ragSources'
  const rawSources = rawMessage.sources || rawMessage.ragSources || [];

  return rawSources.map(src => ({
    documentId: src.documentId || src.id,
    documentName: src.documentName || src.filename,
    filename: src.filename || src.documentName,
    location: src.location || null,
    mimeType: src.mimeType,
    snippet: src.snippet || null,
    relevanceScore: src.relevanceScore || null,
    openUrl: src.openUrl || null,
    viewUrl: src.viewUrl || null,
    downloadUrl: src.downloadUrl || null,
  }));
}

/**
 * Create an optimistic user message for instant UI feedback
 *
 * @param {string} content - Message content
 * @param {Object} options - Additional options
 * @returns {Object} Optimistic user message
 */
export function createOptimisticUserMessage(content, options = {}) {
  const {
    attachedFiles = [],
    conversationId = null,
  } = options;

  const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  return {
    id: tempId,
    role: 'user',
    status: 'sending',
    content,
    attachments: attachedFiles.map(f => ({
      type: 'attached_file',
      id: f.id,
      filename: f.name || f.filename,
      mimeType: f.type || f.mimeType,
    })),
    sources: [],
    requestId,
    conversationId,
    createdAt: new Date().toISOString(),
    isOptimistic: true, // Flag for UI handling
    attachedFiles, // Keep for backward compatibility
  };
}

/**
 * Create a streaming assistant message placeholder
 *
 * @param {string} requestId - Request ID for correlation
 * @param {string} conversationId - Conversation ID
 * @returns {Object} Streaming placeholder message
 */
export function createStreamingPlaceholder(requestId, conversationId) {
  return {
    id: `streaming_${requestId}`,
    role: 'assistant',
    status: 'streaming',
    content: '',
    attachments: [],
    sources: [],
    requestId,
    conversationId,
    createdAt: new Date().toISOString(),
    isStreaming: true,
  };
}

/**
 * Check if a message has any attachments to render
 *
 * @param {Object} message - Normalized message
 * @returns {boolean} True if message has attachments
 */
export function hasAttachments(message) {
  return message.attachments && message.attachments.length > 0;
}

/**
 * Check if a message should render as "buttons only" (no text content)
 *
 * @param {Object} message - Normalized message
 * @returns {boolean} True if buttons-only rendering
 */
export function isButtonsOnly(message) {
  // Check constraints flag
  if (message.constraints?.buttonsOnly) return true;

  // Check if empty/minimal content with attachments
  const contentLength = (message.content || '').trim().length;
  const hasAttach = hasAttachments(message);

  // Buttons only if: very short content AND has attachments
  return contentLength < 30 && hasAttach;
}

/**
 * DEV ASSERTION: Validate message structure
 * Only runs in development mode
 *
 * @param {Object} message - Message to validate
 * @param {string} context - Context for error messages
 */
export function assertValidMessage(message, context = 'unknown') {
  if (process.env.NODE_ENV !== 'development') return;

  const errors = [];

  if (!message.id) errors.push('Missing id');
  if (!message.role) errors.push('Missing role');
  if (!['user', 'assistant'].includes(message.role)) errors.push(`Invalid role: ${message.role}`);
  if (!message.status) errors.push('Missing status');
  if (!['streaming', 'done', 'error', 'sending', 'sent', 'failed'].includes(message.status)) {
    errors.push(`Invalid status: ${message.status}`);
  }
  if (!Array.isArray(message.attachments)) errors.push('attachments must be array');
  if (!Array.isArray(message.sources)) errors.push('sources must be array');

  if (errors.length > 0) {
    console.warn(`🚨 [DEV ASSERTION] Invalid message in ${context}:`, errors, message);
  }
}

export default {
  normalizeMessage,
  normalizeAttachments,
  normalizeSources,
  createOptimisticUserMessage,
  createStreamingPlaceholder,
  hasAttachments,
  isButtonsOnly,
  assertValidMessage,
};
