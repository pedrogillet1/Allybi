/**
 * Public Analytics Routes
 *
 * PURPOSE: Define public API routes for user feedback and event tracking
 * BASE: /api/analytics
 */

import { Router } from 'express';
import analyticsController from '../controllers/analytics.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

// All public analytics routes require authentication (but not admin)
router.use(authenticateToken);

// ═══════════════════════════════════════════════════════════════════════════
// FEEDBACK ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /api/analytics/feedback
 * Record user feedback for a conversation/message
 * Body: {
 *   conversationId: string (required),
 *   messageId?: string,
 *   feedbackType: 'thumbs_up' | 'thumbs_down' | 'rating' | 'comment' (required),
 *   rating?: number (1-5),
 *   comment?: string,
 *   categories?: string[]
 * }
 */
router.post('/feedback', analyticsController.recordFeedback);

// ═══════════════════════════════════════════════════════════════════════════
// EVENT TRACKING ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /api/analytics/track
 * Track a generic analytics event
 * Body: {
 *   eventType: string (required),
 *   eventName: string (required),
 *   category?: string,
 *   properties?: object,
 *   duration?: number
 * }
 */
router.post('/track', analyticsController.trackEvent);

export default router;
