# Spreadsheet Indexing Map

## Date: 2026-01-15

## Executive Summary

Excel files ARE correctly indexed with column headers in chunk content and metadata. The problem is **retrieval matching** - "July" doesn't match "Jul-2024" in BM25 or vector search.

---

## Current XLSX Indexing Flow

### File: `src/services/ingestion/excelProcessor.service.ts`

### Step 1: Column Header Extraction (lines 219-237)
```typescript
const columnHeaders: Map<number, string> = new Map();
const headerRowNum = range.s.r; // Usually row 0 (first row)

for (let colNum = range.s.c; colNum <= range.e.c; colNum++) {
  const cellAddress = XLSX.utils.encode_cell({ r: headerRowNum, c: colNum });
  const cellValue = sheetValues[cellAddress];
  // ... extract header text
  if (headerText) {
    columnHeaders.set(colNum, headerText);
  }
}
```

### Step 2: Row Chunk Creation (lines 297-317)
Each row becomes a chunk with headers in the content:
```typescript
const cellTexts = rowCells.map((cellData, idx) => {
  const cellRef = XLSX.utils.decode_cell(cellData.cell);
  const colHeader = columnHeaders.get(cellRef.c);

  // Format with column header if available
  const prefix = colHeader ? colHeader : cellData.cell;
  return `${prefix}: ${cellData.value}`;
});
```

### Step 3: Metadata Storage (line 354)
Headers stored in chunk metadata:
```typescript
metadata: {
  tableHeaders: [...columnHeaders.values()],  // ["Jul-2024", "Aug-2024", ...]
  rowLabel: rowLabel,  // e.g., "EBITDA"
}
```

---

## Example: How a Spreadsheet is Indexed

**Input Spreadsheet:**
| Category | Jul-2024 | Aug-2024 | Sep-2024 |
|----------|----------|----------|----------|
| Revenue  | $100,000 | $120,000 | $115,000 |
| EBITDA   | $20,000  | $25,000  | $22,000  |

**Generated Chunks:**

**Chunk 1 (Row 1 - Headers):**
```
content: "Sheet 1 'Revenue', Row 1: Category: Category | Jul-2024: Jul-2024 | Aug-2024: Aug-2024 | Sep-2024: Sep-2024"
metadata: {
  tableHeaders: ["Category", "Jul-2024", "Aug-2024", "Sep-2024"],
  rowNumber: 1
}
```

**Chunk 2 (Row 2 - Revenue):**
```
content: "Sheet 1 'Revenue', Row 2 (Revenue): Category: Revenue | Jul-2024: $100,000 | Aug-2024: $120,000 | Sep-2024: $115,000"
metadata: {
  tableHeaders: ["Category", "Jul-2024", "Aug-2024", "Sep-2024"],
  rowLabel: "Revenue",
  rowNumber: 2
}
```

**Chunk 3 (Row 3 - EBITDA):**
```
content: "Sheet 1 'Revenue', Row 3 (EBITDA): Category: EBITDA | Jul-2024: $20,000 | Aug-2024: $25,000 | Sep-2024: $22,000"
metadata: {
  tableHeaders: ["Category", "Jul-2024", "Aug-2024", "Sep-2024"],
  rowLabel: "EBITDA",
  rowNumber: 3
}
```

---

## The Problem: Query → Index Mismatch

### User Query:
"How much revenue in July?"

### BM25 Search (Postgres full-text):
```sql
to_tsvector('simple', dc.text) @@ plainto_tsquery('simple', 'July')
```

**Result**: NO MATCH because:
- Query term: "July"
- Indexed content: "Jul-2024"
- Postgres tokenizes "Jul-2024" as "Jul" + "2024"
- "July" ≠ "Jul"

### Vector Search (Embeddings):
- Query embedding: "July" → [0.12, -0.34, ...]
- Indexed embedding: "Jul-2024" → [0.08, -0.29, ...]
- Semantic similarity: ~0.6 (not strong enough)

---

## Solution: Month Alias Normalization

### Approach: Query Expansion
When user queries contain month names, expand the query to include all variants:

| User Says | Expand To |
|-----------|-----------|
| July | July, Jul, Jul-2024, Jul-2025, 07-2024, 07/2024 |
| Janeiro | Janeiro, Jan, Jan-2024, 01-2024, January |
| Julho | Julho, Jul, Jul-2024, July |

### Implementation Location
**File**: `src/services/core/monthNormalization.service.ts` (NEW)

```typescript
interface MonthAliases {
  en: string[];  // ["January", "Jan", "01"]
  pt: string[];  // ["Janeiro", "Jan", "01"]
  es: string[];  // ["Enero", "Ene", "01"]
}

const MONTH_ALIASES: MonthAliases[] = [
  { en: ["January", "Jan"], pt: ["Janeiro", "Jan"], es: ["Enero", "Ene"] },
  { en: ["February", "Feb"], pt: ["Fevereiro", "Fev"], es: ["Febrero", "Feb"] },
  // ... all 12 months
  { en: ["July", "Jul"], pt: ["Julho", "Jul"], es: ["Julio", "Jul"] },
  // ...
];

function expandMonthQuery(query: string, language: string): string {
  // Find month mentions in query
  // Expand to include variants + year suffixes
  // Return augmented query for BM25
}
```

### Integration Point
**File**: `src/services/retrieval/kodaHybridSearch.service.ts`

Before BM25 search (line 204):
```typescript
// MONTH FIX: Expand month terms in query
const expandedQuery = expandMonthQuery(queryText, filters.language || 'en');
```

---

## Implementation Complete

### Files Created/Modified

| File | Change |
|------|--------|
| `src/services/core/monthNormalization.service.ts` | **NEW** - Month alias expansion service (506 lines) |
| `src/services/retrieval/kodaHybridSearch.service.ts` | Added import and month expansion call in bm25Search() |
| `src/services/core/index.ts` | Added export for monthNormalization service |
| `src/tests/monthNormalization.test.ts` | **NEW** - 28 unit tests |

### Key Changes in `kodaHybridSearch.service.ts`

1. **Import** (line 17):
```typescript
import { expandMonthQuery, hasMonthReference } from '../core/monthNormalization.service';
```

2. **Month Expansion** (lines 207-222):
```typescript
let searchText = queryText;
if (hasMonthReference(queryText)) {
  const expandedQuery = expandMonthQuery(queryText);
  const monthVariants = expandedQuery.slice(queryText.length).trim().split(/\s+/).slice(0, 20);
  if (monthVariants.length > 0) {
    searchText = `${queryText} OR ${monthVariants.join(' OR ')}`;
  }
}
```

3. **SQL Change**: `plainto_tsquery` → `websearch_to_tsquery` for OR support

### Supported Excel Header Patterns

The month normalization service handles ALL common patterns:

| Pattern Type | Examples |
|--------------|----------|
| Full names | "January", "January 2024", "Janeiro", "Enero" |
| Abbreviations | "Jan", "Jan-2024", "Jan24", "Jan-24", "Jan '24" |
| Numeric | "01-2024", "1/2024", "01/24", "2024-01", "2024/01" |
| Period notation | "M1", "M01", "Month 1", "Period 1" |
| Fiscal year | "FY24-Jan", "FY2024 Q1" |
| Quarter | "Q1", "Q1-2024", "1Q24" |
| Half year | "H1", "H1 2024" |

---

## Verification

After fix, query "How much revenue in July?" should:
1. Detect month reference "July"
2. Expand to OR-based search: `"July OR Jul OR Jul-2026 OR Jul-2025 OR Jul26 OR..."`
3. BM25 using `websearch_to_tsquery` matches "Jul-2024" column headers
4. Return chunks with July data

### Test Results

```
MonthNormalizationService
  ✓ 28 tests passed
  - hasMonthReference: 5 tests
  - expandMonthQuery: 7 tests
  - extractMonthNumbers: 5 tests
  - normalizeMonthHeader: 7 tests
  - edge cases: 4 tests
```
