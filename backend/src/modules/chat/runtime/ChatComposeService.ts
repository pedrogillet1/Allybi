import type {
  AnswerClass,
  AnswerMode,
  ChatEngine,
  ChatRequest,
  ChatResult,
  ChatRole,
  NavType,
} from "../domain/chat.contracts";
import type { EvidencePack } from "../../../services/core/retrieval/retrieval.types";
import type { ChatMemoryContextService } from "./ChatMemoryContextService";
import type { EvidenceCheckResult } from "../../../services/core/retrieval/evidenceGate.service";
import type {
  LLMStreamingConfig,
  StreamSink,
} from "../../../services/llm/types/llmStreaming.types";
import { AnswerModeResolver } from "./AnswerModeResolver";
import { EngineMessageBuilder } from "./EngineMessageBuilder";
import { FallbackPolicyResolver } from "./FallbackPolicyResolver";
import { RuntimePromptBuilder } from "./RuntimePromptBuilder";
import {
  asObject,
} from "./chatComposeShared";
import type {
  ComposeRuntimeConfig,
  RuntimeContext,
  RuntimeMeta,
} from "./chatCompose.types";

export class ChatComposeService {
  private readonly answerModeResolver: AnswerModeResolver;
  private readonly fallbackPolicyResolver: FallbackPolicyResolver;
  private readonly runtimePromptBuilder = new RuntimePromptBuilder();
  private readonly engineMessageBuilder: EngineMessageBuilder;

  constructor(
    private readonly memoryContextService: ChatMemoryContextService,
    runtimeConfig: ComposeRuntimeConfig = {
      lowConfidenceSurfaceFallback: false,
    },
  ) {
    this.answerModeResolver = new AnswerModeResolver(memoryContextService);
    this.fallbackPolicyResolver = new FallbackPolicyResolver(runtimeConfig);
    this.engineMessageBuilder = new EngineMessageBuilder(
      this.answerModeResolver,
      memoryContextService,
    );
  }

  evaluateEvidenceGateDecision(
    req: ChatRequest,
    retrievalPack: EvidencePack | null,
  ): EvidenceCheckResult | null {
    return this.answerModeResolver.evaluateEvidenceGateDecision(req, retrievalPack);
  }

  resolveAnswerMode(
    req: ChatRequest,
    retrievalPack: EvidencePack | null,
  ): AnswerMode {
    return this.answerModeResolver.resolveAnswerMode(req, retrievalPack);
  }

  buildRuntimeMeta(
    req: ChatRequest,
    retrievalPack: EvidencePack | null,
    answerMode: AnswerMode,
    runtimeContext?: RuntimeContext | null,
    evidenceGateDecision?: EvidenceCheckResult | null,
    fallbackSignal?: {
      reasonCode?: string;
      telemetryReasonCode?: string;
      policyMeta?: Record<string, unknown> | null;
    } | null,
  ): RuntimeMeta {
    const meta = asObject(req.meta);
    const resolvedFallbackSignal =
      fallbackSignal ?? this.resolveFallbackSignal(req, retrievalPack);
    return this.runtimePromptBuilder.buildRuntimeMeta({
      preferredLanguage: req.preferredLanguage || "en",
      answerMode,
      sourceCount: retrievalPack?.evidence.length ?? 0,
      inheritedMeta: meta,
      runtimeContext,
      evidenceGateDecision,
      fallbackSignal: {
        reasonCode: resolvedFallbackSignal.reasonCode,
        telemetryReasonCode: resolvedFallbackSignal.telemetryReasonCode,
        policyMeta: resolvedFallbackSignal.policyMeta ?? null,
      },
      retrievalPack,
    });
  }

  buildRuntimeContext(
    req: ChatRequest,
    retrievalPack: EvidencePack | null,
    answerModeHint?: AnswerMode,
    history?: Array<{ role: ChatRole; content: string }>,
  ): RuntimeContext {
    return this.runtimePromptBuilder.buildRuntimeContext(
      req,
      retrievalPack,
      answerModeHint,
      history,
    );
  }

  buildEngineMessages(
    history: Array<{ role: ChatRole; content: string }>,
    userText: string,
    preferredLanguage?: string,
    evidenceGateDecision?: EvidenceCheckResult | null,
  ): Array<{ role: ChatRole; content: string; attachments?: unknown | null }> {
    return this.engineMessageBuilder.buildEngineMessages(
      history,
      userText,
      preferredLanguage,
      evidenceGateDecision,
    );
  }

  resolveEvidenceGateBypass(
    decision: EvidenceCheckResult | null | undefined,
    opts?: {
      attachedDocumentIds?: string[];
      evidenceCount?: number;
    },
  ): { failureCode: string } | null {
    return this.fallbackPolicyResolver.resolveEvidenceGateBypass(decision, opts);
  }

  applyEvidenceGatePostProcessText(
    text: string,
    decision: EvidenceCheckResult | null | undefined,
  ): string {
    return this.fallbackPolicyResolver.applyEvidenceGatePostProcessText(
      text,
      decision,
    );
  }

  generateFollowups(
    req: ChatRequest,
    answerMode: AnswerMode,
    retrievalPack: EvidencePack | null,
  ): Array<{ label: string; query: string }> {
    return this.engineMessageBuilder.generateFollowups(
      req,
      answerMode,
      retrievalPack,
    );
  }

  resolveFallbackSignal(
    req: ChatRequest,
    retrievalPack: EvidencePack | null,
  ): {
    reasonCode?: string;
    telemetryReasonCode?: string;
    policyMeta: Record<string, unknown> | null;
  } {
    return this.fallbackPolicyResolver.resolveFallbackSignal(req, retrievalPack);
  }

  toEngineCall(params: {
    engine: ChatEngine;
    stream: boolean;
    traceId: string;
    userId: string;
    conversationId: string;
    messages: Array<{ role: ChatRole; content: string; attachments?: unknown | null }>;
    retrievalPack: EvidencePack | null;
    runtimeContext: RuntimeContext;
    runtimeMeta: RuntimeMeta;
    sink?: StreamSink;
    streamingConfig?: LLMStreamingConfig;
  }) {
    return this.engineMessageBuilder.toEngineCall(params);
  }

  mergeAttachments(
    modelAttachments: unknown,
    sourceButtonsAttachment: unknown | null,
  ): unknown[] {
    return this.engineMessageBuilder.mergeAttachments(
      modelAttachments,
      sourceButtonsAttachment,
    );
  }

  resolveAnswerClass(answerMode: AnswerMode): AnswerClass {
    return this.answerModeResolver.resolveAnswerClass(answerMode);
  }

  resolveNavType(): NavType {
    return this.answerModeResolver.resolveNavType();
  }
}
