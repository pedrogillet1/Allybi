# Composition Quality Runbook

## Scope
- Analytical composition quality regressions.
- Quality telemetry trends for:
  - `/admin/telemetry/quality/reask-rate`
  - `/admin/telemetry/quality/truncation-rate`
  - `/admin/telemetry/quality/regeneration-rate`

## SLO Thresholds (Percent)
- `reaskRateMaxPct`: `35`
- `truncationRateMaxPct`: `15`
- `regenerationRateMaxPct`: `25`

## Triage Order
1. Validate latest certification gates in `reports/cert/gates`.
2. Validate quality endpoint payloads include `thresholdMaxPct`.
3. Compare 7d values vs thresholds.
4. If threshold exceeded, open incident and block release promotion.

## Validation Commands
```powershell
npm.cmd --prefix backend run -s test -- --runInBand src/services/telemetry/adminTelemetryAdapter.quality-metrics.test.ts src/controllers/adminTelemetry.controller.quality-metrics.test.ts src/tests/certification/composition-telemetry-integrity.cert.test.ts
npm.cmd --prefix backend run -s test:cert:composition
npm.cmd --prefix backend run -s policy:composition:a-plus:assert
```

## Rollback
1. Revert latest composition-quality commit.
2. Re-run certification suite.
3. Re-run policy assertion and confirm `ok: true`.
