/**
 * llmChatEngine.ts
 *
 * ChatEngine adapter over LlmGatewayService.
 * The gateway is the only runtime path allowed to assemble prompts.
 */

import type { LLMProvider } from "./llmErrors.types";
import type { StreamSink, LLMStreamingConfig } from "./llmStreaming.types";
import type { EvidencePackLike } from "./llmRequestBuilder.service";

import type { ChatEngine, ChatRole } from "../../prismaChat.service";
import type { LlmGatewayService } from "./llmGateway.service";

export interface LLMChatEngineConfig {
  modelId: string;
  provider: LLMProvider;
  temperature?: number;
  maxOutputTokens?: number;
}

export class LLMChatEngine implements ChatEngine {
  private readonly modelId: string;
  private readonly provider: LLMProvider;

  constructor(
    private readonly gateway: LlmGatewayService,
    config?: Partial<LLMChatEngineConfig>,
  ) {
    this.provider = config?.provider ?? "google";
    this.modelId = config?.modelId ?? "gemini-2.0-flash";
  }

  async generate(params: {
    traceId: string;
    userId: string;
    conversationId: string;
    messages: Array<{
      role: ChatRole;
      content: string;
      attachments?: unknown | null;
    }>;
    evidencePack?: EvidencePackLike | null;
    context?: Record<string, unknown>;
    meta?: Record<string, unknown>;
  }): Promise<{
    text: string;
    attachmentsPayload?: unknown;
    telemetry?: Record<string, unknown>;
  }> {
    const out = await this.gateway.generate({
      traceId: params.traceId,
      userId: params.userId,
      conversationId: params.conversationId,
      messages: params.messages,
      evidencePack: params.evidencePack,
      context: params.context,
      meta: params.meta,
    });

    return {
      text: out.text,
      telemetry: {
        provider: this.provider,
        model: this.modelId,
        ...out.telemetry,
      },
    };
  }

  async generateRetrievalPlan(params: {
    traceId: string;
    userId: string;
    conversationId: string;
    messages: Array<{
      role: ChatRole;
      content: string;
      attachments?: unknown | null;
    }>;
    evidencePack?: EvidencePackLike | null;
    context?: Record<string, unknown>;
    meta?: Record<string, unknown>;
  }): Promise<{
    text: string;
    attachmentsPayload?: unknown;
    telemetry?: Record<string, unknown>;
  }> {
    const out = await this.gateway.generateRetrievalPlan({
      traceId: params.traceId,
      userId: params.userId,
      conversationId: params.conversationId,
      messages: params.messages,
      evidencePack: params.evidencePack,
      context: params.context,
      meta: params.meta,
    });

    return {
      text: out.text,
      telemetry: {
        provider: this.provider,
        model: this.modelId,
        ...out.telemetry,
      },
    };
  }

  async stream(params: {
    traceId: string;
    userId: string;
    conversationId: string;
    messages: Array<{
      role: ChatRole;
      content: string;
      attachments?: unknown | null;
    }>;
    evidencePack?: EvidencePackLike | null;
    context?: Record<string, unknown>;
    meta?: Record<string, unknown>;
    sink: StreamSink;
    streamingConfig: LLMStreamingConfig;
  }): Promise<{
    finalText: string;
    attachmentsPayload?: unknown;
    telemetry?: Record<string, unknown>;
  }> {
    const out = await this.gateway.stream({
      traceId: params.traceId,
      userId: params.userId,
      conversationId: params.conversationId,
      messages: params.messages,
      evidencePack: params.evidencePack,
      context: params.context,
      meta: params.meta,
      sink: params.sink,
      streamingConfig: params.streamingConfig,
    });

    return {
      finalText: out.finalText,
      telemetry: {
        provider: this.provider,
        model: this.modelId,
        ...out.telemetry,
      },
    };
  }
}
