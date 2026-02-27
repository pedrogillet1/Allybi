# Claude Handoff: 100-Query Failure Investigation

Date: 2026-02-26
Scope: `frontend/e2e/query-test-100.spec.ts` run + generated artifacts + chat/retrieval runtime wiring.

## 1) Executive verdict

The current "100-query" run is not a valid RAG quality benchmark yet.

Primary reasons:
1. The test does not attach documents before asking document-grounded questions.
2. The harness hides real HTTP/SSE failures behind `"Something went wrong"` and still marks all results as `status: "ok"`.
3. The report asserts a backend crash (`EADDRINUSE`) without artifact evidence.

Because of that, the result set is diagnostic for test harness issues, not for final product quality.

## 2) Artifacts examined

1. `frontend/e2e/reports/QUALITY-GRADING-REPORT.md`
2. `frontend/e2e/reports/query-test-100-results.json`
3. `frontend/e2e/query-test-100.spec.ts`
4. `frontend/src/components/chat/ChatInterface.jsx`
5. `backend/src/entrypoints/http/routes/chat.routes.ts`
6. `backend/src/modules/chat/runtime/CentralizedChatRuntimeDelegate.ts`
7. `backend/src/modules/chat/runtime/ChatRuntimeOrchestrator.ts`
8. `backend/src/services/core/retrieval/retrievalEngine.service.ts`
9. `backend/src/data_banks/policies/memory_policy.any.json`
10. `frontend/playwright.config.ts`
11. `frontend/src/setupProxy.js`

## 3) Confirmed findings (with evidence)

### F1. The 100-query test never attaches docs in this conversation (critical)

Evidence:
1. The test only logs in, navigates, types queries, and presses Enter. No upload/select step exists: `frontend/e2e/query-test-100.spec.ts:174-205` and `:310-331`.
2. Chat payload includes `attachedDocuments: docAttachments`, but `docAttachments` comes from `attachedDocs` state. If user did not attach in UI, this is empty: `frontend/src/components/chat/ChatInterface.jsx:3540-3610` and `:3110-3114`.

Impact:
1. Document-grounded retrieval cannot be guaranteed.
2. "No document access" responses are expected behavior under empty scope.

### F2. Scope auto-detection is too narrow for the test’s phrasing (high)

Evidence:
1. Auto scope detection relies on filename regex with extension or specific doc-reference phrases: `backend/src/modules/chat/runtime/ChatRuntimeOrchestrator.ts:398-430`.
2. The configured `docReferencePhrase` patterns do not match "docs que anexei (...)" style enumeration in Q1: `backend/src/data_banks/policies/memory_policy.any.json` (`config.runtimeTuning.scopeRuntime.candidatePatterns.docReferencePhrase`).

Impact:
1. Even with semantic doc mentions, `attachedDocumentIds` can remain empty.
2. Retrieval can stay unscoped/null and never produce sources.

### F3. "Q47-Q100 Something went wrong" is a harness observability failure (critical)

Evidence:
1. Results show exact shift at Q47; Q1-46 average ~4402ms, Q47-100 average ~1994ms, all generic: `frontend/e2e/reports/query-test-100-results.json`.
2. UI generic text appears when message `status=error` and `m.error` is missing: `frontend/src/components/chat/ChatInterface.jsx:5338-5342`.
3. In stream send path, non-OK HTTP responses set `status: "error"` without assigning a specific message to that message row: `frontend/src/components/chat/ChatInterface.jsx:3179-3183`.
4. The test scraper still records such messages as `status: "ok"` because it only checks assistant bubble count and text extraction, not message error state nor HTTP status: `frontend/e2e/query-test-100.spec.ts:203-277`.

Impact:
1. Real cause (401/403/429/5xx/network) is invisible in results.
2. Report conclusions about backend crash are speculative.

### F4. The claim "backend crashed with EADDRINUSE" is unproven by artifacts (high)

Evidence:
1. The only mention of `EADDRINUSE` exists inside the markdown report text itself.
2. No log artifact with that error exists in `frontend/e2e/reports/*` or test output.

Impact:
1. Root-cause attribution is not reliable.
2. Fixes may target wrong layer.

### F5. Source-pill absence is currently a downstream symptom, not root cause (high)

Evidence:
1. Sources render only under document-grounded modes/classes: `frontend/src/components/chat/ChatInterface.jsx:5364`.
2. Query results have 0 source entries for all 100: `frontend/e2e/reports/query-test-100-results.json`.

Impact:
1. Source UI is blocked by upstream retrieval/scope failures.
2. Testing source UI without real doc-grounded turns is not meaningful.

### F6. Test run artifacts are inconsistent (medium)

Evidence:
1. `frontend/e2e/reports/results.json` currently says `"No tests found"`, while a 100-query result file exists.

Impact:
1. CI artifact trust is reduced.
2. Reproducibility is weak.

### F7. Truncation signal is partially captured, not root-caused (medium)

Evidence:
1. Two responses carry `TRUNCATED_RESPONSE` (Q3, Q5).
2. Current truncation bank hard cap is 6000 chars and `general_answer.maxCharsDefault` is 1200, so "150 chars cap" is not supported by current bank config alone: `backend/src/data_banks/formatting/truncation_and_limits.any.json`.
3. The scraper relies on visible warning text and not structured final payload fields.

Impact:
1. We can confirm truncation occurred, but not the precise limiter branch causing it.
2. Need server-side trace capture per turn.

## 4) What is wrong in the current report logic

1. It treats "no sources" as a backend retrieval failure without first proving attachments/scope were sent.
2. It labels 54 failures as product runtime failures while test status says all `ok`.
3. It assumes crash cause (`EADDRINUSE`) without logs.
4. It does not distinguish:
   - no-doc context,
   - auth/csrf/rate-limit HTTP failures,
   - SSE runtime errors.

## 5) Required fixes for Claude (ordered)

## P0-A. Fix benchmark harness correctness first

Files:
1. `frontend/e2e/query-test-100.spec.ts`
2. `frontend/playwright.config.ts`

Changes:
1. Add explicit document attach step before Q1.
2. Assert attachment pills are visible before sending first query.
3. Capture and persist per-query HTTP status and SSE terminal event type.
4. Mark query result as `error` when assistant row status is error or stream response non-OK.
5. Fail test on thresholds:
   - `errorRate > 0`
   - `sourceRate == 0` for doc-grounded query blocks.

Acceptance:
1. `status` in results is no longer `ok` for generic error rows.
2. Query results include fields: `httpStatus`, `sseTerminalType`, `assistantStatus`.

## P0-B. Make doc scope deterministic for this scenario

Files:
1. `backend/src/modules/chat/runtime/ChatRuntimeOrchestrator.ts`
2. `backend/src/data_banks/policies/memory_policy.any.json`
3. Optionally the frontend runner payload logic in `ChatInterface.jsx`

Changes:
1. Primary path: send explicit `attachedDocuments` IDs from test harness.
2. Secondary hardening: broaden `docReferencePhrase` patterns to support:
   - "docs que anexei ..."
   - "os documentos ..."
   - comma-separated semantic names without extensions.
3. Add regression tests for mention extraction in PT/EN/ES with semantically shortened names.

Acceptance:
1. Q1 produces non-empty `attachedDocumentIds` on backend.
2. Retrieval scope debug packet shows docset lock for the attached set.

## P0-C. Stop generic error masking in UI + test output

Files:
1. `frontend/src/components/chat/ChatInterface.jsx`
2. `frontend/e2e/query-test-100.spec.ts`

Changes:
1. On `!response.ok`, store message-level error text including status code.
2. Prefer backend `type:error` message text when present.
3. In test output, save both visible text and structured error metadata.

Acceptance:
1. `"Something went wrong"` is no longer emitted without machine-readable error reason.
2. Each failed query has explicit error classification.

## P1. Prove backend cause for Q47+ with logs, not guesses

Files:
1. `backend/src/entrypoints/http/routes/chat.routes.ts`
2. backend logging config

Changes:
1. Add request-scoped log fields for stream startup/termination:
   - requestId, userId, conversationId, statusCode, error code.
2. Emit structured "stream_rejected" log on auth/csrf/rate-limit failures.

Acceptance:
1. One grep query can classify every Q47+ failure by exact backend reason.

## P1. Harden dev stability for long runs

Files:
1. `backend/src/server.ts`
2. run scripts for e2e

Changes:
1. Add graceful shutdown handlers (`SIGTERM`, `SIGINT`) to close HTTP server cleanly.
2. Run 100-query benchmark against stable backend process (not hot-reloading `nodemon`).

Acceptance:
1. No mid-run process restart noise in benchmark environment.

## 6) Concrete technical gaps still blocking frontend query testing

1. No guaranteed attached-doc scope in the benchmark conversation.
2. No reliable failure taxonomy in 100-query output.
3. Report mixes verified facts and speculation.
4. No end-to-end assertion that doc-grounded phases must have sources.
5. No automated guard that fails when all source counts are zero.

## 7) Suggested immediate rerun protocol (after fixes)

1. Start backend in stable mode (non-watch).
2. Run only: `npx playwright test e2e/query-test-100.spec.ts --project=chromium`.
3. Save:
   - raw per-query JSON with transport metadata,
   - backend request logs filtered by requestId.
4. Grade only after those artifacts exist.

## 8) Bottom line for Claude

Do not start by tuning prompts or retrieval rankers.
First fix benchmark integrity and attachment scope transmission.
Current data does not yet isolate model quality; it mostly captures harness and transport-layer blind spots.

