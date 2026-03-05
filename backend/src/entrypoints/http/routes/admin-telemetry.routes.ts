// backend/src/routes/adminTelemetry.routes.ts
//
// Complete Admin Telemetry routes for Koda Dashboard.
// All endpoints guarded by requireAdmin + requireAdminKey (production)
//

import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { apiLimiter } from "../../../middleware/rateLimit.middleware";
import { authenticateAdmin } from "../../../middleware/admin.middleware";
import { requireAdminKey } from "../../../middleware/adminKey.middleware";

import {
  // Overview
  adminTelemetryOverview,
  adminTelemetryTimeseries,
  // Users
  adminTelemetryUsers,
  adminTelemetryUserDetail,
  // Files
  adminTelemetryFiles,
  adminTelemetryFileDetail,
  // Queries
  adminTelemetryQueries,
  adminTelemetryRetrievalTopRewriteRules,
  adminTelemetryRetrievalTopBoostRules,
  adminTelemetryRetrievalWorstRules,
  // Intents
  adminTelemetryIntents,
  adminTelemetryIntentDetail,
  // Domains
  adminTelemetryDomains,
  adminTelemetryDomainDetail,
  adminTelemetryDomainMatrix,
  // Keywords
  adminTelemetryKeywords,
  adminTelemetryTopKeywords,
  adminTelemetryTrendingKeywords,
  // Patterns
  adminTelemetryPatterns,
  adminTelemetryPatternDetail,
  // Interactions
  adminTelemetryInteractions,
  adminTelemetryInteractionDetail,
  // Quality
  adminTelemetryQuality,
  adminTelemetryQualityBreakdown,
  adminTelemetryReaskRate,
  adminTelemetryTruncationRate,
  adminTelemetryRegenerationRate,
  // LLM / Cost
  adminTelemetryLLM,
  adminTelemetryLLMProviders,
  adminTelemetryLLMStages,
  adminTelemetryTokensPerQuery,
  // Errors
  adminTelemetryErrors,
  adminTelemetryErrorSummary,
  // Reliability
  adminTelemetryReliability,
  // Security
  adminTelemetrySecurity,
  adminTelemetrySecurityEvents,
  adminTelemetryAuditLog,
  // API Metrics
  adminTelemetryAPIMetrics,
  adminTelemetryExternalProviders,
  // Live Feed (SSE)
  adminTelemetryLiveFeed,
} from "../../../controllers/adminTelemetry.controller";

const router = Router();

// Prevent caching of telemetry data
router.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

// Require admin authentication on all telemetry endpoints
router.use(authenticateAdmin);

// Gate 2: Require X-KODA-ADMIN-KEY header in production
if (process.env.NODE_ENV === "production") {
  router.use(requireAdminKey);
}

// Rate limit telemetry endpoints
router.use(apiLimiter);

// ============================================================================
// OVERVIEW + TIMESERIES
// ============================================================================
router.get("/overview", adminTelemetryOverview);
router.get("/timeseries", adminTelemetryTimeseries);

// ============================================================================
// USERS
// ============================================================================
router.get("/users", adminTelemetryUsers);
router.get("/users/:userId", adminTelemetryUserDetail);

// ============================================================================
// FILES
// ============================================================================
router.get("/files", adminTelemetryFiles);
router.get("/files/:fileId", adminTelemetryFileDetail);

// ============================================================================
// QUERIES
// ============================================================================
router.get("/queries", adminTelemetryQueries);
router.get(
  "/retrieval/rules/rewrite/top",
  adminTelemetryRetrievalTopRewriteRules,
);
router.get("/retrieval/rules/boost/top", adminTelemetryRetrievalTopBoostRules);
router.get("/retrieval/rules/worst", adminTelemetryRetrievalWorstRules);

// ============================================================================
// INTENTS
// ============================================================================
router.get("/intents", adminTelemetryIntents);
router.get("/intents/:intent", adminTelemetryIntentDetail);

// ============================================================================
// DOMAINS
// ============================================================================
router.get("/domains", adminTelemetryDomains);
router.get("/domains/matrix", adminTelemetryDomainMatrix);
router.get("/domains/:domain", adminTelemetryDomainDetail);

// ============================================================================
// KEYWORDS
// ============================================================================
router.get("/keywords", adminTelemetryKeywords);
router.get("/keywords/top", adminTelemetryTopKeywords);
router.get("/keywords/trending", adminTelemetryTrendingKeywords);

// ============================================================================
// PATTERNS
// ============================================================================
router.get("/patterns", adminTelemetryPatterns);
router.get("/patterns/:patternId", adminTelemetryPatternDetail);

// ============================================================================
// INTERACTIONS (Trace-level)
// ============================================================================
router.get("/interactions", adminTelemetryInteractions);
router.get("/interactions/:traceId", adminTelemetryInteractionDetail);

// ============================================================================
// QUALITY
// ============================================================================
router.get("/quality", adminTelemetryQuality);
router.get("/quality/breakdown", adminTelemetryQualityBreakdown);
router.get("/quality/reask-rate", adminTelemetryReaskRate);
router.get("/quality/truncation-rate", adminTelemetryTruncationRate);
router.get("/quality/regeneration-rate", adminTelemetryRegenerationRate);

// ============================================================================
// LLM / COST
// ============================================================================
router.get("/llm", adminTelemetryLLM);
router.get("/llm/providers", adminTelemetryLLMProviders);
router.get("/llm/stages", adminTelemetryLLMStages);
router.get("/llm/tokens-per-query", adminTelemetryTokensPerQuery);

// ============================================================================
// ERRORS
// ============================================================================
router.get("/errors", adminTelemetryErrors);
router.get("/errors/summary", adminTelemetryErrorSummary);

// ============================================================================
// RELIABILITY
// ============================================================================
router.get("/reliability", adminTelemetryReliability);

// ============================================================================
// SECURITY
// ============================================================================
router.get("/security", adminTelemetrySecurity);
router.get("/security/events", adminTelemetrySecurityEvents);
router.get("/security/audit", adminTelemetryAuditLog);

// ============================================================================
// API METRICS
// ============================================================================
router.get("/api-metrics", adminTelemetryAPIMetrics);
router.get("/api-metrics/external", adminTelemetryExternalProviders);

// ============================================================================
// LIVE FEED (Server-Sent Events)
// ============================================================================
router.get("/live/events", adminTelemetryLiveFeed);

// ============================================================================
// ERROR BOUNDARY
// ============================================================================
router.use(
  (err: unknown, _req: Request, _res: Response, next: NextFunction) => {
    next(err);
  },
);

export default router;
