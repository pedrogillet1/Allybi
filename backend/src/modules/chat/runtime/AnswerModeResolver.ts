import type {
  AnswerClass,
  AnswerMode,
  ChatRequest,
  NavType,
} from "../domain/chat.contracts";
import type { EvidencePack } from "../../../services/core/retrieval/retrieval.types";
import {
  EvidenceGateService,
  type EvidenceCheckResult,
} from "../../../services/core/retrieval/evidenceGate.service";
import { normalizeChatLanguage } from "./chatRuntimeLanguage";
import { asObject } from "./chatComposeShared";
import type { SemanticSignalReader } from "./chatCompose.types";

export class AnswerModeResolver {
  private readonly evidenceGate = new EvidenceGateService();

  constructor(private readonly signalReader: SemanticSignalReader) {}

  evaluateEvidenceGateDecision(
    req: ChatRequest,
    retrievalPack: EvidencePack | null,
  ): EvidenceCheckResult | null {
    if (!retrievalPack) return null;
    const hasDocContext =
      (req.attachedDocumentIds || []).length > 0 ||
      Boolean(retrievalPack.scope?.hardScopeActive) ||
      retrievalPack.evidence.length > 0;
    if (!hasDocContext) return null;
    return this.evidenceGate.checkEvidence(
      req.message,
      retrievalPack.evidence.map((item) => ({ text: item.snippet ?? "" })),
      normalizeChatLanguage(req.preferredLanguage || "en"),
    );
  }

  resolveAnswerMode(
    req: ChatRequest,
    retrievalPack: EvidencePack | null,
  ): AnswerMode {
    const docsAttached = (req.attachedDocumentIds || []).length > 0;
    const meta = asObject(req.meta);
    const operator = String(meta.operator || "")
      .trim()
      .toLowerCase();
    const evidenceCount = retrievalPack?.evidence.length ?? 0;
    const contextSignals = asObject(asObject(req.context).signals);
    const semanticSignals = this.signalReader.collectSemanticSignals(
      req.message,
      contextSignals,
    );
    if ((operator === "open" || operator === "navigate") && evidenceCount === 0) {
      return "nav_pills";
    }
    if (evidenceCount > 0 && semanticSignals.userAskedForQuote) {
      return "doc_grounded_quote";
    }
    if (
      evidenceCount > 0 &&
      (semanticSignals.userAskedForTable || semanticSignals.tableExpected)
    ) {
      return "doc_grounded_table";
    }
    if (evidenceCount > 1) return "doc_grounded_multi";
    if (evidenceCount === 1) return "doc_grounded_single";
    if (docsAttached) return "help_steps";
    return "general_answer";
  }

  resolveAnswerClass(answerMode: AnswerMode): AnswerClass {
    return answerMode === "general_answer" ? "GENERAL" : "DOCUMENT";
  }

  resolveNavType(): NavType {
    return null;
  }

  renderEvidenceGatePromptBlock(
    decision: EvidenceCheckResult | null,
    language?: string,
  ): string | null {
    if (!decision) return null;
    if (decision.suggestedAction === "hedge") return null;
    const prompt = this.evidenceGate.getPromptModification(
      decision,
      normalizeChatLanguage(language || "en"),
    );
    const trimmed = String(prompt || "").trim();
    return trimmed || null;
  }
}
