# Routing Quality Runbook

## Scope
- Intent routing quality for chat turns.
- Follow-up source coverage and precedence parity.
- Runtime graph evidence quality mode (`live` vs `cached`).

## Signals
- Gate: `reports/cert/gates/routing-behavioral.json`
- Gate: `reports/cert/gates/followup-source-coverage.json`
- Gate: `reports/cert/gates/routing-precedence-parity.json`
- Gate: `reports/cert/gates/runtime-wiring.json`
- SLO summary: `reports/cert/routing-quality-slo.json`

## SLO Targets
- `routing-behavioral.passed` must be `true`.
- `followup-source-coverage.metrics.coveredSourceCount` must be `4`.
- `followup-source-coverage.metrics.followupPrecision` must meet `thresholds.minFollowupPrecision`.
- `followup-source-coverage.metrics.followupRecall` must meet `thresholds.minFollowupRecall`.
- `followup-source-coverage.metrics.followupFalsePositiveRate` must be <= `thresholds.maxFollowupFalsePositiveRate`.
- `routing-precedence-parity.passed` must be `true`.
- `runtime-wiring.metrics.commandMode`:
  - CI/release: must be `live`.
  - Local: `live` or `cached`.

## Validation Commands
```bash
npm run test:cert:wiring
npm run audit:routing:slo:strict
```

## Triage Steps
1. Open `reports/cert/routing-quality-slo.json` and identify failing checks.
2. Ensure canonical gate file exists:
   - `reports/cert/gates/routing-behavioral.json`
3. For follow-up source failures:
   - Validate `overlays/followup_indicators.any.json` locale coverage.
   - Validate `routing/intent_patterns.any.json` `overlays.followupIndicators`.
4. For precedence failures:
   - Compare runtime behavior with `src/services/chat/routingPrecedence.contract.ts`.
5. For runtime graph evidence failures:
   - Regenerate with `npm run audit:runtime-graph`.
   - Confirm `runtime-wiring` gate reports `commandMode: live` in CI.

## Rollback
1. Revert routing changes touching:
   - `src/services/chat/turnRouter.service.ts`
   - `src/services/chat/chatKernel.service.ts`
   - `src/services/llm/core/telemetryLlmClient.decorator.ts`
2. Re-run:
```bash
npm run test:cert:wiring
npm run audit:routing:slo:strict
```
