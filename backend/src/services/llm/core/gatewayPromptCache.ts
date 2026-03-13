import { createHash } from "crypto";

import type { EvidencePackLike } from "./llmRequestBuilder.service";

import { BankRuntimeCache } from "../../core/cache/bankRuntimeCache.service";

export type ComposedCacheEntry = {
  text: string;
  telemetry?: Record<string, unknown>;
  promptTrace: {
    promptIds: string[];
    promptVersions: string[];
    promptHashes: string[];
    promptTemplateIds: string[];
  };
};

type PreparedGatewayRequestLike = {
  promptTrace: {
    promptHashes: string[];
    promptTemplateIds: string[];
  };
  outputLanguage: string;
  promptMode: "compose" | "retrieval_plan";
  userText: string;
  request: {
    model: {
      provider: string;
      model: string;
    };
  };
};

let composedFragmentCache: BankRuntimeCache<ComposedCacheEntry> | null = null;

function hashString(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hashEvidencePack(evidencePack: EvidencePackLike | null | undefined): string {
  if (!evidencePack || !Array.isArray(evidencePack.evidence)) return "none";
  const normalizedEvidence = evidencePack.evidence.map((item) => ({
    docId: String(item?.docId || "").trim(),
    locationKey: String(item?.locationKey || "").trim(),
    evidenceType: String(item?.evidenceType || "text").trim(),
    snippet: String(item?.snippet || "").trim(),
  }));
  return hashString(
    JSON.stringify({
      queryNormalized: String(evidencePack.query?.normalized || "").trim(),
      activeDocId: String(evidencePack.scope?.activeDocId || "").trim(),
      explicitDocLock: Boolean(evidencePack.scope?.explicitDocLock),
      evidence: normalizedEvidence,
    }),
  );
}

export function getSharedComposedFragmentCache(): BankRuntimeCache<ComposedCacheEntry> {
  if (!composedFragmentCache) {
    composedFragmentCache = new BankRuntimeCache<ComposedCacheEntry>({
      maxEntries: Number(process.env.BANK_COMPOSE_CACHE_MAX || 600),
      ttlMs: Number(process.env.BANK_COMPOSE_CACHE_TTL_MS || 5 * 60 * 1000),
    });
  }
  return composedFragmentCache;
}

export function clearGatewayCaches(): void {
  composedFragmentCache = null;
}

export function buildComposeCacheKey(
  evidencePack: EvidencePackLike | null | undefined,
  prepared: PreparedGatewayRequestLike,
): string | null {
  const templateId = String(prepared.promptTrace.promptTemplateIds?.[0] || "")
    .trim()
    .toLowerCase();
  if (!templateId) return null;

  const locale = String(prepared.outputLanguage || "en").trim().toLowerCase();
  const promptHashes = Array.from(
    new Set(
      (prepared.promptTrace.promptHashes || [])
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b));

  return `compose:${hashString(
    JSON.stringify({
      evidenceHash: hashEvidencePack(evidencePack),
      templateId,
      locale,
      userTextHash: hashString(String(prepared.userText || "").trim()),
      promptMode: prepared.promptMode,
      modelVersion: prepared.request.model.model,
      provider: prepared.request.model.provider,
      promptHashes,
      composeCacheVersion: "v1",
    }),
  )}`;
}
