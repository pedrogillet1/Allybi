/**
 * circuitBreaker.ts — Three-state circuit breaker for LLM provider calls.
 *
 * States:
 *   closed   → all calls pass through
 *   open     → calls fail-fast with CircuitOpenError
 *   half_open → limited probe calls allowed to test recovery
 *
 * Configured via env vars:
 *   LLM_CB_FAILURE_THRESHOLD   (default 5)
 *   LLM_CB_RESET_TIMEOUT_MS    (default 30_000)
 *   LLM_CB_HALF_OPEN_MAX_CALLS (default 1)
 */

export type CircuitState = "closed" | "open" | "half_open";

export interface CircuitBreakerConfig {
  /** Consecutive failures before tripping to open. Default 5. */
  failureThreshold?: number;
  /** Time in ms before transitioning from open → half_open. Default 30_000. */
  resetTimeoutMs?: number;
  /** Max probe calls allowed in half_open state. Default 1. */
  halfOpenMaxCalls?: number;
}

export interface CircuitSnapshot {
  state: CircuitState;
  consecutiveFailures: number;
  lastFailureTs: number | null;
  halfOpenCalls: number;
}

export class CircuitOpenError extends Error {
  readonly code = "CIRCUIT_OPEN";
  constructor(public readonly provider: string) {
    super(`Circuit breaker open for provider: ${provider}`);
    this.name = "CircuitOpenError";
  }
}

const DEFAULT_FAILURE_THRESHOLD = 8;
const DEFAULT_RESET_TIMEOUT_MS = 15_000;
const DEFAULT_HALF_OPEN_MAX_CALLS = 1;

export class CircuitBreaker {
  private state: CircuitState = "closed";
  private consecutiveFailures = 0;
  private lastFailureTs: number | null = null;
  private halfOpenCalls = 0;

  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly halfOpenMaxCalls: number;

  constructor(
    private readonly provider: string,
    config?: CircuitBreakerConfig,
  ) {
    this.failureThreshold =
      config?.failureThreshold ??
      envInt("LLM_CB_FAILURE_THRESHOLD", DEFAULT_FAILURE_THRESHOLD);
    this.resetTimeoutMs =
      config?.resetTimeoutMs ??
      envInt("LLM_CB_RESET_TIMEOUT_MS", DEFAULT_RESET_TIMEOUT_MS);
    this.halfOpenMaxCalls =
      config?.halfOpenMaxCalls ??
      envInt("LLM_CB_HALF_OPEN_MAX_CALLS", DEFAULT_HALF_OPEN_MAX_CALLS);
  }

  /** Returns true if the circuit is open and calls should be rejected. */
  isOpen(): boolean {
    if (this.state === "closed") return false;

    if (this.state === "open") {
      // Check if enough time has passed to transition to half_open
      if (
        this.lastFailureTs !== null &&
        Date.now() - this.lastFailureTs >= this.resetTimeoutMs
      ) {
        this.state = "half_open";
        this.halfOpenCalls = 0;
        return false; // allow a probe
      }
      return true;
    }

    // half_open: allow up to halfOpenMaxCalls
    return this.halfOpenCalls >= this.halfOpenMaxCalls;
  }

  /** Call after a successful provider call. */
  recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.state = "closed";
    this.halfOpenCalls = 0;
  }

  /** Call after a failed provider call. */
  recordFailure(): void {
    this.consecutiveFailures++;
    this.lastFailureTs = Date.now();

    if (this.state === "half_open") {
      // probe failed — back to open
      this.state = "open";
      return;
    }

    if (this.consecutiveFailures >= this.failureThreshold) {
      this.state = "open";
    }
  }

  /** Increment half-open call counter (call before dispatching probe). */
  recordHalfOpenAttempt(): void {
    if (this.state === "half_open") {
      this.halfOpenCalls++;
    }
  }

  getSnapshot(): CircuitSnapshot {
    return {
      state: this.state,
      consecutiveFailures: this.consecutiveFailures,
      lastFailureTs: this.lastFailureTs,
      halfOpenCalls: this.halfOpenCalls,
    };
  }
}

function envInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}
