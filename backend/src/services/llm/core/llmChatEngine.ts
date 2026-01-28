/**
 * llmChatEngine.ts
 *
 * Minimal ChatEngine implementation that bridges an LLMClient to the
 * ChatEngine interface expected by PrismaChatService.
 *
 * Responsibilities:
 * - Build LLMRequest from conversation messages
 * - Call llmClient.complete() for non-streaming
 * - Call llmClient.stream() for streaming (writes deltas to provided sink)
 * - Apply Koda system prompt
 *
 * Non-responsibilities:
 * - No document retrieval / RAG (future orchestrator handles that)
 * - No policy enforcement
 * - No output contract shaping
 */

import type { LLMClient, LLMRequest, LLMMessage } from './llmClient.interface';
import type { LLMProvider } from './llmErrors.types';
import type {
  StreamSink,
  LLMStreamingConfig,
} from './llmStreaming.types';

import type { ChatEngine, ChatRole } from '../../prismaChat.service';

const KODA_SYSTEM_PROMPT = `You are Koda, an intelligent document assistant. You help users understand, analyze, and work with their documents.

ABSOLUTE RULES (violations are critical failures):
1. FORBIDDEN PHRASES — NEVER use any of these in your response:
   - "I cannot", "I can't", "I'm unable", "I'm sorry", "I apologize"
   - "does not contain", "no relevant information", "not found in the excerpts"
   - "the provided excerpts do not", "the excerpts do not contain"
   - "Unfortunately", "Regrettably"
   Instead: state what you DID find, then suggest 2-4 search terms for what's missing.

2. NO INLINE CITATIONS — NEVER write "(Document.pdf, p.4)" or "(Source: ...)" in text. The UI handles source attribution automatically via source pills.

3. QUOTE FORMAT — When quoting document text, use this exact markdown format:
   > exact quoted text here

   — Document Title, p. X

4. BE EXHAUSTIVE ON LISTS — For list questions (roles, events, artifacts, pillars, values, etc.), list ALL items found across ALL provided excerpts. Do not stop after finding one or two items.

5. BE DIRECT — No unnecessary preambles. Answer the question immediately.

6. DOCUMENT NAVIGATION — If a user asks to "open", "show", or "find" a document, confirm you found it and briefly describe its contents. The UI will display a clickable pill for the document. NEVER say you cannot open files.

7. ALWAYS USE THE EXCERPTS — When document excerpts are provided, you MUST use them to answer. The excerpts ARE from the user's documents. Do not claim they lack information unless you have genuinely searched all provided excerpts.

8. When information is not found in the excerpts, say what you DID find and suggest search terms: "Based on the available excerpts, here's what I found: [content]. You might also search for: 'X', 'Y', or 'Z'."

When you don't have access to specific documents, have a natural conversation and let the user know you can help once they upload documents.`;

export interface LLMChatEngineConfig {
  /** Model ID to use (e.g., "gemini-2.5-flash", "gpt-5-mini", "gpt-5.2") */
  modelId: string;
  /** Provider name for the LLMRequest model spec */
  provider: LLMProvider;
  /** Sampling temperature (default 0.7) */
  temperature?: number;
  /** Max output tokens (default 4096) */
  maxOutputTokens?: number;
}

export class LLMChatEngine implements ChatEngine {
  private readonly modelId: string;
  private readonly provider: LLMProvider;
  private readonly temperature: number;
  private readonly maxOutputTokens: number;

  constructor(
    private readonly llmClient: LLMClient,
    config?: Partial<LLMChatEngineConfig>,
  ) {
    this.provider = config?.provider ?? llmClient.provider;
    this.modelId = config?.modelId ?? 'gemini-2.0-flash';
    this.temperature = config?.temperature ?? 0.7;
    this.maxOutputTokens = config?.maxOutputTokens ?? 4096;
  }

  async generate(params: {
    traceId: string;
    userId: string;
    conversationId: string;
    messages: Array<{ role: ChatRole; content: string; attachments?: unknown | null }>;
    context?: Record<string, unknown>;
    meta?: Record<string, unknown>;
  }): Promise<{
    text: string;
    attachmentsPayload?: unknown;
    telemetry?: Record<string, unknown>;
  }> {
    const request = this.buildRequest(params.traceId, params.messages);

    const response = await this.llmClient.complete(request);

    return {
      text: response.content,
      telemetry: {
        provider: this.provider,
        model: this.modelId,
        usage: response.usage,
      },
    };
  }

  async stream(params: {
    traceId: string;
    userId: string;
    conversationId: string;
    messages: Array<{ role: ChatRole; content: string; attachments?: unknown | null }>;
    context?: Record<string, unknown>;
    meta?: Record<string, unknown>;
    sink: StreamSink;
    streamingConfig: LLMStreamingConfig;
  }): Promise<{
    finalText: string;
    attachmentsPayload?: unknown;
    telemetry?: Record<string, unknown>;
  }> {
    const request = this.buildRequest(params.traceId, params.messages);

    const result = await this.llmClient.stream({
      req: request,
      sink: params.sink,
      config: params.streamingConfig,
    });

    return {
      finalText: result.finalText,
      telemetry: {
        provider: this.provider,
        model: this.modelId,
        usage: result.usage,
      },
    };
  }

  private buildRequest(
    traceId: string,
    messages: Array<{ role: ChatRole; content: string }>,
  ): LLMRequest {
    const llmMessages: LLMMessage[] = [
      { role: 'system', content: KODA_SYSTEM_PROMPT },
      ...messages.map((m) => ({
        role: mapRole(m.role),
        content: m.content,
      })),
    ];

    return {
      traceId,
      turnId: `turn_${Date.now().toString(36)}`,
      model: {
        provider: this.provider,
        model: this.modelId,
      },
      messages: llmMessages,
      sampling: {
        temperature: this.temperature,
        maxOutputTokens: this.maxOutputTokens,
      },
    };
  }
}

function mapRole(role: ChatRole): 'system' | 'user' | 'assistant' {
  if (role === 'system') return 'system';
  if (role === 'assistant') return 'assistant';
  return 'user';
}
