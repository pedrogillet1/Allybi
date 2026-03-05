# Routing Quality Runbook

## Scope
- Intent routing quality for chat turns.
- Follow-up source coverage and precedence parity.
- Runtime graph evidence quality mode (`live` vs `cached`).

## Signals
- Canonical enforced gate set source: `scripts/audit/routing-quality-slo.mjs`
- Gate: `reports/cert/gates/routing-behavioral.json`
- Gate: `reports/cert/gates/followup-source-coverage.json`
- Gate: `reports/cert/gates/followup-overlay-integrity.json`
- Gate: `reports/cert/gates/routing-precedence-parity.json`
- Gate: `reports/cert/gates/collision-matrix-exhaustive.json`
- Gate: `reports/cert/gates/collision-cross-family-tiebreak.json`
- Gate: `reports/cert/gates/routing-determinism.json`
- Gate: `reports/cert/gates/routing-determinism-runtime-e2e.json`
- Gate: `reports/cert/gates/scope-integrity.json`
- Gate: `reports/cert/gates/scope-boundary-locks.json`
- Gate: `reports/cert/gates/slot-contracts-wiring.json`
- Gate: `reports/cert/gates/slot-extraction-e2e.json`
- Gate: `reports/cert/gates/disambiguation-e2e.json`
- Gate: `reports/cert/gates/intent-precision.json`
- Gate: `reports/cert/gates/intent-family-firstclass.json`
- Gate: `reports/cert/gates/routing-bank-consumer-wiring.json`
- Gate: `reports/cert/gates/routing-family-alias-consistency.json`
- Gate: `reports/cert/gates/routing-family-conformance.json`
- Gate: `reports/cert/gates/routing-family-mechanism-contract.json`
- Gate: `reports/cert/gates/routing-integration-intents-parity.json`
- Gate: `reports/cert/gates/routing-calc-intents-parity.json`
- Gate: `reports/cert/gates/nav-intents-locale-parity.json`
- Gate: `reports/cert/gates/telemetry-completeness.json`
- Gate: `reports/cert/gates/runtime-wiring.json`
- SLO summary: `reports/cert/routing-quality-slo.json`
- Grade summary: `reports/cert/routing-grade.json`

## SLO Targets
- `routing-behavioral.passed` must be `true`.
- `followup-source-coverage.metrics.coveredSourceCount` must be `4`.
- `followup-source-coverage.metrics.followupPrecision` must meet `thresholds.minFollowupPrecision`.
- `followup-source-coverage.metrics.followupRecall` must meet `thresholds.minFollowupRecall`.
- `followup-source-coverage.metrics.followupFalsePositiveRate` must be <= `thresholds.maxFollowupFalsePositiveRate`.
- `followup-overlay-integrity.metrics.missingLocaleCount` must be `0`.
- `followup-overlay-integrity.metrics.validModeCount` must be >= `thresholds.expectedValidModeCount`.
- `routing-precedence-parity.passed` must be `true`.
- Every gate listed in **Signals** above must report `passed: true`.
- `runtime-wiring.metrics.commandMode`:
  - CI/release: must be `live`.
  - Local: `live` or `cached`.

## Validation Commands
```bash
npm run test:cert:wiring
npm run audit:routing:slo:strict
npm run audit:routing:grade:strict
# Optional local fail-closed cert verification (enforces local cert-run health):
npm run audit:cert:verify:local-hard
```

## Triage Steps
1. Open `reports/cert/routing-quality-slo.json` and identify failing checks.
2. Ensure canonical gate file exists:
   - `reports/cert/gates/routing-behavioral.json`
3. For follow-up source failures:
   - Validate `overlays/followup_indicators.any.json` locale coverage.
   - Validate `routing/intent_patterns.any.json` `overlays.followupIndicators`.
4. For follow-up overlay integrity failures:
   - Confirm `followup_indicators.config.applyStage` is `pre_routing`.
   - Confirm both runtime modes remain active: `followup_indicators` and `intent_patterns` overlay.
5. For precedence failures:
   - Compare runtime behavior with `src/services/chat/routingPrecedence.contract.ts`.
6. For runtime graph evidence failures:
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
