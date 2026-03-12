# Retrieval Shadow Mode — Runbook

## Overview

Shadow mode runs the V2 retrieval engine alongside V1 on a sample of production requests. The primary engine's result is always returned to the caller. The shadow engine's result is compared and logged for divergence analysis.

## Activation

```bash
# Enable shadow mode (default: off)
RETRIEVAL_SHADOW_MODE=true

# Sample rate: fraction of requests to shadow (default: 0.05 = 5%)
RETRIEVAL_SHADOW_SAMPLE_RATE=0.05

# Timeout for shadow engine (default: 5000ms)
RETRIEVAL_SHADOW_TIMEOUT_MS=5000
```

## Monitoring Metrics

| Metric | Description | Alert |
|--------|-------------|-------|
| `retrieval_shadow_comparisons_total` | Number of shadow comparisons completed | — |
| `retrieval_shadow_timeouts_total` | Shadow requests that timed out | > 20% of comparisons |
| `retrieval_shadow_doc_id_overlap` | Jaccard similarity of evidence doc IDs | p50 < 0.5 = investigate |
| `retrieval_shadow_evidence_count_delta` | Abs difference in evidence count | p95 > 5 = investigate |
| `retrieval_shadow_top_score_delta` | Abs difference in top score | p95 > 0.15 = investigate |

## Escalation Criteria

### Ready to Promote V2

All conditions must hold for 7 consecutive days:
- `doc_id_overlap` p50 > 0.70
- `evidence_count_delta` p95 < 3
- `top_score_delta` p95 < 0.10
- Shadow timeout rate < 5%
- V2 error rate < 1%

### Rollback Criteria

Any of these triggers immediate shadow mode disable:
- V2 shadow error rate > 10% for 5 minutes
- Shadow timeout rate > 50% for 10 minutes
- Memory pressure alerts triggered by shadow load
- p99 latency increase > 30% on primary path (shadow leaking)

## Rollback Procedure

1. Set `RETRIEVAL_SHADOW_MODE=false`
2. Restart affected pods
3. Verify primary path latency returns to baseline
4. Investigate root cause before re-enabling

## Data Retention

- Shadow comparison logs: 14 days in structured logging
- Aggregated metrics: 90 days in monitoring system
- Raw comparison payloads: not persisted (too large)

## Cost Considerations

Shadow mode doubles retrieval compute (Pinecone queries, embedding calls) for sampled requests. At 5% sample rate:
- Pinecone query volume: +5%
- CPU overhead: ~2-3% (fire-and-forget, no blocking)
- Memory: minimal (results discarded after comparison)

Start at 1% (`RETRIEVAL_SHADOW_SAMPLE_RATE=0.01`) and increase gradually.
