# FORMAT SYSTEM MAP - Koda Formatting Pipeline

## Executive Summary

**Current State:** Format constraints (exact bullet counts, tables) are NOT enforced.
**Root Cause:** No parsing of format requirements from query, no post-LLM validation.

---

## Full Call Chain: Query → UI

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ 1. USER QUERY ENTERS SYSTEM                                                     │
│    rag.controller.ts:handleStreamQuery()                                        │
│    → Request: { text: "List 5 key points about...", userId, language }          │
└───────────────────────────────────────────┬─────────────────────────────────────┘
                                            ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ 2. INTENT CLASSIFICATION                                                        │
│    kodaOrchestratorV3.service.ts:orchestrateStream()                            │
│    → intentEngine.predictWithScores()                                           │
│    → Result: { primaryIntent: 'documents', questionType: 'LIST' }               │
│                                                                                 │
│    ⚠️ GAP: questionType='LIST' but NO count extracted (5, 10, etc.)            │
└───────────────────────────────────────────┬─────────────────────────────────────┘
                                            ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ 3. ROUTING & DECISION                                                           │
│    decisionTree.service.ts:decide()                                             │
│    → Routes to DOC_QA handler based on family/sub-intent                        │
│    → No format constraints passed through                                       │
└───────────────────────────────────────────┬─────────────────────────────────────┘
                                            ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ 4. RETRIEVAL                                                                    │
│    kodaRetrievalEngineV3.service.ts:retrieve()                                  │
│    → Fetches relevant chunks from vector store                                  │
│    → No format context needed here                                              │
└───────────────────────────────────────────┬─────────────────────────────────────┘
                                            ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ 5. ANSWER GENERATION (LLM CALL)                                                 │
│    kodaAnswerEngineV3.service.ts:streamAnswerWithDocsAsync()                    │
│                                                                                 │
│    System Prompt Built Here:                                                    │
│    - buildSystemPrompt(intent, lang, domainContext, softAnswerMode)             │
│    - getQuestionTypeInstructions(questionType)                                  │
│                                                                                 │
│    For questionType='LIST':                                                     │
│    → "Present the information as a clear, organized list."                      │
│                                                                                 │
│    ⚠️ GAP: No count instruction (e.g., "exactly 5 items")                      │
│    ⚠️ GAP: No table format instruction for comparison queries                  │
│    ⚠️ GAP: After LLM returns, NO validation of bullet count                    │
└───────────────────────────────────────────┬─────────────────────────────────────┘
                                            ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ 6. FORMATTING PIPELINE                                                          │
│    kodaFormattingPipelineV3.service.ts:format()                                 │
│                                                                                 │
│    Current Processing:                                                          │
│    ✓ Step 1: Detect truncation                                                  │
│    ✓ Step 2: Insert document markers                                            │
│    ✓ Step 2.1: Filter forbidden phrases                                         │
│    ✓ Step 2.2: Language lock enforcement                                        │
│    ✓ Step 2.5: Normalize bullets (style only: * → -)                           │
│    ✓ Step 3: Validate marker locations                                          │
│    ✓ Step 4: Validate markdown structure                                        │
│    ✓ Step 7: UX contract (sentence limits, emoji stripping)                     │
│                                                                                 │
│    ⚠️ MISSING: Parse query for count requirements                              │
│    ⚠️ MISSING: Validate/enforce bullet count                                   │
│    ⚠️ MISSING: Validate/repair table structure                                 │
└───────────────────────────────────────────┬─────────────────────────────────────┘
                                            ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ 7. RESPONSE CONTRACT ENFORCER                                                   │
│    responseContractEnforcer.service.ts                                          │
│                                                                                 │
│    Current Checks:                                                              │
│    ✓ Fallback pattern detection                                                 │
│    ✓ Minimum length validation                                                  │
│    ✓ Language consistency                                                       │
│                                                                                 │
│    ⚠️ MISSING: Format structure validation                                     │
└───────────────────────────────────────────┬─────────────────────────────────────┘
                                            ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ 8. DONE EVENT CONSTRUCTION                                                      │
│    kodaOrchestratorV3.service.ts:buildDoneEvent()                               │
│                                                                                 │
│    Done Event Structure:                                                        │
│    {                                                                            │
│      type: 'done',                                                              │
│      fullAnswer: string,                                                        │
│      formatted: string,                                                         │
│      constraints?: ResponseConstraints,  // ← EXISTS but never populated!      │
│      citations, sources, attachments...                                         │
│    }                                                                            │
│                                                                                 │
│    ResponseConstraints Interface (streaming.types.ts:190):                      │
│    {                                                                            │
│      buttonsOnly?: boolean,                                                     │
│      jsonOnly?: boolean,                                                        │
│      csvOnly?: boolean,                                                         │
│      tableOnly?: boolean,          // ← Never set                               │
│      exactBullets?: number,        // ← Never set                               │
│      maxChars?: number,                                                         │
│    }                                                                            │
│                                                                                 │
│    ⚠️ GAP: constraints.exactBullets and constraints.tableOnly exist            │
│           but are NEVER populated from query parsing!                           │
└───────────────────────────────────────────┬─────────────────────────────────────┘
                                            ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ 9. SSE STREAMING TO FRONTEND                                                    │
│    rag.controller.ts:sendSSE()                                                  │
│    → Sends done event with constraints (if any)                                 │
└───────────────────────────────────────────┬─────────────────────────────────────┘
                                            ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ 10. FRONTEND RENDERING                                                          │
│     StreamingMarkdown.jsx                                                       │
│                                                                                 │
│     Markdown Processing:                                                        │
│     ✓ ReactMarkdown with remarkGfm (GitHub Flavored Markdown)                  │
│     ✓ Tables ARE rendered correctly (| syntax supported)                       │
│     ✓ Lists ARE rendered correctly (-, *, 1. supported)                        │
│     ✓ No interference with formatting                                           │
│                                                                                 │
│     ✓ FRONTEND IS NOT THE PROBLEM                                              │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Key Files and Their Roles

| File | Role | Format-Related Code |
|------|------|---------------------|
| `kodaOrchestratorV3.service.ts` | Main orchestrator | Lines 448-850: orchestrate(), no format parsing |
| `kodaAnswerEngineV3.service.ts` | LLM answer generation | Lines 944-1154: buildSystemPrompt(), getQuestionTypeInstructions() |
| `kodaFormattingPipelineV3.service.ts` | Post-LLM formatting | Lines 182-281: format(), no count validation |
| `responseContractEnforcer.service.ts` | Response validation | No format structure checks |
| `streaming.types.ts` | Type definitions | Lines 190-203: ResponseConstraints with exactBullets, tableOnly |
| `StreamingMarkdown.jsx` | Frontend rendering | Lines 500-508: ReactMarkdown with remarkGfm |

---

## Data Flow Analysis

### What Currently Happens

```
Query: "List 5 key points about the project"
                    ↓
Intent Classification → { primaryIntent: 'documents', questionType: 'LIST' }
                    ↓
System Prompt → "Present the information as a clear, organized list."
(No count instruction!)
                    ↓
LLM Output → May return 3 bullets, 7 bullets, or 5 bullets (random)
                    ↓
Formatting Pipeline → Normalizes bullet style (- instead of *)
(No count validation!)
                    ↓
Done Event → { constraints: undefined }
(exactBullets never set!)
                    ↓
Frontend → Renders whatever LLM produced
```

### What Should Happen

```
Query: "List 5 key points about the project"
                    ↓
Format Constraint Parsing → { wantsBullets: true, bulletCount: 5 }
                    ↓
Intent Classification → { primaryIntent: 'documents', questionType: 'LIST' }
                    ↓
System Prompt → "Present EXACTLY 5 bullet points."
                    ↓
LLM Output → May return wrong count
                    ↓
Format Validator → Counts bullets, detects 7 instead of 5
                    ↓
Format Repair → Truncates to first 5 bullets (preserving citations)
                    ↓
Done Event → { constraints: { exactBullets: 5 } }
                    ↓
Frontend → Renders exactly 5 bullets
```

---

## Bypass Paths Identified

### 1. Help Intent Bypass
**Location:** `kodaOrchestratorV3.service.ts:routeDecision()`
**Problem:** Help responses skip formatting pipeline entirely
**Impact:** If user asks "List 3 things you can help with", count not enforced

### 2. File Actions Bypass
**Location:** `kodaOrchestratorV3.service.ts:handleFileActionsStream()`
**Problem:** File action responses use template strings, skip LLM
**Impact:** Low - templates are pre-formatted

### 3. Error Fallback Bypass
**Location:** `kodaOrchestratorV3.service.ts:buildErrorResponse()`
**Problem:** Error responses skip formatting
**Impact:** Low - errors shouldn't have format requirements

### 4. Multi-Intent Path
**Location:** `kodaOrchestratorV3.service.ts:processMultiIntentSequentially()`
**Problem:** Multi-intent responses combine segments, formatting applied at end
**Impact:** Format constraints from individual segments may be lost

---

## Type Definitions (Already Exist But Unused)

```typescript
// streaming.types.ts:190-203
export interface ResponseConstraints {
  buttonsOnly?: boolean;
  jsonOnly?: boolean;
  csvOnly?: boolean;
  tableOnly?: boolean;           // ← EXISTS, never set
  exactBullets?: number;         // ← EXISTS, never set
  maxChars?: number;
}
```

These constraints are:
1. Defined in types ✓
2. Included in DoneEvent ✓
3. Passed through SSE ✓
4. **BUT never populated by any code!**

---

## Summary of Gaps

| Gap | Location | Impact |
|-----|----------|--------|
| No query parsing for counts | Missing entirely | Critical |
| No count in system prompt | `kodaAnswerEngineV3.ts:getQuestionTypeInstructions()` | High |
| No bullet count validator | `kodaFormattingPipelineV3.ts` | Critical |
| No table structure validator | `kodaFormattingPipelineV3.ts` | Critical |
| No format repair logic | Missing entirely | Critical |
| ResponseConstraints never populated | `kodaOrchestratorV3.ts` | Medium |

---

## Next: FORMAT_ROOT_CAUSE.md

See accompanying document for specific failure examples and root cause analysis.
