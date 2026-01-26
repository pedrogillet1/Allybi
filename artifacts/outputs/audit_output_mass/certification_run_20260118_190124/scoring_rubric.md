# Koda ChatGPT-Like Certification Scoring Rubric

## Overview

This rubric defines the pass/fail criteria for Koda's certification testing.
All criteria are evaluated from the SSE `done` event payload only.

---

## 1. HARD FAIL CONDITIONS (Automatic Fail)

Any of these conditions causes immediate test failure:

| Condition | Field | Check |
|-----------|-------|-------|
| Missing composer stamp | `composedBy` | Must be present and non-empty |
| Language mismatch | `languageLocked` | Must match query language |
| Wrong intent | `intent` | Must match expectedIntent from corpus |
| Empty answer | `fullAnswer` | Must have content >5 chars OR buttons |
| Truncation without repair | `truncationRepairApplied` | If truncated, must be true |
| Dangling markers | `fullAnswer` | No unclosed `{{DOC::`, `**`, ``` |
| Missing instrumentation | ALL | Every required field must be present |

---

## 2. INSTRUMENTATION CHECKS (Required Fields)

Each done event MUST contain these fields:

| Field | Type | Validation |
|-------|------|------------|
| `operator` | string | Must be valid operator enum value |
| `templateId` | string | Must be present and non-empty |
| `languageDetected` | string | Must be 2-letter ISO code (en/pt/es) |
| `languageLocked` | string | Must be 2-letter ISO code, match output language |
| `composedBy` | string | Must be "AnswerComposer" or similar stamp |
| `docScope` | string | Must be "single_doc", "multi_doc", or "unknown" |
| `anchorTypes` | array | Must be array of valid anchor types |
| `attachmentsTypes` | array | Must be array of valid attachment types |
| `truncationRepairApplied` | boolean | Must be present |

### Valid Operator Values:
- `summarize`, `extract`, `locate`, `compare`, `compute`
- `list`, `open`, `where`, `stats`, `help`, `clarify`
- `filter`, `define`, `explain`, `unknown`

### Valid Anchor Types:
- `pdf_page`, `ppt_slide`, `xlsx_cell`, `xlsx_range`
- `docx_heading`, `image_ocr_block`, `none`

### Valid Attachment Types:
- `source_buttons`, `file_list`, `select_file`
- `followup_chips`, `breadcrumbs`

---

## 3. OUTPUT CONTRACT CHECKS

### 3.1 Inventory/List Responses
When `operator` is `list` or `filter`:
- `fileList` OR `sourceButtons` MUST be present
- `fileList.buttons` MUST have items if files exist
- Frontend renders as cards, not text

### 3.2 File Action Responses
When `operator` is `open` or `where`:
- `attachments` MUST be present with file buttons
- `constraints.buttonsOnly` SHOULD be true
- No prose content (buttons only)

### 3.3 Extraction Responses
When `operator` is `extract` or `compare`:
- `sourceButtons` SHOULD be present (citations)
- `docScope` MUST be correctly set
- `anchorTypes` SHOULD contain relevant anchors

### 3.4 Summarization Responses
When `operator` is `summarize`:
- If query specifies "N bullets", count bullets in `fullAnswer`
- Bullet count MUST match exactly (±0 tolerance)
- Each bullet starts with `- `, `• `, or `1. `

### 3.5 Help Responses
When `operator` is `help`:
- Response MUST be in same language as query
- Should NOT contain document content
- Should provide actionable guidance

---

## 4. WORDING QUALITY CHECKS

### 4.1 No Preamble
Answer MUST NOT start with:
- "Based on the documents..."
- "According to your files..."
- "I found..."
- "Here is..."
- "Aqui está..."

### 4.2 No Robotic Repetition
Answer MUST NOT repeat the question verbatim:
- Bad: "What is the revenue? The revenue is..."
- Good: "Revenue for December: $1.2M"

### 4.3 Bullet Count Accuracy
When query contains "N bullets" or "N pontos":
- Count bullets in response
- MUST match exactly

### 4.4 Language Lock
Response language MUST match:
- `languageLocked` field
- Query language for PT/ES queries
- No code-switching mid-response

### 4.5 Conciseness
For extraction queries:
- Lead with the answer
- No unnecessary context
- Max 2-3 sentences unless summary requested

---

## 5. SCORING WEIGHTS

| Category | Weight | Pass Threshold |
|----------|--------|----------------|
| Instrumentation | 30% | 100% |
| Output Contract | 25% | 100% |
| Wording Quality | 25% | 90% |
| Language Lock | 20% | 100% |

### Pass Thresholds
- **Preflight (10 queries)**: 100% pass required
- **Certification (30 queries)**: 95% pass required (max 1 fail)
- **Soak (100+ queries)**: 90% pass required

---

## 6. VALIDATION FUNCTIONS

```typescript
// Hard fail check
function isHardFail(done: DoneEvent): { fail: boolean; reason: string } {
  if (!done.composedBy) return { fail: true, reason: 'Missing composedBy stamp' };
  if (!done.operator) return { fail: true, reason: 'Missing operator' };
  if (!done.languageLocked) return { fail: true, reason: 'Missing languageLocked' };
  if (!done.fullAnswer && !done.fileList && !done.attachments) {
    return { fail: true, reason: 'Empty response' };
  }
  return { fail: false, reason: '' };
}

// Bullet count check
function checkBulletCount(answer: string, expected: number): boolean {
  const bullets = (answer.match(/^[\s]*[-•*]\s|^[\s]*\d+\.\s/gm) || []).length;
  return bullets === expected;
}

// Language check
function checkLanguage(answer: string, expected: string): boolean {
  // PT indicators: ã, ç, é, ê, á, ó
  // ES indicators: ñ, ¿, ¡
  // EN: no special chars
  if (expected === 'pt') {
    return /[ãçéêáóõí]/i.test(answer);
  }
  if (expected === 'es') {
    return /[ñ¿¡]/i.test(answer) || !/[ãçõ]/i.test(answer);
  }
  return true; // EN default
}

// Preamble check
function hasPreamble(answer: string): boolean {
  const preambles = [
    /^based on/i, /^according to/i, /^i found/i,
    /^here is/i, /^aqui está/i, /^com base/i
  ];
  return preambles.some(p => p.test(answer.trim()));
}
```

---

## 7. RESULT FORMAT

Each query result is logged as:

```json
{
  "id": "cert-001",
  "query": "List all files",
  "pass": true,
  "checks": {
    "instrumentation": { "pass": true, "missing": [] },
    "outputContract": { "pass": true, "violations": [] },
    "wordingQuality": { "pass": true, "issues": [] },
    "languageLock": { "pass": true, "expected": "en", "actual": "en" }
  },
  "donePayload": { ... }
}
```

---

## 8. HARD FAIL SCENARIOS

These specific scenarios MUST fail certification:

1. **Inventory without fileList**: "List my files" returns prose, not buttons
2. **Wrong language**: PT query answered in EN
3. **Missing bullets**: "5 bullets" request returns 3 or 7
4. **Preamble**: Answer starts with "Based on your documents..."
5. **Truncation**: Answer ends mid-sentence with "..."
6. **Missing stamp**: `composedBy` field is undefined
7. **Wrong intent**: "Open file X" routes to documents instead of file_actions

---

## 9. CERTIFICATION REPORT FORMAT

Final report MUST include:

```markdown
# Koda Certification Report - [DATE]

## Summary
- Total Queries: 30
- Passed: 29
- Failed: 1
- Pass Rate: 96.7%
- Result: **PASS** (threshold: 95%)

## Failed Queries
| ID | Query | Failure Reason |
|----|-------|----------------|
| cert-012 | "Resuma em 5 pontos" | Bullet count: 4 (expected 5) |

## Instrumentation Coverage
| Field | Present | Missing |
|-------|---------|---------|
| operator | 30/30 | 0 |
| templateId | 30/30 | 0 |
| ... | ... | ... |

## Category Breakdown
| Category | Pass Rate |
|----------|-----------|
| Instrumentation | 100% |
| Output Contract | 100% |
| Wording Quality | 96.7% |
| Language Lock | 100% |
```
