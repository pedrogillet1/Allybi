/**
 * PPTX Preview Metrics Service
 *
 * Lightweight in-memory metrics for PPTX preview system
 * Tracks counters and latencies for observability
 */

interface MetricCounter {
  [key: string]: number;
}

interface MetricTimer {
  count: number;
  sum: number;
  min: number;
  max: number;
  p95?: number;
  values: number[]; // Keep last 1000 values for percentile calculation
}

interface TimerMap {
  [key: string]: MetricTimer;
}

class PPTXPreviewMetrics {
  private counters: MetricCounter = {};
  private timers: TimerMap = {};
  private readonly MAX_VALUES = 1000; // Keep last 1000 values for p95

  /**
   * Increment a counter
   */
  increment(name: string, labels: Record<string, string> = {}, value: number = 1): void {
    const key = this.buildKey(name, labels);
    this.counters[key] = (this.counters[key] || 0) + value;
  }

  /**
   * Record a timer value (in milliseconds)
   */
  recordTiming(name: string, durationMs: number, labels: Record<string, string> = {}): void {
    const key = this.buildKey(name, labels);

    if (!this.timers[key]) {
      this.timers[key] = {
        count: 0,
        sum: 0,
        min: Infinity,
        max: 0,
        values: []
      };
    }

    const timer = this.timers[key];
    timer.count++;
    timer.sum += durationMs;
    timer.min = Math.min(timer.min, durationMs);
    timer.max = Math.max(timer.max, durationMs);

    // Keep last N values for percentile calculation
    timer.values.push(durationMs);
    if (timer.values.length > this.MAX_VALUES) {
      timer.values.shift();
    }

    // Calculate p95 on the fly
    timer.p95 = this.calculateP95(timer.values);
  }

  /**
   * Time a function execution
   */
  async time<T>(
    name: string,
    fn: () => Promise<T>,
    labels: Record<string, string> = {}
  ): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      const duration = Date.now() - start;
      this.recordTiming(name, duration, labels);
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      this.recordTiming(name, duration, { ...labels, status: 'error' });
      throw error;
    }
  }

  /**
   * Get all metrics in Prometheus-like format
   */
  getMetrics(): string {
    const lines: string[] = [];

    // Counters
    lines.push('# HELP pptx_preview_total Total count of events');
    lines.push('# TYPE pptx_preview_total counter');
    for (const [key, value] of Object.entries(this.counters)) {
      lines.push(`${key} ${value}`);
    }
    lines.push('');

    // Timers
    for (const [key, timer] of Object.entries(this.timers)) {
      const baseName = key.replace(/_duration_ms.*$/, '');
      const avg = timer.count > 0 ? timer.sum / timer.count : 0;

      lines.push(`# HELP ${baseName}_duration_ms Duration in milliseconds`);
      lines.push(`# TYPE ${baseName}_duration_ms summary`);
      lines.push(`${baseName}_duration_ms{quantile="avg"} ${avg.toFixed(2)}`);
      lines.push(`${baseName}_duration_ms{quantile="min"} ${timer.min === Infinity ? 0 : timer.min}`);
      lines.push(`${baseName}_duration_ms{quantile="max"} ${timer.max}`);
      if (timer.p95 !== undefined) {
        lines.push(`${baseName}_duration_ms{quantile="0.95"} ${timer.p95.toFixed(2)}`);
      }
      lines.push(`${baseName}_duration_ms_count ${timer.count}`);
      lines.push(`${baseName}_duration_ms_sum ${timer.sum}`);
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Get metrics as JSON object
   */
  getMetricsJSON(): {
    counters: MetricCounter;
    timers: Record<string, {
      count: number;
      avg: number;
      min: number;
      max: number;
      p95?: number;
      sum: number;
    }>;
  } {
    const timersFormatted: Record<string, any> = {};

    for (const [key, timer] of Object.entries(this.timers)) {
      timersFormatted[key] = {
        count: timer.count,
        avg: timer.count > 0 ? timer.sum / timer.count : 0,
        min: timer.min === Infinity ? 0 : timer.min,
        max: timer.max,
        p95: timer.p95,
        sum: timer.sum
      };
    }

    return {
      counters: { ...this.counters },
      timers: timersFormatted
    };
  }

  /**
   * Reset all metrics (useful for testing)
   */
  reset(): void {
    this.counters = {};
    this.timers = {};
  }

  /**
   * Build metric key with labels
   */
  private buildKey(name: string, labels: Record<string, string>): string {
    if (Object.keys(labels).length === 0) {
      return name;
    }

    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');

    return `${name}{${labelStr}}`;
  }

  /**
   * Calculate 95th percentile
   */
  private calculateP95(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * 0.95) - 1;
    return sorted[Math.max(0, index)];
  }
}

// Singleton instance
export const pptxMetrics = new PPTXPreviewMetrics();

// Convenience functions
export const incrementCounter = (name: string, labels?: Record<string, string>, value?: number) =>
  pptxMetrics.increment(name, labels, value);

export const recordTiming = (name: string, durationMs: number, labels?: Record<string, string>) =>
  pptxMetrics.recordTiming(name, durationMs, labels);

export const timeFunction = <T>(name: string, fn: () => Promise<T>, labels?: Record<string, string>) =>
  pptxMetrics.time(name, fn, labels);
