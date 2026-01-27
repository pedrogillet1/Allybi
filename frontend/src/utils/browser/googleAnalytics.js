/**
 * Google Analytics 4 Tracking Utility
 *
 * PURPOSE: Provides easy-to-use functions for tracking events in GA4
 * USAGE: Import and call functions to track user interactions
 */

// Check if GA is available
const isGAAvailable = () => {
  return typeof window !== 'undefined' && typeof window.gtag === 'function';
};

/**
 * Track a custom event
 * @param {string} eventName - Name of the event
 * @param {object} params - Event parameters
 */
export const trackEvent = (eventName, params = {}) => {
  if (!isGAAvailable()) {
    console.debug('[GA] gtag not available, skipping event:', eventName);
    return;
  }

  window.gtag('event', eventName, params);
};

/**
 * Track a page view
 * @param {string} pagePath - The page path
 * @param {string} pageTitle - The page title
 */
export const trackPageView = (pagePath, pageTitle) => {
  if (!isGAAvailable()) return;

  window.gtag('event', 'page_view', {
    page_path: pagePath,
    page_title: pageTitle,
  });
};

// ═══════════════════════════════════════════════════════════════════════════
// KODA-SPECIFIC EVENTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Track user login
 * @param {string} method - Login method (email, google, etc.)
 */
export const trackLogin = (method = 'email') => {
  trackEvent('login', { method });
};

/**
 * Track user signup
 * @param {string} method - Signup method
 */
export const trackSignup = (method = 'email') => {
  trackEvent('sign_up', { method });
};

/**
 * Track chat message sent
 * @param {object} params - Message parameters
 */
export const trackChatMessage = (params = {}) => {
  trackEvent('chat_message_sent', {
    conversation_id: params.conversationId,
    message_length: params.messageLength,
    has_attachments: params.hasAttachments || false,
  });
};

/**
 * Track document upload
 * @param {object} params - Document parameters
 */
export const trackDocumentUpload = (params = {}) => {
  trackEvent('document_upload', {
    file_type: params.fileType,
    file_size: params.fileSize,
    folder_id: params.folderId,
  });
};

/**
 * Track document download
 * @param {object} params - Document parameters
 */
export const trackDocumentDownload = (params = {}) => {
  trackEvent('document_download', {
    document_id: params.documentId,
    file_type: params.fileType,
  });
};

/**
 * Track search performed
 * @param {string} searchTerm - The search query
 * @param {number} resultsCount - Number of results
 */
export const trackSearch = (searchTerm, resultsCount = 0) => {
  trackEvent('search', {
    search_term: searchTerm,
    results_count: resultsCount,
  });
};

/**
 * Track feature usage
 * @param {string} featureName - Name of the feature
 * @param {object} params - Additional parameters
 */
export const trackFeatureUsage = (featureName, params = {}) => {
  trackEvent('feature_usage', {
    feature_name: featureName,
    ...params,
  });
};

/**
 * Track feedback given
 * @param {string} feedbackType - Type of feedback (thumbs_up, thumbs_down)
 * @param {object} params - Additional parameters
 */
export const trackFeedback = (feedbackType, params = {}) => {
  trackEvent('feedback_given', {
    feedback_type: feedbackType,
    conversation_id: params.conversationId,
    message_id: params.messageId,
  });
};

/**
 * Track error occurred
 * @param {string} errorType - Type of error
 * @param {string} errorMessage - Error message
 */
export const trackError = (errorType, errorMessage) => {
  trackEvent('error', {
    error_type: errorType,
    error_message: errorMessage?.substring(0, 100), // Limit length
  });
};

/**
 * Track document generation
 * @param {string} documentType - Type of document generated
 * @param {object} params - Additional parameters
 */
export const trackDocumentGeneration = (documentType, params = {}) => {
  trackEvent('document_generated', {
    document_type: documentType,
    ...params,
  });
};

/**
 * Track folder creation
 * @param {string} folderName - Name of the folder
 */
export const trackFolderCreation = (folderName) => {
  trackEvent('folder_created', {
    folder_name: folderName,
  });
};

/**
 * Track conversation started
 */
export const trackConversationStarted = () => {
  trackEvent('conversation_started');
};

/**
 * Track session duration
 * @param {number} durationSeconds - Session duration in seconds
 */
export const trackSessionDuration = (durationSeconds) => {
  trackEvent('session_duration', {
    duration_seconds: durationSeconds,
  });
};

/**
 * Set user properties for better analytics
 * @param {object} properties - User properties
 */
export const setUserProperties = (properties = {}) => {
  if (!isGAAvailable()) return;

  window.gtag('set', 'user_properties', properties);
};

/**
 * Set user ID for cross-device tracking
 * @param {string} userId - The user's ID
 */
export const setUserId = (userId) => {
  if (!isGAAvailable()) return;

  window.gtag('set', { user_id: userId });
};

export default {
  trackEvent,
  trackPageView,
  trackLogin,
  trackSignup,
  trackChatMessage,
  trackDocumentUpload,
  trackDocumentDownload,
  trackSearch,
  trackFeatureUsage,
  trackFeedback,
  trackError,
  trackDocumentGeneration,
  trackFolderCreation,
  trackConversationStarted,
  trackSessionDuration,
  setUserProperties,
  setUserId,
};
