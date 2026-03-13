import type {
  ChatRequest,
  ChatResult,
} from "../domain/chat.contracts";
import type { EvidencePack } from "../../../services/core/retrieval/retrieval.types";
import type { EvidenceCheckResult } from "../../../services/core/retrieval/evidenceGate.service";
import {
  asObject,
  toPositiveInt,
} from "./chatTraceShared";
import type { TraceRuntimeConfig } from "./chatTrace.types";

export class TraceTelemetryProjector {
  constructor(private readonly config: TraceRuntimeConfig) {}

  toTraceFinalStatus(
    status: ChatResult["status"] | undefined,
  ): "success" | "partial" | "clarification_required" | "blocked" | "failed" {
    if (status === "partial") return "partial";
    if (status === "clarification_required") return "clarification_required";
    if (status === "blocked") return "blocked";
    if (status === "failed") return "failed";
    return "success";
  }

  extractTelemetryUsage(telemetry?: Record<string, unknown> | null): {
    inputTokens: number | null;
    outputTokens: number | null;
  } {
    const usage = asObject(asObject(telemetry).usage);
    return {
      inputTokens: toPositiveInt(
        usage.inputTokens ??
          usage.promptTokens ??
          usage.input_tokens ??
          usage.prompt_tokens,
      ),
      outputTokens: toPositiveInt(
        usage.outputTokens ??
          usage.completionTokens ??
          usage.output_tokens ??
          usage.completion_tokens,
      ),
    };
  }

  extractTraceKeywords(
    query: string,
  ): Array<{ keyword: string; weight: number }> {
    const normalized = String(query || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3);
    return [...new Set(normalized)].slice(0, 16).map((keyword, idx) => ({
      keyword,
      weight: Math.max(0.1, 1 - idx * 0.05),
    }));
  }

  extractTraceEntities(
    req: ChatRequest,
    retrievalPack: EvidencePack | null,
  ): Array<{ type: string; value: string; confidence: number }> {
    const entities: Array<{ type: string; value: string; confidence: number }> =
      [];
    const docIds = new Set<string>([
      ...(Array.isArray(req.attachedDocumentIds) ? req.attachedDocumentIds : []),
      ...(retrievalPack?.scope?.candidateDocIds || []),
    ]);
    for (const docId of docIds) {
      const normalized = String(docId || "").trim();
      if (!normalized) continue;
      entities.push({
        type: "document_id",
        value: normalized,
        confidence: 1,
      });
      if (entities.length >= 20) return entities;
    }

    const years = String(req.message || "").match(/\b(?:19|20)\d{2}\b/g) || [];
    for (const year of years.slice(0, 8)) {
      entities.push({
        type: "year",
        value: year,
        confidence: 0.85,
      });
    }

    const amounts =
      String(req.message || "").match(/\b(?:\$|usd|eur|brl)?\s?\d[\d,.]{2,}\b/gi) ||
      [];
    for (const amount of amounts.slice(0, 8)) {
      entities.push({
        type: "amount",
        value: amount.trim(),
        confidence: 0.7,
      });
    }
    return entities.slice(0, 20);
  }

  mapEvidenceStrengthToScore(
    strength: EvidenceCheckResult["evidenceStrength"] | null | undefined,
  ): number | null {
    if (strength === "strong") return 0.9;
    if (strength === "moderate") return 0.65;
    if (strength === "weak") return 0.35;
    if (strength === "none") return 0.05;
    return null;
  }

  getEnvironment(): string {
    return this.config.environment;
  }
}
