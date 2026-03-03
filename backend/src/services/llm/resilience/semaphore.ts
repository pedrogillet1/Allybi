/**
 * semaphore.ts — Promise-queue concurrency limiter.
 *
 * No npm deps.  FIFO queue, release() always in finally.
 */

export class Semaphore {
  private _inflight = 0;
  private readonly _queue: Array<() => void> = [];

  constructor(private readonly maxConcurrency: number) {
    if (maxConcurrency < 1) {
      throw new Error("Semaphore maxConcurrency must be >= 1");
    }
  }

  /** Current number of in-flight operations. */
  get inflight(): number {
    return this._inflight;
  }

  /** Number of callers waiting for a slot. */
  get queued(): number {
    return this._queue.length;
  }

  /** Wait until a slot is available. Must pair with release(). */
  acquire(): Promise<void> {
    if (this._inflight < this.maxConcurrency) {
      this._inflight++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this._queue.push(resolve);
    });
  }

  /** Release a slot, waking the next queued caller (if any). */
  release(): void {
    const next = this._queue.shift();
    if (next) {
      // Hand the slot directly to the next waiter (inflight stays the same)
      next();
    } else {
      this._inflight = Math.max(0, this._inflight - 1);
    }
  }

  /** Convenience: acquire, run fn, release in finally. */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}
