import type {
  AnswerMode,
  ChatEngine,
  ChatRequest,
  ChatRole,
} from "../domain/chat.contracts";
import type { EvidencePack } from "../../../services/core/retrieval/retrieval.types";
import type { EvidenceCheckResult } from "../../../services/core/retrieval/evidenceGate.service";
import type {
  LLMStreamingConfig,
  StreamSink,
} from "../../../services/llm/types/llmStreaming.types";
import { normalizeChatLanguage } from "./chatRuntimeLanguage";
import {
  hashSeed,
  mergeAttachments,
  textForRoleHistory,
  toEngineEvidencePack,
} from "./chatComposeShared";
import type {
  EngineCallResult,
  EngineMessage,
  RuntimeContext,
  RuntimeMeta,
  SemanticSignalReader,
} from "./chatCompose.types";
import { AnswerModeResolver } from "./AnswerModeResolver";

export class EngineMessageBuilder {
  constructor(
    private readonly answerModeResolver: AnswerModeResolver,
    private readonly signalReader: SemanticSignalReader,
  ) {}

  buildEngineMessages(
    history: Array<{ role: ChatRole; content: string }>,
    userText: string,
    preferredLanguage?: string,
    evidenceGateDecision?: EvidenceCheckResult | null,
  ): EngineMessage[] {
    const cleanedHistory = textForRoleHistory(history);
    const reversedUserIndex = [...cleanedHistory]
      .reverse()
      .findIndex((message) => message.role === "user");
    const resolvedLastUserIndex =
      reversedUserIndex === -1
        ? -1
        : cleanedHistory.length - 1 - reversedUserIndex;

    const withEvidence: Array<{ role: ChatRole; content: string }> = [];
    if (resolvedLastUserIndex >= 0) {
      withEvidence.push(...cleanedHistory.slice(0, resolvedLastUserIndex));
    } else {
      withEvidence.push(...cleanedHistory);
    }

    const gatePrompt = this.answerModeResolver.renderEvidenceGatePromptBlock(
      evidenceGateDecision || null,
      preferredLanguage,
    );
    if (gatePrompt) {
      withEvidence.push({
        role: "system",
        content: gatePrompt,
      });
    }

    if (resolvedLastUserIndex >= 0) {
      withEvidence.push(cleanedHistory[resolvedLastUserIndex]);
    } else {
      withEvidence.push({ role: "user", content: userText.trim() });
    }

    return withEvidence.map((item) => ({
      role: item.role,
      content: item.content,
      attachments: null,
    }));
  }

  generateFollowups(
    req: ChatRequest,
    answerMode: AnswerMode,
    retrievalPack: EvidencePack | null,
  ): Array<{ label: string; query: string }> {
    const isDocGrounded =
      answerMode === "doc_grounded_single" ||
      answerMode === "doc_grounded_multi" ||
      answerMode === "doc_grounded_quote" ||
      answerMode === "doc_grounded_table";
    if (!isDocGrounded || !retrievalPack) return [];

    const language = normalizeChatLanguage(req.preferredLanguage);
    const followups: Array<{ label: string; query: string }> = [];
    const evidenceCount = retrievalPack.evidence.length;
    const hasMultipleDocs =
      new Set(retrievalPack.evidence.map((item) => item.docId)).size > 1;
    const topicKeywords = this.signalReader.extractQueryKeywords(req.message).slice(
      0,
      3,
    );
    const topic = topicKeywords.join(" ");

    if (language === "pt") {
      followups.push({
        label: "Aprofundar",
        query: topic
          ? `Pode detalhar mais sobre ${topic}?`
          : "Pode detalhar mais sobre isso?",
      });
      if (hasMultipleDocs) {
        followups.push({
          label: "Comparar documentos",
          query: topic
            ? `Quais sao as diferencas entre os documentos sobre ${topic}?`
            : "Quais sao as diferencas entre os documentos sobre este tema?",
        });
      }
      if (evidenceCount >= 1) {
        followups.push({
          label: "Resumo",
          query: topic
            ? `Faca um resumo conciso sobre ${topic}.`
            : "Faca um resumo conciso dos pontos principais.",
        });
      }
    } else if (language === "es") {
      followups.push({
        label: "Profundizar",
        query: topic
          ? `Puede dar mas detalles sobre ${topic}?`
          : "Puede dar mas detalles sobre esto?",
      });
      if (hasMultipleDocs) {
        followups.push({
          label: "Comparar documentos",
          query: topic
            ? `Cuales son las diferencias entre los documentos sobre ${topic}?`
            : "Cuales son las diferencias entre los documentos sobre este tema?",
        });
      }
    } else {
      followups.push({
        label: "More details",
        query: topic
          ? `Can you elaborate on ${topic}?`
          : "Can you elaborate on this?",
      });
      if (hasMultipleDocs) {
        followups.push({
          label: "Compare documents",
          query: topic
            ? `What are the differences between the documents on ${topic}?`
            : "What are the differences between the documents on this topic?",
        });
      }
      if (evidenceCount >= 1) {
        followups.push({
          label: "Summary",
          query: topic
            ? `Give me a concise summary about ${topic}.`
            : "Give me a concise summary of the key points.",
        });
      }
    }

    const desiredCount =
      1 + (hashSeed(`${req.userId}:${req.message}:${answerMode}`) % 3);
    return followups.slice(0, Math.max(1, Math.min(3, desiredCount)));
  }

  mergeAttachments(
    modelAttachments: unknown,
    sourceButtonsAttachment: unknown | null,
  ): unknown[] {
    return mergeAttachments(modelAttachments, sourceButtonsAttachment);
  }

  toEngineCall(params: {
    engine: ChatEngine;
    stream: boolean;
    traceId: string;
    userId: string;
    conversationId: string;
    messages: EngineMessage[];
    retrievalPack: EvidencePack | null;
    runtimeContext: RuntimeContext;
    runtimeMeta: RuntimeMeta;
    sink?: StreamSink;
    streamingConfig?: LLMStreamingConfig;
  }): Promise<EngineCallResult> {
    const engineEvidencePack = toEngineEvidencePack(params.retrievalPack);
    if (params.stream) {
      return params.engine.stream({
        traceId: params.traceId,
        userId: params.userId,
        conversationId: params.conversationId,
        messages: params.messages,
        evidencePack: engineEvidencePack,
        context: params.runtimeContext,
        meta: params.runtimeMeta,
        sink: params.sink as StreamSink,
        streamingConfig: params.streamingConfig as LLMStreamingConfig,
      });
    }
    return params.engine.generate({
      traceId: params.traceId,
      userId: params.userId,
      conversationId: params.conversationId,
      messages: params.messages,
      evidencePack: engineEvidencePack,
      context: params.runtimeContext,
      meta: params.runtimeMeta,
    });
  }
}
