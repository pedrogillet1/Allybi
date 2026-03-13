import type { ChatRequest } from "../domain/chat.contracts";
import type { EvidencePack } from "../../../services/core/retrieval/retrieval.types";
import type { EvidenceCheckResult } from "../../../services/core/retrieval/evidenceGate.service";
import { FallbackDecisionPolicyService } from "../../../services/core/policy/fallbackDecisionPolicy.service";
import type {
  ComposeRuntimeConfig,
  EvidenceGateBypass,
  FallbackSignal,
} from "./chatCompose.types";

const USER_FACING_FALLBACK_REASON_CODES = new Set<string>([
  "no_docs_indexed",
  "scope_hard_constraints_empty",
  "no_relevant_chunks_in_scoped_docs",
  "explicit_doc_not_found",
  "needs_doc_choice",
  "doc_ambiguous",
  "indexing_in_progress",
  "extraction_failed",
]);

export class FallbackPolicyResolver {
  private readonly fallbackDecisionPolicy = new FallbackDecisionPolicyService();

  constructor(private readonly config: ComposeRuntimeConfig) {}

  resolveEvidenceGateBypass(
    decision: EvidenceCheckResult | null | undefined,
    opts?: {
      attachedDocumentIds?: string[];
      evidenceCount?: number;
    },
  ): EvidenceGateBypass | null {
    if (!decision) return null;
    const hasAttachedDocs = (opts?.attachedDocumentIds || []).length > 0;
    const hasEvidence = (opts?.evidenceCount ?? 0) > 0;

    if (decision.suggestedAction === "clarify") {
      if (hasAttachedDocs && hasEvidence) return null;
      return { failureCode: "EVIDENCE_NEEDS_CLARIFICATION" };
    }
    if (decision.suggestedAction === "apologize") {
      if (hasAttachedDocs && hasEvidence) return null;
      return { failureCode: "EVIDENCE_INSUFFICIENT" };
    }
    return null;
  }

  applyEvidenceGatePostProcessText(
    text: string,
    decision: EvidenceCheckResult | null | undefined,
  ): string {
    const normalized = String(text || "").trim();
    if (!normalized || !decision) return normalized;
    if (decision.suggestedAction !== "hedge") return normalized;
    const prefix = String(decision.hedgePrefix || "").trim();
    if (!prefix) return normalized;

    const normalizeForCompare = (input: string): string =>
      String(input || "")
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
    const normalizedText = normalizeForCompare(normalized);
    const normalizedPrefix = normalizeForCompare(prefix);
    if (
      normalizedText.startsWith(normalizedPrefix) ||
      normalizedText.startsWith(`${normalizedPrefix},`)
    ) {
      return normalized;
    }
    return `${prefix} ${normalized}`.trim();
  }

  resolveFallbackSignal(
    req: ChatRequest,
    retrievalPack: EvidencePack | null,
  ): FallbackSignal {
    const decision = this.fallbackDecisionPolicy.resolve(req, retrievalPack);
    const reasonCodeRaw = String(decision?.reasonCode || "").trim();
    const shouldSurface = this.shouldSurfaceFallback(reasonCodeRaw, retrievalPack);
    const userFacingReasonCode =
      shouldSurface && reasonCodeRaw ? reasonCodeRaw : undefined;
    const suppressPromptFallback = Boolean(reasonCodeRaw) && !shouldSurface;

    if (!decision || !reasonCodeRaw) {
      return {
        reasonCode: userFacingReasonCode,
        telemetryReasonCode: undefined,
        policyMeta: null,
      };
    }

    return {
      reasonCode: userFacingReasonCode,
      telemetryReasonCode: reasonCodeRaw,
      policyMeta: {
        reasonCode: reasonCodeRaw,
        selectedBankId: decision.selectedBankId,
        selectedRuleId: decision.selectedRuleId,
        severity: decision.severity,
        fallbackType: decision.fallbackType,
        routerAction: decision.routerAction,
        routerTelemetryReason: decision.routerTelemetryReason,
        userFacingReasonCode: userFacingReasonCode || null,
        suppressedForPrompt: suppressPromptFallback,
        suppressionReason:
          suppressPromptFallback && reasonCodeRaw === "low_confidence"
            ? "low_confidence_with_evidence"
            : suppressPromptFallback
              ? "non_user_facing_reason"
              : null,
      },
    };
  }

  private shouldSurfaceFallback(
    reasonCode: string,
    retrievalPack: EvidencePack | null,
  ): boolean {
    const normalized = String(reasonCode || "")
      .trim()
      .toLowerCase();
    if (!normalized) return false;
    if (normalized === "low_confidence") {
      const hasEvidence = (retrievalPack?.evidence.length ?? 0) > 0;
      if (hasEvidence && !this.config.lowConfidenceSurfaceFallback) return false;
      return true;
    }
    return USER_FACING_FALLBACK_REASON_CODES.has(normalized);
  }
}
