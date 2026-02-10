/**
 * localClient.service.ts
 *
 * Local/self-hosted LLM client for Allybi.
 *
 * Targets Ollama (primary) and OpenAI-compatible servers (vLLM, llama.cpp).
 * Aligned with the README dual-LLM strategy: local models serve as the
 * tertiary fallback behind Gemini Flash and GPT-5.2.
 *
 * Responsibilities:
 * - Implements the provider-agnostic LLMClient interface
 * - Non-streamed + streamed generation with ChatGPT-parity feel
 * - Abort/timeout handling with deterministic cleanup
 * - Health check via server ping
 * - Model discovery from running server
 *
 * Non-responsibilities:
 * - No trust/safety microcopy (handled by Trust Gate + banks)
 * - No retrieval logic (handled by RAG pipeline)
 * - No tool execution orchestration (handled by orchestrator)
 * - No user-facing copy anywhere
 */

import type {
  LLMClient,
  LLMRequest,
  LLMCompletionResponse,
  LLMStreamResponse,
  LLMMessage,
} from '../../core/llmClient.interface';

import type { LLMProvider } from '../../types/llmErrors.types';

import type {
  LLMStreamingConfig,
  StreamSink,
  StreamState,
  StreamEvent,
  StreamDelta,
  StreamingHooks,
} from '../../types/llmStreaming.types';

import { loadLocalConfig, type LocalConfig, type LocalApiFormat } from './localConfig';
import { LOCAL_MODEL_DEFAULTS } from './localModels';

// ---------------------------------------------------------------------------
// Ollama API types
// ---------------------------------------------------------------------------

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OllamaChatRequest {
  model: string;
  messages: OllamaMessage[];
  stream: boolean;
  options?: {
    temperature?: number;
    top_p?: number;
    num_predict?: number;
    seed?: number;
    stop?: string[];
    presence_penalty?: number;
    frequency_penalty?: number;
    num_thread?: number;
    num_gpu?: number;
  };
  keep_alive?: string;
}

interface OllamaChatResponse {
  model: string;
  message: OllamaMessage;
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

interface OllamaTagsResponse {
  models: Array<{
    name: string;
    model: string;
    size: number;
    digest: string;
    modified_at: string;
  }>;
}

// ---------------------------------------------------------------------------
// OpenAI-compatible API types (vLLM, llama.cpp server)
// ---------------------------------------------------------------------------

interface OAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OAIChatRequest {
  model: string;
  messages: OAIMessage[];
  stream: boolean;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stop?: string[];
  presence_penalty?: number;
  frequency_penalty?: number;
  seed?: number;
}

interface OAIChatChoice {
  index: number;
  message?: OAIMessage;
  delta?: Partial<OAIMessage>;
  finish_reason?: string | null;
}

interface OAIChatResponse {
  id: string;
  model: string;
  choices: OAIChatChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// ---------------------------------------------------------------------------
// Client implementation
// ---------------------------------------------------------------------------

export class LocalClientService implements LLMClient {
  public readonly provider: LLMProvider = 'ollama';

  private static readonly MODEL_CACHE_TTL = 60_000; // 1 min

  private readonly cfg: LocalConfig;
  private cachedModels: string[] | null = null;
  private cachedModelsAt = 0;

  constructor(config?: LocalConfig) {
    this.cfg = config ?? loadLocalConfig();
  }

  // -------------------------------------------------------------------------
  // Health check
  // -------------------------------------------------------------------------

  async ping(): Promise<{ ok: boolean; provider: LLMProvider; t: number }> {
    const t = Date.now();
    try {
      const url = this.cfg.apiFormat === 'ollama'
        ? `${this.baseUrl()}/api/tags`
        : `${this.baseUrl()}/v1/models`;

      const ac = new AbortController();
      const timeout = setTimeout(() => ac.abort(), this.cfg.health.timeoutMs);

      try {
        const res = await fetch(url, { signal: ac.signal, headers: this.authHeaders() });
        return { ok: res.ok, provider: 'ollama', t };
      } finally {
        clearTimeout(timeout);
      }
    } catch {
      return { ok: false, provider: 'ollama', t };
    }
  }

  // -------------------------------------------------------------------------
  // Non-streamed completion
  // -------------------------------------------------------------------------

  async complete(req: LLMRequest): Promise<LLMCompletionResponse> {
    const model = req.model.model || this.cfg.defaultModel;
    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), this.cfg.timeoutMs);

    try {
      if (this.cfg.apiFormat === 'openai_compat') {
        return await this.completeOAI(req, model, ac.signal);
      }
      return await this.completeOllama(req, model, ac.signal);
    } finally {
      clearTimeout(timeout);
    }
  }

  // -------------------------------------------------------------------------
  // Streamed completion (ChatGPT-parity)
  // -------------------------------------------------------------------------

  async stream(params: {
    req: LLMRequest;
    sink: StreamSink;
    config: LLMStreamingConfig;
    hooks?: StreamingHooks;
    initialState?: Partial<StreamState>;
  }): Promise<LLMStreamResponse> {
    const { req, sink, config, hooks, initialState } = params;
    const model = req.model.model || this.cfg.defaultModel;

    const state: StreamState = {
      phase: 'init',
      kind: 'answer',
      traceId: req.traceId,
      startedAtMs: Date.now(),
      accumulatedText: '',
      markers: [],
      heldMarkers: [],
      abortRequested: false,
      ...initialState,
    };

    // Emit start
    this.emit(sink, {
      event: 'start',
      data: { kind: state.kind, t: Date.now(), traceId: state.traceId },
    });
    hooks?.onStart?.(state);

    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), this.cfg.timeoutMs);

    try {
      if (this.cfg.apiFormat === 'openai_compat') {
        return await this.streamOAI(req, model, sink, config, hooks, state, ac.signal);
      }
      return await this.streamOllama(req, model, sink, config, hooks, state, ac.signal);
    } catch (e) {
      return this.handleStreamError(e, req, sink, hooks, state);
    } finally {
      clearTimeout(timeout);
    }
  }

  // -------------------------------------------------------------------------
  // Ollama: non-streamed
  // -------------------------------------------------------------------------

  private async completeOllama(
    req: LLMRequest,
    model: string,
    signal: AbortSignal,
  ): Promise<LLMCompletionResponse> {
    const url = `${this.baseUrl()}/api/chat`;
    const body: OllamaChatRequest = {
      model,
      messages: this.toOllamaMessages(req.messages),
      stream: false,
      options: this.toOllamaOptions(req),
      keep_alive: this.cfg.ollama.keepAlive,
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok) {
      const errText = await safeReadText(res);
      throw new Error(
        JSON.stringify({
          code: 'LOCAL_HTTP_ERROR',
          status: res.status,
          body: truncate(errText, 2000),
        }),
      );
    }

    const json = (await res.json()) as OllamaChatResponse;

    return {
      traceId: req.traceId,
      turnId: req.turnId,
      model: req.model,
      content: json.message?.content ?? '',
      usage: {
        promptTokens: json.prompt_eval_count,
        completionTokens: json.eval_count,
        totalTokens: (json.prompt_eval_count ?? 0) + (json.eval_count ?? 0) || undefined,
      },
    };
  }

  // -------------------------------------------------------------------------
  // Ollama: streamed
  // -------------------------------------------------------------------------

  private async streamOllama(
    req: LLMRequest,
    model: string,
    sink: StreamSink,
    config: LLMStreamingConfig,
    hooks: StreamingHooks | undefined,
    state: StreamState,
    signal: AbortSignal,
  ): Promise<LLMStreamResponse> {
    const url = `${this.baseUrl()}/api/chat`;
    const body: OllamaChatRequest = {
      model,
      messages: this.toOllamaMessages(req.messages),
      stream: true,
      options: this.toOllamaOptions(req),
      keep_alive: this.cfg.ollama.keepAlive,
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok || !res.body) {
      const errText = await safeReadText(res);
      this.emitStreamError(sink, hooks, state, 'LLM_PROVIDER_BAD_REQUEST', res.status, errText);
      return this.buildStreamReturn(req, state);
    }

    state.phase = 'preamble';

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let firstTokenEmitted = false;
    let finalUsage: LLMCompletionResponse['usage'] | undefined;

    while (sink.isOpen()) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const chunk = safeJsonParse(trimmed) as OllamaChatResponse | null;
        if (!chunk) continue;

        const text = chunk.message?.content ?? '';

        if (text) {
          if (!firstTokenEmitted) {
            firstTokenEmitted = true;
            state.firstTokenAtMs = Date.now();
            this.emit(sink, { event: 'progress', data: { stage: 'generation', t: Date.now() } });
            hooks?.onFirstToken?.(state);
          }

          const deltas = chunkText(text, config.chunking?.maxCharsPerDelta ?? 64);

          for (const dText of deltas) {
            if (!sink.isOpen()) break;

            const delta: StreamDelta = { text: dText };
            state.phase = 'delta';
            state.accumulatedText += dText;

            this.emit(sink, { event: 'delta', data: delta });
            hooks?.onDelta?.(delta, state);

            const targetMs = config.chunking?.targetDeltaEveryMs;
            if (targetMs && targetMs > 0) await sleep(targetMs);
          }
        }

        // Ollama sends done:true on the final chunk with usage stats
        if (chunk.done) {
          finalUsage = {
            promptTokens: chunk.prompt_eval_count,
            completionTokens: chunk.eval_count,
            totalTokens: (chunk.prompt_eval_count ?? 0) + (chunk.eval_count ?? 0) || undefined,
          };
        }
      }
    }

    // Final event
    this.emitFinalEvent(req, sink, hooks, state, finalUsage);
    return this.buildStreamReturn(req, state);
  }

  // -------------------------------------------------------------------------
  // OpenAI-compatible: non-streamed (vLLM, llama.cpp)
  // -------------------------------------------------------------------------

  private async completeOAI(
    req: LLMRequest,
    model: string,
    signal: AbortSignal,
  ): Promise<LLMCompletionResponse> {
    const url = `${this.baseUrl()}/v1/chat/completions`;
    const body: OAIChatRequest = {
      model,
      messages: this.toOAIMessages(req.messages),
      stream: false,
      ...this.toOAIOptions(req),
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok) {
      const errText = await safeReadText(res);
      throw new Error(
        JSON.stringify({
          code: 'LOCAL_HTTP_ERROR',
          status: res.status,
          body: truncate(errText, 2000),
        }),
      );
    }

    const json = (await res.json()) as OAIChatResponse;
    const choice = json.choices?.[0];

    return {
      traceId: req.traceId,
      turnId: req.turnId,
      model: req.model,
      content: choice?.message?.content ?? '',
      usage: json.usage
        ? {
            promptTokens: json.usage.prompt_tokens,
            completionTokens: json.usage.completion_tokens,
            totalTokens: json.usage.total_tokens,
          }
        : undefined,
      requestId: json.id,
    };
  }

  // -------------------------------------------------------------------------
  // OpenAI-compatible: streamed (vLLM, llama.cpp)
  // -------------------------------------------------------------------------

  private async streamOAI(
    req: LLMRequest,
    model: string,
    sink: StreamSink,
    config: LLMStreamingConfig,
    hooks: StreamingHooks | undefined,
    state: StreamState,
    signal: AbortSignal,
  ): Promise<LLMStreamResponse> {
    const url = `${this.baseUrl()}/v1/chat/completions`;
    const body: OAIChatRequest = {
      model,
      messages: this.toOAIMessages(req.messages),
      stream: true,
      ...this.toOAIOptions(req),
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok || !res.body) {
      const errText = await safeReadText(res);
      this.emitStreamError(sink, hooks, state, 'LLM_PROVIDER_BAD_REQUEST', res.status, errText);
      return this.buildStreamReturn(req, state);
    }

    state.phase = 'preamble';

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let firstTokenEmitted = false;

    while (sink.isOpen()) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // SSE format: "data: {...}" or "data: [DONE]"
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') continue;

        const chunk = safeJsonParse(payload) as OAIChatResponse | null;
        if (!chunk) continue;

        const text = chunk.choices?.[0]?.delta?.content ?? '';

        if (text) {
          if (!firstTokenEmitted) {
            firstTokenEmitted = true;
            state.firstTokenAtMs = Date.now();
            this.emit(sink, { event: 'progress', data: { stage: 'generation', t: Date.now() } });
            hooks?.onFirstToken?.(state);
          }

          const deltas = chunkText(text, config.chunking?.maxCharsPerDelta ?? 64);

          for (const dText of deltas) {
            if (!sink.isOpen()) break;

            const delta: StreamDelta = { text: dText };
            state.phase = 'delta';
            state.accumulatedText += dText;

            this.emit(sink, { event: 'delta', data: delta });
            hooks?.onDelta?.(delta, state);

            const targetMs = config.chunking?.targetDeltaEveryMs;
            if (targetMs && targetMs > 0) await sleep(targetMs);
          }
        }
      }
    }

    this.emitFinalEvent(req, sink, hooks, state, undefined);
    return this.buildStreamReturn(req, state);
  }

  // -------------------------------------------------------------------------
  // Message mapping
  // -------------------------------------------------------------------------

  private toOllamaMessages(messages: LLMMessage[]): OllamaMessage[] {
    const out: OllamaMessage[] = [];

    for (const m of messages) {
      // Ollama supports system, user, assistant roles
      if (m.role === 'system' || m.role === 'developer') {
        if (m.content) out.push({ role: 'system', content: m.content });
        continue;
      }

      if (m.role === 'user') {
        out.push({ role: 'user', content: m.content ?? '' });
        continue;
      }

      if (m.role === 'assistant') {
        out.push({ role: 'assistant', content: m.content ?? '' });
        continue;
      }

      if (m.role === 'tool') {
        // Ollama does not have native tool-result messages.
        // Fold tool results into a user message for context continuity.
        const result = m.toolResult;
        if (result) {
          out.push({
            role: 'user',
            content: `[Tool result for ${result.toolName}]: ${
              result.ok ? JSON.stringify(result.output ?? null) : `Error: ${result.error?.message ?? 'unknown'}`
            }`,
          });
        }
        continue;
      }
    }

    return out;
  }

  private toOAIMessages(messages: LLMMessage[]): OAIMessage[] {
    const out: OAIMessage[] = [];

    for (const m of messages) {
      if (m.role === 'system' || m.role === 'developer') {
        if (m.content) out.push({ role: 'system', content: m.content });
        continue;
      }

      if (m.role === 'user') {
        out.push({ role: 'user', content: m.content ?? '' });
        continue;
      }

      if (m.role === 'assistant') {
        out.push({ role: 'assistant', content: m.content ?? '' });
        continue;
      }

      if (m.role === 'tool') {
        const result = m.toolResult;
        if (result) {
          out.push({
            role: 'user',
            content: `[Tool result for ${result.toolName}]: ${
              result.ok ? JSON.stringify(result.output ?? null) : `Error: ${result.error?.message ?? 'unknown'}`
            }`,
          });
        }
        continue;
      }
    }

    return out;
  }

  // -------------------------------------------------------------------------
  // Options mapping
  // -------------------------------------------------------------------------

  private toOllamaOptions(req: LLMRequest): OllamaChatRequest['options'] {
    const s = req.sampling;
    const opts: OllamaChatRequest['options'] = {};

    if (s) {
      if (s.temperature !== undefined) opts.temperature = s.temperature;
      if (s.topP !== undefined) opts.top_p = s.topP;
      if (s.maxOutputTokens !== undefined) opts.num_predict = s.maxOutputTokens;
      if (s.seed !== undefined) opts.seed = s.seed;
      if (s.presencePenalty !== undefined) opts.presence_penalty = s.presencePenalty;
      if (s.frequencyPenalty !== undefined) opts.frequency_penalty = s.frequencyPenalty;
    }

    // Ollama-specific hardware options from config
    if (this.cfg.ollama.numThreads !== undefined) opts.num_thread = this.cfg.ollama.numThreads;
    if (this.cfg.ollama.numGpu !== undefined) opts.num_gpu = this.cfg.ollama.numGpu;

    return Object.keys(opts).length > 0 ? opts : undefined;
  }

  private toOAIOptions(req: LLMRequest): Partial<OAIChatRequest> {
    const s = req.sampling;
    if (!s) return {};

    const opts: Partial<OAIChatRequest> = {};
    if (s.temperature !== undefined) opts.temperature = s.temperature;
    if (s.topP !== undefined) opts.top_p = s.topP;
    if (s.maxOutputTokens !== undefined) opts.max_tokens = s.maxOutputTokens;
    if (s.seed !== undefined) opts.seed = s.seed;
    if (s.presencePenalty !== undefined) opts.presence_penalty = s.presencePenalty;
    if (s.frequencyPenalty !== undefined) opts.frequency_penalty = s.frequencyPenalty;

    return opts;
  }

  // -------------------------------------------------------------------------
  // Model discovery
  // -------------------------------------------------------------------------

  /**
   * List models available on the local server.
   * Cached for MODEL_CACHE_TTL to avoid excessive API calls.
   */
  async listAvailableModels(): Promise<string[]> {
    const now = Date.now();
    if (this.cachedModels && now - this.cachedModelsAt < LocalClientService.MODEL_CACHE_TTL) {
      return this.cachedModels;
    }

    try {
      if (this.cfg.apiFormat === 'ollama') {
        const res = await fetch(`${this.baseUrl()}/api/tags`, { headers: this.authHeaders() });
        if (!res.ok) return Object.keys(LOCAL_MODEL_DEFAULTS);

        const json = (await res.json()) as OllamaTagsResponse;
        this.cachedModels = json.models?.map(m => m.name) ?? [];
      } else {
        const res = await fetch(`${this.baseUrl()}/v1/models`, { headers: this.authHeaders() });
        if (!res.ok) return Object.keys(LOCAL_MODEL_DEFAULTS);

        const json = (await res.json()) as { data?: Array<{ id: string }> };
        this.cachedModels = json.data?.map(m => m.id) ?? [];
      }

      this.cachedModelsAt = now;
      return this.cachedModels;
    } catch {
      return Object.keys(LOCAL_MODEL_DEFAULTS);
    }
  }

  // -------------------------------------------------------------------------
  // Stream helpers
  // -------------------------------------------------------------------------

  private emitFinalEvent(
    req: LLMRequest,
    sink: StreamSink,
    hooks: StreamingHooks | undefined,
    state: StreamState,
    usage: LLMCompletionResponse['usage'] | undefined,
  ): void {
    state.phase = 'finalizing';

    const finalEvent: StreamEvent = {
      event: 'final',
      data: {
        text: state.accumulatedText,
        kind: state.kind,
        llm: {
          provider: 'ollama',
          model: req.model.model,
          promptTokens: usage?.promptTokens,
          completionTokens: usage?.completionTokens,
          totalTokens: usage?.totalTokens,
        },
        markers: state.markers,
        traceId: state.traceId,
        timings: {
          startMs: state.startedAtMs,
          firstTokenMs: state.firstTokenAtMs,
          endMs: Date.now(),
        },
      },
    };

    this.emit(sink, finalEvent);
    hooks?.onFinal?.(finalEvent.data, state);
    sink.close();
  }

  private emitStreamError(
    sink: StreamSink,
    hooks: StreamingHooks | undefined,
    state: StreamState,
    code: string,
    status: number,
    errText: string,
  ): void {
    const errEvent: StreamEvent = {
      event: 'error',
      data: {
        code,
        message: JSON.stringify({ status, body: truncate(errText, 2000) }),
        traceId: state.traceId,
        t: Date.now(),
      },
    };

    this.emit(sink, errEvent);
    hooks?.onError?.(errEvent.data, state);
    sink.close();
  }

  private handleStreamError(
    e: unknown,
    req: LLMRequest,
    sink: StreamSink,
    hooks: StreamingHooks | undefined,
    state: StreamState,
  ): LLMStreamResponse {
    if (!sink.isOpen()) {
      return this.buildStreamReturn(req, state);
    }

    const isAbort = e instanceof Error && (e.name === 'AbortError' || /abort/i.test(e.message));

    if (isAbort) {
      state.phase = 'aborted';
      const abortEvent: StreamEvent = {
        event: 'abort',
        data: { reason: 'timeout', t: Date.now(), traceId: state.traceId },
      };
      this.emit(sink, abortEvent);
      hooks?.onAbort?.(abortEvent.data, state);
    } else {
      state.phase = 'error';
      const errEvent: StreamEvent = {
        event: 'error',
        data: {
          code: 'LLM_GENERATION_FAILED',
          message: sanitizeErrMessage(e),
          traceId: state.traceId,
          t: Date.now(),
        },
      };
      this.emit(sink, errEvent);
      hooks?.onError?.(errEvent.data, state);
    }

    sink.close();
    return this.buildStreamReturn(req, state);
  }

  private buildStreamReturn(req: LLMRequest, state: StreamState): LLMStreamResponse {
    return {
      traceId: req.traceId,
      turnId: req.turnId,
      model: req.model,
      finalText: state.accumulatedText,
    };
  }

  private emit(sink: StreamSink, event: StreamEvent): void {
    if (!sink.isOpen()) return;
    sink.write(event);
    sink.flush?.();
  }

  private baseUrl(): string {
    return this.cfg.baseUrl.replace(/\/$/, '');
  }

  /** Build auth headers when apiKey is configured (RunPod, secured vLLM, hosted Ollama). */
  private authHeaders(): Record<string, string> {
    const h: Record<string, string> = {};
    if (this.cfg.apiKey) h['Authorization'] = `Bearer ${this.cfg.apiKey}`;
    return h;
  }
}

// ---------------------------------------------------------------------------
// Utilities (no user-facing copy)
// ---------------------------------------------------------------------------

function safeJsonParse(s: string): unknown | null {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n) + '\u2026';
}

function sanitizeErrMessage(e: unknown): string {
  if (e instanceof Error) return truncate(e.message, 800);
  return 'unknown_error';
}

function chunkText(text: string, maxChars: number): string[] {
  if (!text) return [];
  if (maxChars <= 0) return [text];

  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    out.push(text.slice(i, i + maxChars));
    i += maxChars;
  }
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
