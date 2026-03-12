# Retrieval Engine — V1/V2 Parity Report

**Date:** 2026-03-12
**Test Suite:** `v2/__tests__/v1-v2-parity.test.ts`

## Overview

The parity test suite validates that V2 produces contract-equivalent output to V1 on 5 seed request types. Comparison is contract-level (evidence doc IDs, count, top score) rather than bit-for-bit, because V2 bug fixes legitimately improve output.

## Test Seeds

| Seed | Query Type | Expected Behavior |
|------|-----------|-------------------|
| `single-doc` | Scoped to 1 document | Same doc ID in evidence, count within ±1 |
| `multi-doc` | Cross-document, compare intent | Same doc IDs (order may differ), count within ±2 |
| `encrypted-mode` | Encrypted-only corpus | Both engines produce evidence for low-similarity hits |
| `compare-intent` | "Compare X and Y" | Both engines return multi-doc balanced evidence |
| `exploratory` | Discovery/list query | Both return evidence from multiple docs |

## Comparison Criteria

| Metric | Threshold | Rationale |
|--------|-----------|-----------|
| Evidence doc IDs | Must overlap (Jaccard > 0.5) | Same documents should be found |
| Evidence count | Within ±1 | Bug fixes may add/remove edge-case evidence |
| Top score | Within 5% delta | Scoring formula is identical; minor float differences expected |
| Runtime status | Both "ok" or both "degraded" | Engine health should match |

## Known Differences

V2 is expected to differ from V1 in these areas (bug fixes):

1. **Bug A (locale parsing):** V2 correctly parses BR/EU number formats, V1 does not
2. **Bug B (language coalesce):** V2 uses correct fallback chain, V1 has redundant expression
3. **Bug C (TOC penalty timing):** V2 applies TOC penalty post-ranking, V1 pre-ranking
4. **Bug D (encrypted weight redistribution):** V2 correctly redistributes dead channel weights

These differences are improvements, not regressions.

## Results

Parity tests run with mock deps (BankLoader, DocStore, SemanticIndex) to isolate engine logic from infrastructure. Production parity requires shadow mode deployment (Phase E).

## Next Steps

1. Deploy shadow mode at 1% sample rate
2. Collect 7 days of comparison data
3. Validate Jaccard overlap > 0.70 at p50
4. Validate evidence count delta < 3 at p95
5. Validate top score delta < 0.10 at p95
