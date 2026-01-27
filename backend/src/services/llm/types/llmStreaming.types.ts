/**
 * llmStreaming.types.ts
 *
 * Streaming contract types for Koda (ChatGPT-parity).
 * - SSE-friendly "delta" events + a single final payload event
 * - Marker buffering support (avoid UI flicker)
 * - No user-facing copy inside types
 */

import type { LLMProvider } from './llmErrors.types';

/** Stream transport used by the server */
export type StreamTransport = 'sse' | 'ws' | 'inproc';

/** Koda streaming phases */
export type StreamPhase =
  | 'init'
  | 'preamble'
  | 'delta'
  | 'marker_hold'
  | 'finalizing'
  | 'done'
  | 'aborted'
  | 'error';

/** High-level purpose of a streamed message */
export type StreamMessageKind =
  | 'answer' // normal doc-grounded answer
  | 'nav_pills' // open/where/discover: one short line + pills only (frontend contract enforced elsewhere)
  | 'system'; // internal/system messages (rare)

/**
 * "Marker" tokens are structural tokens (e.g., evidence markers, source markers)
 * that may arrive mid-stream but should be withheld until safe to show.
 */
export type StreamMarkerType =
  | 'doc_ref' // e.g. **Filename.pdf**
  | 'source_ref' // attachment/source marker
  | 'citation' // numeric/marker references
  | 'other';

/** A marker discovered during streaming. */
export interface StreamMarker {
  type: StreamMarkerType;
  /** Raw marker text as produced by model/pipeline */
  raw: string;
  /** Optional structured info to help resolve/attach later */
  meta?: Record<string, unknown>;
}

/** Server-to-client (SSE) event names */
export type StreamEventName =
  | 'start'
  | 'delta'
  | 'marker'
  | 'progress'
  | 'final'
  | 'abort'
  | 'error'
  | 'ping';

/** Progress signals (optional) to mimic ChatGPT-like responsiveness */
export type StreamProgressStage =
  | 'routing'
  | 'scoping'
  | 'retrieval'
  | 'compose'
  | 'generation'
  | 'validation'
  | 'render';

/** Delta payload: the smallest unit of user-visible text streamed */
export interface StreamDelta {
  /** Text to append (markdown-safe; no raw HTML) */
  text: string;
  /** If true, delta must not be shown immediately (buffer/hold) */
  hold?: boolean;
  /** Optional reason for hold (debug/telemetry only) */
  holdReason?: 'marker' | 'policy' | 'unknown';
}

/** Optional keep-alive ping */
export interface StreamPing {
  t: number; // epoch ms
}

/** Optional progress event */
export interface StreamProgress {
  stage: StreamProgressStage;
  /** 0..1 inclusive, if known */
  p?: number;
  /** Epoch ms */
  t: number;
}

/**
 * The final payload is the only place attachments/sources/contracts should be emitted.
 * Frontend renders sources/pills from this payload; do not inline a "Sources:" label in text.
 */
export interface StreamFinalPayload {
  /** The complete final text that the UI should display */
  text: string;

  /** Message kind informs frontend contracts (e.g., nav_pills) */
  kind: StreamMessageKind;

  /** Provider metadata for telemetry/debug (never user-facing) */
  llm?: {
    provider: LLMProvider;
    model?: string;
    /** Token counts if available */
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };

  /** Markers observed during generation (may have been held back) */
  markers?: StreamMarker[];

  /**
   * Sources/attachments are contract objects; shape lives in attachments.types.ts in your repo.
   * Keep as unknown here to avoid circular deps if needed; replace with real types in your project.
   */
  sourcesPayload?: unknown;
  attachmentsPayload?: unknown;

  /** Server-side trace id */
  traceId?: string;

  /** Duration timing (ms) */
  timings?: {
    startMs: number;
    firstTokenMs?: number;
    endMs: number;
  };
}

/** Abort payload */
export interface StreamAbortPayload {
  reason:
    | 'user_stop'
    | 'server_shutdown'
    | 'timeout'
    | 'upstream_cancel'
    | 'unknown';
  t: number;
  traceId?: string;
}

/** Error payload (shape aligns with llmErrors.types.ts but kept lightweight here) */
export interface StreamErrorPayload {
  code: string;
  message: string; // internal only (server logs); frontend should map to bank-driven microcopy
  traceId?: string;
  t: number;
}

/** Stream events (server -> client) */
export type StreamEvent =
  | { event: 'start'; data: { kind: StreamMessageKind; t: number; traceId?: string } }
  | { event: 'delta'; data: StreamDelta }
  | { event: 'marker'; data: StreamMarker }
  | { event: 'progress'; data: StreamProgress }
  | { event: 'final'; data: StreamFinalPayload }
  | { event: 'abort'; data: StreamAbortPayload }
  | { event: 'error'; data: StreamErrorPayload }
  | { event: 'ping'; data: StreamPing };

/**
 * Stream sink: anything that can receive StreamEvents (SSE writer, WS sender, inproc collector).
 */
export interface StreamSink {
  transport: StreamTransport;

  /** Write an event (must be ordered) */
  write(event: StreamEvent): void;

  /** Optional flush (SSE frameworks often no-op) */
  flush?(): void;

  /** Close the stream (idempotent) */
  close(): void;

  /** Whether the stream is still open */
  isOpen(): boolean;
}

/** Policy for buffering markers/deltas to avoid flicker */
export interface MarkerHoldPolicy {
  /** If true, marker events should be buffered and emitted later */
  enabled: boolean;

  /**
   * Flush markers when we reach a safe boundary.
   * - 'final' is the safest default for ChatGPT-like UX.
   */
  flushAt: 'final' | 'paragraph_boundary' | 'never';

  /** Hard cap to avoid unbounded growth */
  maxBufferedMarkers: number;
}

/** Streaming configuration */
export interface LLMStreamingConfig {
  /** Minimum interval between pings (ms) */
  pingIntervalMs?: number;

  /** Control delta chunking for smooth output */
  chunking?: {
    /** Max characters per emitted delta */
    maxCharsPerDelta: number;
    /** Target milliseconds between deltas (best-effort) */
    targetDeltaEveryMs?: number;
  };

  /** Marker holding rules */
  markerHold: MarkerHoldPolicy;
}

/** Internal stream state for services to track */
export interface StreamState {
  phase: StreamPhase;
  kind: StreamMessageKind;

  traceId: string;
  startedAtMs: number;
  firstTokenAtMs?: number;

  /** Text accumulated so far (may include held segments depending on implementation) */
  accumulatedText: string;

  /** Markers seen */
  markers: StreamMarker[];

  /** Markers held back (if markerHold.enabled) */
  heldMarkers: StreamMarker[];

  /** Whether abort was requested */
  abortRequested: boolean;
}

/** Optional: callbacks for streaming service implementations */
export interface StreamingHooks {
  onStart?: (state: StreamState) => void;
  onFirstToken?: (state: StreamState) => void;
  onDelta?: (delta: StreamDelta, state: StreamState) => void;
  onMarker?: (marker: StreamMarker, state: StreamState) => void;
  onFinal?: (final: StreamFinalPayload, state: StreamState) => void;
  onAbort?: (abort: StreamAbortPayload, state: StreamState) => void;
  onError?: (err: StreamErrorPayload, state: StreamState) => void;
}
