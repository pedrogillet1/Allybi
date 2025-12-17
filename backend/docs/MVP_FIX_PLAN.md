# KODA V3 MVP Fix Plan - Complete Implementation Guide

**Created:** 2025-12-12
**Status:** Ready for Implementation
**Priority:** P0 fixes first, then P1

---

## PHASE 1: TRUE STREAMING (P0 - Critical)

### Problem
Streaming is fake - waits for full response then splits into words.

### Files to Modify

#### 1.1 CREATE: `src/types/streaming.types.ts`
```typescript
// NEW FILE - streaming event types
export interface StreamEvent {
  type: 'thinking' | 'delta' | 'citation' | 'final' | 'error' | 'done';
  data: any;
}

export interface DeltaEvent extends StreamEvent {
  type: 'delta';
  data: { content: string };
}

export interface FinalEvent extends StreamEvent {
  type: 'final';
  data: {
    answer: string;
    formatted: string;
    citations: any[];
    metadata: any;
  };
}

export interface ContentEvent {
  type: 'content';
  content: string;
}
```

#### 1.2 MODIFY: `src/services/geminiGateway.service.ts`
**ADD** new streaming method (after line ~387):
```typescript
/**
 * Stream text generation - yields tokens as they arrive
 * TRUE STREAMING - not fake chunking
 */
public async *streamText(
  prompt: string,
  options?: { model?: string; temperature?: number }
): AsyncGenerator<string, void, unknown> {
  const model = options?.model || this.defaultModel;
  const geminiModel = this.genAI.getGenerativeModel({ model });

  const result = await geminiModel.generateContentStream(prompt);

  for await (const chunk of result.stream) {
    const text = chunk.text();
    if (text) {
      yield text;
    }
  }
}
```

#### 1.3 MODIFY: `src/services/core/kodaAnswerEngineV3.service.ts`

**DELETE lines 228-247** (fake streamAnswer method):
```typescript
// DELETE THIS ENTIRE METHOD:
public async streamAnswer(params: StreamAnswerParams): Promise<void> {
  const { stream, query, language, chitchatMode, metaMode } = params;
  // ... all the fake streaming code with split(' ')
}
```

**DELETE line 486** (delay helper):
```typescript
// DELETE THIS:
private async delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

**ADD** new true streaming method:
```typescript
/**
 * Stream answer with documents - TRUE STREAMING
 * Yields tokens as LLM generates them
 */
public async *streamWithDocs(params: {
  query: string;
  chunks: any[];
  language: string;
  intent: string;
}): AsyncGenerator<StreamEvent, void, unknown> {
  const { query, chunks, language, intent } = params;

  // Build context from chunks (already budgeted by retrieval)
  const context = this.buildContext(chunks);

  // Build prompt
  const systemPrompt = this.buildSystemPrompt(intent, language);
  const userPrompt = `Context:\n${context}\n\nQuestion: ${query}`;
  const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

  // Stream from LLM
  let fullAnswer = '';

  yield { type: 'thinking', data: { message: 'Generating answer...' } };

  for await (const delta of geminiGateway.streamText(fullPrompt)) {
    fullAnswer += delta;
    yield { type: 'delta', data: { content: delta } };
  }

  // Final formatting (only after complete)
  yield {
    type: 'final',
    data: {
      answer: fullAnswer,
      formatted: fullAnswer,
      tokensUsed: Math.ceil(fullAnswer.length / 4)
    }
  };
}
```

#### 1.4 MODIFY: `src/services/core/kodaOrchestratorV3.service.ts`

**ADD** new streaming method:
```typescript
/**
 * Stream orchestration - TRUE STREAMING
 * Yields events as they happen
 */
public async *orchestrateStream(
  request: OrchestratorRequest
): AsyncGenerator<StreamEvent, void, unknown> {
  const startTime = Date.now();

  try {
    // Step 1: Classify intent (fast, not streamed)
    const language = request.language || 'en';
    const intentResult = await this.intentEngine.predict({
      text: request.text,
      language,
      context: { userId: request.userId },
    });

    yield { type: 'thinking', data: { intent: intentResult.primaryIntent } };

    // Step 2: Check if RAG needed
    const context = this.buildHandlerContext(request, intentResult, language);

    if (!this.shouldUseRAG(intentResult)) {
      // Non-RAG response (chitchat, product help, etc.)
      const response = await this.routeIntent(context);
      yield { type: 'final', data: response };
      return;
    }

    // Step 3: Retrieve documents
    if (!this.retrievalEngine || !this.answerEngine) {
      yield { type: 'error', data: { message: 'Services not available' } };
      return;
    }

    const retrievalResult = await this.retrievalEngine.retrieve({
      query: request.text,
      userId: request.userId,
      language,
      intent: context.intent,
    });

    if (!retrievalResult.length) {
      const fallback = this.buildFallbackResponse(context, 'NO_DOCUMENTS');
      yield { type: 'final', data: fallback };
      return;
    }

    // Step 4: Stream answer generation
    yield* this.answerEngine.streamWithDocs({
      query: request.text,
      chunks: retrievalResult,
      language,
      intent: intentResult.primaryIntent,
    });

  } catch (error: any) {
    yield { type: 'error', data: { message: error.message } };
  }
}
```

#### 1.5 MODIFY: `src/controllers/rag.controller.ts`

**DELETE lines 300-308** (fake streaming loop):
```typescript
// DELETE THIS:
const words = response.answer.split(' ');
for (let i = 0; i < words.length; i += 5) {
  const chunk = words.slice(i, i + 5).join(' ') + ' ';
  res.write(`data: ${JSON.stringify({ type: 'content', content: chunk })}\n\n`);
}
```

**REPLACE queryWithRAGStreaming function with:**
```typescript
export const queryWithRAGStreaming = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { query, conversationId, language = 'en' } = req.body;
    if (!query || !conversationId) {
      res.status(400).json({ error: 'Query and conversationId are required' });
      return;
    }

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    await ensureConversationExists(conversationId, userId);

    const request: OrchestratorRequest = {
      userId,
      text: query,
      language: language as LanguageCode,
      conversationId,
    };

    // TRUE STREAMING - yield events as they arrive
    let fullAnswer = '';

    for await (const event of getOrchestrator().orchestrateStream(request)) {
      if (event.type === 'delta') {
        fullAnswer += event.data.content;
        res.write(`data: ${JSON.stringify({ type: 'content', content: event.data.content })}\n\n`);
      } else if (event.type === 'thinking') {
        res.write(`data: ${JSON.stringify({ type: 'thinking', message: 'Processing...' })}\n\n`);
      } else if (event.type === 'final') {
        fullAnswer = event.data.answer || fullAnswer;
      } else if (event.type === 'error') {
        res.write(`data: ${JSON.stringify({ type: 'error', error: event.data.message })}\n\n`);
      }
    }

    // Save messages after streaming complete
    const userMessage = await prisma.message.create({
      data: { conversationId, role: 'user', content: query },
    });

    const assistantMessage = await prisma.message.create({
      data: { conversationId, role: 'assistant', content: fullAnswer },
    });

    res.write(`data: ${JSON.stringify({
      type: 'done',
      messageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
      conversationId,
    })}\n\n`);

    res.end();
  } catch (error: any) {
    console.error('[RAG V3] Streaming error:', error);
    res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
    res.end();
  }
};
```

#### 1.6 MODIFY: `src/services/chat.service.ts`

**DELETE lines 260-264** (fake streaming):
```typescript
// DELETE THIS:
const words = response.answer.split(' ');
for (let i = 0; i < words.length; i += 3) {
  const chunk = words.slice(i, i + 3).join(' ') + ' ';
  onChunk(chunk);
}
```

**REPLACE with true streaming:**
```typescript
// TRUE STREAMING
for await (const event of getOrchestrator().orchestrateStream(request)) {
  if (event.type === 'delta') {
    onChunk(event.data.content);
  }
}
```

---

## PHASE 2: FIX BM25 HYBRID SEARCH (P0 - Critical)

### Problem
BM25 queries wrong table name and column names - always fails silently.

### Files to Modify

#### 2.1 MODIFY: `src/services/retrieval/kodaHybridSearch.service.ts`

**REPLACE lines 149-164** (entire SQL query):

**FROM:**
```typescript
const rawQuery = `
  SELECT
    id as "chunkId",
    "documentId",
    content,
    "pageNumber",
    ts_rank_cd(to_tsvector('simple', content), plainto_tsquery('simple', $1)) AS bm25_score
  FROM chunks
  WHERE "userId" = $2
    ${docFilter}
    AND to_tsvector('simple', content) @@ plainto_tsquery('simple', $1)
  ORDER BY bm25_score DESC
  LIMIT $3
`;
```

**TO:**
```typescript
const rawQuery = `
  SELECT
    dc.id as "chunkId",
    dc."documentId",
    dc.text as content,
    dc.page as "pageNumber",
    d.filename as "documentName",
    ts_rank_cd(to_tsvector('simple', dc.text), plainto_tsquery('simple', $1)) AS bm25_score
  FROM document_chunks dc
  INNER JOIN documents d ON dc."documentId" = d.id
  WHERE d."userId" = $2
    ${docFilter}
    AND to_tsvector('simple', dc.text) @@ plainto_tsquery('simple', $1)
  ORDER BY bm25_score DESC
  LIMIT $3
`;
```

**UPDATE the results mapping (lines 167-176):**
```typescript
const chunks: RetrievedChunk[] = results.map((row) => ({
  chunkId: row.chunkId,
  documentId: row.documentId,
  documentName: row.documentName || '',  // Now populated from JOIN
  content: row.content,
  pageNumber: row.pageNumber ?? undefined,
  score: parseFloat(row.bm25_score) || 0,
  metadata: { retrievalMethod: 'bm25' },
}));
```

#### 2.2 MODIFY: `src/services/document.service.ts`

**ADD** DocumentChunk storage after embedding generation.
Find the section after `chunks` array is created (~line 1095) and **ADD**:

```typescript
// Store chunks in PostgreSQL for BM25 search
console.log(`💾 [Document] Storing ${chunks.length} chunks in PostgreSQL for BM25...`);
try {
  await prisma.documentChunk.createMany({
    data: chunks.map((chunk, index) => ({
      documentId,
      chunkIndex: index,
      text: chunk.content,
      page: chunk.metadata?.pageNumber || null,
      startChar: chunk.metadata?.startChar || null,
      endChar: chunk.metadata?.endChar || null,
    })),
    skipDuplicates: true,
  });
  console.log(`✅ [Document] Stored ${chunks.length} chunks in PostgreSQL`);
} catch (dbError) {
  console.error('❌ [Document] Failed to store chunks in PostgreSQL:', dbError);
  // Don't fail ingestion, but log the error
}
```

#### 2.3 CREATE: Prisma migration for full-text index

Run: `npx prisma migrate dev --name add_fulltext_index`

Then edit the migration to add:
```sql
CREATE INDEX IF NOT EXISTS document_chunks_text_fts_idx
ON document_chunks
USING gin(to_tsvector('simple', text));
```

---

## PHASE 3: JSON SCHEMA VALIDATION (P1)

### Problem
No validation on JSON configs - malformed files cause runtime crashes.

#### 3.1 RUN: `npm install zod`

#### 3.2 CREATE: `src/schemas/configSchemas.ts`

```typescript
import { z } from 'zod';

// Fallback config schema
export const FallbackStyleSchema = z.object({
  id: z.string(),
  maxLength: z.number().optional(),
  structure: z.array(z.string()).optional(),
  tone: z.string().optional(),
  languages: z.object({
    en: z.object({ template: z.string() }),
    pt: z.object({ template: z.string() }),
    es: z.object({ template: z.string() }),
  }),
});

export const FallbackEntrySchema = z.object({
  key: z.string(),
  category: z.string(),
  description: z.string().optional(),
  defaultStyleId: z.string(),
  styles: z.array(FallbackStyleSchema),
});

export const FallbacksConfigSchema = z.object({
  version: z.string().optional(),
  fallbacks: z.array(FallbackEntrySchema),
});

// Intent pattern schema
export const IntentPatternSchema = z.object({
  keywords: z.record(z.array(z.string())),
  patterns: z.record(z.array(z.string())),
  priority: z.number().optional(),
});

export const IntentPatternsConfigSchema = z.record(IntentPatternSchema);

// System prompts schema
export const SystemPromptEntrySchema = z.object({
  mode: z.string(),
  description: z.string().optional(),
  languages: z.record(z.object({
    systemPrompt: z.string(),
    constraints: z.array(z.string()).optional(),
  })),
});

export const SystemPromptsConfigSchema = z.object({
  version: z.string().optional(),
  prompts: z.array(SystemPromptEntrySchema),
});
```

#### 3.3 MODIFY: `src/services/core/promptConfig.service.ts`

**ADD** validation after JSON.parse (around line 1220):

```typescript
import { FallbacksConfigSchema, SystemPromptsConfigSchema } from '../../schemas/configSchemas';

// In loadFile method, after JSON.parse:
private loadFileWithValidation<T>(filename: string, schema: z.ZodSchema<T>): T {
  const filePath = path.join(this.dataDir, filename);
  const content = fs.readFileSync(filePath, 'utf-8');
  const data = JSON.parse(content);

  // Validate against schema
  const result = schema.safeParse(data);
  if (!result.success) {
    const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
    throw new Error(`[PromptConfig] Invalid ${filename}:\n${errors.join('\n')}`);
  }

  return result.data;
}
```

---

## PHASE 4: FIX INTENT TYPE MISMATCH (P1)

### Problem
`PredictedIntent` and `IntentClassificationV3` are incompatible types.

#### 4.1 MODIFY: `src/services/core/kodaOrchestratorV3.service.ts`

**ADD** adapter function (after imports):

```typescript
import { PredictedIntent, IntentName } from '../../types/intentV3.types';
import { IntentClassificationV3, PrimaryIntent, IntentDomain, QuestionType, QueryScope } from '../../types/ragV3.types';

/**
 * Adapt PredictedIntent to IntentClassificationV3
 * Maps 25 IntentNames to the simpler PrimaryIntent enum + adds required fields
 */
function adaptPredictedIntent(predicted: PredictedIntent): IntentClassificationV3 {
  // Map IntentName to PrimaryIntent
  const intentMapping: Record<string, PrimaryIntent> = {
    'DOC_QA': PrimaryIntent.DOCUMENT_QNA,
    'DOC_ANALYTICS': PrimaryIntent.ANALYTICS,
    'DOC_SEARCH': PrimaryIntent.SEARCH,
    'DOC_MANAGEMENT': PrimaryIntent.OTHER,
    'DOC_SUMMARIZE': PrimaryIntent.DOCUMENT_QNA,
    'PRODUCT_HELP': PrimaryIntent.PRODUCT_HELP,
    'ONBOARDING_HELP': PrimaryIntent.PRODUCT_HELP,
    'CHITCHAT': PrimaryIntent.CHITCHAT,
    'META_AI': PrimaryIntent.META_AI,
    'GENERIC_KNOWLEDGE': PrimaryIntent.OTHER,
    'REASONING_TASK': PrimaryIntent.OTHER,
    'TEXT_TRANSFORM': PrimaryIntent.OTHER,
  };

  const primaryIntent = intentMapping[predicted.primaryIntent] || PrimaryIntent.OTHER;

  // Determine if RAG is needed
  const ragIntents = ['DOC_QA', 'DOC_ANALYTICS', 'DOC_SEARCH', 'DOC_SUMMARIZE'];
  const requiresRAG = ragIntents.includes(predicted.primaryIntent);

  const productHelpIntents = ['PRODUCT_HELP', 'ONBOARDING_HELP', 'FEATURE_REQUEST'];
  const requiresProductHelp = productHelpIntents.includes(predicted.primaryIntent);

  return {
    primaryIntent,
    domain: requiresRAG ? IntentDomain.DOCUMENTS : IntentDomain.GENERAL,
    questionType: QuestionType.OTHER,
    scope: QueryScope.ALL_DOCS,
    language: predicted.language,
    requiresRAG,
    requiresProductHelp,
    target: { type: 'NONE' },
    confidence: predicted.confidence,
    matchedPatterns: predicted.matchedPattern ? [predicted.matchedPattern] : [],
    matchedKeywords: predicted.matchedKeywords,
  };
}
```

**REPLACE** `any` types in constructor with proper types:

**FROM:**
```typescript
constructor(
  services: {
    retrievalEngine: any;
    answerEngine: any;
    documentSearch?: any;
    // ...
  }
)
```

**TO:**
```typescript
constructor(
  services: {
    retrievalEngine: KodaRetrievalEngineV3;
    answerEngine: KodaAnswerEngineV3;
    documentSearch?: DocumentSearchService;
    // ...
  }
)
```

---

## PHASE 5: INGESTION INTEGRITY (P1)

#### 5.1 MODIFY: `src/services/document.service.ts`

**ADD** extraction validation after text extraction (~line 485):

```typescript
// Guard: Fail if extraction returned no usable text
if (!extractedText || extractedText.trim().length < 10) {
  throw new Error(`Document extraction failed - no readable text found (length: ${extractedText?.length || 0})`);
}
```

#### 5.2 MODIFY: `src/services/vectorEmbedding.service.ts`

**ADD** transaction rollback on partial failure:

```typescript
async storeDocumentEmbeddings(documentId: string, chunks: any[]): Promise<void> {
  let pineconeSuccess = false;

  try {
    // Step 1: Upsert to Pinecone
    await pineconeService.upsertDocumentEmbeddings(...);
    pineconeSuccess = true;

    // Step 2: Insert to PostgreSQL
    await prisma.documentEmbedding.createMany(...);

  } catch (error) {
    // Rollback: If Pinecone succeeded but PG failed, delete from Pinecone
    if (pineconeSuccess) {
      console.error('❌ [VectorEmbedding] PG failed after Pinecone success - rolling back Pinecone');
      try {
        await pineconeService.deleteDocumentEmbeddings(documentId);
      } catch (rollbackError) {
        console.error('❌ [VectorEmbedding] Rollback failed:', rollbackError);
      }
    }
    throw error;
  }
}
```

---

## PHASE 6: CLEANUP DEAD CODE

### Files to Clean

#### `src/services/core/kodaAnswerEngineV3.service.ts`
- DELETE: `streamAnswer()` method (lines 228-247)
- DELETE: `delay()` helper (line 486)
- DELETE: `StreamAnswerParams` interface if unused
- DELETE: `import { Writable } from 'stream'` if unused

#### `src/controllers/rag.controller.ts`
- DELETE: All `words.split(' ')` fake streaming code

#### `src/services/chat.service.ts`
- DELETE: All `words.split(' ')` fake streaming code

---

## PHASE 7: FINAL VERIFICATION

### Checklist

```bash
# 1. TypeScript check
cd backend && npx tsc --noEmit

# 2. Test streaming endpoint
curl -X POST http://localhost:3001/api/rag/query/stream \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query":"test","conversationId":"test-123"}' \
  --no-buffer

# 3. Check BM25 logs for errors
# Should NOT see: "relation \"chunks\" does not exist"

# 4. Test document upload
# Verify DocumentChunk table has rows after upload

# 5. Verify JSON validation works
# Intentionally break a JSON file and restart server
# Should fail fast with clear error message
```

---

## Summary: What Gets Deleted

| File | Lines/Code to Delete |
|------|----------------------|
| `kodaAnswerEngineV3.service.ts` | `streamAnswer()` method, `delay()` helper |
| `rag.controller.ts` | `words.split(' ')` loop (lines 304-308) |
| `chat.service.ts` | `words.split(' ')` loop (lines 260-264) |
| `kodaOrchestratorV3.service.ts` | All `any` types in constructor |
| `kodaHybridSearch.service.ts` | Old SQL query with wrong table/columns |

## Summary: What Gets Added

| File | New Code |
|------|----------|
| `streaming.types.ts` | NEW FILE - streaming event types |
| `configSchemas.ts` | NEW FILE - zod schemas |
| `geminiGateway.service.ts` | `streamText()` AsyncGenerator |
| `kodaAnswerEngineV3.service.ts` | `streamWithDocs()` AsyncGenerator |
| `kodaOrchestratorV3.service.ts` | `orchestrateStream()` AsyncGenerator, `adaptPredictedIntent()` |
| `rag.controller.ts` | True streaming consumer loop |
| `document.service.ts` | DocumentChunk storage, extraction validation |
| `kodaHybridSearch.service.ts` | Fixed SQL with correct table/columns |
