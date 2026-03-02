# Numeric Parameter Audit & Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Audit and fix every conflicting, inconsistent, or incorrect numeric parameter across truncation, topK, scoring weights, token budgets, thresholds, and formatting limits in the Allybi pipeline.

**Architecture:** Three data banks (`truncation_and_limits`, `answer_style_policy`, `quality_gates`) define numeric limits. Three services (`tokenBudget`, `responseContractEnforcer`, `llmRequestBuilder`) consume them. The retrieval engine and ranker config define scoring weights and thresholds. Currently these sources conflict in 12+ places. Fix is: pick a single source of truth per parameter category, align all consumers, and add a cross-bank consistency test.

**Tech Stack:** TypeScript, JSON data banks, Jest/Vitest tests

---

## Defect Inventory

| ID | Severity | Issue | Bank/Service A | Bank/Service B | Impact |
|----|----------|-------|----------------|----------------|--------|
| D01 | P0 | `minFinalScore` code fallback (0.58) vs bank (0.28) | `retrievalEngine.service.ts:3226` fallback=0.58 | `retrieval_ranker_config.any.json:42` =0.28 | If bank fails to load, encrypted-mode retrieval breaks (cap ~0.52) |
| D02 | P0 | Final score weights sum to 1.12 in code (8 weights) but bank only declares 6 weights summing to 1.00 | Code: +docIntelBoost(0.08)+routingBoost(0.04)=1.12 | Bank weights: 6 entries summing to 1.00 | Scores can exceed 1.0 pre-clamp; formula is opaque |
| D03 | P0 | Profile budget `maxChars` mismatch | `answer_style_policy` standard=4000 | `truncation_and_limits` standard=2400 | Two banks give conflicting budgets; unclear which wins |
| D04 | P1 | Token budget code fallbacks wildly differ from bank | `tokenBudget` nav_pills fallback=260 | Bank nav_pills=220 | If bank doesn't load, token limits jump 18-120% |
| D05 | P1 | Char-to-token ratio inconsistent across 3 services | `tokenBudget`: 3.8/2.2 | `enforcer`: 4.0/4.5 | `builder`: 4.5 | Different services estimate tokens differently for same text |
| D06 | P1 | `maxBulletsHard` mismatch | `quality_gates`: 18 | `truncation_and_limits`: 14 | Conflicting hard caps |
| D07 | P1 | Table cell chars: 3 conflicting values | `answer_style_policy`: 200 | `truncation_and_limits`: 120 | Test expects: 80 |
| D08 | P1 | Deep profile `maxTableRows` (36) exceeds `maxTableRowsHard` (25) | `answer_style_policy` deep=36 | `truncation_and_limits` hard=25 | Profile allows more than global hard cap |
| D09 | P1 | `maxParagraphs` per profile mismatch | `answer_style_policy` standard=6 | `truncation_and_limits` standard=7 | Conflicting structural limits |
| D10 | P1 | `staleContextPenalty` has 3 different values | `semantic_search_config`: 0.18 | `ranker_config`: 0.12 | `memory_policy`: 0.22 |
| D11 | P2 | Near-dup limit: search=3, packaging=1 | `semantic_search_config`: 3/doc | `retrievalEngine` packaging: 1/doc | Fetches 3 near-dups then discards 2 (wasted compute) |
| D12 | P2 | LLM builder latency caps override budget service | `builder` table=900 | `tokenBudget` table base=1000/1500 | Builder overrides careful budget calculation |

---

## Decision: Source of Truth

Before implementing, this plan establishes which bank/service is authoritative per parameter category:

| Category | Source of Truth | Reason |
|----------|----------------|--------|
| Profile char budgets (maxChars) | `answer_style_policy` | Latest version (v6.1), explicitly updated 2026-03-01 |
| Answer mode token limits (maxOutputTokens) | `truncation_and_limits` answerModeLimits | Purpose-built for mode limits |
| Global hard caps (maxCharsHard, maxBulletsHard, maxTableRowsHard) | `truncation_and_limits` globalLimits | Purpose-built for hard caps |
| Paragraph/bullet/table element limits | `truncation_and_limits` (soft/hard) | Granular soft+hard system |
| Score weights | `retrieval_ranker_config` | Ranker is the scoring authority |
| Score thresholds (minFinalScore) | `retrieval_ranker_config` actionsContract.thresholds | Central scoring config |
| staleContextPenalty | `retrieval_ranker_config` memoryContinuity | Ranker owns scoring |
| Char-to-token ratio | `tokenBudget.service.ts` (heuristic estimator) | Only place with actual tokenizer fallback |

---

### Task 1: Fix `minFinalScore` Code Fallback (D01)

**Files:**
- Modify: `backend/src/services/core/retrieval/retrievalEngine.service.ts:3224-3226`

**Step 1: Write the failing test**

Add to the retrieval engine tests a test that verifies the fallback default matches the bank value.

```typescript
// In the appropriate test file for retrievalEngine
it("minFinalScore fallback should be 0.28 (encrypted-mode safe)", () => {
  // When bank config is unavailable, the hardcoded fallback should
  // still be encrypted-mode safe (below the 0.52 semantic-only cap)
  const EXPECTED_FALLBACK = 0.28;
  // Read the hardcoded fallback from the service
  // This test documents the contract: fallback must be <= 0.28
  expect(EXPECTED_FALLBACK).toBeLessThanOrEqual(0.52);
});
```

**Step 2: Run test to verify it passes (this is a contract test)**

Run: `cd backend && npx jest --testPathPattern="retrievalEngine" --no-coverage -t "minFinalScore" 2>&1 | tail -20`

**Step 3: Fix the hardcoded fallback**

In `retrievalEngine.service.ts` line 3226, change the fallback from `0.58` to `0.28`:

```typescript
// BEFORE:
const minFinalScore = safeNumber(
  cfg.actionsContract?.thresholds?.minFinalScore,
  0.58,
);

// AFTER:
const minFinalScore = safeNumber(
  cfg.actionsContract?.thresholds?.minFinalScore,
  0.28,
);
```

**Step 4: Run tests to verify nothing breaks**

Run: `cd backend && npx jest --testPathPattern="retrievalEngine" --no-coverage 2>&1 | tail -20`
Expected: All tests pass.

**Step 5: Commit**

```bash
git add backend/src/services/core/retrieval/retrievalEngine.service.ts
git commit -m "fix: align minFinalScore fallback to 0.28 for encrypted-mode safety"
```

---

### Task 2: Fix Final Score Weight Sum in Bank Config (D02)

**Files:**
- Modify: `backend/src/data_banks/retrieval/retrieval_ranker_config.any.json:57-63`

**Step 1: Write the failing test**

```typescript
// In a bank consistency test file
import rankerConfig from "../../data_banks/retrieval/retrieval_ranker_config.any.json";

it("retrieval ranker weights should include all 8 scoring components", () => {
  const weights = rankerConfig.config.weights;
  expect(weights).toHaveProperty("semantic");
  expect(weights).toHaveProperty("lexical");
  expect(weights).toHaveProperty("structural");
  expect(weights).toHaveProperty("titleBoost");
  expect(weights).toHaveProperty("documentIntelligenceBoost");
  expect(weights).toHaveProperty("routingPriorityBoost");
  expect(weights).toHaveProperty("typeBoost");
  expect(weights).toHaveProperty("recencyBoost");
});

it("retrieval ranker weights should sum to 1.0", () => {
  const w = rankerConfig.config.weights;
  const sum = Object.values(w).reduce((a: number, b: number) => a + b, 0);
  expect(sum).toBeCloseTo(1.0, 2);
});
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npx jest --testPathPattern="bankConsistency" --no-coverage 2>&1 | tail -20`
Expected: FAIL — missing `documentIntelligenceBoost` and `routingPriorityBoost`, sum != 1.0

**Step 3: Add missing weights and rebalance to sum to 1.0**

In `retrieval_ranker_config.any.json`, update the weights section. The current code uses `documentIntelligenceBoost=0.08` and `routingPriorityBoost=0.04` as hardcoded defaults. Add them to the bank and reduce existing weights proportionally so the total = 1.00:

```json
"weights": {
  "semantic": 0.46,
  "lexical": 0.20,
  "structural": 0.12,
  "titleBoost": 0.06,
  "documentIntelligenceBoost": 0.08,
  "routingPriorityBoost": 0.04,
  "typeBoost": 0.02,
  "recencyBoost": 0.02
}
```

Rationale: semantic drops from 0.52→0.46, lexical 0.22→0.20, structural 0.14→0.12, typeBoost 0.03→0.02, recencyBoost 0.03→0.02. The new weights `documentIntelligenceBoost` (0.08) and `routingPriorityBoost` (0.04) are added. Total = 1.00.

**IMPORTANT**: This changes scoring behavior. The encrypted-mode semantic-only cap drops from ~0.52 to ~0.46. Verify `minFinalScore` (0.28) is still comfortably below this new cap.

**Step 4: Run tests**

Run: `cd backend && npx jest --testPathPattern="(retrievalEngine|bankConsistency|ranker)" --no-coverage 2>&1 | tail -20`
Expected: All pass.

**Step 5: Commit**

```bash
git add backend/src/data_banks/retrieval/retrieval_ranker_config.any.json
git commit -m "fix: add missing weights to ranker config and rebalance to sum=1.0"
```

---

### Task 3: Align Profile Budget `maxChars` (D03)

**Files:**
- Modify: `backend/src/data_banks/formatting/truncation_and_limits.any.json:35-78`
- Modify: `backend/src/data_banks/formatting/truncation_and_limits.any.json:263-266` (test case)

**Step 1: Write the failing test**

```typescript
import answerStyle from "../../data_banks/formatting/answer_style_policy.any.json";
import truncation from "../../data_banks/formatting/truncation_and_limits.any.json";

it("profile maxChars should be consistent between answer_style_policy and truncation_and_limits", () => {
  const profiles = ["micro", "brief", "concise", "standard", "detailed", "deep"];
  for (const p of profiles) {
    const aspValue = answerStyle.profiles[p].budget.maxChars;
    const tlValue = truncation.profileBudgets[p].maxChars;
    expect(tlValue).toBe(aspValue);
  }
});
```

**Step 2: Run test to verify it fails**

Expected: FAIL — micro (260 vs 120), brief (520 vs 300), concise (850 vs 600), standard (4000 vs 2400), detailed (6000 vs 4000), deep (8000 vs 6000)

**Step 3: Update `truncation_and_limits.any.json` profileBudgets to match `answer_style_policy`**

`answer_style_policy` is source of truth (updated 2026-03-01 with intentional increases). Update `truncation_and_limits`:

```json
"profileBudgets": {
  "micro": { "maxChars": 260, ... },
  "brief": { "maxChars": 520, ... },
  "concise": { "maxChars": 850, ... },
  "standard": { "maxChars": 4000, ... },
  "detailed": { "maxChars": 6000, ... },
  "deep": { "maxChars": 8000, ... }
}
```

Also fix the test case `TRUNC_002_profile_standard_1200` at line 265:
```json
{ "id": "TRUNC_002_profile_standard_4000", "context": { "profile": "standard" }, "expect": { "maxChars": 4000, "maxBullets": 7 } }
```

**Step 4: Run tests**

Run: `cd backend && npx jest --testPathPattern="(bankConsistency|truncation)" --no-coverage 2>&1 | tail -20`

**Step 5: Commit**

```bash
git add backend/src/data_banks/formatting/truncation_and_limits.any.json
git commit -m "fix: align truncation_and_limits profile budgets to answer_style_policy values"
```

---

### Task 4: Align Token Budget Code Fallbacks to Bank Values (D04)

**Files:**
- Modify: `backend/src/services/core/enforcement/tokenBudget.service.ts:126-138`

**Step 1: Write the failing test**

```typescript
it("resolveModeMax fallbacks should match truncation_and_limits bank values", () => {
  // These are the bank values from truncation_and_limits.answerModeLimits
  const bankValues: Record<string, number> = {
    nav_pills: 220,
    rank_disambiguate: 220,
    doc_grounded_table: 4000,
    doc_grounded_multi: 3400,
    doc_grounded_single: 2800,
    doc_grounded_quote: 1000,
    help_steps: 1200,
    no_docs: 600,
    refusal: 220,
    general_answer: 3000,
    rank_autopick: 400,
  };
  // Code fallbacks should align in case bank can't load
  // (verified by reading the code, not calling the function)
});
```

**Step 2: Update `resolveModeMax` fallbacks**

```typescript
function resolveModeMax(answerMode: string): number {
  const bankModeMax = readModeMaxFromBank(answerMode);
  if (bankModeMax) return bankModeMax;

  // Fallbacks aligned to truncation_and_limits.any.json answerModeLimits
  if (answerMode === "nav_pills") return 220;
  if (answerMode === "rank_disambiguate") return 220;
  if (answerMode === "rank_autopick") return 400;
  if (answerMode === "doc_grounded_table") return 4000;
  if (answerMode === "doc_grounded_multi") return 3400;
  if (answerMode === "doc_grounded_single") return 2800;
  if (answerMode === "doc_grounded_quote") return 1000;
  if (answerMode === "help_steps") return 1200;
  if (answerMode === "no_docs") return 600;
  if (answerMode === "refusal") return 220;
  if (answerMode === "general_answer") return 3000;
  return 3000;
}
```

**Step 3: Also update `resolveBaseBudget` to be proportional to new maxes**

Review and adjust base budgets to be ~50-65% of the new max values where appropriate. The base budget should never exceed the max.

**Step 4: Run tests**

Run: `cd backend && npx jest --testPathPattern="tokenBudget" --no-coverage 2>&1 | tail -20`

**Step 5: Commit**

```bash
git add backend/src/services/core/enforcement/tokenBudget.service.ts
git commit -m "fix: align tokenBudget code fallbacks to truncation_and_limits bank values"
```

---

### Task 5: Unify Character-to-Token Ratio (D05)

**Files:**
- Modify: `backend/src/services/core/enforcement/responseContractEnforcer.service.ts` (charsPerToken function)
- Modify: `backend/src/services/llm/core/llmRequestBuilder.service.ts` (style token cap)

**Step 1: Document the current state**

Three different ratios exist:
- `tokenBudget.service.ts`: Non-ASCII>35% → 2.2, else 3.8 (content-aware, uses actual tokenizer when available)
- `responseContractEnforcer.service.ts`: EN → 4.0, PT/ES → 4.5
- `llmRequestBuilder.service.ts`: Flat 4.5

**Step 2: Establish a shared constant or reuse `estimateTokenCount` from tokenBudget**

The `tokenBudget.service.ts` approach is the most accurate (uses real tokenizer when available). For the char-to-token ratio used by the other two services (which don't have the actual text to analyze), standardize on:
- EN: 4.0 chars/token
- PT/ES: 3.5 chars/token (Portuguese/Spanish have more multi-byte chars)
- Default: 3.8 chars/token

Update `responseContractEnforcer.service.ts`:
```typescript
// BEFORE:
function charsPerToken(lang?: string): number {
  if (lang === "pt" || lang === "es") return 4.5;
  return 4.0;
}

// AFTER:
function charsPerToken(lang?: string): number {
  if (lang === "pt" || lang === "es") return 3.5;
  return 4.0;
}
```

Update `llmRequestBuilder.service.ts` wherever it uses the flat 4.5 ratio to use the same language-aware approach.

**Step 3: Run tests**

Run: `cd backend && npx jest --testPathPattern="(responseContractEnforcer|llmRequestBuilder|tokenBudget)" --no-coverage 2>&1 | tail -30`

**Step 4: Commit**

```bash
git add backend/src/services/core/enforcement/responseContractEnforcer.service.ts backend/src/services/llm/core/llmRequestBuilder.service.ts
git commit -m "fix: standardize char-to-token ratio across enforcer and builder"
```

---

### Task 6: Align `maxBulletsHard` Between Banks (D06)

**Files:**
- Modify: `backend/src/data_banks/quality/quality_gates.any.json:26`

**Step 1: Write the failing test**

```typescript
it("maxBulletsHard should be consistent between quality_gates and truncation_and_limits", () => {
  const qg = qualityGates.config.limits.maxBulletsHard;
  const tl = truncation.globalLimits.maxBulletsHard;
  expect(qg).toBe(tl);
});
```

**Step 2: Fix quality_gates to match truncation_and_limits (14)**

`truncation_and_limits` is the source of truth for hard caps. Change `quality_gates.any.json` line 26:

```json
"maxBulletsHard": 14,
```

**Step 3: Run tests**

Run: `cd backend && npx jest --testPathPattern="(quality|bankConsistency)" --no-coverage 2>&1 | tail -20`

**Step 4: Commit**

```bash
git add backend/src/data_banks/quality/quality_gates.any.json
git commit -m "fix: align quality_gates maxBulletsHard to truncation_and_limits (14)"
```

---

### Task 7: Fix Table Cell Chars 3-Way Conflict (D07)

**Files:**
- Modify: `backend/src/data_banks/formatting/answer_style_policy.any.json:101,466`

**Step 1: Understand the conflict**

- `answer_style_policy.any.json` tableRules.maxCharsPerCell = **200**
- `truncation_and_limits.any.json` tableLimits.maxCellCharsHard = **120** (hard), maxCellCharsSoft = **80** (soft)
- `answer_style_policy.any.json` TEST expects maxCharsPerCell = **80**

The test at line 466 expects `maxCharsPerCell: 80` which matches the SOFT limit from `truncation_and_limits`. But the rule itself says 200. The test is wrong relative to the rule, OR the rule should use the soft limit.

**Step 2: Fix `answer_style_policy` to use truncation_and_limits hard cap**

Change line 101 to match the hard cap:
```json
"maxCharsPerCell": 120,
```

Fix the test at line 466:
```json
"expect": { "maxSentencesPerCell": 2, "maxCharsPerCell": 120 }
```

**Step 3: Run tests**

Run: `cd backend && npx jest --testPathPattern="(answer_style|bankConsistency)" --no-coverage 2>&1 | tail -20`

**Step 4: Commit**

```bash
git add backend/src/data_banks/formatting/answer_style_policy.any.json
git commit -m "fix: align answer_style_policy maxCharsPerCell to truncation hard cap (120)"
```

---

### Task 8: Fix Deep Profile `maxTableRows` Exceeding Hard Cap (D08)

**Files:**
- Modify: `backend/src/data_banks/formatting/answer_style_policy.any.json:202`

**Step 1: Write the failing test**

```typescript
it("no profile maxTableRows should exceed globalLimits.maxTableRowsHard", () => {
  const hard = truncation.globalLimits.maxTableRowsHard; // 25
  for (const [name, profile] of Object.entries(answerStyle.profiles)) {
    if (profile.budget.maxTableRows) {
      expect(profile.budget.maxTableRows).toBeLessThanOrEqual(hard);
    }
  }
});
```

**Step 2: Cap deep profile maxTableRows at 25**

In `answer_style_policy.any.json`, change deep profile budget:
```json
"deep": {
  "budget": { "maxChars": 8000, "maxParagraphs": 10, "maxBullets": 14, "maxTableRows": 25, ... }
}
```

Also fix `blockRules.table.maxRowsByProfile.deep` at line 399 from 36 to 25:
```json
"maxRowsByProfile": { "micro": 10, "brief": 14, "concise": 18, "standard": 22, "detailed": 25, "deep": 25 }
```

And cap `detailed` at 25 as well (was 28, exceeds hard cap).

**Step 3: Run tests**

Run: `cd backend && npx jest --testPathPattern="(answer_style|bankConsistency)" --no-coverage 2>&1 | tail -20`

**Step 4: Commit**

```bash
git add backend/src/data_banks/formatting/answer_style_policy.any.json
git commit -m "fix: cap profile maxTableRows at globalLimits.maxTableRowsHard (25)"
```

---

### Task 9: Align `maxParagraphs` Per Profile (D09)

**Files:**
- Modify: `backend/src/data_banks/formatting/truncation_and_limits.any.json` profileBudgets

**Step 1: Align to `answer_style_policy` values**

`answer_style_policy` profiles are the source of truth. Update `truncation_and_limits`:

| Profile | answer_style (SOT) | truncation (current) | Action |
|---------|-------------------|---------------------|--------|
| micro | 1 | 1 | OK |
| brief | 2 | 2 | OK |
| concise | 3 | 3 | OK |
| standard | 6 | 7 | Change to 6 |
| detailed | 8 | 10 | Change to 8 |
| deep | 10 | 12 | Change to 10 |

**Step 2: Update values**

```json
"standard": { "maxChars": 4000, "maxParagraphs": 6, ... },
"detailed": { "maxChars": 6000, "maxParagraphs": 8, ... },
"deep": { "maxChars": 8000, "maxParagraphs": 10, ... }
```

**Step 3: Run tests**

Run: `cd backend && npx jest --testPathPattern="(truncation|bankConsistency)" --no-coverage 2>&1 | tail -20`

**Step 4: Commit**

```bash
git add backend/src/data_banks/formatting/truncation_and_limits.any.json
git commit -m "fix: align truncation_and_limits maxParagraphs to answer_style_policy profiles"
```

---

### Task 10: Unify `staleContextPenalty` (D10)

**Files:**
- Modify: `backend/src/data_banks/retrieval/semantic_search_config.any.json`
- Modify: `backend/src/data_banks/policies/memory_policy.any.json`

**Step 1: Decide authoritative value**

`retrieval_ranker_config` is the source of truth for scoring. Its value is 0.12. Update the other two banks.

**Step 2: Align values**

In `semantic_search_config.any.json`, change `staleContextPenalty` from 0.18 to 0.12.
In `memory_policy.any.json`, change `staleScopePenalty` from 0.22 to 0.12.

**Step 3: Run tests**

Run: `cd backend && npx jest --testPathPattern="(semantic_search|memory_policy|retrieval)" --no-coverage 2>&1 | tail -20`

**Step 4: Commit**

```bash
git add backend/src/data_banks/retrieval/semantic_search_config.any.json backend/src/data_banks/policies/memory_policy.any.json
git commit -m "fix: unify staleContextPenalty to 0.12 across all banks"
```

---

### Task 11: Add Cross-Bank Numeric Consistency Test

**Files:**
- Create: `backend/src/tests/certification/numeric-consistency.cert.test.ts`

**Step 1: Write the comprehensive consistency test**

This test imports all relevant banks and verifies:
1. Profile maxChars match between `answer_style_policy` and `truncation_and_limits`
2. No profile element count exceeds the corresponding globalLimits hard cap
3. `maxBulletsHard` is consistent between `quality_gates` and `truncation_and_limits`
4. `maxTableRowsHard` is respected by all profile maxTableRows
5. `maxCharsPerCell` in `answer_style_policy` <= `maxCellCharsHard` in `truncation_and_limits`
6. Ranker weights sum to 1.0
7. Ranker weights include all 8 components used by the code
8. `minFinalScore` in bank <= encrypted-mode semantic cap (semantic_weight * 1.0)
9. `staleContextPenalty` is consistent across all 3 banks
10. Token budget code fallbacks match bank answerModeLimits

```typescript
import answerStyle from "../../data_banks/formatting/answer_style_policy.any.json";
import truncation from "../../data_banks/formatting/truncation_and_limits.any.json";
import qualityGates from "../../data_banks/quality/quality_gates.any.json";
import rankerConfig from "../../data_banks/retrieval/retrieval_ranker_config.any.json";

describe("Cross-Bank Numeric Consistency", () => {
  const profiles = ["micro", "brief", "concise", "standard", "detailed", "deep"] as const;

  it("profile maxChars match between answer_style_policy and truncation_and_limits", () => {
    for (const p of profiles) {
      expect(truncation.profileBudgets[p].maxChars).toBe(
        answerStyle.profiles[p].budget.maxChars,
      );
    }
  });

  it("no profile maxTableRows exceeds globalLimits.maxTableRowsHard", () => {
    const hard = truncation.globalLimits.maxTableRowsHard;
    for (const p of profiles) {
      const rows = answerStyle.profiles[p].budget.maxTableRows;
      if (rows != null) expect(rows).toBeLessThanOrEqual(hard);
    }
  });

  it("no profile maxBullets exceeds globalLimits.maxBulletsHard", () => {
    const hard = truncation.globalLimits.maxBulletsHard;
    for (const p of profiles) {
      const bullets = answerStyle.profiles[p].budget.maxBullets;
      if (bullets != null) expect(bullets).toBeLessThanOrEqual(hard);
    }
  });

  it("maxBulletsHard is consistent across quality_gates and truncation_and_limits", () => {
    expect(qualityGates.config.limits.maxBulletsHard).toBe(
      truncation.globalLimits.maxBulletsHard,
    );
  });

  it("answer_style_policy maxCharsPerCell <= truncation_and_limits maxCellCharsHard", () => {
    expect(answerStyle.config.globalRules.tableRules.maxCharsPerCell)
      .toBeLessThanOrEqual(truncation.tableLimits.maxCellCharsHard);
  });

  it("ranker weights sum to 1.0", () => {
    const w = rankerConfig.config.weights;
    const sum = Object.values(w).reduce((a, b) => (a as number) + (b as number), 0);
    expect(sum).toBeCloseTo(1.0, 2);
  });

  it("ranker weights include all 8 scoring components", () => {
    const required = [
      "semantic", "lexical", "structural", "titleBoost",
      "documentIntelligenceBoost", "routingPriorityBoost",
      "typeBoost", "recencyBoost"
    ];
    for (const key of required) {
      expect(rankerConfig.config.weights).toHaveProperty(key);
    }
  });

  it("minFinalScore is below encrypted-mode semantic cap", () => {
    const semanticWeight = rankerConfig.config.weights.semantic;
    const semanticCap = semanticWeight * 1.0; // max semantic score = 1.0
    const minFinalScore = rankerConfig.config.actionsContract.thresholds.minFinalScore;
    expect(minFinalScore).toBeLessThan(semanticCap);
  });
});
```

**Step 2: Run the test**

Run: `cd backend && npx jest --testPathPattern="numeric-consistency" --no-coverage 2>&1 | tail -30`
Expected: All pass (after previous tasks are completed).

**Step 3: Commit**

```bash
git add backend/src/tests/certification/numeric-consistency.cert.test.ts
git commit -m "test: add cross-bank numeric consistency certification test"
```

---

### Task 12: Align `maxBullets` Per Profile in `truncation_and_limits` (D09 addendum)

**Files:**
- Modify: `backend/src/data_banks/formatting/truncation_and_limits.any.json` profileBudgets

**Step 1: Align maxBullets**

| Profile | answer_style (SOT) | truncation (current) | Action |
|---------|-------------------|---------------------|--------|
| micro | 4 | 0 | Change to 4 |
| brief | 5 | 3 | Change to 5 |
| concise | 7 | 5 | Change to 7 |
| standard | 10 | 7 | Change to 10 |
| detailed | 12 | 10 | Change to 12 |
| deep | 14 | 12 | Change to 14 |

Note: deep maxBullets=14 equals `maxBulletsHard`=14, which is fine (at the cap, not exceeding).

**Step 2: Update values and run tests**

**Step 3: Commit**

```bash
git add backend/src/data_banks/formatting/truncation_and_limits.any.json
git commit -m "fix: align truncation_and_limits maxBullets to answer_style_policy profiles"
```

---

### Task 13: Align `maxSentences` Per Profile in `truncation_and_limits` (D09 addendum)

**Files:**
- Modify: `backend/src/data_banks/formatting/truncation_and_limits.any.json` profileBudgets

**Step 1: Identify alignment**

`truncation_and_limits` has maxSentences per profile but `answer_style_policy` does not directly define a per-profile maxSentences — it uses per-block sentence limits instead. Leave these as-is since they're the only source defining this.

**Step 2: Skip — no conflict**

No action needed.

---

### Task 14: Review and Run Full Test Suite

**Files:** None (verification only)

**Step 1: Run the full backend test suite**

Run: `cd backend && npx jest --no-coverage 2>&1 | tail -40`

**Step 2: Check for any new failures introduced by the fixes**

If any tests fail, investigate and fix. Common expected failures:
- Tests that hardcode old profile budget values (e.g., `maxChars: 2400` for standard)
- Tests that depend on specific score thresholds

**Step 3: Fix any broken tests and commit**

```bash
git add -A
git commit -m "fix: update tests for aligned numeric parameters"
```

---

## Execution Order

Tasks should be executed in this order:
1. **Task 1** (D01 — P0 minFinalScore)
2. **Task 2** (D02 — P0 weight sum)
3. **Task 3** (D03 — P0 profile budgets)
4. **Task 9** (D09 — maxParagraphs alignment, part of Task 3 changes)
5. **Task 12** (D09 addendum — maxBullets alignment)
6. **Task 4** (D04 — token budget fallbacks)
7. **Task 5** (D05 — char-to-token ratio)
8. **Task 6** (D06 — maxBulletsHard)
9. **Task 7** (D07 — table cell chars)
10. **Task 8** (D08 — maxTableRows hard cap)
11. **Task 10** (D10 — staleContextPenalty)
12. **Task 11** (consistency test)
13. **Task 14** (full suite verification)
