# FAIL_MAP: Quality Below-B Analysis

**Source**: `quality_50_with_context_2026-01-15T22-49-32`
**Summary**: A=8, B=22, C=19, D=0, F=1
**Goal**: Upgrade 1 F + 19 C to minimum B

---

## BUCKET 1: Spreadsheet Month/Column Mapping Failure (6 queries)

**Root Cause**: P&L spreadsheet has months as columns (A-L = Jan-Dec), but the system retrieves values without mapping column letters to month names.

| ID | Query | Current Grade | Issue |
|----|-------|--------------|-------|
| q11 | "Qual foi o EBITDA de julho de 2024 no P&L?" | C | Says "apresenta a linha EBITDA com valores" but doesn't identify July |
| q12 | "Qual mês teve o maior EBITDA em 2024? E o pior?" | C | Says "not found" - wrong doc retrieved |
| q13 | "Em quais meses de 2024 houve prejuízo?" | C | Lists values but says "não especifica os meses exatos" |
| q26 | "What was the worst net income month in 2024?" | C | Has value (-899,498.54) but "month not identified" |
| q36 | "Julho foi um outlier?" | C | Says "não há informações" - follow-up context lost |
| q43 | "What's the EBITDA in November 2024?" | C | Correctly finds -611,786.51 in column L but doesn't confirm "November" |

**Fix Required**:
- `kodaRetrievalEngineV3.service.ts`: Add spreadsheet column→month mapping in chunk metadata
- OR: `kodaAnswerEngineV3.service.ts`: Post-process to infer months from column position

---

## BUCKET 2: Follow-up Context Loss (1 query - THE ONLY F)

| ID | Query | Current Grade | Issue |
|----|-------|--------------|-------|
| q16 | "Com base nesses números, qual mês parece 'virada' do ano?" | **F** | Says "não contêm informações sobre meses" - prior P&L context completely lost |

**Root Cause**: Follow-up "nesses números" refers to P&L values from previous turns (q11-q15), but retrieval fetched wrong documents.

**Fix Required**:
- `conversationMemory.service.ts`: Store `lastDocumentIds`, `lastTopicEntities`, `lastIntent`
- `kodaRetrievalEngineV3.service.ts`: Boost `lastDocumentIds` when follow-up detected
- `routingPriority.service.ts`: Inherit `lastIntent` for pronoun-heavy queries

---

## BUCKET 3: Language Mismatch (1 query)

| ID | Query | Current Grade | Issue |
|----|-------|--------------|-------|
| q46 | "Qual é o objetivo do projeto?" (PT) | C | Response starts with "The project is currently..." (EN) |

**Root Cause**: Language enforcement not applied to all answer paths.

**Fix Required**:
- `languageEnforcement.service.ts`: Wrap final answer generation
- Apply to ALL response types including doc summaries

---

## BUCKET 4: Formatting/Completeness Issues (5 queries)

| ID | Query | Current Grade | Issue |
|----|-------|--------------|-------|
| q35 | "one-slide summary" | C | Truncated list, answer cut off mid-item |
| q38 | "checklist rápido para reduzir retrabalho" | C | Vague/generic tips, not checklist format |
| q44 | "desafios e como mitigaria cada um, em 6 linhas" | C | Didn't follow "6 linhas" constraint |
| q49 | "one-page executive memo" | C | Truncated list format |
| q14 | "Abril e maio de 2024 foram muito ruins?" | C | Partial answer, missing specifics |
| q15 | "O net income total do ano de 2024" | C | May have truncation issues |

**Fix Required**:
- `kodaFormattingPipelineV3.service.ts`: Validate list completeness
- `kodaAnswerEngineV3.service.ts`: Respect explicit length constraints in prompt

---

## BUCKET 5: Minor Quality Issues (6 queries)

These answers are mostly correct but got C due to evaluation strictness:

| ID | Query | Current Grade | Issue |
|----|-------|--------------|-------|
| q07 | "Por que 'poucos repositores' vira problema" | C | Answer is good but possibly missing depth |
| q22 | "Why does multi-pass generation produce better output" | C | Answer is correct, may need more specificity |
| q30 | "What's a 'positive' example of intangibility" | C | Answer OK, citation format might be issue |
| q42 | "Se eu for cliente durante a obra" | C | Answer is reasonable |
| q47 | "Can you explain perishability in plain English" | C | Answer is clear, may need better structure |
| q50 | "resposta 'de chat', sem cara de relatório" | C | Tried to be conversational, may have style issues |

**Fix Required**:
- Review grading criteria - these may already be B-quality
- Ensure citations are properly formatted
- Minor prompt tuning if needed

---

## PRIORITY FIX ORDER

### CRITICAL (Fixes F and upgrades to B immediately)
1. **Follow-up context inheritance** - Fixes q16 (F) and helps q12, q36
2. **Language enforcement on all paths** - Fixes q46

### HIGH (Upgrades C to B)
3. **Month/column mapping for spreadsheets** - Fixes q11, q13, q26, q43
4. **List formatting validation** - Fixes q35, q38, q44, q49

### MEDIUM (Polish)
5. **Minor citation/structure improvements** - Helps remaining Cs

---

## FILES TO MODIFY

| File | Changes |
|------|---------|
| `conversationMemory.service.ts` | Add lastDocumentIds, lastTopicEntities, lastIntent |
| `kodaRetrievalEngineV3.service.ts` | Boost prior docs on follow-up |
| `routingPriority.service.ts` | Inherit intent for pronoun queries |
| `languageEnforcement.service.ts` | Apply to ALL response paths |
| `kodaFormattingPipelineV3.service.ts` | List completeness validation |
| `kodaAnswerEngineV3.service.ts` | Month mapping, length constraints |

---

## SUCCESS METRICS

- A + B = 50 (currently 30)
- C = 0 (currently 19)
- D = 0 (currently 0)
- F = 0 (currently 1)
- No empty answers
- No language mismatches
- All follow-ups reference correct context
