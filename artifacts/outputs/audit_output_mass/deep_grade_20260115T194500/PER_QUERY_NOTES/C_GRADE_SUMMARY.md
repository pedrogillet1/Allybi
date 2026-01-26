# C-Grade Queries Summary

**Count:** 16 queries
**Common Issue:** Incomplete/hedging answers or wrong document retrieval

---

## C-Grade Query List

| ID | Query | Primary Issue | Fix Category |
|----|-------|---------------|--------------|
| q07 | "Por que 'poucos repositores' vira problema..." | Incomplete explanation | answer_depth |
| q11 | "Qual foi o EBITDA de julho de 2024..." | Hedges "não vejo" when data exists | month_mapping |
| q12 | "Qual mês teve o maior EBITDA..." | Wrong docs (not P&L) | retrieval |
| q13 | "Em quais meses de 2024 houve prejuízo..." | Incomplete months list | retrieval_depth |
| q15 | "O net income total do ano de 2024..." | Hedges + wrong field name | month_mapping |
| q17 | "Se eu tivesse que explicar esse P&L..." | Generic P&L definition | retrieval_relevance |
| q19 | "Qual é o 'Step 1' que o guia recomenda?" | Wrong doc (Scrum not Guide) | memory_lastDocIds |
| q22 | "Why does a multi-pass generation..." | Generic, no guide ref | retrieval_relevance |
| q26 | "What was the worst net income month..." | No month name identified | month_mapping |
| q31 | "Considerando stakeholders e riscos..." | Too verbose | format_length |
| q35 | "I need a one-slide summary..." | PT terms + verbose | language + format |
| q36 | "Julho foi um outlier?" | Wrong docs (follow-up) | memory_lastDocIds |
| q43 | "What's the EBITDA in November 2024..." | No Nov data found | month_mapping |
| q46 | "Qual é o objetivo do projeto?" | Hedges "não vejo" | answer_depth |
| q47 | "Can you explain perishability..." | Generic explanation | answer_depth |
| q50 | "Me dá uma resposta 'de chat'..." | Too formal (not chat) | answer_style |

---

## Root Cause Breakdown

| Root Cause | Count | Queries |
|------------|-------|---------|
| Month column mapping | 4 | q11, q15, q26, q43 |
| Answer depth/hedging | 4 | q07, q46, q47, q13 |
| Memory/lastDocIds | 3 | q19, q22, q36 |
| Retrieval relevance | 2 | q12, q17 |
| Format/verbosity | 2 | q31, q35 |
| Answer style | 1 | q50 |

---

## Fixes to Upgrade C→A

### Priority 1: Month Column Mapping (4 queries)

**File:** `monthNormalization.service.ts`

The spreadsheet has month data but columns aren't mapped to month names. Fix:
```typescript
function mapColumnToMonth(colIndex: number): string | null {
  const monthMap = {
    0: 'January', 1: 'February', 2: 'March', 3: 'April',
    4: 'May', 5: 'June', 6: 'July', 7: 'August',
    8: 'September', 9: 'October', 10: 'November', 11: 'December'
  };
  return monthMap[colIndex] || null;
}
```

### Priority 2: Remove Hedging Patterns (4 queries)

**File:** `kodaAnswerEngineV3.ts`

Add post-processing to remove unnecessary hedging when data exists:
- Remove "Não vejo" when answer contains data
- Remove "I don't see" when facts are cited
- Increase depth for analytical questions

### Priority 3: Fix lastDocumentIds Boost (3 queries)

**File:** `kodaRetrievalEngineV3.ts`

Apply score boost to chunks from previous turn's documents:
```typescript
if (lastDocumentIds.includes(chunk.documentId)) {
  chunk.score *= 1.5;
}
```

---

## Expected Upgrade Path

With the 3 priority fixes above:
- q11, q15, q26, q43 → B or A (month mapping)
- q07, q13, q46, q47 → B or A (hedging removal)
- q19, q22, q36 → B or A (lastDocIds)
- Remaining 4 queries need style/format tuning
