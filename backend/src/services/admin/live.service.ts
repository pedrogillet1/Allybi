/**
 * Live Service
 * Real-time event feed from Postgres (with optional Redis)
 */

import type { PrismaClient } from "@prisma/client";
import { clampLimit } from "./_shared/clamp";
import { supportsModel } from "./_shared/prismaAdapter";

export interface LiveEvent {
  type: "model_call" | "retrieval" | "ingestion";
  at: string;
  userId: string;
  traceId?: string;
  provider?: string;
  model?: string;
  stage?: string;
  status?: string;
  intent?: string;
  domain?: string;
  documentId?: string;
  filename?: string;
  mimeType?: string;
}

export interface LiveEventsResult {
  items: LiveEvent[];
  source: "redis" | "postgres";
}

// Optional Redis client type
interface RedisClient {
  lrange: (key: string, start: number, stop: number) => Promise<string[]>;
}

let redisClient: RedisClient | null = null;

/**
 * Initialize Redis client (optional)
 * Call this from app startup if Redis is configured
 */
export function initLiveRedis(client: RedisClient): void {
  redisClient = client;
}

/**
 * Get recent events from Redis or Postgres
 */
export async function getRecentEvents(
  prisma: PrismaClient,
  params: { limit?: number },
): Promise<LiveEventsResult> {
  const limit = clampLimit(params.limit, 50);

  // Try Redis first if available
  if (redisClient) {
    try {
      const redisEvents = await getEventsFromRedis(limit);
      if (redisEvents.length > 0) {
        return { items: redisEvents, source: "redis" };
      }
    } catch (error) {
      console.warn(
        "[LiveService] Redis unavailable, falling back to Postgres:",
        error,
      );
    }
  }

  // Fallback to Postgres
  const postgresEvents = await getEventsFromPostgres(prisma, limit);
  return { items: postgresEvents, source: "postgres" };
}

async function getEventsFromRedis(limit: number): Promise<LiveEvent[]> {
  if (!redisClient) return [];

  try {
    const raw = await redisClient.lrange("telemetry:live", 0, limit - 1);
    const events: LiveEvent[] = [];

    for (const item of raw) {
      try {
        const parsed = JSON.parse(item);
        events.push(normalizeRedisEvent(parsed));
      } catch {
        // Skip malformed entries
      }
    }

    return events;
  } catch {
    return [];
  }
}

function normalizeRedisEvent(raw: Record<string, unknown>): LiveEvent {
  const type = (raw.type as string) || "model_call";
  const eventType =
    type === "retrieval"
      ? "retrieval"
      : type === "ingestion"
        ? "ingestion"
        : "model_call";

  return {
    type: eventType,
    at:
      (raw.at as string) ||
      (raw.timestamp as string) ||
      new Date().toISOString(),
    userId: (raw.userId as string) || "unknown",
    traceId: raw.traceId as string | undefined,
    provider: raw.provider as string | undefined,
    model: raw.model as string | undefined,
    stage: raw.stage as string | undefined,
    status: raw.status as string | undefined,
    intent: raw.intent as string | undefined,
    domain: raw.domain as string | undefined,
    documentId: raw.documentId as string | undefined,
    filename: raw.filename as string | undefined,
    mimeType: raw.mimeType as string | undefined,
  };
}

async function getEventsFromPostgres(
  prisma: PrismaClient,
  limit: number,
): Promise<LiveEvent[]> {
  const events: LiveEvent[] = [];

  // Get events from all three sources in parallel
  const [modelCalls, retrievalEvents, ingestionEvents] = await Promise.all([
    supportsModel(prisma, "modelCall")
      ? prisma.modelCall.findMany({
          take: Math.ceil(limit / 3),
          orderBy: { at: "desc" },
          select: {
            at: true,
            userId: true,
            traceId: true,
            provider: true,
            model: true,
            stage: true,
            status: true,
          },
        })
      : [],

    supportsModel(prisma, "retrievalEvent")
      ? prisma.retrievalEvent.findMany({
          take: Math.ceil(limit / 3),
          orderBy: { at: "desc" },
          select: {
            at: true,
            userId: true,
            traceId: true,
            intent: true,
            domain: true,
          },
        })
      : [],

    supportsModel(prisma, "ingestionEvent")
      ? prisma.ingestionEvent.findMany({
          take: Math.ceil(limit / 3),
          orderBy: { at: "desc" },
          select: {
            at: true,
            userId: true,
            documentId: true,
            filename: true,
            mimeType: true,
            status: true,
          },
        })
      : [],
  ]);

  // Convert to LiveEvent
  for (const mc of modelCalls) {
    events.push({
      type: "model_call",
      at: mc.at.toISOString(),
      userId: mc.userId,
      traceId: mc.traceId,
      provider: mc.provider,
      model: mc.model,
      stage: mc.stage,
      status: mc.status,
    });
  }

  for (const re of retrievalEvents) {
    events.push({
      type: "retrieval",
      at: re.at.toISOString(),
      userId: re.userId,
      traceId: re.traceId,
      intent: re.intent,
      domain: re.domain,
    });
  }

  for (const ie of ingestionEvents) {
    events.push({
      type: "ingestion",
      at: ie.at.toISOString(),
      userId: ie.userId,
      documentId: ie.documentId ?? undefined,
      filename: ie.filename ?? undefined,
      mimeType: ie.mimeType ?? undefined,
      status: ie.status,
    });
  }

  // Sort by time descending and limit
  return events
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, limit);
}
