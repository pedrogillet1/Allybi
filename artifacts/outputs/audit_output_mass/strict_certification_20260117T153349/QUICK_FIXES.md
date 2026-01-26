# Quick Fixes - Top 10 Highest Leverage Changes

These fixes are ordered by impact. Implementing fixes #1-5 should raise pass rate from 42% to ~80%+.

---

## Fix #1: Language Lock in Answer Engine (Impact: +15 queries)

**File**: `backend/src/services/core/kodaAnswerEngineV3.service.ts`

**Current Issue**: PT queries get EN responses

**Fix**:
```typescript
// In generateAnswer(), add to system prompt:
const languageInstruction = detectedLanguage === 'pt'
  ? 'IMPORTANTE: Você DEVE responder em português brasileiro. Não use inglês.'
  : 'You MUST respond in English only.';

systemPrompt = `${languageInstruction}\n\n${systemPrompt}`;
```

---

## Fix #2: PT Keywords in file_actions Intent (Impact: +5 queries)

**File**: `backend/src/data/intent_patterns.runtime.json`

**Current Issue**: PT file action queries not matching

**Fix**: Add to `file_actions.keywords.pt`:
```json
"pt": ["liste", "listar", "onde está", "onde estão", "mostre", "mostrar", "abra", "abrir", "arquivos", "documentos"]
```

Add to `file_actions.patterns.pt`:
```json
"pt": [
  "\\b(liste|listar)\\s+(todos|meus|os)\\s+(arquivos|documentos)\\b",
  "\\b(onde|aonde)\\s+(está|estão|fica)\\s+",
  "\\b(mostre|mostrar|abra|abrir)\\s+(o|os|meus?)\\s+"
]
```

---

## Fix #3: Content Verb Routing Protection (Impact: +4 queries)

**File**: `backend/src/services/core/routingPriority.service.ts`

**Current Issue**: "Summarize X" / "What is X" with filename routes to file_actions

**Fix**:
```typescript
// In adjustScores(), add content verb detection:
const CONTENT_VERBS = [
  /\b(summarize|explain|what is|what are|describe|compare|analyze)/i,
  /\b(resuma|explique|o que é|quais são|descreva|compare|analise)/i
];

if (CONTENT_VERBS.some(p => p.test(query))) {
  // Boost documents, dampen file_actions
  adjustedScores.documents = (adjustedScores.documents || 0) + 0.35;
  adjustedScores.file_actions = Math.max(0, (adjustedScores.file_actions || 0) - 0.40);
}
```

---

## Fix #4: Truncation Repair (Impact: +5 queries)

**File**: `backend/src/services/core/kodaFormattingPipelineV3.service.ts`

**Current Issue**: Answers ending with "..." not being repaired

**Fix**:
```typescript
// In repairTruncation():
if (answer.trim().endsWith('...') && !answer.includes('etc...')) {
  // Remove trailing ellipsis and mark for completion
  const cleaned = answer.replace(/\.\.\.\s*$/, '');
  // Attempt sentence completion or truncate at last complete sentence
  const lastSentenceEnd = Math.max(
    cleaned.lastIndexOf('.'),
    cleaned.lastIndexOf('!'),
    cleaned.lastIndexOf('?')
  );
  if (lastSentenceEnd > cleaned.length * 0.7) {
    return cleaned.slice(0, lastSentenceEnd + 1);
  }
  // Or append completion indicator
  return cleaned + '.';
}
```

---

## Fix #5: Formatting Constraint Enforcement (Impact: +5 queries)

**File**: `backend/src/services/core/kodaAnswerEngineV3.service.ts`

**Current Issue**: "exactly N bullets/items" not enforced

**Fix**:
```typescript
// In buildPrompt(), detect explicit count constraints:
const bulletMatch = query.match(/exactly\s+(\d+)\s+(bullet|point|item)/i);
const numberedMatch = query.match(/exactly\s+(\d+)\s+(numbered|number)/i);
const paragraphMatch = query.match(/exactly\s+(\d+)\s+paragraph/i);

if (bulletMatch) {
  systemPrompt += `\n\n⚠️ CRITICAL: You MUST provide EXACTLY ${bulletMatch[1]} bullet points. Not more, not fewer. Count them.`;
}
if (numberedMatch) {
  systemPrompt += `\n\n⚠️ CRITICAL: You MUST provide EXACTLY ${numberedMatch[1]} numbered items (1. 2. 3. etc). Count them.`;
}
```

---

## Fix #6: Table Format Detection (Impact: +2 queries)

**File**: `backend/src/services/core/kodaAnswerEngineV3.service.ts`

**Fix**:
```typescript
// When "table" or "columns" detected:
if (/\b(table|columns?)\b/i.test(query)) {
  systemPrompt += `\n\nFormat your response as a markdown table:
| Column1 | Column2 |
|---------|---------|
| data    | data    |`;
}
```

---

## Fix #7: Follow-up Context Resolution (Impact: +2 queries)

**File**: `backend/src/services/core/kodaOrchestratorV3.service.ts`

**Current Issue**: Follow-ups like "Explain it" lose context

**Fix**: Store last referenced document ID in conversation memory and inject it when pronouns detected.

---

## Fix #8: Button-Only Enforcement for Open Commands (Impact: +1 query)

**File**: `backend/src/services/core/kodaOrchestratorV3.service.ts`

**Fix**:
```typescript
// In handleFileActions():
if (actionType === 'open' || actionType === 'abra') {
  return {
    content: '', // Empty content for button-only
    sourceButtons: buildSourceButtons(matchedFiles),
    constraints: { buttonsOnly: true }
  };
}
```

---

## Fix #9: "Find documents about X" Routing (Impact: +1 query)

**File**: `backend/src/data/intent_patterns.runtime.json`

**Fix**: Add to `documents` patterns:
```json
"\\bfind\\s+(all\\s+)?documents?\\s+(about|mentioning|that|which)\\b"
```

---

## Fix #10: seeAll Edge Case (Impact: +1 query)

**File**: `backend/src/services/core/kodaOrchestratorV3.service.ts`

**Fix**: Ensure seeAll is always added when totalCount > buttons.length:
```typescript
if (totalCount > buttons.length) {
  sourceButtons.seeAll = {
    label: 'See all',
    totalCount,
    remainingCount: totalCount - buttons.length
  };
}
```

---

## Implementation Priority

| Priority | Fix | Impact | Effort |
|----------|-----|--------|--------|
| P0 | #1 Language Lock | +15 | Low |
| P0 | #2 PT Keywords | +5 | Low |
| P0 | #3 Content Verb Routing | +4 | Low |
| P1 | #4 Truncation Repair | +5 | Medium |
| P1 | #5 Constraint Enforcement | +5 | Medium |
| P2 | #6-10 | +7 | Low-Medium |

**Estimated improvement with P0 fixes**: 42% → 70%+
**Estimated improvement with P0+P1 fixes**: 42% → 90%+

---

## CRITICAL FIXES (from manual review)

### Fix #0: PT Inventory MUST Use Database, Not LLM (CRITICAL)

**File**: `backend/src/services/core/kodaOrchestratorV3.service.ts`

**Current Issue**: PT inventory query misroutes to `documents` intent → LLM generates fake file list

**Fix**:
```typescript
// In handleQuery() or detectIntent():
// If query matches inventory pattern (any language), FORCE file_actions intent
const INVENTORY_PATTERNS = [
  /\b(list|show|display|what)\s+(all\s+)?(my\s+)?(files?|documents?)\b/i,
  /\b(liste|listar|mostre|mostrar|quais)\s+(todos?\s+)?(meus?\s+)?(arquivos?|documentos?)\b/i
];

if (INVENTORY_PATTERNS.some(p => p.test(query))) {
  // FORCE file_actions - do NOT let LLM generate content
  return handleFileActions(query, userId);
}
```

### Fix #0b: Validate File Lists Against Database

**File**: `backend/src/services/core/kodaFormattingPipelineV3.service.ts`

**Fix**: Before returning any file list response, validate that listed filenames exist in user's actual documents:
```typescript
async validateFileList(response: string, userId: string): Promise<boolean> {
  const userDocs = await this.documentService.getUserDocuments(userId);
  const userFilenames = new Set(userDocs.map(d => d.filename.toLowerCase()));
  
  // Extract filenames from response
  const listedFiles = response.match(/\d+\.\s+(.+?)(?:\n|$)/g) || [];
  
  for (const file of listedFiles) {
    const filename = file.replace(/^\d+\.\s+/, '').trim();
    if (!userFilenames.has(filename.toLowerCase())) {
      console.error(`HALLUCINATION DETECTED: "${filename}" not in user docs`);
      return false;
    }
  }
  return true;
}
```

### Fix #0c: Sentence vs Bullet Format Detection

When query asks for "sentences", ensure output is prose (no "-" or "•" at start of lines).
