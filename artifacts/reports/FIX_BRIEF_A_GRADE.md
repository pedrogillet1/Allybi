# Koda A-Grade Fix Brief
**Goal:** Transform current 6% A-grade rate to 90%+ A-grade rate

## Current State
- A: 3 (6%) | B: 23 (46%) | C: 12 (24%) | D: 3 (6%) | F: 9 (18%)
- 76% "pass" but mostly B/C quality
- 9 hard failures blocking any improvement

---

## P0 FIXES (Must Complete First)

### P0-A: Content-Question Guard Before Inventory Intercept

**File:** `src/services/core/kodaOrchestratorV3.service.ts`
**Location:** BEFORE line ~1576 (INVENTORY QUERY INTERCEPT)

**Problem:** Queries like "In the marketing PDF, what does intangibility lead customers to..." trigger `type_search` file listing instead of RAG content retrieval.

**Fix:** Add content question detection BEFORE the inventory intercept:

```typescript
// ═══════════════════════════════════════════════════════════════════════
// CONTENT QUESTION GUARD - Must run BEFORE inventory intercept
// ═══════════════════════════════════════════════════════════════════════
const CONTENT_QUESTION_PATTERNS = [
  // "What does X say/mention/contain" patterns
  /\b(what|which|how|why|does|do)\b.{0,50}?\b(pdf|file|document|arquivo)\b.{0,30}?\b(say|mention|contain|discuss|talk|explain|mean|lead|reduce|show)/i,
  // "In the PDF, what..." patterns
  /\b(in|from|no|na)\s+(the|o|a)?\s*\w*\s*(pdf|file|document|arquivo)\b[,\s]*(what|which|how|why|does|o\s+que|qual|como|por\s*que)/i,
  // "What examples in the PDF" patterns
  /\b(what|which)\s+(example|examples?|caso|casos)\b.{0,30}?\b(in|from|no|na)\s+(the|o|a)?\s*(pdf|file|document)/i,
  // "Does the PDF mention X" patterns
  /\b(does|do)\s+(the|o|a)?\s*\w*\s*(pdf|file|document)\s+(mention|say|contain|have|include|discuss|talk|explicar|falar)/i,
  // PT: "O que o PDF diz sobre" patterns
  /\b(o\s+que|qual|como|por\s*que)\b.{0,30}?\b(pdf|arquivo|documento)\b.{0,30}?\b(diz|fala|menciona|explica|mostra)/i,
];

const isContentQuestion = CONTENT_QUESTION_PATTERNS.some(p => p.test(query));
if (isContentQuestion) {
  this.logger.debug('[CONTENT_GUARD] Detected content question, skipping inventory intercept');
  // Skip inventory logic, proceed directly to RAG
}
```

**Test Queries (must NOT trigger file listing):**
- "In the marketing PDF, what does 'intangibility' lead customers to rely on?"
- "What examples in the PDF reduce perceived service quality immediately?"
- "Does the marketing PDF mention 'inseparability' explicitly?"
- "What's a 'positive' example of intangibility in the PDF?"

---

### P0-B: Restrict file_actions to Explicit Verbs Only

**File:** `src/services/core/kodaOrchestratorV3.service.ts`
**Location:** `detectFileActionQuery()` method and `handleFileActions()`

**Problem:** Any query with "PDF" in it can trigger file_actions.

**Fix:** Only trigger file_actions for explicit file operation verbs:

```typescript
const FILE_ACTION_EXPLICIT_VERBS = [
  // Location queries
  /\b(where\s+is|onde\s+está|find|encontr|locate|localiz)\s+(my\s+|meu\s+|minha\s+)?(file|document|pdf|arquivo)/i,
  // Open/view queries
  /\b(open|abr[aei]r?|show\s+me|mostre|preview|visualiz)\s+(the\s+|o\s+|a\s+)?(file|document|pdf|arquivo)\s+\w+/i,
  // List queries
  /\b(list|listar?|show\s+all|mostrar\s+todos?)\s+(my\s+|meus?|minhas?)?\s*(files?|documents?|pdfs?|arquivos?)/i,
  // Delete/remove queries
  /\b(delete|exclu[íi]r?|remove|remov|apagar?)\s+(the\s+|o\s+|a\s+)?(file|document|pdf|arquivo)/i,
  // Rename/move queries
  /\b(rename|renome|move|mover?)\s+(the\s+|o\s+|a\s+)?(file|document|pdf|arquivo)/i,
  // Download queries
  /\b(download|baixar?)\s+(the\s+|o\s+|a\s+)?(file|document|pdf|arquivo)/i,
];

// MUST match explicit verb pattern to trigger file_actions
const isExplicitFileAction = FILE_ACTION_EXPLICIT_VERBS.some(p => p.test(query));
```

**Queries that MUST NOT trigger file_actions:**
- "What does the PDF say about X?" → documents (RAG)
- "Summarize the marketing PDF" → documents (RAG)
- "In the PDF, what examples..." → documents (RAG)

**Queries that SHOULD trigger file_actions:**
- "Where is the marketing PDF?" → file_actions (location)
- "Open the contract.pdf" → file_actions (preview)
- "List my PDF files" → file_actions (inventory)

---

### P0-C: Fix Help Fallback for Synthesis Queries

**File:** `src/services/core/kodaOrchestratorV3.service.ts`
**Location:** Help/fallback routing logic

**Problem:** Synthesis queries like "como você estruturaria a comunicação do projeto" return generic help template instead of RAG synthesis.

**Fix:** Add synthesis detection patterns that override help routing:

```typescript
const SYNTHESIS_PATTERNS = [
  // Structure/organize queries
  /\b(estrutur|organiz|structure|organize)\w*\b.{0,30}?\b(comunicação|communication|projeto|project)/i,
  // Mitigation/challenge queries
  /\b(mitig|desafio|challenge|risk|risco)\w*\b.{0,20}?\b(\d+\s*)?(linhas?|lines?|bullets?|pontos?)/i,
  // "Give me X in Y lines/bullets" queries
  /\b(me\s+d[êáa]|give\s+me|explain)\b.{0,40}?\b(\d+\s*)?(linhas?|lines?|bullets?|pontos?|frases?)/i,
  // "How would you X" queries about docs
  /\b(como\s+você|how\s+would\s+you)\b.{0,30}?\b(estrutur|organiz|apresent|summariz|resum)/i,
  // Stakeholder/risk analysis
  /\b(stakeholder|parte\s+interessada|risco|risk)\b.{0,30}?\b(estrutur|comunicar?|análise|analysis)/i,
];

const isSynthesisQuery = SYNTHESIS_PATTERNS.some(p => p.test(query));
if (isSynthesisQuery && currentIntent === 'help') {
  this.logger.debug('[SYNTHESIS_OVERRIDE] Redirecting help → documents for synthesis query');
  finalIntent = 'documents';
  synthesisMode = true;
}
```

**Test Queries (must NOT return help template):**
- "Considerando stakeholders e riscos, como você estruturaria a comunicação do projeto"
- "Me diga os desafios e como você mitigaria cada um, em 6 linhas"

---

## P1 FIXES (Polish for A-Grade)

### P1-A: Language Lock at Final Assembly

**File:** `src/services/core/kodaFormattingPipelineV3.service.ts`
**Location:** Final answer assembly

**Problem:** PT prompts get answered in English ("Based on the documents...").

**Fix:** Force language at the last mile:

```typescript
// Detect user language from query
const userLanguage = this.detectLanguage(query);

// Language-specific templates
const PREAMBLES = {
  pt: 'Com base nos documentos:',
  en: 'Based on the documents:',
  es: 'Según los documentos:',
};

const NOT_FOUND = {
  pt: 'Essa informação não foi encontrada nos documentos.',
  en: 'This information was not found in the documents.',
  es: 'Esta información no se encontró en los documentos.',
};

// Force language in final assembly
if (userLanguage === 'pt' && answer.startsWith('Based on')) {
  answer = answer.replace(/^Based on the documents[,:]/i, PREAMBLES.pt);
}
```

---

### P1-B: List Normalization Contract

**File:** `src/services/core/kodaFormattingPipelineV3.service.ts`
**Location:** List formatting logic

**Problem:** Lists mix bullets and numbers, inconsistent markers.

**Fix:** Single contract - normalize all lists to one format:

```typescript
// RULE: One list type per block
// - Bullets: always use "- " (dash space)
// - Numbers: always use "1. ", "2. ", etc. (no reset)

function normalizeListBlock(text: string): string {
  const lines = text.split('\n');
  let inList = false;
  let listType: 'bullet' | 'number' | null = null;
  let numberCounter = 0;

  return lines.map(line => {
    const isBullet = /^\s*[-*•]\s+/.test(line);
    const isNumber = /^\s*\d+[.)]\s+/.test(line);

    if (isBullet || isNumber) {
      if (!inList) {
        inList = true;
        listType = isBullet ? 'bullet' : 'number';
        numberCounter = 0;
      }

      if (listType === 'bullet') {
        // Normalize to "- "
        return line.replace(/^\s*[-*•]\s+/, '- ');
      } else {
        // Normalize to sequential numbers
        numberCounter++;
        return line.replace(/^\s*\d+[.)]\s+/, `${numberCounter}. `);
      }
    } else if (line.trim() === '') {
      // Empty line ends list
      inList = false;
      listType = null;
      return line;
    }
    return line;
  }).join('\n');
}
```

---

### P1-C: Remove Blank Lines Inside Lists

**File:** `src/services/core/kodaFormattingPipelineV3.service.ts`

**Problem:** Blank lines inserted mid-list break parsing.

**Fix:** Strip internal blank lines from list blocks:

```typescript
function removeInternalListBlanks(text: string): string {
  // Pattern: list item, blank line, list item → remove blank
  return text.replace(
    /^(\s*[-*•\d.]+\s+.+)\n\n+(\s*[-*•\d.]+\s+)/gm,
    '$1\n$2'
  );
}
```

---

### P1-D: Tighten Retrieval Source Relevance

**File:** `src/services/core/kodaRetrievalEngineV3.service.ts`

**Problem:** Low-relevance sources included, irrelevant docs cited.

**Fix:** Add minimum relevance threshold:

```typescript
const MIN_RELEVANCE_SCORE = 0.65; // Adjust based on testing

function filterRelevantSources(sources: Source[]): Source[] {
  return sources
    .filter(s => s.relevanceScore >= MIN_RELEVANCE_SCORE)
    .slice(0, 5); // Max 5 sources
}
```

---

### P1-E: Excel Month Header Extraction

**File:** `src/services/document.service.ts` or extraction pipeline

**Problem:** Excel P&L files have month headers but extraction loses them.

**Fix:** Ensure header row is captured and indexed:

```typescript
// When extracting XLSX:
// 1. Identify header row (usually row 1 or first non-empty row)
// 2. Map column letters to header values
// 3. Store mapping: { B: "January", C: "February", ... }
// 4. Include in chunk metadata for retrieval
```

---

### P1-F: Enforce Answer-First Contract

**File:** `src/services/core/kodaFormattingPipelineV3.service.ts`

**Problem:** Answers start with "Based on the documents..." preamble.

**Fix:** Remove preamble, start with direct answer:

```typescript
function enforceAnswerFirst(answer: string): string {
  // Remove common preambles
  const preamblePatterns = [
    /^Based on (the |your )?documents[,:]\s*/i,
    /^Com base nos documentos[,:]\s*/i,
    /^According to (the |your )?documents[,:]\s*/i,
    /^De acordo com os documentos[,:]\s*/i,
  ];

  for (const pattern of preamblePatterns) {
    if (pattern.test(answer)) {
      answer = answer.replace(pattern, '');
      // Capitalize first letter
      answer = answer.charAt(0).toUpperCase() + answer.slice(1);
      break;
    }
  }
  return answer;
}
```

---

## P2 FIXES (Final Polish)

### P2-A: Sources Shown = Sources Cited

Only include sources in the `sources` array that are actually referenced in the answer text.

### P2-B: Remove Step Templates from Answers

Remove "Step 1:", "Step 2:" template artifacts that bleed into final answers.

---

## Validation Checkpoints

### After P0 Fixes:
- [ ] q28, q29, q30, q37 return content (not file listing)
- [ ] q31, q44 return synthesis (not help template)
- [ ] file_actions total Fs = 0
- [ ] help fallback Fs = 0

### After P1 Fixes:
- [ ] PT queries answered in PT
- [ ] Lists use consistent markers (no mixing)
- [ ] No blank lines inside list blocks
- [ ] Answers start with direct response (no preamble)
- [ ] Only relevant sources shown

### Target Metrics:
- [ ] F-grade count: 0
- [ ] D-grade count: 0
- [ ] A-grade count: 45+ (90%)

---

## Test Command

```bash
JWT_ACCESS_SECRET="k8mP2vXqL9nR4wYj6tF1hB3cZ5sA7uD0eG8iK2oM4qW6yT1xV3nJ5bH7fL9pU2rE" \
npx ts-node tools/quality/run_50_test_chatgpt.ts
```
