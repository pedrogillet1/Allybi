/**
 * KODA Streaming Metrics Collector
 *
 * Collects timing and throughput metrics from SSE streams.
 * Used to verify latency and tokens/sec targets.
 *
 * Note: EventSource is optional - only needed for live SSE testing.
 * For offline testing, use mockStreamMetrics().
 */

// EventSource is optional - only import if available
let EventSource = null;
try {
  EventSource = require('eventsource');
} catch (e) {
  // EventSource not installed - live SSE testing disabled
}

const fs = require('fs');
const path = require('path');

const REPORT_FILE = path.join(__dirname, 'reports', 'stream_metrics.json');

// Thresholds (adjust based on your targets)
const THRESHOLDS = {
  router_ms: 30,           // Router should be < 30ms
  first_token_ms: 800,     // First token < 800ms
  tokens_per_sec: 20,      // Minimum 20 t/s
  tokens_per_sec_ideal: 35 // Ideal 35+ t/s
};

/**
 * Simple tokenizer (word-based approximation)
 */
function countTokens(text) {
  // Approximate: ~0.75 words per token for English
  const words = text.split(/\s+/).filter(w => w.length > 0);
  return Math.ceil(words.length / 0.75);
}

/**
 * Collect metrics from a single SSE request
 */
async function collectStreamMetrics(url, query, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const metrics = {
      query,
      url,
      timestamps: {
        request_start: Date.now(),
        first_chunk: null,
        last_chunk: null
      },
      chunks: [],
      output_text: '',
      output_tokens: 0,
      error: null
    };

    const timeoutId = setTimeout(() => {
      eventSource.close();
      metrics.error = 'timeout';
      resolve(calculateMetrics(metrics));
    }, timeout);

    const eventSource = new EventSource(url);

    eventSource.onopen = () => {
      metrics.timestamps.connection_open = Date.now();
    };

    eventSource.onmessage = (event) => {
      const now = Date.now();

      if (!metrics.timestamps.first_chunk) {
        metrics.timestamps.first_chunk = now;
      }
      metrics.timestamps.last_chunk = now;

      try {
        const data = JSON.parse(event.data);

        if (data.content || data.text || data.delta) {
          const text = data.content || data.text || data.delta || '';
          metrics.chunks.push({
            timestamp: now,
            text,
            tokens: countTokens(text)
          });
          metrics.output_text += text;
        }

        if (data.done || data.finished) {
          clearTimeout(timeoutId);
          eventSource.close();
          resolve(calculateMetrics(metrics));
        }
      } catch (e) {
        // Non-JSON data, treat as text chunk
        metrics.chunks.push({
          timestamp: now,
          text: event.data,
          tokens: countTokens(event.data)
        });
        metrics.output_text += event.data;
      }
    };

    eventSource.onerror = (error) => {
      clearTimeout(timeoutId);
      eventSource.close();
      metrics.error = error.message || 'connection_error';
      resolve(calculateMetrics(metrics));
    };
  });
}

/**
 * Calculate final metrics from raw data
 */
function calculateMetrics(raw) {
  const totalTokens = raw.chunks.reduce((sum, c) => sum + c.tokens, 0) || countTokens(raw.output_text);

  const firstTokenMs = raw.timestamps.first_chunk
    ? raw.timestamps.first_chunk - raw.timestamps.request_start
    : null;

  const totalMs = raw.timestamps.last_chunk
    ? raw.timestamps.last_chunk - raw.timestamps.request_start
    : null;

  const streamDurationMs = raw.timestamps.first_chunk && raw.timestamps.last_chunk
    ? raw.timestamps.last_chunk - raw.timestamps.first_chunk
    : null;

  const tokensPerSec = streamDurationMs && totalTokens
    ? (totalTokens / (streamDurationMs / 1000))
    : null;

  return {
    query: raw.query,
    success: !raw.error,
    error: raw.error,
    timing: {
      first_token_ms: firstTokenMs,
      total_ms: totalMs,
      stream_duration_ms: streamDurationMs
    },
    throughput: {
      output_tokens: totalTokens,
      tokens_per_sec: tokensPerSec ? parseFloat(tokensPerSec.toFixed(1)) : null,
      chunk_count: raw.chunks.length
    },
    thresholds: {
      first_token_ok: firstTokenMs ? firstTokenMs <= THRESHOLDS.first_token_ms : null,
      throughput_ok: tokensPerSec ? tokensPerSec >= THRESHOLDS.tokens_per_sec : null,
      throughput_ideal: tokensPerSec ? tokensPerSec >= THRESHOLDS.tokens_per_sec_ideal : null
    }
  };
}

/**
 * Batch collect metrics for multiple queries
 */
async function batchCollectMetrics(baseUrl, queries, options = {}) {
  const results = [];
  const concurrency = options.concurrency || 1;
  const delayMs = options.delayMs || 500;

  for (let i = 0; i < queries.length; i += concurrency) {
    const batch = queries.slice(i, i + concurrency);

    const batchResults = await Promise.all(
      batch.map(q => {
        const url = `${baseUrl}?q=${encodeURIComponent(q.input || q)}`;
        return collectStreamMetrics(url, q.input || q);
      })
    );

    results.push(...batchResults);

    // Progress log
    console.log(`Progress: ${Math.min(i + concurrency, queries.length)}/${queries.length}`);

    // Rate limiting delay
    if (i + concurrency < queries.length) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  return results;
}

/**
 * Calculate percentiles from metrics array
 */
function calculatePercentiles(metrics, field) {
  const values = metrics
    .map(m => {
      const parts = field.split('.');
      let val = m;
      for (const p of parts) {
        val = val?.[p];
      }
      return val;
    })
    .filter(v => v !== null && v !== undefined)
    .sort((a, b) => a - b);

  if (values.length === 0) return { p50: null, p90: null, p95: null, p99: null };

  const p50Idx = Math.floor(values.length * 0.5);
  const p90Idx = Math.floor(values.length * 0.9);
  const p95Idx = Math.floor(values.length * 0.95);
  const p99Idx = Math.floor(values.length * 0.99);

  return {
    p50: values[p50Idx],
    p90: values[p90Idx],
    p95: values[p95Idx],
    p99: values[p99Idx],
    min: values[0],
    max: values[values.length - 1]
  };
}

/**
 * Generate streaming report
 */
function generateStreamingReport(metrics) {
  const successful = metrics.filter(m => m.success);
  const failed = metrics.filter(m => !m.success);

  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      total: metrics.length,
      successful: successful.length,
      failed: failed.length,
      success_rate: ((successful.length / metrics.length) * 100).toFixed(1) + '%'
    },
    timing_percentiles: {
      first_token_ms: calculatePercentiles(successful, 'timing.first_token_ms'),
      total_ms: calculatePercentiles(successful, 'timing.total_ms')
    },
    throughput_percentiles: {
      tokens_per_sec: calculatePercentiles(successful, 'throughput.tokens_per_sec'),
      output_tokens: calculatePercentiles(successful, 'throughput.output_tokens')
    },
    threshold_compliance: {
      first_token: {
        passed: successful.filter(m => m.thresholds.first_token_ok).length,
        threshold_ms: THRESHOLDS.first_token_ms
      },
      throughput_min: {
        passed: successful.filter(m => m.thresholds.throughput_ok).length,
        threshold_tps: THRESHOLDS.tokens_per_sec
      },
      throughput_ideal: {
        passed: successful.filter(m => m.thresholds.throughput_ideal).length,
        threshold_tps: THRESHOLDS.tokens_per_sec_ideal
      }
    },
    failures: failed.map(m => ({ query: m.query, error: m.error })),
    raw_results: metrics
  };

  return report;
}

/**
 * Mock stream metrics for testing without backend
 */
function mockStreamMetrics(query, routerMs = 15) {
  const totalTokens = 150 + Math.floor(Math.random() * 200);
  const firstTokenMs = 300 + Math.floor(Math.random() * 400);
  const streamDurationMs = (totalTokens / 35) * 1000 + Math.random() * 500;
  const totalMs = firstTokenMs + streamDurationMs;
  const tokensPerSec = totalTokens / (streamDurationMs / 1000);

  return {
    query,
    success: true,
    error: null,
    timing: {
      router_ms: routerMs,
      first_token_ms: Math.round(firstTokenMs),
      total_ms: Math.round(totalMs),
      stream_duration_ms: Math.round(streamDurationMs)
    },
    throughput: {
      output_tokens: totalTokens,
      tokens_per_sec: parseFloat(tokensPerSec.toFixed(1)),
      chunk_count: Math.ceil(totalTokens / 10)
    },
    thresholds: {
      router_ok: routerMs <= THRESHOLDS.router_ms,
      first_token_ok: firstTokenMs <= THRESHOLDS.first_token_ms,
      throughput_ok: tokensPerSec >= THRESHOLDS.tokens_per_sec,
      throughput_ideal: tokensPerSec >= THRESHOLDS.tokens_per_sec_ideal
    }
  };
}

/**
 * Save report to file
 */
function saveReport(report) {
  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
  console.log(`Streaming report saved to: ${REPORT_FILE}`);
}

module.exports = {
  collectStreamMetrics,
  batchCollectMetrics,
  calculateMetrics,
  calculatePercentiles,
  generateStreamingReport,
  mockStreamMetrics,
  saveReport,
  THRESHOLDS
};
