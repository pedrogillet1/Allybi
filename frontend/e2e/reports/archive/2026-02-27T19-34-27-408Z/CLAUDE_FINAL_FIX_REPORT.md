# Claude Final Fix Report: 100-Query Test Readiness

**Date:** 2026-02-26
**Scope:** All 6 phases from the fix plan

## 1) Changes Made

### Phase 1: Test Harness Correctness

**File:** `frontend/e2e/query-test-100.spec.ts` (full rewrite v2)

1. **Deterministic document attachment (1.1):** Uses Playwright's `page.route()` to intercept every `/api/chat/stream` POST and inject `attachedDocuments` with the 6 target document IDs:
   - `7d55ead0` — Anotações_Aula_2__1_.pdf
   - `8938fa6a` — Capítulo_8__Framework_Scrum_.pdf
   - `ee91764d` — Trabalho_projeto_.pdf
   - `5471856b` — OBA_marketing_servicos__1_.pdf
   - `5708e5f5` — TRABALHO_FINAL__1_.PNG
   - `ce276bc4` — guarda_bens_self_storage.pptx

2. **Transport metadata capture (1.2):** Each query result now includes:
   - `transport.httpStatus` — actual HTTP status from the stream response
   - `transport.requestId` — x-request-id from the request
   - `transport.sseTerminalType` — SSE terminal event type
   - `transport.errorBody` — response body on non-OK responses

3. **Correct status classification (1.3):** A query is marked `status: "error"` if ANY of:
   - Response text is exactly "Something went wrong"
   - HTTP status >= 400
   - Failure code is present
   - Response is empty

4. **Assertions added:**
   - Error rate gate: fails if >5% of queries error
   - Source rate gate: fails if <50% of non-error queries have sources

5. **Attachment verification:** After Q1, verifies the interceptor injected documents successfully.

### Phase 2: Preflight Gate

**File:** `frontend/e2e/preflight-gate.spec.ts` (new)

Checks before running the 100-query test:
1. Backend is reachable
2. Test user can log in and reach chat
3. All 6 target documents exist, are in ready/indexed status
4. Chat stream endpoint accepts authenticated POST

### Phase 3: Backend Scope/Retrieval Wiring

**3.1 — Canonical scope from attached docs:** Verified that the existing backend architecture already correctly:
- Takes `attachedDocumentIds` from request body
- Creates a `docset` scope lock via `buildAttachmentDocScopeLock()`
- Never allows global corpus search when attachments are present (`allowGlobalScope` is only true when `attached.length === 0`)
- Persists scope to conversation for follow-up queries

No code changes needed — the architecture was already correct. The failure was that the test harness never sent `attachedDocuments`.

**3.2 — Broadened doc mention detection patterns:**

**File:** `backend/src/data_banks/policies/memory_policy.any.json`

Added 5 new `docReferencePhrase` patterns to support:
- Portuguese colloquial: "docs que anexei ...", "os documentos que enviei ..."
- Portuguese formal: "em relação aos documentos ..."
- Portuguese reference: "nos docs que ..."
- Spanish: "los documentos que adjunté ..."
- English: "the docs I attached ..."

### Phase 4: Error Transparency

**4.1 — Structured error in UI:**

**File:** `frontend/src/components/chat/ChatInterface.jsx`

Fixed the `!response.ok` handler (line ~3179) to:
- Parse the response body for error details
- Set `m.error` with the HTTP status code and reason
- Set `m.error` on network errors too ("Network error — could not reach the server.")

Before: `m.error` was never set, causing "Something went wrong" fallback.
After: `m.error` contains "Request failed (HTTP 401)" or similar structured reason.

**4.2 — CSRF on confirmation resend:**

**File:** `frontend/src/components/chat/ChatInterface.jsx`

Added `getCsrfToken()` call and `x-csrf-token` header to the confirmation resend fetch (line ~3961). This was the only streaming fetch missing the CSRF header.

### Phase 5: Stable Long-Run Execution

**5.1 — Graceful shutdown handlers:**

**File:** `backend/src/server.ts`

Added SIGTERM and SIGINT handlers that:
- Close the HTTP server cleanly (release port)
- Disconnect Prisma database
- Force exit after 10s timeout if connections don't drain

This prevents EADDRINUSE crashes when nodemon restarts during long test runs.

**5.2 — Stable run command:**

Documented in `frontend/e2e/query-test-100.spec.ts` header:
```
cd backend && npx ts-node --transpile-only src/server.ts
```
This runs the server without nodemon hot-reload, preventing mid-test restarts.

### Phase 6: Truncation Hardening

**File:** `backend/src/data_banks/formatting/truncation_and_limits.any.json`

- `no_docs` mode: 400 chars/300 tokens → **800 chars/600 tokens** (was cutting helpful error explanations too short)
- `general_answer` mode: 1200 chars/1000 tokens → **2400 chars/1600 tokens** (queries asking for tables, lists, detailed analysis need more room)
- `no_docs` profile: `brief` → `concise` (allows more sentences)
- `general_answer` profile: `standard` → `detailed` (allows more structured content)

## 2) Build Verification

```
Frontend build: ✓ (npm run build exits 0)
Backend type-check: ✓ (npx tsc --noEmit exits 0)
```

## 3) Files Modified

| File | Change |
|---|---|
| `frontend/e2e/query-test-100.spec.ts` | Full rewrite v2 — doc attachment, transport metadata, error classification |
| `frontend/e2e/preflight-gate.spec.ts` | NEW — preflight checks |
| `frontend/src/components/chat/ChatInterface.jsx` | Error transparency + CSRF fix |
| `backend/src/data_banks/policies/memory_policy.any.json` | 5 new docReferencePhrase patterns |
| `backend/src/data_banks/formatting/truncation_and_limits.any.json` | Increased no_docs and general_answer limits |
| `backend/src/server.ts` | Graceful shutdown handlers |

## 4) Rerun Protocol

1. Start backend in stable mode: `cd backend && npx ts-node --transpile-only src/server.ts`
2. Start frontend: `cd frontend && npm run start`
3. Run preflight: `cd frontend && npx playwright test e2e/preflight-gate.spec.ts --project=chromium`
4. Run 100-query test: `cd frontend && npx playwright test e2e/query-test-100.spec.ts --project=chromium`
5. Review: `cat frontend/e2e/reports/query-test-100-results.json`

## 5) What Should Be Different in Next Run

1. **Documents will be attached** — every query goes through retrieval with 6 docs in scope
2. **Errors will be classified** — "Something went wrong" replaced with HTTP status + reason
3. **Transport metadata captured** — each result has httpStatus, requestId, errorBody
4. **No mid-test crash** — graceful shutdown + stable run mode prevent EADDRINUSE
5. **Wider truncation limits** — general answers and no-docs responses won't cut mid-sentence
6. **Broader Portuguese detection** — "docs que anexei" patterns now match for scope auto-detection
7. **Source assertions** — test fails if <50% of ok queries have sources (RAG must engage)
