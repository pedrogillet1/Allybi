# Retrieval Engine — SLOs & Alert Definitions

## Service Level Objectives

### Availability
- **Target:** 99.5% of `retrieve()` calls return `runtimeStatus !== "failed"` (7-day rolling)
- **Measurement:** `retrievalRequestsTotal{status!="failed"} / retrievalRequestsTotal`
- **Burn rate alert:** 14.4x (30min window), 6x (6h window)

### Latency
- **p50:** < 400ms
- **p95:** < 800ms
- **p99:** < 2000ms
- **Measurement:** `retrievalDurationMs` histogram

### Quality
- **p50 topScore > 0.35** (non-scoped, non-encrypted mode)
- **p50 topScore > 0.15** (encrypted mode)
- **Measurement:** `retrievalTopScore` histogram, segmented by `isEncryptedOnlyMode`

## Alert Rules

### CRITICAL

| Alert | Condition | For | Action |
|-------|-----------|-----|--------|
| `RetrievalHighErrorRate` | error rate > 5% | 5 min | Page on-call; check dependency health (Pinecone, Postgres) |
| `RetrievalV2RuntimeFailure` | V2 `runtimeStatus=failed` AND fallback to V1 > 10/min | 3 min | Check V2 logs; consider env flag rollback |

### WARNING

| Alert | Condition | For | Action |
|-------|-----------|-----|--------|
| `RetrievalHighLatency` | p95 > 1200ms | 10 min | Check phase durations; consider reducing `RETRIEVAL_PHASE_BUDGET_MS` |
| `RetrievalLowCacheHitRate` | cache hit rate < 10% | 30 min | Check `BANK_MULTI_LEVEL_CACHE_ENABLED`; verify cache TTL |
| `RetrievalHighHeapUsage` | heap > 80% of `maxHeapUsedMb` | 5 min | Check for memory leaks; consider pod restart |
| `RetrievalLowQualityScore` | p50 topScore < 0.20 (non-encrypted) | 30 min | Check embedding model version; verify bank configs |
| `RetrievalBankValidationFailures` | bank validation failures > 0/min | 5 min | Check bank registry; verify bank shapes after deployment |

## Dashboard Queries (Prometheus-compatible)

```promql
# Error rate (5 min)
1 - (sum(rate(retrieval_requests_total{status!="failed"}[5m]))
    / sum(rate(retrieval_requests_total[5m])))

# p95 latency
histogram_quantile(0.95, sum(rate(retrieval_duration_ms_bucket[5m])) by (le, engine))

# Cache hit rate
sum(rate(retrieval_cache_hits_total{result="hit"}[5m]))
/ sum(rate(retrieval_cache_hits_total[5m]))

# Candidate funnel
avg(retrieval_candidate_count{stage="considered"})
avg(retrieval_candidate_count{stage="after_negatives"})
avg(retrieval_candidate_count{stage="after_boosts"})
avg(retrieval_candidate_count{stage="after_diversification"})
avg(retrieval_evidence_count)
```

## Escalation

1. WARNING alerts → Slack `#retrieval-alerts` (auto)
2. CRITICAL alerts → PagerDuty on-call rotation
3. If V2 fallback rate > 20% sustained → rollback `RETRIEVAL_USE_V2_ORCHESTRATOR=false`
