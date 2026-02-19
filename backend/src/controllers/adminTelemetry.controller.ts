// backend/src/controllers/adminTelemetry.controller.ts
//
// Complete Admin Telemetry Controller for Koda Dashboard.
// Thin HTTP layer - delegates to AdminTelemetryAppService via app.locals.services
//

import type { Request, Response, NextFunction } from "express";

type AdminTelemetryAppService = {
  overview: (params: { range: string }) => Promise<any>;
  timeseries: (params: { metric: string; range: string }) => Promise<any>;
  users: (params: {
    range: string;
    limit: number;
    cursor?: string;
  }) => Promise<any>;
  userDetail: (params: { userId: string; range: string }) => Promise<any>;
  files: (params: {
    range: string;
    limit: number;
    cursor?: string;
  }) => Promise<any>;
  fileDetail: (params: { fileId: string; range: string }) => Promise<any>;
  queries: (params: {
    range: string;
    limit: number;
    cursor?: string;
    domain?: string;
    intent?: string;
  }) => Promise<any>;
  intents: (params: { range: string; limit: number }) => Promise<any>;
  intentDetail: (params: { intent: string; range: string }) => Promise<any>;
  domains: (params: { range: string; limit: number }) => Promise<any>;
  domainDetail: (params: { domain: string; range: string }) => Promise<any>;
  domainMatrix: (params: { range: string }) => Promise<any>;
  keywords: (params: {
    range: string;
    limit: number;
    domain?: string;
    search?: string;
  }) => Promise<any>;
  topKeywords: (params: { range: string; limit: number }) => Promise<any>;
  trendingKeywords: (params: { range: string; limit: number }) => Promise<any>;
  patterns: (params: { range: string; limit: number }) => Promise<any>;
  patternDetail: (params: { patternId: string; range: string }) => Promise<any>;
  interactions: (params: {
    range: string;
    limit: number;
    cursor?: string;
  }) => Promise<any>;
  interactionDetail: (params: { traceId: string }) => Promise<any>;
  quality: (params: {
    range: string;
    limit: number;
    cursor?: string;
  }) => Promise<any>;
  qualityBreakdown: (params: { range: string }) => Promise<any>;
  reaskRate: (params: { range: string }) => Promise<any>;
  llm: (params: {
    range: string;
    limit: number;
    cursor?: string;
    provider?: string;
    model?: string;
  }) => Promise<any>;
  llmProviders: (params: { range: string }) => Promise<any>;
  llmStages: (params: { range: string }) => Promise<any>;
  tokensPerQuery: (params: { range: string }) => Promise<any>;
  errors: (params: {
    range: string;
    limit: number;
    cursor?: string;
  }) => Promise<any>;
  errorSummary: (params: { range: string }) => Promise<any>;
  reliability: (params: { range: string }) => Promise<any>;
  security: (params: { range: string }) => Promise<any>;
  securityEvents: (params: {
    range: string;
    limit: number;
    cursor?: string;
  }) => Promise<any>;
  auditLog: (params: {
    range: string;
    limit: number;
    cursor?: string;
  }) => Promise<any>;
  apiMetrics: (params: { range: string }) => Promise<any>;
  externalProviders: (params: { range: string }) => Promise<any>;
};

type AdminTelemetryServices = {
  adminTelemetryApp?: AdminTelemetryAppService;
};

function getSvc(req: Request): AdminTelemetryAppService {
  const services = (req.app.locals.services as AdminTelemetryServices) || {};
  const svc = services.adminTelemetryApp;
  if (!svc) {
    const err = new Error("ADMIN_TELEMETRY_APP_NOT_WIRED");
    (err as any).status = 500;
    throw err;
  }
  return svc;
}

function parseRange(input: unknown, fallback = "7d"): string {
  const v = String(input ?? "").trim();
  if (!v) return fallback;
  if (/^(1d|24h|7d|30d|90d)$/i.test(v))
    return v.toLowerCase().replace("24h", "1d");
  return fallback;
}

function parseLimit(input: unknown, fallback = 50): number {
  const n = Number(input);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.max(Math.floor(n), 1), 200);
}

function parseCursor(input: unknown): string | undefined {
  const v = String(input ?? "").trim();
  return v || undefined;
}

function parseOptionalString(input: unknown): string | undefined {
  const v = String(input ?? "").trim();
  return v || undefined;
}

// ============================================================================
// OVERVIEW + TIMESERIES
// ============================================================================

export async function adminTelemetryOverview(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const svc = getSvc(req);
    const range = parseRange(req.query.range, "7d");
    const data = await svc.overview({ range });
    res.json({ ok: true, range, data });
  } catch (e) {
    next(e);
  }
}

export async function adminTelemetryTimeseries(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const svc = getSvc(req);
    const metric = String(req.query.metric || "dau").trim();
    const range = parseRange(req.query.range, "30d");
    const data = await svc.timeseries({ metric, range });
    res.json({ ok: true, metric, range, data });
  } catch (e) {
    next(e);
  }
}

// ============================================================================
// USERS
// ============================================================================

export async function adminTelemetryUsers(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const svc = getSvc(req);
    const range = parseRange(req.query.range, "7d");
    const limit = parseLimit(req.query.limit, 50);
    const cursor = parseCursor(req.query.cursor);
    const data = await svc.users({ range, limit, cursor });
    res.json({ ok: true, range, ...data });
  } catch (e) {
    next(e);
  }
}

export async function adminTelemetryUserDetail(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const svc = getSvc(req);
    const userId = String(req.params.userId);
    const range = parseRange(req.query.range, "7d");
    const data = await svc.userDetail({ userId, range });
    res.json({ ok: true, range, data });
  } catch (e) {
    next(e);
  }
}

// ============================================================================
// FILES
// ============================================================================

export async function adminTelemetryFiles(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const svc = getSvc(req);
    const range = parseRange(req.query.range, "7d");
    const limit = parseLimit(req.query.limit, 50);
    const cursor = parseCursor(req.query.cursor);
    const data = await svc.files({ range, limit, cursor });
    res.json({ ok: true, range, ...data });
  } catch (e) {
    next(e);
  }
}

export async function adminTelemetryFileDetail(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const svc = getSvc(req);
    const fileId = String(req.params.fileId);
    const range = parseRange(req.query.range, "30d");
    const data = await svc.fileDetail({ fileId, range });
    res.json({ ok: true, range, data });
  } catch (e) {
    next(e);
  }
}

// ============================================================================
// QUERIES
// ============================================================================

export async function adminTelemetryQueries(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const svc = getSvc(req);
    const range = parseRange(req.query.range, "7d");
    const limit = parseLimit(req.query.limit, 50);
    const cursor = parseCursor(req.query.cursor);
    const domain = parseOptionalString(req.query.domain);
    const intent = parseOptionalString(req.query.intent);
    const data = await svc.queries({ range, limit, cursor, domain, intent });
    res.json({ ok: true, range, ...data });
  } catch (e) {
    next(e);
  }
}

// ============================================================================
// INTENTS
// ============================================================================

export async function adminTelemetryIntents(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const svc = getSvc(req);
    const range = parseRange(req.query.range, "7d");
    const limit = parseLimit(req.query.limit, 50);
    const data = await svc.intents({ range, limit });
    res.json({ ok: true, range, ...data });
  } catch (e) {
    next(e);
  }
}

export async function adminTelemetryIntentDetail(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const svc = getSvc(req);
    const intent = String(req.params.intent);
    const range = parseRange(req.query.range, "7d");
    const data = await svc.intentDetail({ intent, range });
    res.json({ ok: true, range, data });
  } catch (e) {
    next(e);
  }
}

// ============================================================================
// DOMAINS
// ============================================================================

export async function adminTelemetryDomains(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const svc = getSvc(req);
    const range = parseRange(req.query.range, "7d");
    const limit = parseLimit(req.query.limit, 50);
    const data = await svc.domains({ range, limit });
    res.json({ ok: true, range, ...data });
  } catch (e) {
    next(e);
  }
}

export async function adminTelemetryDomainDetail(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const svc = getSvc(req);
    const domain = String(req.params.domain);
    const range = parseRange(req.query.range, "7d");
    const data = await svc.domainDetail({ domain, range });
    res.json({ ok: true, range, data });
  } catch (e) {
    next(e);
  }
}

export async function adminTelemetryDomainMatrix(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const svc = getSvc(req);
    const range = parseRange(req.query.range, "7d");
    const data = await svc.domainMatrix({ range });
    res.json({ ok: true, range, data });
  } catch (e) {
    next(e);
  }
}

// ============================================================================
// KEYWORDS
// ============================================================================

export async function adminTelemetryKeywords(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const svc = getSvc(req);
    const range = parseRange(req.query.range, "7d");
    const limit = parseLimit(req.query.limit, 100);
    const domain = parseOptionalString(req.query.domain);
    const search = parseOptionalString(req.query.search);
    const data = await svc.keywords({ range, limit, domain, search });
    res.json({ ok: true, range, ...data });
  } catch (e) {
    next(e);
  }
}

export async function adminTelemetryTopKeywords(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const svc = getSvc(req);
    const range = parseRange(req.query.range, "7d");
    const limit = parseLimit(req.query.limit, 20);
    const data = await svc.topKeywords({ range, limit });
    res.json({ ok: true, range, ...data });
  } catch (e) {
    next(e);
  }
}

export async function adminTelemetryTrendingKeywords(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const svc = getSvc(req);
    const range = parseRange(req.query.range, "7d");
    const limit = parseLimit(req.query.limit, 20);
    const data = await svc.trendingKeywords({ range, limit });
    res.json({ ok: true, range, ...data });
  } catch (e) {
    next(e);
  }
}

// ============================================================================
// PATTERNS
// ============================================================================

export async function adminTelemetryPatterns(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const svc = getSvc(req);
    const range = parseRange(req.query.range, "7d");
    const limit = parseLimit(req.query.limit, 50);
    const data = await svc.patterns({ range, limit });
    res.json({ ok: true, range, ...data });
  } catch (e) {
    next(e);
  }
}

export async function adminTelemetryPatternDetail(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const svc = getSvc(req);
    const patternId = String(req.params.patternId);
    const range = parseRange(req.query.range, "7d");
    const data = await svc.patternDetail({ patternId, range });
    res.json({ ok: true, range, data });
  } catch (e) {
    next(e);
  }
}

// ============================================================================
// INTERACTIONS
// ============================================================================

export async function adminTelemetryInteractions(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const svc = getSvc(req);
    const range = parseRange(req.query.range, "7d");
    const limit = parseLimit(req.query.limit, 50);
    const cursor = parseCursor(req.query.cursor);
    const data = await svc.interactions({ range, limit, cursor });
    res.json({ ok: true, range, ...data });
  } catch (e) {
    next(e);
  }
}

export async function adminTelemetryInteractionDetail(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const svc = getSvc(req);
    const traceId = String(req.params.traceId);
    const data = await svc.interactionDetail({ traceId });
    res.json({ ok: true, data });
  } catch (e) {
    next(e);
  }
}

// ============================================================================
// QUALITY
// ============================================================================

export async function adminTelemetryQuality(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const svc = getSvc(req);
    const range = parseRange(req.query.range, "7d");
    const limit = parseLimit(req.query.limit, 50);
    const cursor = parseCursor(req.query.cursor);
    const data = await svc.quality({ range, limit, cursor });
    res.json({ ok: true, range, ...data });
  } catch (e) {
    next(e);
  }
}

export async function adminTelemetryQualityBreakdown(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const svc = getSvc(req);
    const range = parseRange(req.query.range, "7d");
    const data = await svc.qualityBreakdown({ range });
    res.json({ ok: true, range, data });
  } catch (e) {
    next(e);
  }
}

export async function adminTelemetryReaskRate(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const svc = getSvc(req);
    const range = parseRange(req.query.range, "7d");
    const data = await svc.reaskRate({ range });
    res.json({ ok: true, range, data });
  } catch (e) {
    next(e);
  }
}

// ============================================================================
// LLM / COST
// ============================================================================

export async function adminTelemetryLLM(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const svc = getSvc(req);
    const range = parseRange(req.query.range, "7d");
    const limit = parseLimit(req.query.limit, 50);
    const cursor = parseCursor(req.query.cursor);
    const provider = parseOptionalString(req.query.provider);
    const model = parseOptionalString(req.query.model);
    const data = await svc.llm({ range, limit, cursor, provider, model });
    res.json({ ok: true, range, ...data });
  } catch (e) {
    next(e);
  }
}

export async function adminTelemetryLLMProviders(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const svc = getSvc(req);
    const range = parseRange(req.query.range, "7d");
    const data = await svc.llmProviders({ range });
    res.json({ ok: true, range, ...data });
  } catch (e) {
    next(e);
  }
}

export async function adminTelemetryLLMStages(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const svc = getSvc(req);
    const range = parseRange(req.query.range, "7d");
    const data = await svc.llmStages({ range });
    res.json({ ok: true, range, data });
  } catch (e) {
    next(e);
  }
}

export async function adminTelemetryTokensPerQuery(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const svc = getSvc(req);
    const range = parseRange(req.query.range, "7d");
    const data = await svc.tokensPerQuery({ range });
    res.json({ ok: true, range, data });
  } catch (e) {
    next(e);
  }
}

// ============================================================================
// ERRORS
// ============================================================================

export async function adminTelemetryErrors(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const svc = getSvc(req);
    const range = parseRange(req.query.range, "7d");
    const limit = parseLimit(req.query.limit, 50);
    const cursor = parseCursor(req.query.cursor);
    const data = await svc.errors({ range, limit, cursor });
    res.json({ ok: true, range, ...data });
  } catch (e) {
    next(e);
  }
}

export async function adminTelemetryErrorSummary(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const svc = getSvc(req);
    const range = parseRange(req.query.range, "7d");
    const data = await svc.errorSummary({ range });
    res.json({ ok: true, range, data });
  } catch (e) {
    next(e);
  }
}

// ============================================================================
// RELIABILITY
// ============================================================================

export async function adminTelemetryReliability(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const svc = getSvc(req);
    const range = parseRange(req.query.range, "7d");
    const data = await svc.reliability({ range });
    res.json({ ok: true, range, data });
  } catch (e) {
    next(e);
  }
}

// ============================================================================
// SECURITY
// ============================================================================

export async function adminTelemetrySecurity(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const svc = getSvc(req);
    const range = parseRange(req.query.range, "7d");
    const data = await svc.security({ range });
    res.json({ ok: true, range, data });
  } catch (e) {
    next(e);
  }
}

export async function adminTelemetrySecurityEvents(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const svc = getSvc(req);
    const range = parseRange(req.query.range, "7d");
    const limit = parseLimit(req.query.limit, 50);
    const cursor = parseCursor(req.query.cursor);
    const data = await svc.securityEvents({ range, limit, cursor });
    res.json({ ok: true, range, ...data });
  } catch (e) {
    next(e);
  }
}

export async function adminTelemetryAuditLog(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const svc = getSvc(req);
    const range = parseRange(req.query.range, "7d");
    const limit = parseLimit(req.query.limit, 50);
    const cursor = parseCursor(req.query.cursor);
    const data = await svc.auditLog({ range, limit, cursor });
    res.json({ ok: true, range, ...data });
  } catch (e) {
    next(e);
  }
}

// ============================================================================
// API METRICS
// ============================================================================

export async function adminTelemetryAPIMetrics(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const svc = getSvc(req);
    const range = parseRange(req.query.range, "7d");
    const data = await svc.apiMetrics({ range });
    res.json({ ok: true, range, data });
  } catch (e) {
    next(e);
  }
}

export async function adminTelemetryExternalProviders(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const svc = getSvc(req);
    const range = parseRange(req.query.range, "7d");
    const data = await svc.externalProviders({ range });
    res.json({ ok: true, range, data });
  } catch (e) {
    next(e);
  }
}

// ============================================================================
// LIVE FEED (Server-Sent Events)
// ============================================================================

export async function adminTelemetryLiveFeed(
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  // Send initial connection event
  res.write(
    `event: connected\ndata: ${JSON.stringify({ connected: true, timestamp: new Date().toISOString() })}\n\n`,
  );

  // Keep-alive ping every 30 seconds
  const pingInterval = setInterval(() => {
    res.write(
      `event: ping\ndata: ${JSON.stringify({ timestamp: new Date().toISOString() })}\n\n`,
    );
  }, 30000);

  // In a real implementation, you would subscribe to a message queue or pub/sub
  // For now, we'll send simulated events
  const eventInterval = setInterval(() => {
    const eventTypes = ["query", "llm", "retrieval", "ingestion", "error"];
    const event = {
      id: `evt_${Date.now()}`,
      type: eventTypes[Math.floor(Math.random() * eventTypes.length)],
      timestamp: new Date().toISOString(),
      summary: "Live event",
      details: {},
    };
    res.write(`event: telemetry\ndata: ${JSON.stringify(event)}\n\n`);
  }, 5000);

  // Cleanup on close
  req.on("close", () => {
    clearInterval(pingInterval);
    clearInterval(eventInterval);
    res.end();
  });
}
