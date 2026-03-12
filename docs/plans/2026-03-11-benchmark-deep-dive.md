# 88.3/100 → A+ Deep Dive: Root Cause Analysis of Every Non-A+ Query

**Date**: 2026-03-11
**Benchmark**: 89-query, 9 documents, grading v3.2
**Score**: 88.3/100 (B+ strong), 50 A+, 6 A, 3 B, 18 C, 11 D, 1 F

---

## Executive Summary

39 of 89 queries scored below A+. Tracing every failure to its root file reveals **5 systemic issues** responsible for 95% of the penalty points:

| Root Cause | Queries Hit | Penalty Impact | Fix Difficulty |
|------------|-------------|----------------|----------------|
| 1. Evidence starvation → short/incomplete answers | 24 | ~480 pts lost | Medium |
| 2. Missing inline citations for spreadsheet data | 6 | ~156 pts lost | Easy |
| 3. Profile misrouting → wrong output budget | 8 | ~160 pts lost | Medium |
| 4. No table-format enforcement for explicit requests | 3 | ~66 pts lost | Easy |
| 5. Weak hedging for scanned/OCR documents | 3 | ~45 pts lost | Easy |

**Projected score after fixes**: 93-95/100 (A grade, Silver gate)

---

## Part 1: Issue-by-Issue Root Cause Trace

### 1. INCOMPLETE_LIST — 15 queries (biggest single issue)

**Affected**: Q7, Q14, Q25, Q29, Q34, Q36, Q39, Q45, Q52, Q59, Q81, Q82, Q84, Q85, Q89

**Symptom**: Answers enumerate partial lists. Many cut off mid-sentence with trailing `(p.` — the LLM started a citation but ran out of tokens.

**Evidence from actual answers**:
- Q7 (462 ch): "four such segments, but only these two are detailed" — LLM explicitly says it can't see the other two
- Q14 (304 ch): Ends `(p.` — mid-citation truncation
- Q45 (154 ch): Ends `XML (p.` — mid-citation truncation
- Q52 (93 ch): "The uses of capital for each project and the total portfolio are as follows (p." — LLM started but had nothing to write
- Q59 (1223 ch): "Missing Information for Underwriting:" section header with NO content after it

**Root cause chain**:

```
Evidence snippets too short (maxSnippetChars: 600)
  → LLM only sees partial content from each evidence chunk
    → LLM can only enumerate what it sees
      → Answer is "incomplete" by grading rubric standards
```

AND separately:

```
LLM hits maxOutputTokens before completing enumeration
  → tokenBudget.service resolveBaseBudget() returns base budget
    → For doc_grounded_multi: base is 4800 tokens, but complexity boost is only +250/+500
      → LLM generation terminates mid-sentence
        → Answer ends with "(p." or trailing colon
```

**Root files**:
| File | Line | What it does | Problem |
|------|------|-------------|---------|
| `llm_builder_policy.any.json` | config.evidenceCapsByMode | Limits evidence chars/items per mode | Even at 2x, maxSnippetChars=600 truncates long passages |
| `llmRequestBuilder.service.ts` | ~1030-1046 | Renders evidence into prompt | `maxSnippetChars` cuts snippets, losing enumerable items |
| `tokenBudget.service.ts` | 144-159 | `resolveBaseBudget()` | Base budget for extraction queries same as general queries |
| `retrievalEngine.service.ts` | snippet generation | `toSnippet()` truncates to 2000 chars | Chunks may contain 10 items but snippet only shows 5 |
| `answer_style_policy.any.json` | profiles.standard.budget | maxBullets: 8 for standard profile | Many queries land on "standard" with only 8 bullet slots |

**Fix priorities**:
1. **Raise maxSnippetChars for extraction queries**: When `isExtractionQuery=true`, use 1200 chars instead of 600
2. **Raise base token budget for extraction**: Add extraction detection in `resolveBaseBudget()` — +800 tokens for queries with extraction signals
3. **Ensure extraction queries get "detailed" or "deep" profile**: Profile selection rule `table_or_numeric_request` only triggers on `numericIntentStrong` — extraction queries ("Extract all...", "List every...") don't match this rule

---

### 2. BELOW_MIN_LENGTH — 9 queries

**Affected**: Q3, Q18, Q21, Q24, Q25, Q50, Q52, Q73, Q83

**Symptom**: Answers are factually correct but too short for the grading rubric's minimum length threshold.

**Evidence from actual answers**:
- Q21 (189 ch): Correct billing summary with all 4 fields — but grader wants 300+ chars
- Q83 (143 ch): "Total are 2,442,726 (Row 4). The the total registered live births for 'Brasil (1)' or 'Norte'." — garbled sentence, clearly LLM generation error
- Q50 (256 ch): Lists 5 action-plan fields correctly — but grader wants contextual explanation
- Q73 (272 ch): "The how the reserve base is calculated for demand deposits." — garbled META_NON_ANSWER, LLM failed to generate

**Root cause chain**:

```
Two distinct failure modes:

Mode A — Terse correct answers (Q21, Q50):
  Profile selection → "standard" or "concise"
    → LLM generates minimal response because evidence is clear/simple
      → No prompt instruction to "elaborate" or "explain in context"
        → Grader penalizes brevity

Mode B — LLM generation failures (Q73, Q83, Q52):
  Evidence snippet doesn't contain the answer OR is too truncated
    → LLM starts a sentence but can't complete it
      → Output is garbled/incomplete (e.g., "The how the reserve base...")
        → This is actually evidence starvation manifesting as garbled output
```

**Root files**:
| File | Line | Problem |
|------|------|---------|
| `rag_policy.any.json` | Point #11 | Says "address ALL parts" but doesn't say "elaborate with context" |
| `task_answer_with_sources.any.json` | doc_grounded instructions | No minimum-effort instruction for simple queries |
| `answer_style_policy.any.json` | profileSelection rules | No rule for "extraction with required fields" → defaults to standard |
| `retrievalEngine.service.ts` | Evidence retrieval | Key data not surfacing in snippets (Q73: reserve base formula not in top snippets) |

**Fix priorities**:
1. **Add RAG policy instruction**: "When the question asks for specific fields (dates, amounts, identifiers), provide each field AND its context/meaning, not just the raw value"
2. **Improve snippet relevance**: Q73's evidence clearly didn't contain the reserve base calculation formula — either the chunk wasn't retrieved or the snippet was too short
3. **Profile routing for "required fields" queries**: Queries asking "Give a full summary with X, Y, Z" should get "detailed" profile

---

### 3. MISSING_KEY_FACTS — 6 queries

**Affected**: Q6, Q13, Q26, Q36, Q73, Q85

**Symptom**: Answer misses gold facts that the grading spec requires.

**Evidence from actual answers**:
- Q6 (709 ch): Lists 6 grid services but misses specific ones the spec requires (e.g., frequency regulation, voltage support)
- Q13 (872 ch): Lists 8 metrics but misses some the spec requires (e.g., CAC payback, revenue per employee)
- Q26 (462 ch): Lists identifiers but misses some dates and dollar amounts
- Q85 (770 ch): Lists 14 rows of 2024 data but misses several visible rows

**Root cause chain**:

```
Gold facts exist in the document but NOT in the evidence snippets
  → Pinecone retrieval returns top-K chunks ranked by semantic similarity
    → Some relevant chunks rank lower and get excluded by maxItems cap
      → LLM never sees the chunk containing the gold fact
        → Answer is correct for what the LLM saw, but incomplete vs. full document
```

**Root files**:
| File | Line | Problem |
|------|------|---------|
| `llm_builder_policy.any.json` | evidenceCapsByMode.maxItems | Even at 14, some docs have 20+ relevant chunks |
| `retrievalEngine.service.ts` | Scoring weights | Semantic weight 0.52 may miss chunks that are lexically relevant |
| `prismaRetrievalAdapters.service.ts` | Pinecone topK | topK multiplier determines how many candidates enter the pipeline |
| `llmRequestBuilder.service.ts` | renderEvidenceForPrompt | maxSectionChars limits total evidence context |

**Fix priorities**:
1. **Increase maxItems for extraction queries**: When `isExtractionQuery=true`, allow 20+ items
2. **Increase Pinecone topK for extraction**: The topK multiplier (currently 6x) should be higher for "extract all" queries
3. **Consider chunk merging**: Adjacent chunks from the same document could be merged to reduce item count while preserving content

---

### 4. NO_INLINE_CITATIONS — 6 queries (ALL from Tabela 1.1)

**Affected**: Q84, Q85, Q86, Q88, Q89, Q25

**Symptom**: Answers reference "Row 92" or "Row 4" instead of "(p. 1)" — grader expects `(p. N)` format.

**Evidence from actual answers**:
- Q84: Uses "Row 42", "Row 43" throughout — no page references
- Q85: Uses "Row in sheet" column — technically a location ref but not `(p. N)` format
- Q86: "Row **92**" — no page number
- Q88: "Sheet row" column — row references, not page references
- Q89: No citations at all

**Root cause chain**:

```
Spreadsheet data (XLSX) doesn't have "pages"
  → Evidence snippets have location.sheet but not location.page
    → LLM correctly uses "Row N" as the locator
      → Grader checks for "(p. N)" pattern specifically
        → Row references don't pass the citation check
```

AND:

```
RAG policy says "cite page numbers, section headers, article numbers"
  → No instruction for spreadsheet row/cell references
    → LLM uses Row N informally without consistent citation format
      → Some answers omit even Row references
```

**Root files**:
| File | Line | Problem |
|------|------|---------|
| `rag_policy.any.json` | Point #10 | Says "page numbers, section headers" — no mention of row/cell refs for spreadsheets |
| `task_answer_with_sources.any.json` | citation instructions | Only mentions "(p. 2)", "per Article 48" — no spreadsheet format |
| `llmRequestBuilder.service.ts` | ~1063-1067 | Location rendering: includes `page`, `slide`, `sheet` but evidence ID format varies |
| `grade-99-query.mjs` | citation check | Grader may be overly strict about `(p. N)` format |

**Fix (two-part)**:
1. **RAG policy**: Add "For spreadsheet/tabular data, cite the sheet name and row numbers inline, e.g., '(Sheet 1, Row 42)' or '(Row 42)'"
2. **Grader update**: Accept `(Row N)`, `(sheet:X, Row N)` as valid inline citations for XLSX sources

---

### 5. SHORT_WITH_REQUIRED_FIELDS — 5 queries

**Affected**: Q18, Q21, Q24, Q83, Q86

**Symptom**: Answer addresses the question correctly but is too terse when the spec defines required output fields.

This is a sub-case of BELOW_MIN_LENGTH. Q21 (189 ch) correctly lists all 4 billing fields but as a compact bullet list. The grader wants a paragraph-style explanation.

**Root cause**: Same as BELOW_MIN_LENGTH Mode A — no prompt instruction to "elaborate" for factual extraction queries. The LLM is efficient and terse when evidence is clear.

**Fix**: Add RAG policy instruction: "When providing a structured extraction (billing summary, fact sheet, field extraction), include a brief contextual sentence for each field, not just the raw value."

---

### 6. MISSING_CATEGORIZATION — 5 queries

**Affected**: Q19, Q27, Q40, Q43, Q63

**Symptom**: Comparison or interpretive answers don't group findings into categories (e.g., "Strengths vs Weaknesses", "Supported vs Unsupported").

**Root cause chain**:

```
answer_style_policy.blockPlanner doesn't include a "categorization" block
  → No prompt instruction to categorize findings
    → LLM produces a flat list instead of grouped analysis
```

**Root files**:
| File | Line | Problem |
|------|------|---------|
| `answer_style_policy.any.json` | blockPlanner.plansByProfile | No "categorize" block in any plan |
| `rag_policy.any.json` | No categorization instruction | Comparison queries should prompt "group by strength/weakness/risk" |
| `task_answer_with_sources.any.json` | No categorization instruction | Missing for interpretive_grounded query type |

**Fix**: Add RAG policy instruction: "For comparison, evaluation, or assessment queries, organize your answer into clear categories (e.g., Strengths / Weaknesses / Risks, or Supported / Suggested / Unconfirmed)."

---

### 7. MISSING_TABLE — 3 queries

**Affected**: Q5, Q60, Q64

**Symptom**: Query explicitly asks for a table (Q60: "Put into a structured table: asset | location | ...") but answer is prose/bullets.

**Evidence from actual answers**:
- Q5 (757 ch): Comparison query — gets two bullet sections instead of a table
- Q60 (1062 ch): "Put the full one-page summary into a structured table" → gets semi-structured text with `**Asset**: ...; **Location**: ...;` format, NOT a markdown table
- Q64 (484 ch): SIPOC model → gets bullet list instead of the 5-column SIPOC table

**Root cause chain**:

```
Profile selection for Q60:
  User says "put into a structured table"
    → Signal detection: does `signals.userAskedForTable` fire?
      → If not: profile defaults to "standard" which doesn't force table block
        → LLM prompt doesn't include table formatting instruction
          → LLM chooses prose/bullets
```

AND:

```
Even when table block is in plan, LLM may ignore it
  → System prompt says "include table" but LLM decides format
    → No HARD enforcement that table queries MUST produce GFM table
      → Enforcer doesn't ADD tables, only validates/repairs existing ones
```

**Root files**:
| File | Line | Problem |
|------|------|---------|
| `answer_style_policy.any.json` | profileSelection.table_or_numeric_request | Only triggers on `numericIntentStrong` — Q60 is structural not numeric |
| `answer_style_policy.any.json` | blockPlanner.formatConstraints.ifUserAsksForTable | Depends on `signals.userAskedForTable` being set — may not fire for all phrasings |
| `CentralizedChatRuntimeDelegate.ts` | Signal detection | `userAskedForTable` regex may not match "put into a structured table" |
| `rag_policy.any.json` | No table enforcement | No instruction like "If the user requests a table, you MUST respond with a GFM markdown table" |

**Fix**:
1. **RAG policy**: Add "If the user explicitly asks for a table, a comparison, or uses column headers like 'X | Y | Z', you MUST respond with a properly formatted GitHub Flavored Markdown (GFM) table. Never respond with prose or bullets when a table is explicitly requested."
2. **Signal detection**: Broaden `userAskedForTable` regex to match patterns like "put into a table", "structured table", "side-by-side table"

---

### 8. META_NON_ANSWER — 2 queries (most damaging per query)

**Affected**: Q18 (49 pts), Q24 (39 pts — only F in entire run)

**Symptom**: LLM describes what the document contains instead of answering the question, OR says "information not available."

**Evidence from actual answers**:
- Q18 (143 ch): "The provided investor deck the planned use of funds split. Therefore, it is not possible to infer the strategic priorities based on fund allocation from the available information." — Garbled first sentence + abstention
- Q24 (190 ch): "The current total amount due is $98.49 (p. 1). The amount of the last bill is not provided in the available information, so a comparison and explanation of the difference cannot be made." — But Q25's answer shows "Your last bill | $137.08" IS in the evidence!

**Root cause chain for Q24**:

```
Q24 asks "Compare the last bill amount with the current amount"
  → Evidence snippets for THIS query don't include the "last bill" line item
    → But Q25 (different query, same doc) DOES get that evidence
      → Retrieval is query-dependent: Q24's embedding doesn't match "last bill" chunk
        → LLM correctly says "not provided" — but the data IS in the document
          → This is a retrieval failure, not an LLM failure
```

**Root cause chain for Q18**:

```
Q18 asks "How is the planned use of funds split?"
  → The deck may not have an explicit fund allocation slide
    → Or: the relevant chunk didn't rank high enough in retrieval
      → LLM can't find it → garbled abstention
        → The garbled first sentence ("The provided investor deck the planned use of funds split")
           suggests the LLM started generating but the evidence didn't support completion
```

**Root files**:
| File | Line | Problem |
|------|------|---------|
| `retrievalEngine.service.ts` | Semantic search | Query "compare the last bill" doesn't retrieve the "last bill $137.08" chunk |
| `rag_policy.any.json` | Point #11 | Says "address ALL parts" but allows abstention with "state explicitly what's missing" |
| `task_answer_with_sources.any.json` | Abstention policy | Allows "not enough information" response — correct behavior but grader penalizes |

**Fix**:
1. **Conversation-level evidence accumulation**: When queries use the same conversation + document, evidence from prior queries should remain available (Q25 found the data that Q24 needed)
2. **RAG policy**: "Before saying information is 'not available' or 'not provided', verify that ALL evidence snippets have been checked. If partial information exists, provide what you can and note only the specific missing piece."

---

### 9. FALSE_CERTAINTY_ON_SCAN — 3 queries (Breguet only)

**Affected**: Q32, Q33, Q40

**Symptom**: LLM makes confident claims about dates, places, and identifiers from a partially legible scanned document.

**Root files**:
| File | Problem |
|------|---------|
| `rag_policy.any.json` | No OCR confidence hedging instruction |
| `task_answer_with_sources.any.json` | No "scanned document" handling |

**Fix**: Add RAG policy instruction: "For scanned or OCR-processed documents, qualify uncertain readings with hedging language like 'appears to show', 'partially legible as', or 'the text seems to read'. Never present OCR-uncertain text as definitive fact."

---

### 10. INTERNAL_CONTRADICTION — 2 queries

**Affected**: Q32 (Breguet dates), Q24 (ATT last bill) — plus cross-query contradiction groups

**Root cause**: Same document queried multiple times in same conversation. Different retrieval results per query → different evidence → LLM produces inconsistent claims across answers.

**Fix**: Evidence consistency layer — when multiple queries target the same document in the same session, resolved facts should be cached and reused.

---

### 11. HIGH_LATENCY / VERY_HIGH_LATENCY — 6 queries

**Affected**: Q36, Q53, Q54, Q60 (HIGH), Q20, Q40 (VERY HIGH)

All >14s. Root cause: more evidence tokens + complex reasoning = longer Gemini processing. The 2x evidence increase amplifies this.

**Mitigation**: Not a code fix — this is a cost/quality tradeoff. Could add evidence-aware timeout that falls back to draft model for very high latency.

---

### 12. Minor Issues (1-2 queries each)

| Issue | Query | Root Cause | Fix |
|-------|-------|-----------|-----|
| TRUNCATED | Q36 | 3866 ch answer marked truncated — hit LLM maxOutputTokens | Raise doc_grounded_table base budget |
| WALL_OF_TEXT | Q41 | 986 ch with insufficient breaks | Enforcer wall-of-text guard threshold (350 ch) may not fire for shorter walls |
| VERY_SHORT | Q52 | 93 ch — LLM generation failure | Evidence starvation (see Issue #1) |
| TABLE_EMPTY_CELLS | Q81 | Table has empty geography type cells | LLM should fill with "—" not leave empty |
| WEAK_CITATIONS | Q87 | Citations present but generic | LLM uses "if present" hedging instead of definitive page refs |
| UNANCHORED_STATISTIC | Q85, Q89 | Numbers without source attribution | RAG policy should require every number to have a page/row ref |

---

## Part 2: Pipeline Bottleneck Map

```
User Query
  │
  ▼
┌─────────────────────────────────┐
│ Retrieval Engine                │ ◄── BOTTLENECK A: topK too low for extraction
│ - Pinecone semantic search      │     queries, missing relevant chunks
│ - Scoring: 0.52s + 0.22l + 0.14│
│ - maxItems: 10-14               │
│ - minFinalScore filtering       │
└──────────┬──────────────────────┘
           │
           ▼
┌─────────────────────────────────┐
│ LLM Request Builder             │ ◄── BOTTLENECK B: maxSnippetChars=600 truncates
│ - Evidence rendering            │     evidence; extraction queries get same budget
│ - maxSnippetChars: 500-800      │     as simple Q&A queries
│ - maxSectionChars: 7000-14000   │
│ - totalPayloadChars: 32000      │
└──────────┬──────────────────────┘
           │
           ▼
┌─────────────────────────────────┐
│ Token Budget Service            │ ◄── BOTTLENECK C: base budget for extraction
│ - resolveBaseBudget(): 4800     │     same as general doc_grounded; no extraction
│ - complexity boost: +250/+500   │     boost; LLM stops generating mid-list
│ - maxOutputTokens → Gemini API  │
└──────────┬──────────────────────┘
           │
           ▼
┌─────────────────────────────────┐
│ Gemini LLM Generation           │
│ - Generates answer using        │
│   evidence + prompt + budget    │
│ - May stop early if evidence    │
│   doesn't support completion    │
└──────────┬──────────────────────┘
           │
           ▼
┌─────────────────────────────────┐
│ Response Contract Enforcer v2   │ ◄── BOTTLENECK D: bullet cap (now 14, was 7),
│ - Bullet limit: 14 (fixed)     │     char limits, paragraph splitting
│ - Char limit per mode           │     Can truncate completed answers
│ - Table repair/truncation       │
│ - Banned phrase removal         │
│ - Bolding enforcement           │
└──────────┬──────────────────────┘
           │
           ▼
┌─────────────────────────────────┐
│ Provenance Revalidation         │ ◄── BOTTLENECK E: if enforcer truncation removes
│ - Rebuilds provenance from      │     evidence-backed text, provenance fails and
│   truncated text                │     ENTIRE answer gets replaced with fallback
│ - Can REPLACE entire answer     │
└──────────┬──────────────────────┘
           │
           ▼
  Final Answer to User
```

---

## Part 3: Consolidated Fix Plan (Priority Order)

### Tier 1 — High Impact, Easy (projected +3-4 pts)

**Fix 1.1**: Update RAG policy with spreadsheet citation format
- File: `rag_policy.any.json`, point #10
- Add: "For spreadsheet data, cite row numbers inline: '(Row 42)' or '(Sheet 1, Row 42)'"
- Fixes: 6 × NO_INLINE_CITATIONS queries

**Fix 1.2**: Update RAG policy with table enforcement
- File: `rag_policy.any.json`, add new point
- Add: "If user explicitly requests a table or provides column headers, you MUST respond with a GFM markdown table"
- Fixes: 3 × MISSING_TABLE queries

**Fix 1.3**: Update RAG policy with categorization instruction
- File: `rag_policy.any.json`, add new point
- Add: "For comparison/evaluation queries, organize findings into categories"
- Fixes: 5 × MISSING_CATEGORIZATION queries

**Fix 1.4**: Add OCR hedging instruction
- File: `rag_policy.any.json`, add new point
- Add: "For scanned documents, use hedging language for uncertain readings"
- Fixes: 3 × FALSE_CERTAINTY_ON_SCAN queries

### Tier 2 — High Impact, Medium (projected +3-5 pts)

**Fix 2.1**: Add extraction-aware token budget boost
- File: `tokenBudget.service.ts`, `resolveBaseBudget()`
- Add detection for extraction queries → +800 base tokens
- Fixes: ~10 queries with INCOMPLETE_LIST and BELOW_MIN_LENGTH

**Fix 2.2**: Raise evidence limits for extraction queries
- File: `llmRequestBuilder.service.ts`, `extractionBoost`
- Already raised to 16 items / 16000 chars — verify signal detection fires
- File: `CentralizedChatRuntimeDelegate.ts` — ensure `isExtractionQuery` signal fires for "Extract all", "List every", "Break down"

**Fix 2.3**: Improve profile routing for extraction queries
- File: `answer_style_policy.any.json`, profileSelection
- Add rule: extraction/enumeration queries → "detailed" profile (maxBullets: 12)
- Currently falls through to "default_standard" (maxBullets: 8)

### Tier 3 — Medium Impact, Medium (projected +1-2 pts)

**Fix 3.1**: Broaden `userAskedForTable` signal detection
- File: `CentralizedChatRuntimeDelegate.ts` or signal detection module
- Ensure "put into a table", "structured table", "side-by-side" trigger the signal

**Fix 3.2**: RAG policy anti-abstention instruction
- Add: "Before saying info is 'not available', verify ALL evidence snippets. Provide partial answers rather than full abstentions."
- Fixes: 2 × META_NON_ANSWER

**Fix 3.3**: Evidence consistency across conversation queries
- When same doc is queried multiple times, cache resolved facts
- Fixes: 2 × INTERNAL_CONTRADICTION

---

## Part 4: Document-Level Analysis

| Document | Avg Score | Worst Issue | Root Cause |
|----------|-----------|-------------|-----------|
| Guarda Bens | 96.6 | Q64 MISSING_TABLE (74) | SIPOC should be table; profile/signal miss |
| Reserve Requirements | 96.6 | Q73 BELOW_MIN_LENGTH (69) | Evidence snippet missing formula details |
| IBGE Open Data Plan | 94.6 | Q50 BELOW_MIN_LENGTH (74) | Terse correct answer; no elaboration prompt |
| ARM Montana Arizona | 90.6 | Q52 VERY_SHORT (69) | 93 chars — total LLM generation failure |
| BESS Brazilian Market | 89.4 | Q6 MISSING_KEY_FACTS (69) | Grid services not all in top evidence |
| Breguet | 88.2 | Q36 TRUNCATED (69) | Fact sheet hit token limit; OCR hedging |
| Mayfair Investor Deck | 87.1 | Q18 META_NON_ANSWER (49) | Fund split not in evidence; garbled output |
| ATT Bill Dec2023 | 82.0 | Q24 META_NON_ANSWER (39) | Last bill amount not in this query's evidence |
| **Tabela 1.1** | **74.6** | **NO_INLINE_CITATIONS** | **Spreadsheet data uses Row refs not (p.N)** |

**Tabela 1.1 is the single worst-performing document** and is responsible for most of the Consistency penalty. All 9 queries score below A+ primarily due to NO_INLINE_CITATIONS. Fixing the citation format for spreadsheets alone would raise the benchmark ~3 points.

---

## Part 5: Grader Calibration Notes

Some penalties may be grader artifacts rather than true quality issues:

| Issue | Grader Behavior | Assessment |
|-------|----------------|------------|
| NO_INLINE_CITATIONS for XLSX | Requires `(p. N)` — XLSX has no pages | **Grader should accept (Row N)** |
| BELOW_MIN_LENGTH for Q21 | Q21 (189 ch) has all 4 required fields, factually perfect | **Grader minimum too high for factual extraction** |
| INCOMPLETE_LIST for Q82 | Lists all 11 year columns correctly in a table | **Grader may be false-positive on "incomplete"** |

Adjusting the grader to accept row-based citations for XLSX would move Tabela 1.1 from avg 74.6 → ~90+ and the overall score from 88.3 → ~91.
