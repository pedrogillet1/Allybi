/**
 * Dashboard Routes
 *
 * API endpoints for admin monitoring dashboard
 * All routes are protected by admin authentication
 */

import { Router } from 'express';
import * as dashboardController from '../controllers/dashboard.controller';
import analyticsController from '../controllers/analytics.controller';
import { authenticateToken } from '../middleware/auth.middleware';
import { isAdmin } from '../middleware/admin.middleware';

const router = Router();

/**
 * All dashboard routes require:
 * 1. Authentication (valid JWT token)
 * 2. Admin privileges
 */

// Overview metrics
router.get(
  '/overview',
  authenticateToken,
  isAdmin,
  dashboardController.getOverview
);

// Intent analysis metrics
router.get(
  '/intent-analysis',
  authenticateToken,
  isAdmin,
  dashboardController.getIntentAnalysis
);

// Retrieval performance metrics
router.get(
  '/retrieval',
  authenticateToken,
  isAdmin,
  dashboardController.getRetrieval
);

// Error monitoring metrics
router.get(
  '/errors',
  authenticateToken,
  isAdmin,
  dashboardController.getErrors
);

// User activity metrics
router.get(
  '/users',
  authenticateToken,
  isAdmin,
  dashboardController.getUsers
);

// Database and storage metrics
router.get(
  '/database',
  authenticateToken,
  isAdmin,
  dashboardController.getDatabase
);

// ═══════════════════════════════════════════════════════════════════════════
// ANALYTICS CONTROL PLANE ENDPOINTS
// Complete observability for RAG pipeline
// ═══════════════════════════════════════════════════════════════════════════

// Analytics overview (legacy, from analyticsService)
router.get(
  '/analytics/overview',
  authenticateToken,
  isAdmin,
  analyticsController.getOverview
);

// Quick stats
router.get(
  '/analytics/quick-stats',
  authenticateToken,
  isAdmin,
  analyticsController.getQuickStats
);

// User analytics
router.get(
  '/analytics/users',
  authenticateToken,
  isAdmin,
  analyticsController.getUserAnalytics
);

// Conversation analytics
router.get(
  '/analytics/conversations',
  authenticateToken,
  isAdmin,
  analyticsController.getConversationAnalytics
);

// Document analytics
router.get(
  '/analytics/documents',
  authenticateToken,
  isAdmin,
  analyticsController.getDocumentAnalytics
);

// System health
router.get(
  '/analytics/system-health',
  authenticateToken,
  isAdmin,
  analyticsController.getSystemHealth
);

// Cost analytics
router.get(
  '/analytics/costs',
  authenticateToken,
  isAdmin,
  analyticsController.getCostAnalytics
);

// ═══════════════════════════════════════════════════════════════════════════
// QUERY TELEMETRY ANALYTICS (Control Plane)
// ═══════════════════════════════════════════════════════════════════════════

// Intent classification analytics
router.get(
  '/analytics/intents',
  authenticateToken,
  isAdmin,
  analyticsController.getIntentAnalytics
);

// Retrieval performance analytics
router.get(
  '/analytics/retrieval',
  authenticateToken,
  isAdmin,
  analyticsController.getRetrievalAnalytics
);

// Quality & grounding analytics
router.get(
  '/analytics/quality',
  authenticateToken,
  isAdmin,
  analyticsController.getQualityAnalytics
);

// Language resolution analytics
router.get(
  '/analytics/language',
  authenticateToken,
  isAdmin,
  analyticsController.getLanguageAnalytics
);

// Performance & latency analytics
router.get(
  '/analytics/performance',
  authenticateToken,
  isAdmin,
  analyticsController.getPerformanceAnalytics
);

// Token usage & cost analytics (from telemetry)
router.get(
  '/analytics/telemetry-costs',
  authenticateToken,
  isAdmin,
  analyticsController.getTelemetryCostAnalytics
);

// Query list with filters (paginated)
router.get(
  '/analytics/queries',
  authenticateToken,
  isAdmin,
  analyticsController.getQueryList
);

// Query detail view
router.get(
  '/analytics/queries/:id',
  authenticateToken,
  isAdmin,
  analyticsController.getQueryDetail
);

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

// RAG performance stats
router.get(
  '/analytics/rag-performance',
  authenticateToken,
  isAdmin,
  analyticsController.getRAGPerformance
);

// API performance stats
router.get(
  '/analytics/api-performance',
  authenticateToken,
  isAdmin,
  analyticsController.getAPIPerformance
);

// Token usage
router.get(
  '/analytics/token-usage',
  authenticateToken,
  isAdmin,
  analyticsController.getTokenUsage
);

// Daily token usage trend
router.get(
  '/analytics/token-usage/daily',
  authenticateToken,
  isAdmin,
  analyticsController.getDailyTokenUsage
);

// Error stats
router.get(
  '/analytics/errors',
  authenticateToken,
  isAdmin,
  analyticsController.getErrorStats
);

// Daily aggregates
router.get(
  '/analytics/daily-aggregates',
  authenticateToken,
  isAdmin,
  analyticsController.getDailyAnalyticsAggregates
);

// Feature usage stats
router.get(
  '/analytics/feature-usage',
  authenticateToken,
  isAdmin,
  analyticsController.getFeatureUsageStats
);

// Cache management
router.post(
  '/analytics/refresh',
  authenticateToken,
  isAdmin,
  analyticsController.refreshCache
);

router.get(
  '/analytics/cache-stats',
  authenticateToken,
  isAdmin,
  analyticsController.getCacheStats
);

export default router;
