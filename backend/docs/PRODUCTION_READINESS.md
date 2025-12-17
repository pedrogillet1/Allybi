# KODA V3 Production Readiness Audit

**Date:** 2025-12-12
**Auditor:** Claude Code (Senior Staff Engineer)
**Verdict:** **DO NOT DEPLOY** - Critical blockers identified

---

## 1. Executive Risk Verdict

### Status: DO NOT DEPLOY

The Koda RAG system has critical issues that prevent core functionality from working correctly:

| Risk Level | Count | Impact |
|------------|-------|--------|
| P0 (Blocker) | 3 | Core RAG broken |
| P1 (Critical) | 4 | Major features broken |
| P2 (Important) | 3 | Stability/UX issues |

### Top 5 Blocking Issues

1. **Answer Engine Truncates Chunks to 1000 chars** - Nullifies retrieval budgeting
2. **Formatting Pipeline Called with Wrong Property** - `answer` vs `text` mismatch
3. **Fake Streaming** - Full response awaited before chunking
4. **Missing Service Injection** - 4+ services undefined in orchestrator
5. **Intent Type Mismatch** - `PredictedIntent` vs `IntentClassificationV3`

---

## 2. Verified Call Graphs

### 2.1 Non-Stream RAG Request

```
POST /api/rag/query
  └── rag.controller.ts:queryWithRAG (line 71)
      └── kodaOrchestratorV3.orchestrate() (line 121)
          ├── kodaIntentEngineV3.predict() (line 93)
          │   └── intentConfigService.getAllPatterns() (line 115)
          └── routeIntent() → handleDocumentQnA() (line 245)
              ├── checkUserHasDocuments() (line 249)
              ├── retrievalEngine.retrieve() (line 256) [INJECTED ✓]
              │   ├── embeddingService.generateQueryEmbedding()
              │   └── pineconeService.query()
              ├── answerEngine.generate() (line 263) [INJECTED ✓]
              │   └── geminiGateway.quickGenerateWithMetadata()
              └── formattingPipeline.format() (line 270) [BROKEN - wrong property]
```

### 2.2 Stream Endpoint (FAKE STREAMING!)

```
POST /api/rag/query/stream
  └── rag.controller.ts:queryWithRAGStreaming (line 259)
      └── orchestrator.orchestrate() (line 294) [AWAITS FULL RESPONSE]
          ├── [Same as non-stream path]
          └── return response
      └── words = response.answer.split(' ') (line 297) [SPLITS AFTER COMPLETE]
      └── for-loop chunks (line 298-301) [FAKE STREAMING]
```

### 2.3 Document Ingestion Pipeline

```
POST /api/documents/upload
  └── document.controller.ts → uploadDocument()
      └── document.service.ts:uploadDocument (line 175)
          ├── fileValidator.validateServerSide()
          ├── uploadFile() → GCS
          ├── processDocumentWithTimeout() (line 416)
          │   ├── textExtractionService.extract*()
          │   ├── chunkTextWithOverlap() (line 46)
          │   ├── embeddingService.generateEmbeddings()
          │   └── pineconeService.upsertDocumentEmbeddings() (line 60)
          └── prisma.document.update() [status: completed]
```

### 2.4 WebSocket Streaming (ALTERNATIVE PATH)

```
socket.on('send-message')
  └── chatService.sendMessageStreaming() (line 110)
      └── [NOT using orchestrator - bypasses V3 pipeline]
```

---

## 3. Orchestrator Wiring & DI Audit

### File: `src/services/core/kodaOrchestratorV3.service.ts`

### Singleton Construction (lines 879-887)
```typescript
const retrievalEngine = new KodaRetrievalEngineV3();
const answerEngine = new KodaAnswerEngineV3();

export const kodaOrchestratorV3 = new KodaOrchestratorV3({
  retrievalEngine,
  answerEngine,
});
```

### INJECTED SERVICES ✓
| Service | Injected | Status |
|---------|----------|--------|
| `intentEngine` | ✓ (default singleton) | Working |
| `fallbackConfig` | ✓ (default singleton) | Working |
| `productHelp` | ✓ (default singleton) | Working |
| `formattingPipeline` | ✓ (default singleton) | Working |
| `retrievalEngine` | ✓ (explicit) | Working |
| `answerEngine` | ✓ (explicit) | Working |

### MISSING SERVICES ✗ (all `undefined`)
| Service | Line | Impact |
|---------|------|--------|
| `documentSearch` | 78 | DOC_ANALYTICS, DOC_SEARCH return "SERVICE_UNAVAILABLE" |
| `userPreferences` | 79 | PREFERENCE_UPDATE returns "SERVICE_UNAVAILABLE" |
| `conversationMemory` | 80 | MEMORY_STORE/RECALL, ANSWER_REWRITE return "SERVICE_UNAVAILABLE" |
| `feedbackLogger` | 81 | FEEDBACK_POSITIVE/NEGATIVE logging silently fails |

### Handlers That Crash Without Services
- `handleDocAnalytics()` (line 295) - checks `if (this.documentSearch)`
- `handleDocSearch()` (line 337) - checks `if (this.documentSearch)`
- `handlePreferenceUpdate()` (line 399) - checks `if (this.userPreferences)`
- `handleMemoryStore()` (line 427) - checks `if (this.conversationMemory)`
- `handleMemoryRecall()` (line 455) - checks `if (this.conversationMemory)`
- `handleAnswerRewrite()` (line 477) - checks `if (this.conversationMemory && this.answerEngine)`

**Note:** These don't crash (guard checks work), but return "SERVICE_UNAVAILABLE" fallback.

---

## 4. Intent Engine Audit

### File: `src/services/core/kodaIntentEngineV3.service.ts`

### Language Detection (lines 241-268)
```typescript
// HEURISTIC-BASED (not library)
private async detectLanguage(text: string): Promise<LanguageCode> {
  const ptIndicators = ['você', 'está', 'não', ...];
  const esIndicators = ['usted', 'está', 'cuántos', ...];
  const enIndicators = ['you', 'are', 'how', ...];
  // Simple count-based scoring
}
```

**Issues:**
- `'está'` appears in both PT and ES indicators (line 245, 244)
- Very short queries may default to English incorrectly
- No confidence threshold for language detection

### Scoring Logic (lines 130-174)
```typescript
// 1. Regex patterns get score 1.0 on first match
// 2. Keywords scored as ratio: matchedCount / totalKeywords
// 3. Final = max(regexScore, keywordScore) * (priority / 100)
```

**Issues:**
- Regex match = instant 1.0 score (dominates over keywords)
- Keywords only match if ALL in list → low scores for partial matches
- Priority multiplier can unfairly boost low-confidence intents

### Misclassification Risks
| Query | Expected | Risk |
|-------|----------|------|
| "está" (alone) | AMBIGUOUS | Could match PT or ES randomly |
| "how many docs" | DOC_ANALYTICS | May hit CHITCHAT if "how" triggers greeting |
| "translate this" | TEXT_TRANSFORM | May hit DOC_SUMMARIZE if "this" is ambiguous |

---

## 5. Retrieval Engine Audit

### File: `src/services/core/kodaRetrievalEngineV3.service.ts`

### Hybrid Search Status
```typescript
usedHybrid: true, // Currently vector-only, BM25 can be added later (line 107)
hybridDetails: {
  vectorTopK: params.maxChunks ? params.maxChunks * 2 : 20,
  bm25TopK: 0, // BM25 not yet implemented (line 111)
  mergeStrategy: 'weighted',
},
```

**Status:** BM25/Keyword search NOT implemented. "Hybrid" is misleading.

### Context Budgeting (lines 233-256)
```typescript
private applyContextBudget(chunks, maxTokens = 4000, language?) {
  const budgetingService = getContextWindowBudgeting();
  const budgetResult = budgetingService.selectChunksWithinBudget(contentStrings, maxTokens, language);
  return chunks.slice(0, budgetResult.chunksIncluded);
}
```

**Works correctly** - but nullified by AnswerEngine truncation (see Section 6).

### Intent Passing Issue (line 260)
```typescript
intent: context.intent, // FIX: Pass intent for intent-aware retrieval
```

**Type mismatch:** Orchestrator passes `PredictedIntent` but retrieval expects `IntentClassificationV3`.

### Zero Chunks Failure Mode
- Returns empty array on Pinecone error (line 83-85)
- Returns empty array if embedding generation fails (line 132-134)
- Returns empty array if no `requiresRAG` flag (line 73-75)
- **No retry mechanism** for transient failures

---

## 6. Answer Engine + Formatting Pipeline Audit

### File: `src/services/core/kodaAnswerEngineV3.service.ts`

### **CRITICAL: Chunk Truncation Bug (lines 271-279)**
```typescript
private buildContext(documents: any[]): string {
  return documents
    .slice(0, 5) // Limit to top 5 documents
    .map((doc, idx) => {
      const content = doc.content || doc.text || '';
      const name = doc.documentName || doc.filename || `Document ${idx + 1}`;
      return `[${name}]\n${content.substring(0, 1000)}`; // ← BRUTAL TRUNCATION
    })
    .join('\n\n---\n\n');
}
```

**Impact:**
- Retrieval engine carefully budgets 4000 tokens across chunks
- Answer engine throws away everything after 1000 chars per chunk
- 5 chunks × 1000 chars = ~1250 tokens used (31% of budget)
- **69% of retrieved context is WASTED**

### Truncation Detection (lines 342-367)
```typescript
private detectTruncation(text: string, finishReason?: string): boolean {
  if (finishReason === 'MAX_TOKENS' || finishReason === 'LENGTH') return true;
  // Heuristic checks: incomplete sentences, unclosed markdown
}
```

**Works correctly** - but repair is opt-in and never called from main path.

### Formatting Pipeline Issue

**File:** `src/services/core/kodaOrchestratorV3.service.ts` (lines 269-274)

```typescript
const formatted = await this.formattingPipeline.format({
  answer: answerResult.text, // ← WRONG PROPERTY NAME
  documents: retrievalResult.documents,
  language,
});
```

**Expected interface (`FormattingInput`):**
```typescript
export interface FormattingInput {
  text: string;  // ← Expects "text" not "answer"
  citations?: Citation[];
  documents?: DocumentReference[];
  ...
}
```

**Result:** `text` is `undefined`, formatting receives empty string.

---

## 7. Streaming Audit

### File: `src/controllers/rag.controller.ts` (lines 259-336)

### Verdict: **FAKE STREAMING**

```typescript
// Line 294: WAITS for full response
const response = await orchestrator.orchestrate(request);

// Line 297-301: THEN splits into fake chunks
const words = response.answer.split(' ');
for (let i = 0; i < words.length; i += 5) {
  const chunk = words.slice(i, i + 5).join(' ') + ' ';
  res.write(`data: ${JSON.stringify({ type: 'content', content: chunk })}\n\n`);
}
```

### Problems:
1. **Time to First Token (TTFT):** Equal to full response time (5-15+ seconds)
2. **No AsyncGenerator chain:** Controller → Orchestrator → AnswerEngine → LLM
3. **No provider streaming:** `geminiGateway.quickGenerateWithMetadata()` is non-streaming
4. **User perception:** Appears frozen until full response, then rapid burst

### What True Streaming Requires:
1. Answer Engine must yield chunks as LLM generates
2. Orchestrator must propagate AsyncGenerator
3. Controller must write as chunks arrive
4. Gemini/OpenAI streaming API must be used

---

## 8. Ingestion Pipeline Audit

### File: `src/services/document.service.ts`

### Text Extraction (verified working)
- PDF: pdfjs/pdf-parse
- DOCX: mammoth
- PPTX: custom extractor with image extraction
- OCR: integrated for images

### Chunking (lines 46-93)
```typescript
function chunkTextWithOverlap(text: string, options: ChunkOptions) {
  // Smart boundary detection (sentence/paragraph)
  // Overlap for context preservation
}
```
**Works correctly.**

### Embedding & Storage (verified)
```typescript
// Pinecone upsert with full metadata (line 118)
content: chunk.content.substring(0, 5000), // Stores up to 5000 chars
```

### Risk: "0 Chunks" Completion
- If text extraction returns empty string, chunks = []
- Embedding loop skipped, Pinecone upsert skipped
- Document marked "completed" with 0 searchable content
- **No guard** to fail documents with 0 chunks

---

## 9. Config/JSON Wiring Audit

### JSON Files Location
```
backend/src/data/
├── system_prompts.json
├── answer_styles.json
├── answer_examples.json
├── markdown_components.json
├── table_presets.json
├── validation_policies.json
├── retrieval_policies.json
├── error_localization.json
├── language_profiles.json
├── debug_labels.json
├── fallbacks.json
├── koda_product_help.json
├── capabilities_catalog.json
├── intent_patterns.json   ← Used by IntentConfigService
├── analytics_phrases.json
├── doc_aliases.json
├── doc_query_synonyms.json
└── [25 individual intent JSONs]
```

### Loading Mechanism

**Server Startup (server.ts:154-188):**
```typescript
// 1. Verify files exist
verifyAllDataFiles();

// 2. Init services (loads JSON once)
initPromptConfig({ dataDir: DATA_DIR, ... });
initTokenBudgetEstimator();
initContextWindowBudgeting();
await intentConfigService.loadPatterns();
```

### Schema Validation
- **IntentConfigService:** Validates intent names, compiles regex
- **PromptConfigService:** Basic existence checks only
- **No JSON schema validation** (zod/ajv)

### Missing Config Services
- `retrieval_policies.json` loaded but not used by RetrievalEngine
- `validation_policies.json` loaded but no enforcement layer
- Model routing configuration not implemented

---

## 10. Concrete Patch Plan

### P0 (Blockers) - Deploy Breakers

#### P0-1: Fix Formatting Pipeline Property Name
**File:** `src/services/core/kodaOrchestratorV3.service.ts`
**Line:** 269-274
```typescript
// BEFORE
const formatted = await this.formattingPipeline.format({
  answer: answerResult.text,
  ...
});

// AFTER
const formatted = await this.formattingPipeline.format({
  text: answerResult.text,
  ...
});
```

#### P0-2: Remove 1000-char Truncation in Answer Engine
**File:** `src/services/core/kodaAnswerEngineV3.service.ts`
**Line:** 277
```typescript
// BEFORE
return `[${name}]\n${content.substring(0, 1000)}`;

// AFTER (respect retrieval budgeting)
return `[${name}]\n${content}`;
```

#### P0-3: Fix Intent Type Mismatch
**File:** `src/services/core/kodaOrchestratorV3.service.ts`
**Line:** 260

Either:
1. Change `intent: context.intent` to pass proper type
2. Or update RetrievalEngine to accept `PredictedIntent`

---

### P1 (Critical) - Major Features Broken

#### P1-1: Inject Missing Services
**File:** `src/services/core/kodaOrchestratorV3.service.ts`
**Lines:** 879-887
```typescript
import { documentSearchService } from '../analytics/documentSearch.service';
// Create or import userPreferences, conversationMemory, feedbackLogger

export const kodaOrchestratorV3 = new KodaOrchestratorV3({
  retrievalEngine,
  answerEngine,
  documentSearch: documentSearchService,
  // userPreferences: userPreferencesService,
  // conversationMemory: conversationMemoryService,
  // feedbackLogger: feedbackLoggerService,
});
```

#### P1-2: Implement True Streaming
**Files:**
- `src/services/core/kodaAnswerEngineV3.service.ts` - Add streaming generator
- `src/services/geminiGateway.service.ts` - Use streaming API
- `src/services/core/kodaOrchestratorV3.service.ts` - Add orchestrateStream()
- `src/controllers/rag.controller.ts` - Consume stream properly

#### P1-3: Guard 0-Chunk Documents
**File:** `src/services/document.service.ts`
After chunking:
```typescript
if (chunks.length === 0) {
  throw new Error('Document produced 0 chunks - extraction failed');
}
```

#### P1-4: Fix Language Detection Overlap
**File:** `src/services/core/kodaIntentEngineV3.service.ts`
Remove `'está'` from one of PT/ES indicators or use proper NLP library.

---

### P2 (Important) - Stability/UX

#### P2-1: Add Retrieval Retry Mechanism
**File:** `src/services/core/kodaRetrievalEngineV3.service.ts`
Add exponential backoff for Pinecone failures.

#### P2-2: Implement BM25 for True Hybrid Search
Currently only vector search is implemented.

#### P2-3: Add JSON Schema Validation
Use zod/ajv to validate config files at startup.

---

## 11. Dead Code / Unused Services

### Commented/Deprecated Code
| File | Line | Description |
|------|------|-------------|
| `app.ts` | 11 | `// import documentSearchRoutes` |
| `app.ts` | 200 | `// app.use('/api/documents', documentSearchRoutes)` |
| `document.service.ts` | 579-580 | DEPRECATED stub for `pptxSlideGenerator` |

### Unused Exports
| Service | Export | Status |
|---------|--------|--------|
| `documentSearchService` | Exported but not injected | Available but unused |
| `retrieval_policies.json` | Loaded but not consumed | Dead config |
| `validation_policies.json` | Loaded but not enforced | Dead config |

### Duplicate Implementations
- `gemini.service.ts` and `openai.service.ts` have identical code (1994 lines each)
- Consider unified LLM gateway

---

## 12. MVP Acceptance Tests (Backend-Only)

### Test 1: Orchestrator Wiring
```typescript
describe('KodaOrchestratorV3', () => {
  it('should have retrievalEngine injected', () => {
    expect(kodaOrchestratorV3['retrievalEngine']).toBeDefined();
  });

  it('should have answerEngine injected', () => {
    expect(kodaOrchestratorV3['answerEngine']).toBeDefined();
  });
});
```

### Test 2: Retrieval Returns Chunks
```typescript
describe('KodaRetrievalEngineV3', () => {
  it('should return chunks for valid query with documents', async () => {
    const params = {
      userId: 'test-user',
      query: 'test query',
      intent: mockIntent,
      language: 'en' as const,
    };
    const chunks = await retrievalEngine.retrieve(params);
    expect(chunks.length).toBeGreaterThan(0);
  });
});
```

### Test 3: Formatting Receives Correct Property
```typescript
describe('FormattingPipeline', () => {
  it('should accept text property', async () => {
    const result = await formattingPipeline.format({
      text: 'Test answer',
      documents: [],
    });
    expect(result.text).toBe('Test answer');
  });
});
```

### Test 4: Ingestion Never Completes with 0 Chunks
```typescript
describe('Document Ingestion', () => {
  it('should fail if 0 chunks produced', async () => {
    const emptyBuffer = Buffer.from('');
    await expect(
      processDocument(emptyBuffer, 'empty.txt', 'text/plain', 'user1')
    ).rejects.toThrow('0 chunks');
  });
});
```

### Test 5: Answer Engine Context Not Truncated
```typescript
describe('KodaAnswerEngineV3', () => {
  it('should not truncate chunk content', () => {
    const longContent = 'a'.repeat(3000);
    const docs = [{ content: longContent, documentName: 'test' }];
    const context = answerEngine['buildContext'](docs);
    expect(context).toContain(longContent); // Full content preserved
  });
});
```

---

## Summary

**Koda V3 is NOT ready for deployment.** The system has architectural issues that prevent core RAG functionality from working correctly:

1. The answer engine discards 69% of retrieved context
2. Streaming is fake (waits for full response)
3. Multiple services are undefined in the orchestrator
4. Type mismatches between services

**Minimum effort to functional MVP:**
- 3 P0 fixes (~1 hour)
- P1-3 guard (~30 min)
- Total: ~2 hours code changes + testing

**For production-quality:**
- True streaming implementation (~1-2 days)
- Missing service implementations (~2-3 days)
- Comprehensive testing (~1 day)
