# Ingestion Audit Refresh (2026-03-05)

## Scope
Refresh of ingestion audit evidence after the 2026-03-03 deep-dive. Focused on upload scheduling, worker state transitions, connector fallback behavior, CI gates, and OCR degrade contracts.

## Commands Executed
| Command | Result |
| --- | --- |
| `npm.cmd --prefix backend run typecheck --silent` | PASS |
| `npm.cmd --prefix backend run audit:ocr:strict --silent` | PASS (10/10) |
| `npm.cmd --prefix backend test -- --runInBand --runTestsByPath src/entrypoints/http/routes/multipart-upload.routes.test.ts src/queues/workers/stuckDocSweeper.service.test.ts src/queues/workers/documentIngestionPipeline.service.test.ts src/services/retrieval/vectorEmbedding.runtime.service.test.ts src/services/ingestion/fileValidator.service.test.ts src/services/ingestion/pipeline/__tests__/documentPipeline.validation.test.ts src/services/connectors/slack/slackSync.service.test.ts src/services/connectors/gmail/gmailSync.service.test.ts src/services/connectors/outlook/outlookSync.service.test.ts` | PASS (9/9 suites, 48/48 tests) |

## Key Outcomes
- Upload queue scheduling failures are surfaced with explicit `503` + `QUEUE_UNAVAILABLE` and persisted telemetry.
- Connector sync cursor advancement is guarded by failed-ingest accounting.
- OCR strict gate now matches live runtime behavior and is green.
- Connector inline fallback now uses `DocumentStateManager` transitions (no direct status write).

## CI/Governance Corrections Applied
- Updated stale upload workflow path filters to current entrypoint routes.
- Replaced empty token stub in upload truth audit workflow with deterministic JWT generation + assertion.
- Removed fail-open `continue-on-error` from backend TypeScript/lint/prettier checks in `typescript-checks.yml`.
- Added dedicated ingestion hard gate workflow: `.github/workflows/ingestion-gates.yml`.

## Residual Risk
- Historical workflow intent for large upload truth datasets was removed from active workflow because referenced scripts were no longer present; current guard now relies on deterministic token generation plus route-level truth tests.

## Related Files
- `.github/workflows/upload-truth-audit.yml`
- `.github/workflows/upload-visibility-guard.yml`
- `.github/workflows/typescript-checks.yml`
- `.github/workflows/ingestion-gates.yml`
- `backend/src/services/connectors/connectorsIngestion.service.ts`
- `backend/src/services/connectors/connectorsIngestion.service.test.ts`
