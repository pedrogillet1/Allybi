/**
 * localClient.service.ts
 *
 * Clean, production-ready local LLM client for Koda (Ollama / local HTTP LLM).
 * Implements the provider-agnostic LLMClient interface with:
 * - complete() (non-streamed)
 * - stream()   (ChatGPT-parity streaming feel via StreamSink)
 *
 * Design goals (Koda README-aligned):
 * - Deterministic request shaping (stable role mapping, stable options)
 * - Smooth streaming (steady deltas, abortable)
 * - No user-facing microcopy
 * - Tool calls: supported in a conservative, best-effort way (adapter-friendly)
 *
 * NOTES:
 * - This is a generic “local” client. If your local model supports tool calling, you can extend
 *   `extractToolCallsFromText` or add a native tool-call adapter.
 * - This service does not enforce safety, wrong-doc, evidence gates, banned phrases, etc.
 *   Those belong in Trust Gate / Quality Gates.
 */

import crypto from 'crypto';

import type { LLMClient, LLMRequest, LLMCompletionResponse, LLMStreamResponse } from './llmClient.interface';
import type { LLMProvider } from './llmErrors.types';
import type { ProviderToolCall, ToolRegistry } from './llmTools.types';
import type {
  LLMStreamingConfig,
  StreamSink,
  StreamEvent,
  StreamState,
  StreamingHooks,
  StreamDelta,
} from './llmStreaming.types';

export interface LocalClientConfig {
  /**
   * Backend kind:
   * - 'ollama': expects Ollama API shapes for /api/chat
   * - 'generic': uses a generic chat completions-ish endpoint you provide
   */
  backend: 'ollama' | 'generic';

  /** Base URL for local LLM server (no trailing slash) */
  baseUrl: string;

  /** Default endpoint paths (can override) */
  endpoints?: {
    chat?: string; // ollama: "/api/chat"
    generate?: string; // ollama: "/api/generate" (optional)
    genericChat?: string; // generic: "/v1/chat/completions" or similar
  };

  /** Hard timeout (ms) */
  timeoutMs: number;

  /**
   * If true, use streaming mode by default in stream()
   * (complete() always requests non-stream by default).
   */
  streamingEnabled: boolean;

  /**
   * If true, attempt to detect tool calls from model output via a strict JSON envelope
   * (best-effort). Leave false if you don’t want any accidental tool triggers.
   */
  toolCallDetectionEnabled: boolean;

  /**
   * Deterministic tool-call id embedding (if tool calls are detected).
   */
  toolCallIdSalt?: string;

  /**
   * Optional headers (for reverse proxies, auth, etc.)
   */
  headers?: Record<string, string>;
}

type OllamaRole = 'system' | 'user' | 'assistant' | 'tool';

interface OllamaChatMessage {
  role: OllamaRole;
  content: string;
}

interface OllamaChatRequest {
  model: string;
  messages: OllamaChatMessage[];
  stream: boolean;
  options?: {
    temperature?: number;
    top_p?: number;
    num_predict?: number;
    // You can extend with num_ctx, repeat_penalty, seed, etc. if your server supports it.
  };
}

interface OllamaChatResponseChunk {
  // streamed chunks from /api/chat
  model?: string;
  created_at?: string;
  message?: { role?: string; content?: string };
  done?: boolean;
  done_reason?: string;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
  eval_duration?: number;
}

interface OllamaChatResponseFinal extends OllamaChatResponseChunk {
  done: true;
}

/**
 * Generic backend (OpenAI-like) types (best-effort).
 * If your local server differs, tweak these shapes.
 */
interface GenericChatRequest {
  model: string;
  messages: Array<{ role: string; content: string }>;
  stream?: boolean;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
}

interface GenericChatResponse {
  id?: string;
  model?: string;
  choices?: Array<{ message?: { role?: string; content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

export class LocalClientService implements LLMClient {
  public readonly provider: LLMProvider = 'local';

  constructor(private readonly cfg: LocalClientConfig) {}

  async ping(): Promise<{ ok: boolean; provider: LLMProvider; t: number }> {
    const t = Date.now();
    try {
      // best-effort: no network call by default
      return { ok: true, provider: 'local', t };
    } catch {
      return { ok: false, provider: 'local', t };
    }
  }

  async complete(req: LLMRequest): Promise<LLMCompletionResponse> {
    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), this.cfg.timeoutMs);

    try {
      const url = this.buildCompleteUrl();
      const body = this.buildRequestBody(req, /*stream*/ false);

      const res = await fetch(url, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
        signal: ac.signal,
      });

      const requestId = res.headers.get('x-request-id') ?? undefined;

      if (!res.ok) {
        const errText = await safeReadText(res);
        throw new Error(
          JSON.stringify({
            code: 'LOCAL_HTTP_ERROR',
            status: res.status,
            body: truncate(errText, 2000),
          })
        );
      }

      const parsed = await this.parseCompleteResponse(res, req);

      return {
        traceId: req.traceId,
        turnId: req.turnId,
        model: req.model,
        content: parsed.text,
        toolCallRequest: parsed.toolCalls.length ? { toolCalls: parsed.toolCalls } : undefined,
        usage: parsed.usage,
        requestId,
        raw: undefined,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async stream(params: {
    req: LLMRequest;
    sink: StreamSink;
    config: LLMStreamingConfig;
    hooks?: StreamingHooks;
    initialState?: Partial<StreamState>;
  }): Promise<LLMStreamResponse> {
    const { req, sink, config, hooks, initialState } = params;

    const state: StreamState = {
      phase: 'init',
      kind: inferKind(req),
      traceId: req.traceId,
      startedAtMs: Date.now(),
      accumulatedText: '',
      markers: [],
      heldMarkers: [],
      abortRequested: false,
      ...initialState,
    };

    // Start
    this.emit(sink, { event: 'start', data: { kind: state.kind, t: Date.now(), traceId: state.traceId } });
    hooks?.onStart?.(state);

    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), this.cfg.timeoutMs);

    try {
      const url = this.buildStreamUrl();
      const body = this.buildRequestBody(req, /*stream*/ true);

      const res = await fetch(url, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
        signal: ac.signal,
      });

      const requestId = res.headers.get('x-request-id') ?? undefined;

      if (!res.ok || !res.body) {
        const errText = await safeReadText(res);
        this.emit(sink, {
          event: 'error',
          data: {
            code: 'LLM_PROVIDER_BAD_REQUEST',
            message: JSON.stringify({ status: res.status, body: truncate(errText, 2000) }),
            traceId: state.traceId,
            t: Date.now(),
          },
        });
        hooks?.onError?.(
          {
            code: 'LLM_PROVIDER_BAD_REQUEST',
            message: 'provider_bad_request',
            traceId: state.traceId,
            t: Date.now(),
          },
          state
        );
        sink.close();
        return {
          traceId: req.traceId,
          turnId: req.turnId,
          model: req.model,
          finalText: state.accumulatedText,
          requestId,
        };
      }

      state.phase = 'preamble';

      // Consume stream as NDJSON (Ollama) or SSE-ish (generic)
      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');

      let buffer = '';
      let firstTokenEmitted = false;

      const maxChars = config.chunking?.maxCharsPerDelta ?? 64;
      const targetMs = config.chunking?.targetDeltaEveryMs ?? 0;

      const toolCalls: ProviderToolCall[] = [];

      while (sink.isOpen()) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse line-by-line (NDJSON)
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          if (this.cfg.backend === 'ollama') {
            const chunk = safeJsonParse<OllamaChatResponseChunk>(trimmed);
            if (!chunk) continue;

            const deltaText = chunk.message?.content ?? '';
            if (deltaText) {
              if (!firstTokenEmitted) {
                firstTokenEmitted = true;
                state.firstTokenAtMs = Date.now();
                hooks?.onFirstToken?.(state);
              }

              // Optionally detect tool calls from text (best-effort)
              if (this.cfg.toolCallDetectionEnabled) {
                const detected = extractToolCallsFromText(deltaText, this.cfg.toolCallIdSalt);
                if (detected.length) toolCalls.push(...detected);
              }

              // Stream deltas steadily
              state.phase = 'delta';
              state.accumulatedText += deltaText;

              for (const part of chunkText(deltaText, maxChars)) {
                const d: StreamDelta = { text: part };
                this.emit(sink, { event: 'delta', data: d });
                hooks?.onDelta?.(d, state);
                if (targetMs > 0) await sleep(targetMs);
              }
            }

            if (chunk.done) {
              // done_reason available
              break;
            }
          } else {
            // generic backend streaming: many servers stream SSE "data: {json}\n\n"
            // We support BOTH raw JSON lines and "data:" lines.
            const dataLine = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed;
            if (dataLine === '[DONE]') break;

            const obj = safeJsonParse<any>(dataLine);
            if (!obj) continue;

            const deltaText = extractGenericDeltaText(obj);
            if (deltaText) {
              if (!firstTokenEmitted) {
                firstTokenEmitted = true;
                state.firstTokenAtMs = Date.now();
                hooks?.onFirstToken?.(state);
              }

              if (this.cfg.toolCallDetectionEnabled) {
                const detected = extractToolCallsFromText(deltaText, this.cfg.toolCallIdSalt);
                if (detected.length) toolCalls.push(...detected);
              }

              state.phase = 'delta';
              state.accumulatedText += deltaText;

              for (const part of chunkText(deltaText, maxChars)) {
                const d: StreamDelta = { text: part };
                this.emit(sink, { event: 'delta', data: d });
                hooks?.onDelta?.(d, state);
                if (targetMs > 0) await sleep(targetMs);
              }
            }
          }
        }
      }

      state.phase = 'finalizing';

      // Final payload (sources/attachments added by orchestrator elsewhere)
      this.emit(sink, {
        event: 'final',
        data: {
          text: state.accumulatedText,
          kind: state.kind,
          llm: { provider: 'local', model: req.model.model },
          markers: state.markers,
          traceId: state.traceId,
          timings: {
            startMs: state.startedAtMs,
            firstTokenMs: state.firstTokenAtMs,
            endMs: Date.now(),
          },
        },
      });
      hooks?.onFinal?.(
        {
          text: state.accumulatedText,
          kind: state.kind,
          llm: { provider: 'local', model: req.model.model },
          markers: state.markers,
          traceId: state.traceId,
          timings: {
            startMs: state.startedAtMs,
            firstTokenMs: state.firstTokenAtMs,
            endMs: Date.now(),
          },
        },
        state
      );

      sink.close();

      return {
        traceId: req.traceId,
        turnId: req.turnId,
        model: req.model,
        finalText: state.accumulatedText,
        toolCallRequest: toolCalls.length ? { toolCalls } : undefined,
        requestId,
      };
    } catch (e) {
      const isAbort = e instanceof Error && (e.name === 'AbortError' || /abort/i.test(e.message));
      if (isAbort) {
        this.emit(sink, { event: 'abort', data: { reason: 'timeout', t: Date.now(), traceId: state.traceId } });
        hooks?.onAbort?.({ reason: 'timeout', t: Date.now(), traceId: state.traceId }, state);
      } else {
        this.emit(sink, {
          event: 'error',
          data: {
            code: 'LLM_GENERATION_FAILED',
            message: sanitizeErrMessage(e),
            traceId: state.traceId,
            t: Date.now(),
          },
        });
        hooks?.onError?.(
          { code: 'LLM_GENERATION_FAILED', message: sanitizeErrMessage(e), traceId: state.traceId, t: Date.now() },
          state
        );
      }
      sink.close();

      return {
        traceId: req.traceId,
        turnId: req.turnId,
        model: req.model,
        finalText: state.accumulatedText,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  /* ------------------------------ internals ------------------------------ */

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      ...(this.cfg.headers ?? {}),
    };
  }

  private buildCompleteUrl(): string {
    const base = this.cfg.baseUrl.replace(/\/$/, '');
    if (this.cfg.backend === 'ollama') {
      const path = this.cfg.endpoints?.chat ?? '/api/chat';
      return `${base}${path}`;
    }
    const path = this.cfg.endpoints?.genericChat ?? '/v1/chat/completions';
    return `${base}${path}`;
  }

  private buildStreamUrl(): string {
    // same endpoint, stream: true in body
    return this.buildCompleteUrl();
  }

  private buildRequestBody(req: LLMRequest, stream: boolean): OllamaChatRequest | GenericChatRequest {
    const messages = normalizeMessagesForLocal(req.messages);

    const temperature = req.sampling?.temperature;
    const topP = req.sampling?.topP;
    const maxOut = req.sampling?.maxOutputTokens;

    if (this.cfg.backend === 'ollama') {
      const ollamaMessages: OllamaChatMessage[] = messages.map(m => ({
        role: (m.role as OllamaRole) ?? 'user',
        content: m.content ?? '',
      }));

      const body: OllamaChatRequest = {
        model: req.model.model,
        messages: ollamaMessages,
        stream,
        options: {
          temperature,
          top_p: topP,
          num_predict: maxOut,
        },
      };

      // Tools are not included in Ollama base spec; if your model supports tools,
      // pass them via system message or a custom field (keep bank-driven elsewhere).
      void req.tools;

      return body;
    }

    // generic
    const body: GenericChatRequest = {
      model: req.model.model,
      messages: messages.map(m => ({ role: m.role, content: m.content ?? '' })),
      stream,
      temperature,
      top_p: topP,
      max_tokens: maxOut,
    };

    // If your generic server supports tool schemas, add them here (bank-driven upstream).
    void req.tools;

    return body;
  }

  private async parseCompleteResponse(res: Response, req: LLMRequest): Promise<{
    text: string;
    toolCalls: ProviderToolCall[];
    usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
  }> {
    if (this.cfg.backend === 'ollama') {
      const json = (await res.json()) as OllamaChatResponseFinal;
      const text = json.message?.content ?? '';
      const toolCalls = this.cfg.toolCallDetectionEnabled ? extractToolCallsFromText(text, this.cfg.toolCallIdSalt) : [];
      const usage = {
        promptTokens: json.prompt_eval_count,
        completionTokens: json.eval_count,
        totalTokens:
          (json.prompt_eval_count ?? 0) && (json.eval_count ?? 0)
            ? (json.prompt_eval_count ?? 0) + (json.eval_count ?? 0)
            : undefined,
      };

      return { text, toolCalls, usage };
    }

    // generic
    const json = (await res.json()) as GenericChatResponse;
    const text = json.choices?.[0]?.message?.content ?? '';
    const toolCalls = this.cfg.toolCallDetectionEnabled ? extractToolCallsFromText(text, this.cfg.toolCallIdSalt) : [];
    const usage = json.usage
      ? {
          promptTokens: json.usage.prompt_tokens,
          completionTokens: json.usage.completion_tokens,
          totalTokens: json.usage.total_tokens,
        }
      : undefined;

    return { text, toolCalls, usage };
  }

  private emit(sink: StreamSink, event: StreamEvent): void {
    if (!sink.isOpen()) return;
    sink.write(event);
    sink.flush?.();
  }
}

/* ------------------------------ helpers ------------------------------ */

/**
 * Normalize roles deterministically for local backends:
 * - system/developer → system
 * - user → user
 * - assistant → assistant
 * - tool → tool (or user if your server doesn't support tool role)
 *
 * NOTE: keep tool role if you have it; otherwise you can fold into user at the adapter layer.
 */
function normalizeMessagesForLocal(messages: any[]): Array<{ role: string; content: string }> {
  const out: Array<{ role: string; content: string }> = [];
  for (const m of messages) {
    const role = normalizeRole(m.role);
    const content = m.content ?? '';
    out.push({ role, content });
  }
  return out;
}

function normalizeRole(role: any): string {
  const r = String(role ?? '').toLowerCase();
  if (r === 'system' || r === 'developer') return 'system';
  if (r === 'assistant') return 'assistant';
  if (r === 'tool') return 'tool';
  return 'user';
}

function inferKind(req: LLMRequest): 'answer' | 'nav_pills' | 'system' {
  // Keep deterministic; upstream routing should set this via operator selection.
  if (req.purpose === 'intent_routing' || req.purpose === 'retrieval_planning') return 'system';
  return 'answer';
}

function safeJsonParse<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
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
  return s.slice(0, n) + '…';
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

/**
 * Generic streaming delta extractor:
 * Supports common patterns:
 * - OpenAI-like: choices[0].delta.content
 * - choices[0].message.content
 */
function extractGenericDeltaText(obj: any): string {
  // SSE delta style
  const d1 = obj?.choices?.[0]?.delta?.content;
  if (typeof d1 === 'string') return d1;

  // Non-stream chunk style
  const d2 = obj?.choices?.[0]?.message?.content;
  if (typeof d2 === 'string') return d2;

  return '';
}

/**
 * Best-effort tool call extraction from model text.
 * We only accept a STRICT envelope to avoid accidental triggers:
 *
 *   {"tool_call":{"name":"tool_name","args":{...}}}
 *
 * If present, we parse it and return ProviderToolCall(provider='unknown'|'local').
 * You can change the envelope to match your local model prompt format.
 */
function extractToolCallsFromText(text: string, salt?: string): ProviderToolCall[] {
  const out: ProviderToolCall[] = [];
  const trimmed = text.trim();

  // Fast check: must start with "{" to even try
  if (!trimmed.startsWith('{')) return out;

  const parsed = safeJsonParse<any>(trimmed);
  const tc = parsed?.tool_call;
  if (!tc || typeof tc.name !== 'string') return out;

  const args = (tc.args && typeof tc.args === 'object') ? (tc.args as Record<string, unknown>) : {};
  const callId = deterministicToolCallId(tc.name, args, salt ?? '');

  // Embed deterministic id for traceability
  if (!Object.prototype.hasOwnProperty.call(args, '__callId')) {
    (args as any).__callId = callId;
  }

  out.push({
    provider: 'unknown',
    name: tc.name,
    args,
  });

  return out;
}

function deterministicToolCallId(name: string, args: Record<string, unknown>, salt: string): string {
  const h = crypto.createHash('sha256');
  h.update(salt);
  h.update('|');
  h.update(name);
  h.update('|');
  h.update(JSON.stringify(sortKeysDeep(args)));
  return h.digest('hex').slice(0, 24);
}

function sortKeysDeep<T>(x: T): T {
  if (x === null || typeof x !== 'object') return x;
  if (Array.isArray(x)) return x.map(sortKeysDeep) as unknown as T;

  const obj = x as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) out[k] = sortKeysDeep(obj[k]);
  return out as T;
}
