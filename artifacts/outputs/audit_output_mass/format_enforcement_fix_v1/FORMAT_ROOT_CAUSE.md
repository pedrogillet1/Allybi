# FORMAT ROOT CAUSE ANALYSIS

## Problem Statement

When users request:
- "List 5 key points..." → Output may have 3, 7, or 12 bullets (not 5)
- "Create a comparison table..." → Output may be prose or bullets (not a table)
- "Em 6 tópicos..." → Output may have any number of items

**This is a deterministic enforcement failure, not an LLM prompting issue.**

---

## Root Cause A: Bullet Count Not Enforced

### Evidence: No Parsing

**Search for count extraction:**
```bash
rg "bulletCount|wantsBullets|exactBullets" backend/src
```

**Result:** Only type definitions found. No parsing logic exists.

### Evidence: System Prompt Has No Count

**File:** `kodaAnswerEngineV3.service.ts:1113-1154`

```typescript
private getQuestionTypeInstructions(questionType: QuestionType, lang: LanguageCode): string {
  const instructions: Record<string, Record<LanguageCode, string>> = {
    // ...
    LIST: {
      en: 'Present the information as a clear, organized list.',  // ← NO COUNT!
      pt: 'Apresente as informações como uma lista clara e organizada.',
      es: 'Presenta la información como una lista clara y organizada.',
    },
    // ...
  };
}
```

**Problem:** "Present as a list" ≠ "Present exactly 5 items"

### Evidence: No Post-LLM Validation

**File:** `kodaFormattingPipelineV3.service.ts:352-406`

```typescript
private normalizeBullets(text: string): string {
  // Convert * bullets to - bullets
  processed = processed.replace(/^(\s*)\*(\s+)/gm, '$1-$2');

  // Ensure single space after bullet
  processed = processed.replace(/^(\s*)-\s+/gm, '$1- ');

  // ⚠️ NO COUNT CHECKING
  // ⚠️ NO TRUNCATION
  // ⚠️ NO EXPANSION

  return processed;
}
```

### Failure Example

**Query:** "Liste os 5 principais pontos do documento"
**Expected:** Exactly 5 bullets
**Actual:** 8 bullets returned

```markdown
- Ponto 1: ...
- Ponto 2: ...
- Ponto 3: ...
- Ponto 4: ...
- Ponto 5: ...
- Ponto 6: ...  ← SHOULD NOT EXIST
- Ponto 7: ...  ← SHOULD NOT EXIST
- Ponto 8: ...  ← SHOULD NOT EXIST
```

### Root Cause Chain

```
1. Query enters system: "List 5 key points"
2. Intent engine classifies: questionType = 'LIST'
   ⚠️ Count "5" is lost here - not extracted
3. System prompt says: "Present as a list"
   ⚠️ No count instruction
4. LLM generates: 8 bullets (its best guess)
5. Formatting pipeline: Normalizes bullet style
   ⚠️ Never checks count
6. Output: 8 bullets instead of 5
```

---

## Root Cause B: Table Requirements Not Enforced

### Evidence: No Table Detection

**Search for table requirement detection:**
```bash
rg "wantsTable|tableRequired|comparison table" backend/src
```

**Result:** Only `hasSpreadsheetData` check for Excel files, nothing for user-requested tables.

### Evidence: Table Prompt Is Conditional

**File:** `kodaAnswerEngineV3.service.ts:401-412`

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// GRADE-A FIX #4: Detect spreadsheet/tabular data for table formatting
// ═══════════════════════════════════════════════════════════════════════════
const hasSpreadsheetData = documents.some((doc: any) =>
  doc.sourceType === 'excel' ||
  doc.sourceType === 'excel_table' ||
  doc.documentName?.match(/\.(xlsx?|csv)$/i) ||
  doc.filename?.match(/\.(xlsx?|csv)$/i)
);

// Table formatting only applied for spreadsheet data, NOT user requests
const tableSection = hasSpreadsheetData ? tableFormattingInstructions[lang] : '';
```

**Problem:** Table instructions only added for Excel/CSV source data, NOT when user says "create a table".

### Evidence: No Table Validation

**File:** `kodaFormattingPipelineV3.service.ts:676-691`

```typescript
private extractMetadata(text: string): {...} {
  return {
    hasCodeBlocks: /```/.test(text),
    hasTables: /\|[^\n]+\|/.test(text),  // ← Detection only, no enforcement!
    hasLists: /^[\s]*[-*\d+.]\s/m.test(text),
    // ...
  };
}
```

**Detection exists but no enforcement:**
- `hasTables` is logged in metadata
- No action taken if `wantsTable=true` but `hasTables=false`

### Failure Example

**Query:** "Create a comparison table of Project A vs Project B"
**Expected:** Markdown table

```markdown
| Aspect | Project A | Project B |
|--------|-----------|-----------|
| Cost   | $100k     | $150k     |
| Time   | 3 months  | 4 months  |
```

**Actual:** Prose or bullets

```markdown
Here's a comparison:

- Project A costs $100k and takes 3 months
- Project B costs $150k and takes 4 months
```

### Root Cause Chain

```
1. Query enters system: "Create comparison table"
2. Intent engine: No table detection
   ⚠️ "table" keyword not extracted
3. System prompt: No table instruction
   ⚠️ tableSection = '' (no spreadsheet detected)
4. LLM generates: Prose or bullets (path of least resistance)
5. Formatting pipeline: Detects hasTables=false
   ⚠️ No repair attempted
6. Output: Non-table format
```

---

## Pattern Inventory: Count Triggers

### English Patterns

| Pattern | Count Extraction | Example |
|---------|------------------|---------|
| `list N` | N from digit | "list 5 key points" → 5 |
| `give me N` | N from digit | "give me 3 reasons" → 3 |
| `top N` | N from digit | "top 10 items" → 10 |
| `in N lines` | N from digit | "in 6 lines" → 6 |
| `N key points` | N from digit | "5 key points" → 5 |
| `exactly N` | N from digit | "exactly 4 bullets" → 4 |

### Portuguese Patterns

| Pattern | Count Extraction | Example |
|---------|------------------|---------|
| `em N tópicos` | N from digit | "em 5 tópicos" → 5 |
| `liste N pontos` | N from digit | "liste 5 pontos" → 5 |
| `em N linhas` | N from digit | "em 6 linhas" → 6 |
| `top N` | N from digit | "top 10" → 10 |
| `os N principais` | N from digit | "os 5 principais" → 5 |

### Table Triggers

| Pattern | Language | Example |
|---------|----------|---------|
| `table` | EN | "create a table" |
| `comparison table` | EN | "comparison table" |
| `side-by-side` | EN | "side-by-side comparison" |
| `tabela` | PT | "em tabela" |
| `comparação em tabela` | PT | "comparação em tabela" |
| `tabla` | ES | "crear una tabla" |

---

## Quantified Impact

Based on the evaluation rubric, format failures cause:
- **Grade B → A blocker:** Correct content but wrong format = B at best
- **User frustration:** User asks for 5, gets 8 = perceived as not following instructions

### Expected Improvement

| Issue | Current State | After Fix |
|-------|--------------|-----------|
| Bullet count accuracy | ~30% (random) | 95%+ (enforced) |
| Table format compliance | ~20% (LLM decides) | 90%+ (enforced) |
| Overall A-grade rate | Estimated +10-15% | Verified via eval |

---

## Fix Requirements

### 1. Parse Format Constraints from Query

```typescript
interface FormatConstraints {
  wantsBullets: boolean;
  wantsNumbered: boolean;
  wantsTable: boolean;
  bulletCount?: number;
  lineCount?: number;
  compareTable?: boolean;
}

function parseFormatConstraints(query: string, language: 'en' | 'pt' | 'es'): FormatConstraints
```

### 2. Include Count in System Prompt

When `bulletCount=5`:
```
Present EXACTLY 5 bullet points. No more, no less.
```

When `wantsTable=true`:
```
Format your response as a Markdown table with proper | delimiters.
```

### 3. Post-LLM Validation & Repair

```typescript
function enforceBulletCount(text: string, requiredCount: number): string {
  const bullets = extractBullets(text);
  if (bullets.length > requiredCount) {
    return truncateToFirstN(text, requiredCount);
  }
  if (bullets.length < requiredCount) {
    return appendExplanation(text, bullets.length, requiredCount);
  }
  return text;
}

function enforceTableFormat(text: string): string {
  if (isValidMarkdownTable(text)) return text;
  return attemptTableConversion(text) || addTableRequiredNote(text);
}
```

### 4. Populate ResponseConstraints

```typescript
const constraints: ResponseConstraints = {
  exactBullets: formatReq.bulletCount,
  tableOnly: formatReq.wantsTable,
};
```

---

## Next: FORMAT_PATCH.md

See accompanying document for exact code changes.
