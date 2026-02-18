import type { PrismaClient } from "@prisma/client";

import { logger } from "../../utils/logger";
import { supportsModel } from "../admin/_shared/prismaAdapter";
import { TelemetryService } from "../telemetry/telemetry.service";
import { redactText, stableObjectHash } from "../telemetry/telemetry.redaction";
import type { EditTelemetry } from "./editing.types";

type EditTelemetryEvent = "edit_planned" | "edit_previewed" | "edit_applied" | "edit_failed" | "edit_noop";

function safeNumber(x: unknown): number | null {
  if (typeof x !== "number") return null;
  if (!Number.isFinite(x)) return null;
  return x;
}

function safeString(x: unknown, maxLen = 120): string | null {
  if (typeof x !== "string") return null;
  const s = x.trim();
  if (!s) return null;
  return s.length <= maxLen ? s : s.slice(0, maxLen);
}

/**
 * EditTelemetryService
 * - fail-open (never throws to callers)
 * - never stores raw instruction / doc text in DB logs
 * - optionally forwards a compact event to the generic TelemetryService
 */
export class EditTelemetryService implements EditTelemetry {
  private readonly enabled: boolean;
  private readonly salt: string;

  constructor(
    private readonly prisma?: PrismaClient,
    private readonly telemetry?: TelemetryService,
    opts?: {
      enabled?: boolean;
      /** Used only for hashing/redaction */
      salt?: string;
    },
  ) {
    this.enabled = opts?.enabled ?? (process.env.TELEMETRY_ENABLED === "true");
    this.salt = opts?.salt ?? process.env.TELEMETRY_HASH_SALT ?? "dev-salt";
  }

  async track(event: EditTelemetryEvent, payload: Record<string, unknown>): Promise<void> {
    if (!this.enabled) return;

    // Hard rule: do not persist raw bodies/tokens; only hashed signatures and numeric metrics.
    const userId = safeString(payload.userId, 64);
    if (!userId) return;

    const conversationId = safeString(payload.conversationId, 128);
    const correlationId = safeString(payload.correlationId, 128);
    const clientMessageId = safeString(payload.clientMessageId, 128);
    const operator = safeString(payload.operator, 64);
    const documentId = safeString(payload.documentId, 64);
    const targetId = safeString(payload.targetId, 120);
    const revisionId = safeString(payload.revisionId, 64);

    const stage = safeString(payload.stage, 40);
    const confidence = safeNumber(payload.confidence);
    const decisionMargin = safeNumber(payload.decisionMargin);
    const similarity = safeNumber(payload.similarity);
    const preservePass = typeof payload.preservePass === "boolean" ? payload.preservePass : null;
    const requiresConfirmation =
      typeof payload.requiresConfirmation === "boolean" ? payload.requiresConfirmation : null;
    const missingRequiredEntities = safeNumber(payload.missingRequiredEntities);

    const error = safeString(payload.error, 240);

    const signature = stableObjectHash(
      {
        event,
        stage,
        operator,
        documentId,
        targetId,
        // correlation IDs are already non-sensitive, but including them in the signature reduces groupability
      },
      { salt: this.salt },
    );

    // In-process log (safe)
    logger.debug?.("[EditTelemetry] event", {
      event,
      stage,
      operator,
      documentId,
      targetId,
      revisionId,
      confidence,
      decisionMargin,
      similarity,
      preservePass,
      requiresConfirmation,
      missingRequiredEntities,
      signature,
      userId,
      conversationId,
      correlationId,
      clientMessageId,
      error,
    });

    // Optional DB telemetry: write a generic UsageEvent (fail-open).
    // This intentionally avoids adding new Prisma models/enum values.
    // If your schema later adds a dedicated EditTelemetry table, switch this over.
    if (this.telemetry && this.prisma && supportsModel(this.prisma, "usageEvent")) {
      const meta = {
        kind: "editing",
        event,
        stage,
        operator,
        documentId,
        targetId,
        revisionId,
        confidence,
        decisionMargin,
        similarity,
        preservePass,
        requiresConfirmation,
        missingRequiredEntities,
        signature,
        correlationId,
        clientMessageId,
        // Store only redacted error text for aggregation.
        error: error ? redactText(error, { salt: this.salt, allowPreview: false }).hash : null,
      };

      // Use an existing eventType to avoid enum mismatch breaking writes; telemetry service is fail-open anyway.
      await this.telemetry.logUsage({
        userId,
        eventType: "FILE_PILL_CLICKED",
        at: new Date(),
        conversationId: conversationId ?? null,
        documentId: documentId ?? null,
        meta,
      });
    }
  }
}
