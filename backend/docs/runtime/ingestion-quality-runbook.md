# Ingestion Quality Runbook

## Scope
- Document ingestion and normalization quality gates for:
- MIME coverage and SSOT wiring
- OCR fail-closed policy for weak PDFs
- Ingestion SLO (p95 latency + failure rate)

## Evidence Inputs
- Ingestion telemetry events (`ingestionEvent`) with:
- `mimeType`
- `durationMs`
- `meta.sizeBucket`
- `meta.peakRssMb`
- `meta.ocrAttempted`
- `meta.ocrOutcome`

## Gate Commands
- Generate/refresh ingestion SLO summary artifact from an existing report:
```bash
npm run -s audit:ingestion:slo -- --report reports/cert/ingestion-slo-summary.json --out reports/cert/ingestion-slo-gate.json
```

- Strict gate from an existing report:
```bash
npm run -s audit:ingestion:slo:strict -- --report reports/cert/ingestion-slo-summary.json --out reports/cert/ingestion-slo-gate.json
```

- Certification strict path (collect from `ingestion_events`, then gate):
```bash
npm run -s audit:ingestion:slo:cert:strict -- --report reports/cert/ingestion-slo-summary.json --out reports/cert/ingestion-slo-gate.json
```

## Default Thresholds
- `INGESTION_SLO_MIN_DOCS=100`
- `INGESTION_SLO_MAX_GLOBAL_P95_MS=120000`
- `INGESTION_SLO_MAX_GLOBAL_FAILURE_RATE=5`

## Alert Contract
- `ingestion_global_p95_exceeded`
: Trigger when ingestion p95 exceeds threshold for two consecutive windows.
- `ingestion_failure_rate_exceeded`
: Trigger when weighted global failure rate exceeds threshold.
- `ingestion_weak_pdf_ocr_required_unavailable_spike`
: Trigger when `skipCode=OCR_REQUIRED_UNAVAILABLE` exceeds baseline.

## Incident Triage
1. Check strict gate output: `reports/cert/ingestion-slo-gate.json`.
2. Slice by `mimeType` + `sizeBucket` to isolate outlier buckets.
3. Verify OCR provider health for weak PDFs (`ocrOutcome=provider_unavailable`).
4. Check peak RSS trend by bucket to identify memory pressure paths.
5. If regression is isolated to a release window, rollback ingestion worker image.

## Rollback Strategy
- Keep strict gate command, but temporarily run non-strict mode in CI while fixing.
- Revert last ingestion pipeline release if p95/failure alerts sustain.
- Maintain telemetry schema compatibility (`sizeBucket`, `peakRssMb`, OCR fields) during rollback.
