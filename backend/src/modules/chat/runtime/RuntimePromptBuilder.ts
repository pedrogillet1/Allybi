import type {
  AnswerMode,
  ChatRequest,
  ChatRole,
} from "../domain/chat.contracts";
import type { EvidencePack } from "../../../services/core/retrieval/retrieval.types";
import {
  asObject,
} from "./chatComposeShared";
import { CompositionStyleResolver } from "./CompositionStyleResolver";
import type {
  RuntimeContext,
  RuntimeMeta,
  RuntimeMetaParams,
  TurnStyleState,
} from "./chatCompose.types";
import { RuntimeOperatorPlaybookBuilder } from "./RuntimeOperatorPlaybookBuilder";
import { RuntimeFormattingStyleBuilder } from "./RuntimeFormattingStyleBuilder";

export class RuntimePromptBuilder {
  private readonly compositionStyleResolver = new CompositionStyleResolver();
  private readonly playbookBuilder = new RuntimeOperatorPlaybookBuilder();
  private readonly formattingStyleBuilder = new RuntimeFormattingStyleBuilder();

  buildRuntimeMeta(params: RuntimeMetaParams): RuntimeMeta {
    const resolvedFallbackSignal = params.fallbackSignal || null;
    const inheritedIntentFamily =
      typeof params.inheritedMeta.intentFamily === "string"
        ? String(params.inheritedMeta.intentFamily).trim()
        : "";
    const inheritedOperator =
      typeof params.inheritedMeta.operator === "string"
        ? String(params.inheritedMeta.operator).trim()
        : "";
    return {
      ...params.inheritedMeta,
      preferredLanguage: params.preferredLanguage,
      answerMode: params.answerMode,
      intentFamily:
        inheritedIntentFamily ||
        (params.sourceCount > 0 ? "documents" : "general"),
      operator:
        inheritedOperator ||
        (params.sourceCount > 0 ? "answer_with_sources" : "answer"),
      fallbackReasonCode: resolvedFallbackSignal?.reasonCode,
      fallbackTelemetry: resolvedFallbackSignal?.telemetryReasonCode
        ? {
            reasonCode: resolvedFallbackSignal.telemetryReasonCode,
            policy: resolvedFallbackSignal.policyMeta || null,
          }
        : null,
      fallbackPolicy: resolvedFallbackSignal?.policyMeta || null,
      retrievalStats: params.retrievalPack?.stats ?? null,
      styleDecision: params.runtimeContext?.styleDecision ?? null,
      turnStyleState: params.runtimeContext?.turnStyleState ?? null,
      styleFailureHistory: params.runtimeContext?.styleFailureHistory ?? null,
      styleRepairTrace: params.runtimeContext?.styleRepairTrace ?? null,
      evidenceGate: params.evidenceGateDecision
        ? {
            action: params.evidenceGateDecision.suggestedAction,
            strength: params.evidenceGateDecision.evidenceStrength,
            missingEvidence: params.evidenceGateDecision.missingEvidence,
          }
        : null,
    };
  }

  buildRuntimeContext(
    req: ChatRequest,
    retrievalPack: EvidencePack | null,
    answerModeHint?: AnswerMode,
    history?: Array<{ role: ChatRole; content: string }>,
  ): RuntimeContext {
    const baseContext = asObject(req.context || {});
    const baseSignals = asObject(baseContext.signals || {});
    const baseStyleDecision = asObject(baseContext.styleDecision || {});
    const baseTurnStyleState = asObject(baseContext.turnStyleState || {});
    const evidenceGate = asObject(asObject(req.meta).evidenceGate || {});
    const compositionStyleDecision = this.compositionStyleResolver.resolve({
      req,
      retrievalPack,
      answerMode: answerModeHint,
      evidenceStrength: String(
        evidenceGate.strength || baseSignals.evidenceStrength || "",
      ).trim(),
      history,
    });
    const turnStyleState = this.buildTurnStyleState({
      history,
      baseTurnStyleState,
    });
    const formattingStyle = this.formattingStyleBuilder.buildFormattingStyleSignals(
      req,
      answerModeHint,
      this.resolveRuntimeOperatorFamily(req),
    );
    const operatorFamily = this.resolveRuntimeOperatorFamily(req);
    const mergedSignals = {
      ...baseSignals,
      voiceProfile: compositionStyleDecision.voiceProfile,
      answerStrategy: compositionStyleDecision.answerStrategy,
      templateFamily: compositionStyleDecision.templateFamily,
      uncertaintyBand: compositionStyleDecision.uncertaintyBand,
      openerFamily: compositionStyleDecision.openerFamily,
      rhythmProfile: compositionStyleDecision.rhythmProfile,
      claimStrengthProfile: compositionStyleDecision.claimStrengthProfile,
      repetitionGuard: compositionStyleDecision.repetitionGuard,
      empathyMode: compositionStyleDecision.empathyMode,
      antiRoboticFocus: compositionStyleDecision.antiRoboticFocus,
      ...(formattingStyle || {}),
      ...(operatorFamily ? { operatorFamily } : {}),
    };

    return {
      ...baseContext,
      preferredLanguage: req.preferredLanguage || "en",
      attachedDocumentIds: req.attachedDocumentIds || [],
      signals: mergedSignals,
      styleDecision: {
        ...baseStyleDecision,
        ...compositionStyleDecision,
      },
      turnStyleState,
      styleFailureHistory: Array.isArray(baseContext.styleFailureHistory)
        ? baseContext.styleFailureHistory
            .map((item) => String(item || "").trim())
            .filter(Boolean)
        : [],
      styleRepairTrace: Array.isArray(baseContext.styleRepairTrace)
        ? baseContext.styleRepairTrace
            .map((item) => String(item || "").trim())
            .filter(Boolean)
        : [],
      retrieval: retrievalPack
        ? {
            query: retrievalPack.query,
            scope: retrievalPack.scope,
            stats: retrievalPack.stats,
          }
        : null,
      operatorPlaybook: this.playbookBuilder.buildOperatorPlaybookContext(req),
    };
  }

  private buildTurnStyleState(params: {
    history?: Array<{ role: ChatRole; content: string }>;
    baseTurnStyleState: Record<string, unknown> | null;
  }): TurnStyleState {
    const assistantTurns = (params.history || [])
      .filter((entry) => entry.role === "assistant")
      .map((entry) => String(entry.content || "").trim())
      .filter(Boolean)
      .slice(-3);
    const recentLeadSignatures = assistantTurns
      .map((content) => this.extractLeadSignature(content))
      .filter(Boolean);
    const recentCloserSignatures = assistantTurns
      .map((content) => this.extractCloserSignature(content))
      .filter(Boolean);
    const priorLeadSignatures = Array.isArray(params.baseTurnStyleState?.recentLeadSignatures)
      ? params.baseTurnStyleState!.recentLeadSignatures
          .map((entry) => String(entry || "").trim())
          .filter(Boolean)
      : [];
    const priorCloserSignatures = Array.isArray(
      params.baseTurnStyleState?.recentCloserSignatures,
    )
      ? params.baseTurnStyleState!.recentCloserSignatures
          .map((entry) => String(entry || "").trim())
          .filter(Boolean)
      : [];
    const rawLeadSignatures = [...priorLeadSignatures, ...recentLeadSignatures].filter(Boolean);
    const rawCloserSignatures = [...priorCloserSignatures, ...recentCloserSignatures].filter(
      Boolean,
    );
    const mergedLeadSignatures = Array.from(new Set(rawLeadSignatures)).slice(-3);
    const mergedCloserSignatures = Array.from(new Set(rawCloserSignatures)).slice(-3);
    return {
      assistantTurnsSeen: assistantTurns.length,
      recentLeadSignatures: mergedLeadSignatures,
      recentCloserSignatures: mergedCloserSignatures,
      lastAssistantPreview: assistantTurns.length
        ? assistantTurns[assistantTurns.length - 1]!.slice(0, 160)
        : null,
      repeatedLeadRisk: new Set(rawLeadSignatures).size !== rawLeadSignatures.length,
      repeatedCloserRisk: new Set(rawCloserSignatures).size !== rawCloserSignatures.length,
    };
  }

  private extractLeadSignature(text: string): string {
    const sentence = String(text || "").split(/(?<=[.!?])\s+/)[0] || "";
    return sentence
      .toLowerCase()
      .replace(/[^a-z0-9\s]/gi, " ")
      .trim()
      .split(/\s+/)
      .slice(0, 3)
      .join(" ");
  }

  private extractCloserSignature(text: string): string {
    const sentences = String(text || "")
      .split(/(?<=[.!?])\s+/)
      .map((part) => part.trim())
      .filter(Boolean);
    const sentence = sentences[sentences.length - 1] || "";
    const tokens = sentence
      .toLowerCase()
      .replace(/[^a-z0-9\s]/gi, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    return tokens.slice(Math.max(0, tokens.length - 3)).join(" ");
  }

  private resolveRuntimeOperatorFamily(req: ChatRequest): string | null {
    const meta = asObject(req.meta);
    const contextSignals = asObject(asObject(req.context).signals);
    const metaOperatorFamily = String(meta.operatorFamily || "")
      .trim()
      .toLowerCase();
    if (metaOperatorFamily) return metaOperatorFamily;
    const signalFamily = String(contextSignals.operatorFamily || "")
      .trim()
      .toLowerCase();
    if (signalFamily) return signalFamily;
    const operator = String(meta.operator || "")
      .trim()
      .toLowerCase();
    if (operator === "open" || operator === "navigate" || operator === "where") {
      return "file_actions";
    }
    if (
      operator === "thank_you" ||
      operator === "greeting" ||
      operator === "smalltalk"
    ) {
      return "conversation";
    }
    return null;
  }
}
