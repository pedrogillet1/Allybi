# Observability & Eval Proof Pack — A+ Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Take the Observability & Eval Proof Pack from 33/100 to 100/100 by fixing every defect found in the harsh audit — eval fixtures, cert tests, CI gating, telemetry, debuggability, and rollout safety.

**Architecture:** Seven workstreams mapped 1:1 to rubric dimensions. Each workstream has atomic tasks ordered by dependency. Telemetry data-loss bugs are fixed first (they affect everything downstream). Then eval fixtures are rebuilt with real content. Then cert tests are made rigorous. Then CI workflows enforce everything. Then dashboards surface the data. Then alerting and rollout safety close the loop.

**Tech Stack:** TypeScript (backend), Jest (tests), GitHub Actions (CI), Prisma (ORM), Express (routes), React + wouter (dashboard), Pino (logging), SSE (live feed), Zod (validation)

**Rubric Target Scores:**
| Dimension | Current | Target |
|---|---|---|
| Eval suite coverage | 8 | 25 |
| Collision & negative fixtures | 4 | 15 |
| EN/PT parity proof | 6 | 15 |
| CI gates enforce thresholds | 2 | 15 |
| Telemetry completeness | 7 | 15 |
| Debuggability | 3 | 10 |
| Rollout safety | 3 | 5 |

---

## Phase 1: Telemetry Data-Loss Fixes (Dimension 5 — Telemetry Completeness)

> Fix silent data loss, broken rollups, dead code, and correlation gaps.
> These are foundational — everything else depends on telemetry actually working.

---

### Task 1.1: Fix Hourly Rollup Event Type Mismatch

**Files:**
- Modify: `backend/src/analytics/rollups/hourlyRollup.job.ts:139-179`
- Test: `backend/src/analytics/rollups/hourlyRollup.job.test.ts` (create if missing, or add test cases)

**Context:** The rollup SQL queries filter by `'chat.message_sent'`, `'rag.query'`, `'document.upload'`, `'auth.login'` but the actual `UsageEventCreate` type uses `CHAT_MESSAGE_SENT`, `DOCUMENT_UPLOADED`, `SESSION_START`. This means `activeUsers`, `messages`, and `documentsUploaded` are permanently zero.

**Step 1: Write the failing test**

Create or append to `backend/src/analytics/rollups/hourlyRollup.job.test.ts`:

```typescript
import { describe, test, expect } from "@jest/globals";

// We need to verify the SQL event type strings match the constants
import { USAGE_EVENT_TYPES } from "../../services/telemetry/telemetry.constants";

describe("hourlyRollup event type alignment", () => {
  test("rollup SQL event types match USAGE_EVENT_TYPES constants", () => {
    // These are the event types the rollup queries for
    const rollupEventTypes = {
      messages: "CHAT_MESSAGE_SENT",
      queries: "RAG_QUERY",
      uploads: "DOCUMENT_UPLOADED",
      logins: "SESSION_START",
    };

    expect(USAGE_EVENT_TYPES).toContain(rollupEventTypes.messages);
    expect(USAGE_EVENT_TYPES).toContain(rollupEventTypes.queries);
    expect(USAGE_EVENT_TYPES).toContain(rollupEventTypes.uploads);
    expect(USAGE_EVENT_TYPES).toContain(rollupEventTypes.logins);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npx jest hourlyRollup.job.test --no-coverage`
Expected: PASS (constants exist). This is a guard test — the real fix is the SQL.

**Step 3: Fix the SQL in hourlyRollup.job.ts**

In `backend/src/analytics/rollups/hourlyRollup.job.ts`, replace the raw SQL event type strings:

```typescript
// Line ~144: Replace 'chat.message_sent' with 'CHAT_MESSAGE_SENT'
// Line ~147: Replace 'rag.query' with 'RAG_QUERY'
// Line ~153: Replace 'document.upload' with 'DOCUMENT_UPLOADED'
// Line ~156: Replace 'auth.login' with 'SESSION_START'
```

Exact replacements in the SQL template literals:
- `eventType = 'chat.message_sent'` → `"eventType" = 'CHAT_MESSAGE_SENT'`
- `eventType = 'rag.query'` → `"eventType" = 'RAG_QUERY'`
- `eventType = 'document.upload'` → `"eventType" = 'DOCUMENT_UPLOADED'`
- `eventType = 'auth.login'` → `"eventType" = 'SESSION_START'`

Also check if column names need quoting (Prisma uses camelCase mapped to snake_case — verify the actual column name in the `usage_events` table via `backend/prisma/schema.prisma`).

**Step 4: Add a compile-time guard**

Add to the top of `computeHourlyMetrics()`:

```typescript
// Compile-time alignment guard — if USAGE_EVENT_TYPES changes, update SQL below
const _messageType: typeof USAGE_EVENT_TYPES[number] = "CHAT_MESSAGE_SENT";
const _queryType: typeof USAGE_EVENT_TYPES[number] = "RAG_QUERY";
const _uploadType: typeof USAGE_EVENT_TYPES[number] = "DOCUMENT_UPLOADED";
const _loginType: typeof USAGE_EVENT_TYPES[number] = "SESSION_START";
```

**Step 5: Run test to verify it passes**

Run: `cd backend && npx jest hourlyRollup.job.test --no-coverage`
Expected: PASS

**Step 6: Commit**

```bash
git add backend/src/analytics/rollups/hourlyRollup.job.ts backend/src/analytics/rollups/hourlyRollup.job.test.ts
git commit -m "fix: align hourly rollup SQL event types with USAGE_EVENT_TYPES constants

DAU, messages, and uploads were permanently zero because the rollup
queried dot-notation event types (chat.message_sent) while the writer
uses SCREAMING_SNAKE (CHAT_MESSAGE_SENT)."
```

---

### Task 1.2: Add Telemetry Buffer Flush on Graceful Shutdown

**Files:**
- Modify: `backend/src/server.ts:390-412`
- Modify: `backend/src/services/telemetry/telemetry.service.ts:73-75`

**Context:** The graceful shutdown handler closes HTTP server and disconnects Prisma but never flushes the telemetry buffer. Up to 2000 events are silently dropped on every deploy. Also, `shutdown()` clears the interval but doesn't flush.

**Step 1: Fix TelemetryService.shutdown() to flush before stopping**

In `backend/src/services/telemetry/telemetry.service.ts`, replace `shutdown()`:

```typescript
async shutdown(): Promise<void> {
  if (this.flushTimer) {
    clearInterval(this.flushTimer);
    this.flushTimer = undefined;
  }
  // Drain remaining buffer before exit
  await this.flush();
}
```

Note: change return type from `void` to `Promise<void>`.

**Step 2: Wire shutdown into graceful shutdown handler**

In `backend/src/server.ts`, modify the `gracefulShutdown` function. You need to find where `telemetryService` is accessible. It may be on `app.locals.services.telemetry` or similar. Locate the service instance reference first by searching for `telemetryService` or `TelemetryService` in server.ts or the DI container.

Add before `prisma.$disconnect()`:

```typescript
const gracefulShutdown = async (signal: string) => {
  console.log(`[Server] ${signal} received — shutting down gracefully...`);
  httpServer.close(async () => {
    console.log("[Server] HTTP server closed.");
    try {
      // Flush telemetry before disconnecting DB
      const telemetry = app.locals?.services?.telemetry;
      if (telemetry?.shutdown) {
        await telemetry.shutdown();
        console.log("[Server] Telemetry buffer flushed.");
      }
    } catch (err) {
      console.warn("[Server] Telemetry flush failed:", err);
    }
    prisma
      .$disconnect()
      .then(() => {
        console.log("[Server] Database disconnected.");
        process.exit(0);
      })
      .catch(() => {
        process.exit(0);
      });
  });
  setTimeout(() => {
    console.warn("[Server] Forced shutdown after 10s timeout.");
    process.exit(1);
  }, 10_000).unref();
};
```

**Step 3: Commit**

```bash
git add backend/src/services/telemetry/telemetry.service.ts backend/src/server.ts
git commit -m "fix: flush telemetry buffer on graceful shutdown

Previously up to 2000 buffered events were silently dropped on every
deploy. Now shutdown() drains the buffer before disconnecting the DB."
```

---

### Task 1.3: Add Buffer Overflow Counter and Logging

**Files:**
- Modify: `backend/src/services/telemetry/telemetry.service.ts:157-165`

**Context:** `pushBuffer()` silently drops oldest events when buffer exceeds 2000. No metric, no log, no counter.

**Step 1: Add overflow tracking**

In the `TelemetryService` class, add a counter field:

```typescript
private droppedCount = 0;
```

Replace `pushBuffer()`:

```typescript
private pushBuffer(item: BufferedItem): void {
  this.buffer.push(item);
  if (this.buffer.length > this.cfg.maxBufferSize) {
    const overflow = this.buffer.length - this.cfg.maxBufferSize;
    this.buffer.splice(0, overflow);
    this.droppedCount += overflow;
    if (this.droppedCount % 100 === overflow) {
      // Log every ~100 drops to avoid log spam
      console.warn(
        `[telemetry] buffer overflow: dropped ${overflow} events (total dropped: ${this.droppedCount})`
      );
    }
  }
}
```

**Step 2: Expose dropped count for monitoring**

Add a public getter:

```typescript
get totalDropped(): number {
  return this.droppedCount;
}
```

**Step 3: Commit**

```bash
git add backend/src/services/telemetry/telemetry.service.ts
git commit -m "fix: log and count telemetry buffer overflow events

Silent data loss is now observable via droppedCount counter and
periodic console.warn when events are dropped."
```

---

### Task 1.4: Compute ttftAvgMs in Hourly Rollup

**Files:**
- Modify: `backend/src/analytics/rollups/hourlyRollup.job.ts:131` and add SQL query

**Context:** `ttftAvgMs` is hardcoded to `null` and never computed. The `firstTokenMs` field IS captured in `model_calls` table by the telemetry decorator.

**Step 1: Add TTFT aggregation query**

In `computeHourlyMetrics()`, after the existing queries, add:

```typescript
// Compute average time-to-first-token from model_calls
const ttftResult = await prisma.$queryRawUnsafe<[{ avg_ttft: number | null }]>(
  `SELECT AVG("firstTokenMs") as avg_ttft
   FROM "model_calls"
   WHERE "at" >= $1 AND "at" < $2
     AND "firstTokenMs" IS NOT NULL
     AND "firstTokenMs" > 0
     AND "status" = 'ok'`,
  bucketStart,
  bucketEnd,
);
const ttftAvgMs = ttftResult[0]?.avg_ttft
  ? Math.round(ttftResult[0].avg_ttft * 100) / 100
  : null;
```

**Step 2: Replace the hardcoded null**

Change line ~131 from:
```typescript
ttftAvgMs: null,
```
to:
```typescript
ttftAvgMs,
```

**Step 3: Commit**

```bash
git add backend/src/analytics/rollups/hourlyRollup.job.ts
git commit -m "fix: compute ttftAvgMs from model_calls in hourly rollup

Was hardcoded to null. Now aggregates AVG(firstTokenMs) from
successful model calls per hour bucket."
```

---

### Task 1.5: Correlate requestId with traceId

**Files:**
- Modify: `backend/src/middleware/requestId.middleware.ts`
- Modify: The chat runtime delegate where traceId is derived (search for `mkTraceId`)

**Context:** The HTTP middleware sets `req.requestId` but the chat runtime derives `traceId` from `meta.requestId` in the request body. These are independent values, making it impossible to correlate HTTP logs with telemetry traces.

**Step 1: Propagate middleware requestId as fallback**

Find the chat runtime file where traceId is derived. It should be in `CentralizedChatRuntimeDelegate` or similar. The pattern is:

```typescript
// Current:
return sanitizeTraceId(meta.requestId) || mkTraceId();
```

Change to:

```typescript
// Prefer body meta.requestId, fall back to HTTP middleware requestId
return sanitizeTraceId(meta.requestId) || sanitizeTraceId(req.requestId) || mkTraceId();
```

This requires `req.requestId` to be passed through to the runtime delegate. Search for how the request object flows from the route handler to the delegate — it may need to be added to the `meta` object at the controller level.

**Step 2: Set traceId on response header**

In the route handler that creates the chat turn, after traceId is resolved:

```typescript
res.setHeader("x-trace-id", traceId);
```

This allows clients/load balancers to correlate requests with traces.

**Step 3: Commit**

```bash
git add backend/src/middleware/requestId.middleware.ts backend/src/modules/chat/runtime/CentralizedChatRuntimeDelegate*.ts
git commit -m "fix: correlate HTTP requestId with telemetry traceId

Falls back to middleware requestId when body meta.requestId is absent.
Also emits x-trace-id response header for client correlation."
```

---

### Task 1.6: Fix Edit Telemetry Event Type Pollution

**Files:**
- Modify: `backend/src/services/editing/editTelemetry.service.ts:152`

**Context:** Edit telemetry writes events as `eventType: "FILE_PILL_CLICKED"` to avoid enum mismatch, polluting pill-click analytics.

**Step 1: Add proper event types to the enum**

In `backend/src/services/telemetry/telemetry.types.ts`, add editing event types to `UsageEventCreate.eventType`:

```typescript
| "EDIT_PLANNED"
| "EDIT_PREVIEWED"
| "EDIT_APPLIED"
| "EDIT_FAILED"
| "EDIT_NOOP"
```

Also add them to `USAGE_EVENT_TYPES` in `telemetry.constants.ts`.

**Step 2: Update editTelemetry.service.ts**

Replace `eventType: "FILE_PILL_CLICKED"` with the actual editing event type from the `kind` parameter.

**Step 3: Commit**

```bash
git add backend/src/services/telemetry/telemetry.types.ts backend/src/services/telemetry/telemetry.constants.ts backend/src/services/editing/editTelemetry.service.ts
git commit -m "fix: use dedicated event types for edit telemetry

Editing events were disguised as FILE_PILL_CLICKED to avoid enum
mismatch, polluting pill-click analytics. Now uses proper
EDIT_PLANNED/PREVIEWED/APPLIED/FAILED/NOOP types."
```

---

### Task 1.7: Wire logRetrieval() or Delete Dead Code

**Files:**
- Modify: `backend/src/services/telemetry/telemetry.service.ts` (either wire or delete `logRetrieval`, `logIngestion`)
- Modify: `backend/src/services/telemetry/telemetry.capture.ts` (delete unused builders or wire them)

**Context:** `logRetrieval()`, `logIngestion()`, and all 4 builder functions in `telemetry.capture.ts` have zero call sites. The sanitization logic in the builders is bypassed at every real call site.

**Step 1: Delete dead code**

Since retrieval events are written through `TraceWriterService.writeRetrievalEvent()` (which works), and ingestion events have no writer at all:

- Remove `logRetrieval()` and `logIngestion()` methods from `TelemetryService`
- Remove `RetrievalEventCreate` and `IngestionEventCreate` from the `BufferedItem` union (keep the types for TraceWriter)
- Remove `buildUsageEvent`, `buildModelCall`, `buildRetrievalEvent`, `buildIngestionEvent` from `telemetry.capture.ts` (or repurpose the sanitization into the actual call sites)
- Keep the private helpers (`numberOrNull`, `boolOrNull`, `clamp01OrNull`) — export them for use by TraceWriter

**Step 2: Commit**

```bash
git add backend/src/services/telemetry/telemetry.service.ts backend/src/services/telemetry/telemetry.capture.ts
git commit -m "chore: remove dead telemetry code paths

logRetrieval(), logIngestion(), and 4 unused builder functions had
zero call sites. Retrieval events go through TraceWriterService.
Ingestion telemetry needs a separate implementation task."
```

---

### Task 1.8: Add Anthropic Provider to Telemetry Taxonomy and Cost Table

**Files:**
- Modify: `backend/src/services/telemetry/telemetry.types.ts:81`
- Modify: `backend/src/data_banks/llm/llm_cost_table.any.json`

**Context:** `LLMProviderKey` is `"openai" | "google" | "local" | "unknown"`. The `"anthropic"` provider from `LLMProvider` collapses to `"unknown"`. Cost table has only 3 real model entries.

**Step 1: Add anthropic to LLMProviderKey**

```typescript
export type LLMProviderKey = "openai" | "google" | "anthropic" | "local" | "unknown";
```

**Step 2: Update canonicalization**

In `backend/src/services/llm/core/providerNormalization.ts`, ensure `"anthropic"` maps to `"anthropic"` (not null).

**Step 3: Add cost entries**

In `llm_cost_table.any.json`, add entries for common models:

```json
{ "key": "anthropic:claude-sonnet-4-6", "inputPer1M": 3.0, "outputPer1M": 15.0 },
{ "key": "anthropic:claude-haiku-4-5", "inputPer1M": 0.8, "outputPer1M": 4.0 },
{ "key": "google:gemini-2.5-pro", "inputPer1M": 1.25, "outputPer1M": 10.0 },
{ "key": "google:*", "inputPer1M": 0.15, "outputPer1M": 0.6 },
{ "key": "openai:*", "inputPer1M": 0.3, "outputPer1M": 1.2 }
```

Add wildcard fallbacks so unknown models within a provider get non-zero cost.

**Step 4: Invalidate cost cache on bank reload**

In `backend/src/services/llm/core/telemetryLlmClient.decorator.ts`, replace the module-level cache with a function that re-reads on bank reload. Simplest fix: remove caching entirely (it's only called once per LLM invocation, the overhead is negligible):

```typescript
function getCostTable(): CostTable | null {
  return getOptionalBank<CostTable>("llm_cost_table") ?? null;
}
```

**Step 5: Commit**

```bash
git add backend/src/services/telemetry/telemetry.types.ts backend/src/services/llm/core/providerNormalization.ts backend/src/data_banks/llm/llm_cost_table.any.json backend/src/services/llm/core/telemetryLlmClient.decorator.ts
git commit -m "fix: add anthropic provider to telemetry taxonomy and expand cost table

Anthropic calls were bucketed as 'unknown'. Added anthropic to
LLMProviderKey, added cost entries for Claude + Gemini Pro, added
wildcard fallbacks, removed stale cost cache."
```

---

## Phase 2: Eval Fixture Rebuild (Dimension 1 — Eval Suite Coverage)

> Replace template-generated filler with hand-crafted, domain-authentic eval cases.
> Every case must have ground-truth expected answers and test real disambiguation.

---

### Task 2.1: Rebuild wrong_doc_traps.qa.jsonl (5 → 60 Cases)

**Files:**
- Modify: `backend/src/data_banks/document_intelligence/eval/wrong_doc_traps.qa.jsonl`

**Context:** Currently 5 cases, one per domain, queries name the docTypeId (trivially easy). Need 60+ cases with confusable pairs, adversarial queries that do NOT name the docTypeId, and both EN/PT coverage.

**Step 1: Design confusable pairs**

Each case must present a query that could plausibly match multiple documents. The `mustCite` field identifies the correct one, and `mustNotDo` traps the wrong one.

The new file must follow the existing JSONL schema (see `wrong_doc_traps.qa.jsonl` schema from audit). Required fields: `id`, `lang`, `domain`, `docTypeId`, `queryFamily`, `query`, `expected`.

**Step 2: Write 60 hand-crafted cases**

Organize as 12 cases per domain (6 EN + 6 PT) across 5 domains = 60 total. Each case must:
- NOT name the docTypeId in the query
- Present a confusable scenario (e.g., "What's the outstanding balance?" when both `acct_bank_reconciliation` and `acct_accounts_receivable_aging` are plausible)
- Include `expected.confusableDocs` (new field) listing the trap documents
- Include `expected.expectedAnswer` (new field) with ground-truth answer snippet

**Confusable pair examples per domain:**

**Accounting:**
- `acct_bank_reconciliation` vs `acct_accounts_receivable_aging` (both have "balance")
- `acct_general_ledger` vs `acct_trial_balance` (both have account totals)
- `acct_journal_entry` vs `acct_general_ledger` (both have debit/credit)

**Finance:**
- `fin_cash_flow` vs `fin_cash_forecast` (both have cash projections)
- `fin_10q` vs `fin_quarterly_close_pack` (both are quarterly)
- `fin_arr_mrr_report` vs `fin_revenue_operational_review` (both have revenue)

**Legal:**
- `lease` vs `legal_lease_agreement` (name overlap)
- `legal_nda` vs `legal_non_compete` (both restrict disclosure)
- `legal_sow` vs `legal_msa` (both have payment terms)

**Medical:**
- `med_problem_list` vs `med_progress_note` (both list conditions)
- `med_lab_result` vs `med_pathology_report` (both have test results)
- `med_referral_letter` vs `med_discharge_summary` (both reference next steps)

**Everyday:**
- `every_utility_bill` vs `every_phone_bill` (both are bills)
- `every_tax_notice` vs `every_tax_return` (both are tax docs)
- `every_receipt` vs `every_invoice` (both show amounts)

**Step 3: Validate JSONL format**

Run: `cd backend && node -e "require('fs').readFileSync('src/data_banks/document_intelligence/eval/wrong_doc_traps.qa.jsonl','utf8').trim().split('\n').forEach((l,i) => { try { JSON.parse(l) } catch(e) { console.error('Line', i+1, e.message) } })"`
Expected: No errors

**Step 4: Commit**

```bash
git add backend/src/data_banks/document_intelligence/eval/wrong_doc_traps.qa.jsonl
git commit -m "eval: rebuild wrong_doc_traps with 60 hand-crafted confusable-pair cases

Replaces 5 trivial cases that named the docTypeId with 60 adversarial
cases across 5 domains x 2 languages, each with confusable doc pairs
and ground-truth expected answers."
```

---

### Task 2.2: Rebuild crossdoc.qa.jsonl (190 Template Filler → 80 Real Cases)

**Files:**
- Modify: `backend/src/data_banks/document_intelligence/eval/crossdoc.qa.jsonl`
- Modify: `backend/src/data_banks/document_intelligence/eval/suites/suite_registry.any.json` (update `maxCases` if needed)

**Context:** Current 190 cases are 2 templates auto-generated. Every query says "check scope-lock and refuse comparison." Need real cross-document reasoning queries.

**Step 1: Delete current content and write 80 hand-crafted cases**

Categories of cross-doc queries (16 each = 80):
1. **Legitimate cross-doc comparison** (should succeed): "Compare the payment terms in the SOW with the pricing in the MSA"
2. **Scope violation** (should refuse): query asks about doc B while locked to doc A
3. **Ambiguous scope** (should clarify): query could apply to multiple attached docs
4. **Cross-doc inference** (should refuse): query requires combining facts from unrelated docs
5. **Single-doc with distractor** (should answer from correct doc, ignoring distractor)

Each case: 8 EN + 8 PT = 16 per category. Queries must be natural language, not templates.

**Step 2: Update suite_registry.any.json**

Change `crossdoc` suite's `maxCases` to 80 and `minimumCases` to 80.

**Step 3: Validate and commit**

```bash
git add backend/src/data_banks/document_intelligence/eval/crossdoc.qa.jsonl backend/src/data_banks/document_intelligence/eval/suites/suite_registry.any.json
git commit -m "eval: rebuild crossdoc with 80 hand-crafted cross-document reasoning cases

Replaces 190 auto-generated template filler with 80 real queries across
5 cross-doc scenarios, each with ground-truth expected behavior."
```

---

### Task 2.3: Rebuild retrieval_precision.qa.jsonl (280 Answer-in-Query → 120 Real Cases)

**Files:**
- Modify: `backend/src/data_banks/document_intelligence/eval/retrieval_precision.qa.jsonl`

**Context:** Current 280 cases contain the docTypeId in the query ("include strongest evidence for fin_arr_mrr_report"). Any trivial retriever passes. Need queries that require actual retrieval.

**Step 1: Write 120 cases (24 per domain, 12 EN + 12 PT)**

Each query must:
- Be a natural user question (NOT mention docTypeId)
- Test a specific retrieval challenge: synonym matching, section targeting, numeric extraction, temporal scoping
- Include `expected.mustRetrieve` with the correct docTypeId
- Include `expected.mustNotRetrieve` with confusable alternatives
- Include `expected.minRelevanceScore` with realistic thresholds (0.6+)

**Step 2: Validate and commit**

```bash
git add backend/src/data_banks/document_intelligence/eval/retrieval_precision.qa.jsonl
git commit -m "eval: rebuild retrieval_precision with 120 natural-language queries

Replaces 280 answer-in-query cases with real disambiguation queries
that test synonym matching, section targeting, and temporal scoping."
```

---

### Task 2.4: Rebuild Domain Core Suites (finance, legal, medical, accounting, everyday)

**Files:**
- Modify: `backend/src/data_banks/document_intelligence/eval/domain_specific/finance/finance_core.qa.jsonl`
- Modify: `backend/src/data_banks/document_intelligence/eval/domain_specific/legal/legal_core.qa.jsonl`
- Modify: `backend/src/data_banks/document_intelligence/eval/domain_specific/medical/medical_core.qa.jsonl`
- Modify: `backend/src/data_banks/document_intelligence/eval/domain_specific/accounting/accounting_core.qa.jsonl`
- Modify: `backend/src/data_banks/document_intelligence/eval/domain_specific/everyday/everyday_core.qa.jsonl`

**Context:** Current 320-case suites are template × docType rotations with zero domain knowledge. "Extract pricing from med_problem_list" is nonsensical.

**Step 1: Rebuild each domain with 100 hand-crafted cases (50 EN + 50 PT)**

Each domain's cases must test **actual domain concepts**:

**Finance (100 cases):**
- EBITDA margin calculations, covenant ratio checks, working capital analysis
- Revenue recognition timing, deferred revenue identification
- Cash flow vs. accrual differences
- Multi-period comparison queries

**Legal (100 cases):**
- Clause interpretation (indemnification, limitation of liability)
- Conflict-of-law identification
- Force majeure applicability
- Termination vs. breach distinction
- Party obligation extraction

**Medical (100 cases):**
- Lab result interpretation with reference ranges
- Medication reconciliation
- Clinical safety boundaries (MUST refuse dosage advice)
- PHI redaction requirements (MUST redact SSN/MRN/DOB in output)
- Differential diagnosis from symptoms

**Accounting (100 cases):**
- Journal entry validation (debits = credits)
- Reconciliation discrepancy identification
- Standards compliance (GAAP vs IFRS differences)
- Period-end close procedures

**Everyday (100 cases):**
- Bill amount extraction with currency
- Date disambiguation (due date vs statement date)
- Address extraction and formatting
- Multi-line item totaling

**Step 2: Add ground-truth expected answers**

Every case must include `expected.expectedAnswer` with the actual correct answer text. This is the single most important change — without ground truth, the suite tests format compliance, not correctness.

**Step 3: Update suite_registry.any.json minimumCases**

Set each domain's `minimumCases` to 100 (down from 320 — fewer but real).

**Step 4: Commit per domain (5 commits)**

```bash
git commit -m "eval: rebuild finance_core with 100 domain-authentic cases"
git commit -m "eval: rebuild legal_core with 100 domain-authentic cases"
git commit -m "eval: rebuild medical_core with 100 clinical-safety cases"
git commit -m "eval: rebuild accounting_core with 100 standards-aware cases"
git commit -m "eval: rebuild everyday_core with 100 practical extraction cases"
```

---

### Task 2.5: Rebuild Excel Calc Eval Suites (Deduplicate and Add Ground Truth)

**Files:**
- Modify: `backend/src/data_banks/agents/excel_calc/eval/chart_tests.qa.jsonl`
- Modify: `backend/src/data_banks/agents/excel_calc/eval/locale_coverage.qa.jsonl`
- Modify: `backend/src/data_banks/agents/excel_calc/eval/calc_precision.qa.jsonl`
- Modify: `backend/src/data_banks/agents/excel_calc/eval/suite_registry.any.json`

**Context:** `chart_tests` is 12 cases copy-pasted 4×. `locale_coverage` is 4 cases copy-pasted 11×. `calc_precision` has no expected values.

**Step 1: Rebuild chart_tests (48 unique cases)**

- 12 chart types × 2 languages × 2 variations (different data shapes) = 48
- Each variation must use different ranges and different query phrasing
- Add 12 negative cases (wrong data shape, insufficient data, too many series)
- Total: 60 unique cases

**Step 2: Rebuild locale_coverage (40 unique cases)**

- Cover: en-US, pt-BR, de-DE, fr-FR, es-ES (5 locales × 4 patterns × 2 languages)
- Patterns: number format, date format, currency symbol, percentage
- Add 10 negative cases: ambiguous locale, conflicting signals
- Total: 50 unique cases

**Step 3: Rebuild calc_precision with expected values**

- Keep the 30 calcFamilies but ADD `expected.value` with the actual numeric result
- Use varied input ranges (not just A1:A120 everywhere)
- Add tolerance per calcFamily (tighter for simple, looser for iterative)
- Add negative cases: wrong type in range, #N/A errors, circular reference, negative where positive required
- Total: 72 unique cases (keep count, improve quality)

**Step 4: Update suite_registry.any.json**

Update minimumCases to match new unique counts. Add `requireUniqueIds: true` to config.

**Step 5: Commit**

```bash
git add backend/src/data_banks/agents/excel_calc/eval/
git commit -m "eval: deduplicate excel calc suites, add ground-truth expected values

chart_tests: 60 unique (was 12×4). locale_coverage: 50 unique (was 4×11).
calc_precision: 72 with expected.value and varied ranges."
```

---

### Task 2.6: Expand golden-eval.seeds.json (25 → 60 Seeds)

**Files:**
- Modify: `backend/src/services/core/retrieval/__fixtures__/golden-eval.seeds.json`

**Context:** Currently 25 seeds across 5 categories with absurdly low thresholds (0.25–0.4). Missing: negative, adversarial, multilingual, table extraction, entity disambiguation categories.

**Step 1: Add 7 new categories (5 seeds each = 35 new)**

```json
{
  "categories": [
    "single_doc_extract",      // existing 5
    "multi_doc_compare",       // existing 5
    "numeric_precision",       // existing 5
    "legal_clause",            // existing 5
    "time_scoped",             // existing 5
    "negative_no_match",       // NEW: queries that should return NO docs
    "adversarial_confusable",  // NEW: near-miss document pairs
    "multilingual_pt",         // NEW: PT queries
    "table_extraction",        // NEW: queries targeting table data
    "entity_disambiguation",   // NEW: same entity name in different docs
    "out_of_scope",            // NEW: query about content not in corpus
    "ocr_degraded"             // NEW: queries against scanned docs
  ]
}
```

**Step 2: Raise thresholds on existing seeds**

- `single_doc_extract`: `expectedMinScore` 0.4 → 0.7
- `multi_doc_compare`: 0.3 → 0.5
- `numeric_precision`: 0.4 → 0.7
- `legal_clause`: 0.4 → 0.7
- `time_scoped`: 0.25 → 0.5

**Step 3: Add expected answer content to all seeds**

Every seed gets `expectedAnswerContains: ["key phrase from correct answer"]` so we can validate not just retrieval but extraction.

**Step 4: Commit**

```bash
git add backend/src/services/core/retrieval/__fixtures__/golden-eval.seeds.json
git commit -m "eval: expand golden seeds to 60 with 7 new categories and ground truth

Raises score thresholds (0.25→0.5+). Adds negative, adversarial,
multilingual, table, entity disambiguation, out-of-scope, OCR categories.
Every seed now has expectedAnswerContains."
```

---

### Task 2.7: Expand gold.jsonl for Document Understanding (4 → 20 Cases)

**Files:**
- Modify: `backend/src/document_understanding/eval/fixtures/gold.jsonl`

**Context:** Only 4 cases. Missing: nested tables, multi-page tables, multi-language, handwriting, forms/checkboxes, header/footer noise, watermarks.

**Step 1: Add 16 new gold records**

Keep the existing 4, add:
5. Nested table (table within table)
6. Multi-page spanning table
7. PT-only document
8. Mixed EN/PT document
9. Form with checkboxes
10. Document with headers/footers to ignore
11. Watermarked document
12. Multi-column layout
13. Document with footnotes
14. Spreadsheet-like layout
15. Presentation slide deck
16. Email thread document
17. Table with merged cells
18. Document with embedded images (caption extraction)
19. Handwritten annotation overlay
20. Heavily redacted document

Each follows the existing schema: `schema_version`, `document_id`, `doc_type`, `sections`, `tables`, `meta`.

**Step 2: Commit**

```bash
git add backend/src/document_understanding/eval/fixtures/gold.jsonl
git commit -m "eval: expand document understanding gold set to 20 cases

Adds nested tables, multi-page tables, multi-language, forms,
watermarks, footnotes, merged cells, and other real-world doc types."
```

---

## Phase 3: Collision & Negative Fixtures (Dimension 2)

---

### Task 3.1: Create adversarial_collisions.qa.jsonl

**Files:**
- Create: `backend/src/data_banks/document_intelligence/eval/adversarial_collisions.qa.jsonl`
- Modify: `backend/src/data_banks/document_intelligence/eval/suites/suite_registry.any.json`

**Context:** No adversarial/near-miss corpus exists. Need queries designed to trigger wrong-doc retrieval.

**Step 1: Write 50 adversarial cases (25 EN + 25 PT)**

Categories:
- **Title collision**: docs with similar names ("Q3 Revenue Report" vs "Q3 Revenue Forecast")
- **Content overlap**: same numbers appear in multiple docs
- **Temporal confusion**: "latest report" when multiple dated docs exist
- **Entity ambiguity**: same person/company name in different docs
- **Section name collision**: "Summary" section exists in every doc

Each case includes `expected.trapDocIds` listing the wrong documents that look similar.

**Step 2: Register in suite_registry**

Add to `ci_suites` and `suites`:

```json
{
  "id": "adversarial_collisions_ci",
  "path": "document_intelligence/eval/adversarial_collisions.qa.jsonl",
  "maxCases": 50,
  "minimumCases": 50,
  "description": "Adversarial collision and near-miss document traps."
}
```

**Step 3: Commit**

```bash
git add backend/src/data_banks/document_intelligence/eval/adversarial_collisions.qa.jsonl backend/src/data_banks/document_intelligence/eval/suites/suite_registry.any.json
git commit -m "eval: add 50 adversarial collision cases for near-miss trapping"
```

---

### Task 3.2: Fix patternCollision.test.ts 230% Tolerance

**Files:**
- Modify: `backend/src/tests/patternCollision.test.ts:141`

**Context:** `allowedCollisionCount = Math.max(25, Math.round(rowCount * 2.3))` means 230% collision tolerance. This is decorative.

**Step 1: Tighten tolerance**

Replace line 141:

```typescript
// Old: const allowedCollisionCount = Math.max(25, Math.round(rowCount * 2.3));
const allowedCollisionCount = Math.max(5, Math.round(rowCount * 0.1));
```

This allows max 10% cross-row phrase collision rate with a floor of 5.

**Step 2: Add collision detail logging**

When the test fails, log which phrases collided and between which rows:

```typescript
if (collisions > allowedCollisionCount) {
  const details = collisionPairs.slice(0, 20).map(
    (p) => `  "${p.phrase}" in rows [${p.rowIds.join(", ")}]`
  ).join("\n");
  fail(
    `${family}/${file}: ${collisions} cross-row collisions (max ${allowedCollisionCount}).\nTop collisions:\n${details}`
  );
}
```

**Step 3: Run tests and fix any legitimate collisions exposed**

Run: `cd backend && npx jest patternCollision --no-coverage`

If tests fail, review the collisions. For legitimate shared phrases (e.g., "show me"), add them to an explicit allowlist (not a percentage tolerance).

**Step 4: Commit**

```bash
git add backend/src/tests/patternCollision.test.ts
git commit -m "fix: tighten pattern collision tolerance from 230% to 10%

The previous tolerance was so high it was decorative. Now detects
real ambiguity with detailed collision reporting."
```

---

### Task 3.3: Fix docint-wiring-proof.test.ts Dead Assertion

**Files:**
- Modify: `backend/src/tests/document-intelligence/docint-wiring-proof.test.ts:403`

**Context:** Line 403 contains `|| true` making an assertion unconditionally pass.

**Step 1: Remove the `|| true`**

Find line 403 and remove the `|| true`:

```typescript
// Before:
diagnostics.versions[expected] !== undefined || diagnostics.loadedBankIds.includes(expected) || diagnostics.counts[expected] !== undefined || true

// After:
diagnostics.versions[expected] !== undefined || diagnostics.loadedBankIds.includes(expected) || diagnostics.counts[expected] !== undefined
```

**Step 2: Run and fix any failures**

Run: `cd backend && npx jest docint-wiring-proof --no-coverage`

If it fails, the diagnostics object is missing expected entries — fix the diagnostics implementation, don't re-add `|| true`.

**Step 3: Commit**

```bash
git add backend/src/tests/document-intelligence/docint-wiring-proof.test.ts
git commit -m "fix: remove dead assertion (|| true) in docint-wiring-proof

Line 403 had an unconditionally-passing assertion. Now properly
validates that diagnostics contain expected entries."
```

---

## Phase 4: EN/PT Parity (Dimension 3)

---

### Task 4.1: Upgrade patternParity to Semantic Parity Check

**Files:**
- Modify: `backend/src/tests/patternParity.en_pt.test.ts`

**Context:** Current test only checks array lengths match. 5 EN invoice patterns + 5 PT weather patterns → PASS. Need semantic content validation.

**Step 1: Add content parity checks**

After the existing length check, add:

```typescript
// Check that EN and PT phrases share the same placeholders
for (let i = 0; i < en.length; i++) {
  const enPlaceholders = (en[i].match(/\{\{[^}]+\}\}/g) || []).sort();
  const ptPlaceholders = (pt[i].match(/\{\{[^}]+\}\}/g) || []).sort();
  expect(enPlaceholders).toEqual(ptPlaceholders);
}

// Check that each PT string contains at least one Portuguese word indicator
// (common PT articles/prepositions not found in English)
const ptIndicators = /\b(de|do|da|dos|das|no|na|nos|nas|um|uma|para|com|por|ou|se|que|como|este|esta|esse|essa|qual|quais)\b/i;
for (const phrase of pt) {
  if (phrase.length > 10) { // skip very short strings
    expect(phrase).toMatch(ptIndicators);
  }
}

// Check that no PT phrase is identical to its EN counterpart (translation actually happened)
for (let i = 0; i < en.length; i++) {
  if (en[i].length > 15) { // skip short templated strings
    expect(pt[i]).not.toBe(en[i]);
  }
}
```

**Step 2: Remove accounting allowlist or add expiry**

Replace the static `ALLOWLIST_MISSING_META_FILES` with a dated allowlist:

```typescript
const ALLOWLIST_EXPIRES = new Date("2026-04-01");
const ALLOWLIST_MISSING_META_FILES = Date.now() < ALLOWLIST_EXPIRES.getTime()
  ? ["acct_aging_report", /* ... */]
  : []; // Expired — all files must comply
```

**Step 3: Run tests and fix exposed issues**

Run: `cd backend && npx jest patternParity --no-coverage`

**Step 4: Commit**

```bash
git add backend/src/tests/patternParity.en_pt.test.ts
git commit -m "feat: upgrade EN/PT parity to semantic validation

Now checks: placeholder parity per phrase, PT language indicators,
no untranslated phrases. Allowlist has expiry date."
```

---

### Task 4.2: Remove patternOrphanDetection 23-Bank Allowlist

**Files:**
- Modify: `backend/src/tests/patternOrphanDetection.test.ts`

**Context:** 23 banks are completely exempt from all orphan checks. No staleness expiry.

**Step 1: Add expiry mechanism**

```typescript
const ORPHAN_ALLOWLIST_EXPIRY = new Date("2026-04-15");
const PATTERN_BANK_ALLOWLIST = Date.now() < ORPHAN_ALLOWLIST_EXPIRY.getTime()
  ? [/* existing 23 IDs */]
  : []; // Force resolution by deadline
```

**Step 2: Register as many allowlisted banks as possible**

For each of the 23 banks, check if it's actually used. If yes, add it to the bank_registry and bank_dependencies. If not, delete it. Reduce the allowlist toward zero.

**Step 3: Commit**

```bash
git add backend/src/tests/patternOrphanDetection.test.ts
git commit -m "fix: add expiry to orphan detection allowlist, register known banks

23 banks were exempt from orphan checks with no expiry. Added
2026-04-15 deadline. Registered banks that are actually in use."
```

---

## Phase 5: CI Gating (Dimension 4)

> This is the highest-ROI phase. All tests exist locally but nothing prevents regressions from shipping.

---

### Task 5.1: Create Core Test Gate Workflow

**Files:**
- Create: `.github/workflows/core-test-gate.yml`

**Context:** `npm test` (199 unit tests) is NEVER run in CI. This is the single biggest gap.

**Step 1: Write the workflow**

```yaml
name: Core Test Gate

on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main, develop]

jobs:
  unit-tests:
    name: Unit tests (Jest full suite)
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
          cache-dependency-path: backend/package-lock.json

      - name: Install dependencies
        working-directory: ./backend
        run: npm ci

      - name: Generate Prisma client
        working-directory: ./backend
        run: npx prisma generate

      - name: Run full test suite
        working-directory: ./backend
        run: npx jest --ci --forceExit --maxWorkers=2
        env:
          NODE_ENV: test

      - name: Upload coverage
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: test-coverage
          path: backend/coverage/
          retention-days: 7
```

**Step 2: Commit**

```bash
git add .github/workflows/core-test-gate.yml
git commit -m "ci: add core test gate running full Jest suite on every PR

199 unit tests were never run in CI. This workflow runs npm test
with --ci flag and blocks on any failure."
```

---

### Task 5.2: Create Certification and P0 Gate Workflow

**Files:**
- Create: `.github/workflows/certification-gate.yml`

**Step 1: Write the workflow**

```yaml
name: Certification & P0 Gates

on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main, develop]

jobs:
  cert-tests:
    name: Certification test suite
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
          cache-dependency-path: backend/package-lock.json

      - name: Install dependencies
        working-directory: ./backend
        run: npm ci

      - name: Generate Prisma client
        working-directory: ./backend
        run: npx prisma generate

      - name: Run certification tests
        working-directory: ./backend
        run: npm run test:cert:strict
        env:
          NODE_ENV: test

      - name: Run P0 gates
        working-directory: ./backend
        run: npm run audit:p0:strict
        env:
          NODE_ENV: test
          P0_GATE_MAX_AGE_HOURS: "1"

      - name: Run policy certification
        working-directory: ./backend
        run: npm run policy:cert:strict

      - name: Assert A-grade policy
        working-directory: ./backend
        run: npm run policy:a-grade:assert

      - name: Assert A+ composition
        working-directory: ./backend
        run: npm run policy:composition:a-plus:assert
```

**Step 2: Commit**

```bash
git add .github/workflows/certification-gate.yml
git commit -m "ci: add certification and P0 gate workflow

Runs test:cert:strict (25 cert tests), audit:p0:strict (wrong-doc,
enforcer, evidence, security), and policy certification on every PR."
```

---

### Task 5.3: Create Eval Suite Gate Workflow

**Files:**
- Create: `.github/workflows/eval-gate.yml`

**Step 1: Write the workflow**

```yaml
name: Eval Suite Gate

on:
  pull_request:
    branches: [main, develop]
    paths:
      - "backend/src/data_banks/**"
      - "backend/src/services/core/retrieval/**"
      - "backend/src/services/core/banks/**"
      - "backend/src/modules/chat/runtime/**"
      - "backend/scripts/eval/**"
  push:
    branches: [main, develop]

jobs:
  eval-gate:
    name: Retrieval eval gate
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
          cache-dependency-path: backend/package-lock.json

      - name: Install dependencies
        working-directory: ./backend
        run: npm ci

      - name: Generate Prisma client
        working-directory: ./backend
        run: npx prisma generate

      - name: Run retrieval eval gate
        working-directory: ./backend
        run: npx ts-node --transpile-only scripts/eval/retrieval_eval_gate.ts --mode=mock
        env:
          NODE_ENV: test

      - name: Run EN/PT parity gate
        working-directory: ./backend
        run: npx jest patternParity.en_pt.test --ci --forceExit

      - name: Run pattern collision gate
        working-directory: ./backend
        run: npx jest patternCollision --ci --forceExit

      - name: Run docint wiring proof
        working-directory: ./backend
        run: npx jest docint-wiring-proof --ci --forceExit
```

**Step 2: Commit**

```bash
git add .github/workflows/eval-gate.yml
git commit -m "ci: add eval suite gate for retrieval quality and parity

Runs retrieval eval gate, EN/PT parity, collision detection, and
docint wiring proof on PRs touching data banks or retrieval code."
```

---

### Task 5.4: Fix typescript-checks.yml — Remove continue-on-error

**Files:**
- Modify: `.github/workflows/typescript-checks.yml`

**Context:** Every critical step has `continue-on-error: true`, making the entire workflow cosmetic.

**Step 1: Remove continue-on-error from blocking steps**

Remove `continue-on-error: true` from:
- Full TypeScript Check (line ~54)
- Critical Chat TypeScript Check
- Backend Build Test

Keep `continue-on-error: true` ONLY on:
- Frontend TypeScript Check (if it's known to have pre-existing errors)
- ESLint (only if >50 warnings exist that can't be fixed immediately)

**Step 2: Fix the summary job**

The summary job's `exit 1` condition needs to actually check step outcomes, not just job outcomes. Add step `id:` fields and check them explicitly.

**Step 3: Commit**

```bash
git add .github/workflows/typescript-checks.yml
git commit -m "ci: make TypeScript checks blocking by removing continue-on-error

TypeScript errors, ESLint, and Prettier now actually block PRs.
Only frontend typecheck remains non-blocking (pre-existing errors)."
```

---

### Task 5.5: Fix security-scan.yml Broken Step IDs

**Files:**
- Modify: `.github/workflows/security-scan.yml`

**Context:** Summary step references `steps.secrets.outcome` etc. but no step has `id: secrets`. Summary always shows "passed".

**Step 1: Add step IDs**

Add `id:` to each scan step:

```yaml
- name: Scan for Hardcoded Secrets
  id: secrets
  run: ...

- name: Scan for Unprotected Admin Routes
  id: routes
  run: ...

- name: Scan for Plaintext Writes
  id: plaintext
  continue-on-error: true  # keep for now — migration in progress
  run: ...
```

**Step 2: Commit**

```bash
git add .github/workflows/security-scan.yml
git commit -m "fix: add step IDs to security scan so summary reflects real outcomes"
```

---

### Task 5.6: Fix runtime-slo-gates.yml Silent Skip

**Files:**
- Modify: `.github/workflows/runtime-slo-gates.yml:29`

**Context:** When secrets are missing, the entire job silently skips. GitHub shows "skipped" (neutral), not "failed".

**Step 1: Split into two jobs**

```yaml
jobs:
  check-secrets:
    name: Verify SLO test credentials exist
    runs-on: ubuntu-latest
    outputs:
      has-secrets: ${{ steps.check.outputs.has-secrets }}
    steps:
      - name: Check secrets
        id: check
        run: |
          if [ -z "${{ secrets.RUNTIME_SLO_API_BASE }}" ]; then
            echo "::warning::RUNTIME_SLO secrets not configured. SLO gate is DISABLED."
            echo "has-secrets=false" >> $GITHUB_OUTPUT
          else
            echo "has-secrets=true" >> $GITHUB_OUTPUT
          fi

  runtime-slo:
    name: Runtime SLO gate
    needs: check-secrets
    if: needs.check-secrets.outputs.has-secrets == 'true'
    runs-on: ubuntu-latest
    steps:
      # ... existing steps ...
```

This makes the skip visible as a warning rather than silent.

**Step 2: Commit**

```bash
git add .github/workflows/runtime-slo-gates.yml
git commit -m "fix: emit warning when runtime SLO secrets are missing

Previously the entire SLO gate silently skipped. Now emits a visible
warning so missing secrets don't go unnoticed."
```

---

### Task 5.7: Create check:all Workflow (Full Pre-deploy Gate)

**Files:**
- Create: `.github/workflows/predeploy-gate.yml`

**Context:** `npm run check:all` chains 26+ checks but has zero CI coverage. This is the canonical deploy gate.

**Step 1: Write the workflow (runs on push to main only — too heavy for every PR)**

```yaml
name: Pre-deploy Gate

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  predeploy:
    name: Full pre-deploy grade
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
          cache-dependency-path: backend/package-lock.json

      - name: Install
        working-directory: ./backend
        run: npm ci

      - name: Prisma generate
        working-directory: ./backend
        run: npx prisma generate

      - name: Run full check:all
        working-directory: ./backend
        run: npm run check:all
        env:
          NODE_ENV: test

      - name: Run predeploy:grade
        working-directory: ./backend
        run: npm run predeploy:grade
        env:
          NODE_ENV: test
```

**Step 2: Commit**

```bash
git add .github/workflows/predeploy-gate.yml
git commit -m "ci: add full pre-deploy gate running check:all on push to main

Runs the complete 26-step check:all pipeline including all
certification tests, audits, and policy assertions."
```

---

## Phase 6: Cert Test Rigor (Supports Dimensions 1, 2, 4)

> Make cert tests prove real behavior instead of testing mocks.

---

### Task 6.1: Fix retrieval-golden-eval.cert.test.ts — Real Scoring

**Files:**
- Modify: `backend/src/tests/certification/retrieval-golden-eval.cert.test.ts`

**Context:** The mock is constructed per-seed to guarantee target docs score highest. The test is tautological. Aggregate precision threshold of 0.7 allows 30% failure.

**Step 1: Remove per-seed rigged mock**

Replace `makeGoldenEngine` with one that uses a SINGLE pre-computed index (not per-seed):

```typescript
// Use a shared mock index where ALL docs have reasonable scores
// Target docs should NOT be artificially boosted
function makeSharedEngine(allDocs: Doc[]) {
  const semanticIndex = {
    search: async (query: string, k: number) => {
      // Return all docs with scores based on a simple TF-IDF-like heuristic
      // NOT rigged to return the expected doc first
      return allDocs.map((doc) => ({
        ...doc,
        score: computeSimpleRelevance(query, doc.content),
      })).sort((a, b) => b.score - a.score).slice(0, k);
    },
  };
  // ... rest of engine setup
}
```

**Step 2: Raise aggregate precision threshold**

Change from 0.7 to 0.9 (allow max 10% failure, not 30%).

**Step 3: Raise per-seed thresholds**

Use the new `expectedMinScore` values from Task 2.6 (0.5–0.7 range, not 0.25–0.4).

**Step 4: Run and validate**

Run: `cd backend && npx jest retrieval-golden-eval.cert --no-coverage`

**Step 5: Commit**

```bash
git add backend/src/tests/certification/retrieval-golden-eval.cert.test.ts
git commit -m "fix: make golden eval cert test non-tautological

Removes per-seed rigged mock. Uses shared index with simple relevance
scoring. Raises aggregate precision from 0.7 to 0.9."
```

---

### Task 6.2: Add Error Paths to Evidence Fidelity and Provenance Tests

**Files:**
- Modify: `backend/src/tests/certification/evidence-fidelity.cert.test.ts`
- Modify: `backend/src/tests/certification/provenance-strictness.cert.test.ts`

**Context:** `evidence-fidelity` tests 1 doc, 1 hash. `provenance-strictness` tests 2 trivially extreme data points.

**Step 1: Add multi-evidence and boundary tests to evidence-fidelity**

```typescript
test("partial hash match is blocked", () => {
  // 3 evidence items, 2 match, 1 doesn't
  const partialProvenance = { ...baseProvenance, evidenceMap: { ... } };
  // Assert blocked with specific reason
});

test("empty evidence map is blocked", () => { ... });
test("null snippet hash is blocked", () => { ... });
test("duplicate evidence IDs are handled", () => { ... });
```

**Step 2: Add boundary and multi-evidence tests to provenance-strictness**

```typescript
test("medium overlap (50%) is handled correctly", () => { ... });
test("paraphrased content passes if semantic overlap is sufficient", () => { ... });
test("multi-evidence provenance with mixed quality", () => { ... });
test("empty evidence array is blocked", () => { ... });
test("null provenance fields are blocked", () => { ... });
```

**Step 3: Commit**

```bash
git add backend/src/tests/certification/evidence-fidelity.cert.test.ts backend/src/tests/certification/provenance-strictness.cert.test.ts
git commit -m "fix: add error paths and boundary tests to evidence + provenance certs

evidence-fidelity: adds partial match, empty map, null hash, duplicates.
provenance-strictness: adds medium overlap, paraphrase, multi-evidence."
```

---

### Task 6.3: Convert Linter Certs to Behavioral Tests

**Files:**
- Modify: `backend/src/tests/certification/observability-integrity.cert.test.ts`
- Modify: `backend/src/tests/certification/runtime-wiring.cert.test.ts`

**Context:** Both are source-code grep / file-existence checks, not behavioral tests.

**Step 1: Make observability-integrity actually fire spans**

```typescript
test("all 6 pipeline stages produce real spans", async () => {
  const traceWriter = new TraceWriterService(config);
  const traceId = "test-observability-integrity";

  // Start and end a span for each required stage
  const stages = ["input_normalization", "retrieval", "evidence_gate", "compose", "quality_gates", "output_contract"];
  for (const stage of stages) {
    const spanId = traceWriter.startSpan(traceId, stage);
    traceWriter.endSpan(traceId, spanId, "ok");
  }

  const buffer = traceWriter.getBuffer(traceId);
  expect(buffer.spans).toHaveLength(6);
  expect(buffer.spans.map(s => s.stepName).sort()).toEqual(stages.sort());
  // All spans have valid duration
  for (const span of buffer.spans) {
    expect(span.durationMs).toBeGreaterThanOrEqual(0);
    expect(span.status).toBe("ok");
  }
});
```

**Step 2: Make runtime-wiring actually test runtime behavior**

Replace file-existence checks with actual import resolution tests:

```typescript
test("critical runtime modules resolve without error", async () => {
  // Dynamic import tests — if the module has broken imports, this fails
  const modules = [
    "../../modules/chat/runtime/CentralizedChatRuntimeDelegate",
    "../../services/core/retrieval/retrievalEngine.service",
    "../../services/core/banks/dataBankLoader.service",
  ];
  for (const mod of modules) {
    await expect(import(mod)).resolves.toBeDefined();
  }
});
```

**Step 3: Commit**

```bash
git add backend/src/tests/certification/observability-integrity.cert.test.ts backend/src/tests/certification/runtime-wiring.cert.test.ts
git commit -m "fix: convert linter certs to behavioral tests

observability-integrity: now fires real spans and validates buffer.
runtime-wiring: now tests module resolution, not file existence."
```

---

## Phase 7: Debuggability (Dimension 6)

---

### Task 7.1: Wire TraceTailPage to Real SSE Backend

**Files:**
- Modify: `dashboard/client/src/pages/live/TraceTailPage.tsx`

**Context:** TraceTailPage uses `Math.random()` and `setInterval` for fake data. The backend has a real SSE endpoint at `GET /live/events`. The `useLiveStream` hook in `useAdminApi.ts` already wraps SSE.

**Step 1: Replace fake data with real SSE connection**

Remove the `setInterval` + `Math.random()` block (lines ~39-74). Import `useLiveStream` from `@/hooks/useAdminApi`:

```typescript
import { useLiveStream } from "@/hooks/useAdminApi";

// Replace the fake data state with:
const [traces, setTraces] = useState<TraceSpan[]>([]);
const { status } = useLiveStream({
  onEvent: (event) => {
    setTraces((prev) => [mapEventToTrace(event), ...prev].slice(0, 200));
  },
});
```

Write a `mapEventToTrace()` function that converts the SSE event shape to the `TraceSpan` interface.

**Step 2: Commit**

```bash
git add dashboard/client/src/pages/live/TraceTailPage.tsx
git commit -m "feat: wire TraceTailPage to real SSE backend

Replaces Math.random() fake data with useLiveStream hook connected
to GET /live/events SSE endpoint."
```

---

### Task 7.2: Route Missing Dashboard Pages

**Files:**
- Modify: `dashboard/client/src/App.tsx`
- Modify: `dashboard/client/src/pages/overview/index.ts`

**Context:** TraceTailPage, AlertsPage, and DataHealthPage are orphaned components with no routes.

**Step 1: Add routes in App.tsx**

```typescript
import { TraceTailPage } from "@/pages/live/TraceTailPage";
import { AlertsPage } from "@/pages/overview/AlertsPage";

// Inside the <Switch>:
<Route path="/admin/live/traces">
  <ProtectedRoute><TraceTailPage /></ProtectedRoute>
</Route>
<Route path="/admin/alerts">
  <ProtectedRoute><AlertsPage /></ProtectedRoute>
</Route>
```

**Step 2: Export from index**

In `dashboard/client/src/pages/overview/index.ts`:

```typescript
export { OverviewPage } from "./OverviewPage";
export { AlertsPage } from "./AlertsPage";
```

**Step 3: Add navigation links**

Add sidebar links in the dashboard layout component pointing to `/admin/live/traces` and `/admin/alerts`.

**Step 4: Commit**

```bash
git add dashboard/client/src/App.tsx dashboard/client/src/pages/overview/index.ts
git commit -m "feat: route TraceTailPage and AlertsPage in dashboard

TraceTail at /admin/live/traces, Alerts at /admin/alerts. Both
were orphaned components with no navigation path."
```

---

### Task 7.3: Surface Missing Telemetry Fields in Dashboards

**Files:**
- Modify relevant dashboard pages (QualityPage, LLMPage, ReliabilityPage)
- Modify backend aggregation queries if needed

**Context:** `wrongDocPrevented`, `firstTokenMs`, `candidates/selected`, `retries`, prompt/completion split are captured but never surfaced.

**Step 1: Add wrongDocPrevented to Quality page**

In the Quality page's KPI section, add a new metric card:

```typescript
<MetricCard
  label="Wrong-Doc Prevented"
  value={data.kpis.wrongDocPreventedCount}
  description="Times the scope guard prevented wrong-document leakage"
/>
```

Add the aggregation query in the backend if it doesn't exist:

```typescript
wrongDocPreventedCount: await prisma.retrievalEvent.count({
  where: { wrongDocPrevented: true, at: { gte: rangeStart } },
}),
```

**Step 2: Add TTFT and prompt/completion split to LLM page**

Add to LLM page KPIs:
- `avgTtftMs` (average firstTokenMs from model_calls)
- `promptTokensTotal` / `completionTokensTotal` breakdown

**Step 3: Add retrieval funnel (candidates → selected) to Quality page**

Show a funnel visualization: candidates considered → selected → cited.

**Step 4: Commit**

```bash
git add dashboard/client/src/pages/ backend/src/services/telemetry/telemetry.aggregations.ts
git commit -m "feat: surface wrongDocPrevented, TTFT, and retrieval funnel in dashboards

Adds wrongDocPrevented count to Quality page, TTFT + prompt/completion
split to LLM page, and retrieval funnel to Quality page."
```

---

### Task 7.4: Delete Dead Dashboard Code

**Files:**
- Delete: All files in `dashboard/client/src/pages/admin/` (16+ orphaned v1 pages)
- Delete: `dashboard/client/src/pages/overview/DataHealthPage.tsx` (stub)

**Context:** 16 old admin pages with hardcoded mock data were replaced by v2 but never deleted. DataHealthPage is a placeholder that says "Not Yet Implemented."

**Step 1: Verify no imports reference these files**

Search for imports from `pages/admin/` in the codebase. If the index.ts is imported anywhere, update those imports first.

**Step 2: Delete the files**

```bash
rm -rf dashboard/client/src/pages/admin/
rm dashboard/client/src/pages/overview/DataHealthPage.tsx
```

**Step 3: Commit**

```bash
git add -A dashboard/client/src/pages/admin/ dashboard/client/src/pages/overview/DataHealthPage.tsx
git commit -m "chore: delete 16 orphaned v1 dashboard pages and DataHealth stub

All were replaced by v2 pages or were unimplemented stubs with
hardcoded mock data. No active imports reference them."
```

---

## Phase 8: Rollout Safety (Dimension 7)

---

### Task 8.1: Add Canary Health Check to Feature Flag Rollout

**Files:**
- Modify: `backend/src/services/core/banks/bankRollout.service.ts`
- Create: `backend/src/services/core/banks/canaryHealthCheck.service.ts`

**Context:** Feature flags support percentage rollout but no automated health-check-based rollback.

**Step 1: Create canary health check**

```typescript
export class CanaryHealthCheckService {
  constructor(
    private readonly telemetryAgg: TelemetryAggregations,
    private readonly prisma: PrismaClient,
  ) {}

  async checkHealth(flagId: string): Promise<{
    healthy: boolean;
    metrics: {
      errorRate: number;
      p95LatencyMs: number;
      weakEvidenceRate: number;
    };
    thresholds: {
      maxErrorRate: number;
      maxP95Ms: number;
      maxWeakEvidenceRate: number;
    };
    recommendation: "continue" | "pause" | "rollback";
  }> {
    const last15m = new Date(Date.now() - 15 * 60_000);
    // Query telemetry for the canary population (users where flag is enabled)
    // Compare metrics against thresholds
    // Return recommendation
  }
}
```

**Step 2: Wire into rollout service**

Add optional health check before advancing rollout percentage:

```typescript
async advanceRollout(flagId: string, targetPercent: number): Promise<void> {
  const health = await this.healthCheck.checkHealth(flagId);
  if (health.recommendation === "rollback") {
    throw new Error(`Canary unhealthy for ${flagId}: ${JSON.stringify(health.metrics)}`);
  }
  // Proceed with rollout
}
```

**Step 3: Commit**

```bash
git add backend/src/services/core/banks/canaryHealthCheck.service.ts backend/src/services/core/banks/bankRollout.service.ts
git commit -m "feat: add canary health check to feature flag rollout

Checks error rate, P95 latency, and weak evidence rate for canary
population before advancing rollout percentage."
```

---

### Task 8.2: Wire Incident Response Policy to Alerting

**Files:**
- Create: `backend/src/services/core/alerting/alertDispatcher.service.ts`
- Modify: `backend/src/data_banks/policies/incident_response_policy.any.json`

**Context:** Incident response policy defines `page_immediately` with targets like `security_oncall` but there's no execution mechanism.

**Step 1: Create alert dispatcher**

```typescript
export class AlertDispatcherService {
  constructor(private readonly config: AlertConfig) {}

  async dispatch(alert: {
    severity: "critical" | "high" | "medium";
    category: string;
    message: string;
    context: Record<string, unknown>;
  }): Promise<void> {
    // Log structured alert
    logger.error({ alert }, "ALERT_DISPATCHED");

    // Webhook integration (Slack, PagerDuty, etc.)
    if (this.config.webhookUrl) {
      await fetch(this.config.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `[${alert.severity.toUpperCase()}] ${alert.category}: ${alert.message}`,
          ...alert.context,
        }),
      }).catch((err) => {
        logger.warn({ err }, "Alert webhook failed");
      });
    }
  }
}
```

**Step 2: Wire to quality gate failures**

In the quality gate runner, after a BLOCK-severity gate fires:

```typescript
if (gate.severity === "BLOCK") {
  await alertDispatcher.dispatch({
    severity: "critical",
    category: "quality_gate_block",
    message: `Gate ${gate.id} blocked response for user ${userId}`,
    context: { gateId: gate.id, traceId, userId },
  });
}
```

**Step 3: Add webhook URL to environment config**

```typescript
// In config or env:
ALERT_WEBHOOK_URL=https://hooks.slack.com/services/... (or PagerDuty endpoint)
```

**Step 4: Commit**

```bash
git add backend/src/services/core/alerting/alertDispatcher.service.ts
git commit -m "feat: add alert dispatcher with webhook integration

Fires structured alerts on quality gate blocks and critical failures.
Supports Slack/PagerDuty webhooks via ALERT_WEBHOOK_URL env var."
```

---

### Task 8.3: Add Prometheus Metrics Endpoint

**Files:**
- Create: `backend/src/entrypoints/http/routes/metrics.routes.ts`
- Modify: `backend/src/server.ts` (mount route)

**Context:** Zero external monitoring integration. A `/metrics` endpoint enables Prometheus/Grafana without heavy vendor lock-in.

**Step 1: Create metrics endpoint**

```typescript
import { Router, Request, Response } from "express";

const metricsRouter = Router();

metricsRouter.get("/metrics", async (_req: Request, res: Response) => {
  // Collect key metrics in Prometheus exposition format
  const metrics: string[] = [
    `# HELP koda_telemetry_buffer_size Current telemetry buffer size`,
    `# TYPE koda_telemetry_buffer_size gauge`,
    `koda_telemetry_buffer_size ${telemetryService.bufferSize}`,
    `# HELP koda_telemetry_dropped_total Total dropped telemetry events`,
    `# TYPE koda_telemetry_dropped_total counter`,
    `koda_telemetry_dropped_total ${telemetryService.totalDropped}`,
    // Add more: active connections, LLM call rate, error rate, etc.
  ];

  res.set("Content-Type", "text/plain; version=0.0.4");
  res.send(metrics.join("\n") + "\n");
});

export { metricsRouter };
```

**Step 2: Mount in server.ts**

```typescript
app.use(metricsRouter); // No auth — Prometheus needs to scrape
```

**Step 3: Commit**

```bash
git add backend/src/entrypoints/http/routes/metrics.routes.ts backend/src/server.ts
git commit -m "feat: add /metrics Prometheus endpoint for external monitoring

Exposes buffer size, dropped events, and key operational metrics
in Prometheus exposition format for Grafana integration."
```

---

## Phase 9: Enforce Suite Registry Integrity

---

### Task 9.1: Add Unique Case ID Enforcement to Suite Registry

**Files:**
- Modify: `backend/src/data_banks/document_intelligence/eval/suites/suite_registry.any.json`
- Modify: `backend/src/data_banks/agents/excel_calc/eval/suite_registry.any.json`

**Context:** Registries enforce `minimumCases` by raw line count, not unique IDs. This enables the copy-paste padding seen in chart_tests and locale_coverage.

**Step 1: Add `requireUniqueIds` to config**

Both registries should have:

```json
"config": {
  "requireUniqueIds": true,
  "requireUniqueCaseContent": true,
  "failOnDuplicateQueryText": true
}
```

**Step 2: Create enforcement test**

Create `backend/src/tests/eval-registry-integrity.test.ts`:

```typescript
test("all eval suites have unique case IDs and unique query text", () => {
  for (const suite of allSuites) {
    const lines = readJsonl(suite.path);
    const ids = lines.map(l => l.id);
    const queries = lines.map(l => l.query);

    // Unique IDs
    expect(new Set(ids).size).toBe(ids.length);

    // Unique query text (no copy-paste padding)
    const uniqueQueries = new Set(queries);
    const dupeRatio = 1 - uniqueQueries.size / queries.length;
    expect(dupeRatio).toBeLessThan(0.1); // max 10% duplicate queries
  }
});
```

**Step 3: Commit**

```bash
git add backend/src/data_banks/document_intelligence/eval/suites/suite_registry.any.json backend/src/data_banks/agents/excel_calc/eval/suite_registry.any.json backend/src/tests/eval-registry-integrity.test.ts
git commit -m "feat: enforce unique IDs and unique query text in eval suites

Prevents copy-paste padding that inflates case counts without adding
signal. Max 10% duplicate query text allowed."
```

---

## Phase 10: Integration Verification

---

### Task 10.1: Run Full check:all Locally and Fix Breakage

**Step 1:** Run: `cd backend && npm run check:all`

**Step 2:** Fix any failures introduced by all the above changes. This is the integration gate.

**Step 3:** Run: `cd backend && npm run predeploy:grade`

**Step 4:** Commit all fixes.

```bash
git commit -m "fix: resolve check:all failures from observability overhaul"
```

---

### Task 10.2: Verify All CI Workflows Pass

**Step 1:** Push branch and verify all 12 workflows pass:
- `core-test-gate.yml` (NEW)
- `certification-gate.yml` (NEW)
- `eval-gate.yml` (NEW)
- `predeploy-gate.yml` (NEW)
- `typescript-checks.yml` (FIXED)
- `security-scan.yml` (FIXED)
- `runtime-slo-gates.yml` (FIXED)
- `bank-quality-gates.yml` (existing)
- `secret-detection.yml` (existing)
- `upload-truth-audit.yml` (existing)
- `upload-visibility-guard.yml` (existing)
- `pptx-preview-gate.yml` (existing)

**Step 2:** Fix any CI-specific failures.

**Step 3:** Commit fixes.

---

### Task 10.3: Configure GitHub Branch Protection

**Step 1:** In GitHub repository settings → Branches → main:
- Enable "Require status checks to pass before merging"
- Add as required checks:
  - `Unit tests (Jest full suite)`
  - `Certification test suite`
  - `Backend TypeScript full check`
  - `Scan for Hardcoded Secrets`
  - `detect-secrets scan`

**Step 2:** Document the required checks in a `CONTRIBUTING.md` or similar.

---

## Summary: Task Count by Phase

| Phase | Tasks | Est. Changes |
|---|---|---|
| 1. Telemetry fixes | 8 | ~15 files |
| 2. Eval fixture rebuild | 7 | ~12 files |
| 3. Collision & negative | 3 | ~3 files |
| 4. EN/PT parity | 2 | ~2 files |
| 5. CI gating | 7 | ~10 files |
| 6. Cert test rigor | 3 | ~5 files |
| 7. Debuggability | 4 | ~8 files |
| 8. Rollout safety | 3 | ~4 files |
| 9. Registry integrity | 1 | ~3 files |
| 10. Integration verify | 3 | varies |
| **TOTAL** | **41 tasks** | **~62 files** |

**Expected score after completion:**
| Dimension | Before | After |
|---|---|---|
| Eval suite coverage | 8 | 23-25 |
| Collision & negative | 4 | 14-15 |
| EN/PT parity | 6 | 14-15 |
| CI gates | 2 | 14-15 |
| Telemetry completeness | 7 | 14-15 |
| Debuggability | 3 | 9-10 |
| Rollout safety | 3 | 5 |
| **TOTAL** | **33** | **93-100** |
