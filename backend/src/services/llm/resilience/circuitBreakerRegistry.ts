/**
 * circuitBreakerRegistry.ts — Per-model circuit breaker isolation.
 *
 * Instead of one circuit breaker per provider, this registry lazily creates
 * a CircuitBreaker per `provider:model` key. If one model trips (e.g.
 * gpt-5.2 hitting rate limits), other models on the same provider remain
 * available.
 */

import { CircuitBreaker, type CircuitBreakerConfig, type CircuitSnapshot } from "./circuitBreaker";

export class CircuitBreakerRegistry {
  private readonly breakers = new Map<string, CircuitBreaker>();

  constructor(
    private readonly namespace: string,
    private readonly config?: CircuitBreakerConfig,
  ) {}

  /** Get or create a circuit breaker for the given model key. */
  get(modelKey: string): CircuitBreaker {
    const fullKey = `${this.namespace}:${modelKey}`;
    let cb = this.breakers.get(fullKey);
    if (!cb) {
      cb = new CircuitBreaker(fullKey, this.config);
      this.breakers.set(fullKey, cb);
    }
    return cb;
  }

  /** Check if circuit is open for a specific model. */
  isOpen(modelKey: string): boolean {
    return this.get(modelKey).isOpen();
  }

  recordSuccess(modelKey: string): void {
    this.get(modelKey).recordSuccess();
  }

  recordFailure(modelKey: string): void {
    this.get(modelKey).recordFailure();
  }

  recordHalfOpenAttempt(modelKey: string): void {
    this.get(modelKey).recordHalfOpenAttempt();
  }

  getSnapshot(modelKey: string): CircuitSnapshot {
    return this.get(modelKey).getSnapshot();
  }

  /** Get all registered model keys and their states. */
  getAllSnapshots(): Record<string, CircuitSnapshot> {
    const out: Record<string, CircuitSnapshot> = {};
    for (const [key, cb] of this.breakers) {
      out[key] = cb.getSnapshot();
    }
    return out;
  }
}
