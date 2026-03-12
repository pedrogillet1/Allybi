# Root Cause Classification — Benchmark 51.4/100

**Date**: 2026-03-12
**Benchmark Run**: hardening-benchmark-run.json (80 queries, 8 doc groups)
**Score**: 51.4/100 FAIL

---

## Classification Key

- **PROVEN**: Root cause confirmed with exact code evidence + direct correlation to specific failing queries
- **PLAUSIBLE**: Strong circumstantial evidence + logical chain, but not directly confirmed end-to-end
- **UNPROVEN**: Hypothesized but lacks supporting evidence or contradicted by data

---

## RC1: PDF Extraction Misses Table Data (Cadastro)

**Classification: PLAUSIBLE (75%)**
**Impact**: CRITICAL — Q1-Q10 (Cadastro section, avg 20.8/100)
**Affected Queries**: 10/80 (12.5%)

### Evidence FOR
- `MIN_CHARS_PER_PAGE_THRESHOLD = 100` at `pdfExtractor.service.ts:28` — OCR only triggers when a page has <100 chars of text
- Cadastro PDF pages with TOC entries contain >100 chars of descriptive text, so OCR never triggers even if actual data is in images
- All 10 Cadastro answers are tagged `TITLE_ONLY_EXTRACTION` — system retrieves table titles/descriptions but zero numeric data values
- `pdfTableExtractor` runs as post-processing on existing text (line 597), not as an alternative extraction method
- `extractPagesSelectiveOCR()` at lines 391-403 uses purely char-count logic, no table-content awareness

### Evidence AGAINST
- No direct proof that OCR would extract IBGE census table data — the tables may be in a format that Google Vision can't parse
- No test with the actual Cadastro PDF to confirm text layer quality
- The text layer might contain the data in a format that's just not being chunked correctly

### Why Not PROVEN
We have not run OCR on the actual Cadastro PDF pages to confirm data exists in image form. The root cause could alternatively be: (a) the data IS in the text layer but chunking doesn't recognize it, or (b) the data is in a linked Excel file referenced by the PDF.

### Fix Direction
Add table-content-aware OCR trigger: pages with structural markers (Tabela/Table) but <3 numeric values should be OCR'd regardless of char count. BUT: validate on actual document first.

---

## RC2: XLS Cell Fact Extraction Gated on Financial/Temporal Keywords

**Classification: PROVEN (99%)**
**Impact**: CRITICAL — Q51-Q60 (Non-Profit section, avg 27.1/100)
**Affected Queries**: 10/80 (12.5%)

### Evidence
- `xlsxExtractor.service.ts:321`: `if (financial || temporal)` gates ALL cell fact extraction
- `FINANCIAL_KEYWORDS` (lines 33-83) contains zero social/demographic terms — "receita", "despesa", "lucro", etc. are all financial
- `isFinancialMetric()` at lines 201-204 returns `false` for social assistance entity data
- When both conditions are false: `cellFacts = []` → only generic `table_summary` chunks are emitted
- All 10 Non-Profit answers tagged `WRONG_TABLE_CONTEXT` — system returns health economics data from a different sheet instead of social assistance counts
- The `chunkAssembly.service.ts` XLSX branch (lines 136-251) processes cell facts only if `extraction.cellFacts.length > 0`

### Causal Chain
```
Tab02.xls ingested → xlsxExtractor evaluates sheets
→ isFinancialMetric() returns false (no financial keywords)
→ isTemporalColumn() returns false (no date/year headers)
→ cellFacts = [] → only table_summary chunks created
→ table_summary chunks from wrong sheet rank higher for queries
→ 10/10 answers return wrong context
```

### Fix
Remove `financial || temporal` gate. Extract cell facts for ANY sheet with ≥2 headers and ≥1 data row. Re-ingest Tab02.xls.

---

## RC3: TOC Penalty Insufficient for Large Legal Documents

**Classification: PROVEN (95%)**
**Impact**: HIGH — Q21-Q30, Q61-Q70, Q71-Q80 (Trade Act, FDCA, CARES, combined avg 53.3/100)
**Affected Queries**: ~15/80 (19%)

### Evidence
- `retrievalEngine.service.ts` line ~2660: `c.scores.final = ((c.scores.final ?? 0) * 0.35)` — 0.35× multiplier
- `looksLikeTOC()` has 6 heuristics including Portuguese patterns, but for English legal docs, TOC entries like "Sec. 301—DETERMINATIONS AND ACTIONS BY THE TRADE REPRESENTATIVE" embed with very high semantic similarity to queries about Section 301
- 0.35 × 0.95 (TOC semantic score) = 0.33, which can still outrank 0.25 (actual content semantic score from a deep section)
- No cap on TOC candidates in evidence selection — a 400-page Act can fill 5+ evidence slots with TOC entries
- Grading shows FDCA Q63, Q65, Q68, Q70 all tagged `HONEST_EMPTY` or `PARTIAL` with TOC-style evidence
- Trade Act Q27, Q29, Q30 score ≤35 — queries about specific provisions within the Act

### Why PROVEN (not just PLAUSIBLE)
Multiple query failures directly correlate: wherever a large legal document's TOC is semantically close to the query topic, content retrieval fails. The 0.35× penalty is mathematically insufficient when TOC similarity >> content similarity.

### Fix Direction
1. Strengthen penalty to 0.20× or lower
2. Cap TOC candidates to max 1 per document in evidence selection
3. Consider TOC-diversity rule: if >50% of candidates from a doc are TOC-flagged, deprioritize all of them

---

## RC4: Sentence Boundary Recovery Threshold Too High

**Classification: PROVEN (99%)**
**Impact**: HIGH — 11+ answers with broken fragments
**Affected Queries**: Q1, Q17, Q20, Q29, Q30, Q39, Q44, Q45, Q56, Q63, Q79

### Evidence
- `CentralizedChatRuntimeDelegate.ts:3906`: `if (lastPeriod > text.length * 0.3)` — requires last sentence boundary in final 70% of text
- For short outputs (e.g., 46 chars), a period at position 6 is `6/46 = 0.13 < 0.3` → recovery skipped
- Q1 answer: "the specific number... is ." — incomplete predicate ships to user
- Q30 answer: broken fragment with no complete sentence
- Q56: truncated mid-word "accoun" (110 chars total)
- 11 answers across 6 sections have `BROKEN_FORMAT` tag in grading

### Causal Chain
```
LLM output exhausts token budget → output truncated mid-sentence
→ applySentenceBoundaryRecovery() called
→ lastPeriod position < text.length * 0.3 → recovery skipped
→ broken fragment ships as final answer
→ structural_completeness gate fires but severity="warn" → not blocked
```

### Fix
Lower threshold from 0.3 to 0.15, add minimum char floor: `lastPeriod > Math.min(text.length * 0.15, 50)`

---

## RC5: Structural Completeness Gate is Warn-Only

**Classification: PROVEN (99%)**
**Impact**: HIGH — allows broken fragments to ship (compounds RC4)
**Affected Queries**: Same 11 as RC4

### Evidence
- `CentralizedChatRuntimeDelegate.ts:1210-1215`: `DEFAULT_BLOCKING_QUALITY_GATES` does NOT include `"structural_completeness"`
- `quality_gates.any.json` lines 92-112: `gateSeverityByName` does NOT include `"structural_completeness"`
- `quality_gates.any.json` lines 128-141: `reasonCodes` does NOT include `"bad_fallback_detected"`
- Gate function exists and fires correctly (verified in qualityGateRunner tests, 9/9 pass)
- But severity resolves to default `"warn"` → broken answers pass through

### Causal Chain
```
gateStructuralCompleteness fires → returns {passed: false, actionOnFail: "bad_fallback_detected"}
→ runtime resolves severity → "warn" (not in gateSeverityByName)
→ runtime logs warning but does NOT block
→ broken answer ships to user
```

### Fix
1. Add `"structural_completeness": "block"` to `gateSeverityByName` in quality_gates.any.json
2. Add `"structural_completeness"` to `DEFAULT_BLOCKING_QUALITY_GATES` in CentralizedChatRuntimeDelegate.ts
3. Add `"bad_fallback_detected": "bad_fallback_detected"` to `reasonCodes` in quality_gates.any.json
4. Verify runtime's gate-failure handler routes blocked gates to `emit_adaptive_failure_message`

---

## RC6: Evidence Packaging May Starve Single-Doc Answers

**Classification: PLAUSIBLE (60%)**
**Impact**: MEDIUM — affects queries where one document has many candidate chunks
**Affected Queries**: Likely Q27, Q29, Q72, Q74, Q75 (single-doc queries with low retrieval scores)

### Evidence FOR
- `maxEvidenceHard=36`, `maxPerDocHard=10` — large docs can produce hundreds of candidate chunks, but only 10 make it to evidence
- For a 400-page legal doc, the 10 "best" chunks may all be from the TOC or from irrelevant sections
- Evidence selection doesn't consider query-topic diversity within a single document
- Several queries tagged `HONEST_EMPTY` suggest the LLM had no useful evidence to work with

### Evidence AGAINST
- `maxPerDocHard=10` is already generous — 10 high-quality chunks should be sufficient
- The problem may be entirely explained by RC3 (TOC domination) rather than an independent packaging issue
- No direct measurement of how many useful chunks exist vs. how many make it through

### Why Not PROVEN
Could be an artifact of RC3. Need to instrument evidence selection to measure "useful chunks available but not selected" vs. "no useful chunks exist."

---

## RC7: Snippet Clipping Produces Incoherent Evidence

**Classification: PLAUSIBLE (55%)**
**Impact**: MEDIUM — evidence quality degradation
**Affected Queries**: Unknown specific queries — cross-cutting

### Evidence FOR
- `toSnippet()` truncates at 3200 chars with hard cutoff
- If a chunk's critical information is at the end and the snippet clips at 3200 chars, the LLM receives incomplete evidence
- `maxSnippetChars=2200` in evidence packaging further constrains

### Evidence AGAINST
- Most chunks are created by `splitTextIntoChunks()` which already targets ~1000-2000 chars
- 3200 char snippet limit is generous relative to typical chunk size
- No direct correlation between snippet clipping and specific query failures

### Why Not PROVEN
No instrumentation to measure how often snippet clipping removes critical information. The chunk sizes from `splitTextIntoChunks()` are typically well within the snippet limit.

---

## RC8: Static Token Budget Collision

**Classification: PARTIAL-PROVEN (70%)**
**Impact**: MEDIUM — contributes to truncation (compounds RC4)
**Affected Queries**: Q14, Q29, Q56 (tagged `TRUNCATED_OUTPUT`)

### Evidence FOR
- `tokenBudget.service.ts` lines 127-143: static budgets per answer mode — `doc_grounded_single=4800`, `doc_grounded_multi=5400`
- These budgets are for total LLM output including chain-of-thought / thinking
- For complex legal questions requiring multi-paragraph explanations, 4800 tokens may be insufficient
- 3 answers explicitly tagged `TRUNCATED_OUTPUT` in grading

### Evidence AGAINST
- 4800 tokens ≈ 3600 words — should be sufficient for most answers
- Truncation could be caused by the model's own stop token rather than budget exhaustion
- No `finishReason` data to distinguish budget-exhaustion from model-stop

### Why PARTIAL-PROVEN
The static budgets are confirmed in code and the truncation is confirmed in output. What's missing is proof that the budget caused the truncation (vs. other causes like model stop token).

---

## RC9: Missing finishReason Propagation

**Classification: PLAUSIBLE (50%)**
**Impact**: LOW-MEDIUM — prevents distinguishing truncation from completion
**Affected Queries**: Cross-cutting diagnostic issue

### Evidence FOR
- Truncated outputs exist (RC4, RC8) but the runtime doesn't know WHY they're truncated
- If `finishReason` were propagated, the runtime could detect `max_tokens` and trigger retry/recovery

### Evidence AGAINST
- The runtime already has sentence boundary recovery (RC4) as a post-hoc fix
- Adding finishReason detection is a diagnostic improvement, not a direct fix for score

### Impact Assessment
This is a diagnostic gap, not a direct score-impact root cause. Fixing RC4 and RC5 addresses the symptom. finishReason propagation would prevent future regressions.

---

## Summary Matrix

| RC | Classification | Confidence | Impact | Queries | Fix Complexity |
|----|---------------|-----------|--------|---------|---------------|
| RC1 | PLAUSIBLE | 75% | CRITICAL | Q1-Q10 | HIGH — needs validation |
| RC2 | PROVEN | 99% | CRITICAL | Q51-Q60 | LOW — one line change + re-ingest |
| RC3 | PROVEN | 95% | HIGH | ~15 queries | MEDIUM — penalty tuning + cap |
| RC4 | PROVEN | 99% | HIGH | 11 queries | LOW — threshold change |
| RC5 | PROVEN | 99% | HIGH | 11 queries | LOW — config + set addition |
| RC6 | PLAUSIBLE | 60% | MEDIUM | ~5 queries | MEDIUM — needs instrumentation |
| RC7 | PLAUSIBLE | 55% | MEDIUM | Unknown | LOW — but uncertain payoff |
| RC8 | PARTIAL-PROVEN | 70% | MEDIUM | 3 queries | LOW — budget increase |
| RC9 | PLAUSIBLE | 50% | LOW-MEDIUM | Diagnostic | MEDIUM — LLM client changes |

## Priority Order (by expected score impact)

1. **RC2** (PROVEN, CRITICAL) — Fix first, highest certainty, lowest risk
2. **RC3** (PROVEN, HIGH) — Fix second, affects 3 sections
3. **RC4 + RC5** (PROVEN, HIGH) — Fix together, eliminates broken fragments
4. **RC1** (PLAUSIBLE, CRITICAL) — Validate before fixing, highest payoff if confirmed
5. **RC8** (PARTIAL-PROVEN, MEDIUM) — Quick fix, low risk
6. **RC6** (PLAUSIBLE, MEDIUM) — Instrument before fixing
7. **RC9** (PLAUSIBLE, LOW) — Diagnostic improvement, defer
8. **RC7** (PLAUSIBLE, MEDIUM) — Likely not impactful, defer
