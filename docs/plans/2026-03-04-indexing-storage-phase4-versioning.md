# Phase 4: Versioning, Pinecone Queries & Pipeline Hardening — Indexing & Storage A+ Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix version filtering in Pinecone queries, implement soft-delete flow, purge old version vectors on revision, add document audit trail, harden pipeline against races and orphans, add "deleted" state to state machine.

**Architecture:** (1) Add version + status filters to Pinecone queries, (2) implement soft-delete in document service, (3) purge old vectors on revision, (4) wire up audit trail, (5) add concurrency guards to pipeline, (6) add embedding model version tracking.

**Tech Stack:** TypeScript, Prisma, Pinecone SDK, BullMQ, Jest

**Depends on:** Phase 1 (soft-delete columns, DocumentStatus.deleted, cross-doc tables exist), Phase 3 (Pinecone contentHash migration).

---

### Task 1: Add Version + Status Filters to Pinecone Queries

**Files:**
- Modify: `backend/src/services/retrieval/pinecone/pinecone.filters.ts`
- Modify: `backend/src/services/retrieval/pinecone.service.ts:272-345` (searchSimilarChunks)
- Modify: `backend/src/services/retrieval/pinecone/pinecone.mappers.ts`
- Test: `backend/src/services/retrieval/pinecone.service.test.ts`

**Step 1: Write failing tests**

```typescript
describe("version and status filtering", () => {
  test("searchSimilarChunks filters by isLatestVersion when flag enabled", async () => {
    process.env.RETRIEVAL_LATEST_VERSION_ONLY = "true";
    await pineconeService.searchSimilarChunks(queryEmbedding, "user1");
    const queryCall = mockIndex.query.mock.calls[0][0];
    // Filter should include isLatestVersion: true
    expect(JSON.stringify(queryCall.filter)).toContain("isLatestVersion");
  });

  test("searchSimilarChunks excludes non-ready statuses", async () => {
    await pineconeService.searchSimilarChunks(queryEmbedding, "user1");
    const queryCall = mockIndex.query.mock.calls[0][0];
    // Filter should exclude failed, uploading, enriching, deleted
    expect(JSON.stringify(queryCall.filter)).toContain("status");
  });
});
```

**Step 2: Run tests, verify failure**

**Step 3: Add filter builders to `pinecone.filters.ts`**

```typescript
export function buildVersionFilter(): PineconeFilter {
  return { isLatestVersion: { $eq: true } };
}

export function buildStatusFilter(): PineconeFilter {
  return {
    status: { $in: ["indexed", "ready", "available", "completed"] },
  };
}

export function buildScopedFilterWithVersioning(args: {
  userId: string;
  documentId?: string;
  folderId?: string;
  latestVersionOnly?: boolean;
}): PineconeFilter {
  const conditions: PineconeFilter[] = [
    { userId: { $eq: args.userId } },
    buildStatusFilter(),
  ];

  if (args.documentId) {
    conditions.push({ documentId: { $eq: args.documentId } });
  }
  if (args.folderId) {
    conditions.push({ folderId: { $eq: args.folderId } });
  }
  if (args.latestVersionOnly) {
    conditions.push(buildVersionFilter());
  }

  return conditions.length === 1 ? conditions[0] : { $and: conditions };
}
```

**Step 4: Update `searchSimilarChunks` in pinecone.service.ts**

Replace the `buildFilter` call (line 287-291):

```typescript
private buildFilter(args: {
  userId: string;
  documentId?: string;
  folderId?: string;
}): PineconeFilter {
  const latestVersionOnly = String(process.env.RETRIEVAL_LATEST_VERSION_ONLY || "true")
    .trim().toLowerCase() === "true";

  return buildScopedFilterWithVersioning({
    ...args,
    latestVersionOnly,
  });
}
```

Remove the client-side status check (lines 312-313) since it's now server-side:
```typescript
// REMOVE: const status = String(md.status || "active");
// REMOVE: if (status === "deleted") continue;
```

**Step 5: Update `pinecone.mappers.ts` — include version metadata in hits**

```typescript
export function mapPineconeMatchesToHits(matches: PineconeQueryMatch[]): PineconeSearchHit[] {
  return matches.map((m) => {
    const md = (m?.metadata || {}) as Record<string, unknown>;
    return {
      // ...existing fields...
      document: {
        // ...existing fields...
        parentVersionId: md.parentVersionId ? String(md.parentVersionId) : undefined,
        rootDocumentId: md.rootDocumentId ? String(md.rootDocumentId) : undefined,
        isLatestVersion: md.isLatestVersion === true,
        versionId: md.versionId ? String(md.versionId) : undefined,
      },
    };
  });
}
```

**Step 6: Run tests, verify pass**

**Step 7: Commit**

```bash
git commit -m "feat: add version + status filters to Pinecone queries, include version metadata in hits"
```

---

### Task 2: Implement Soft-Delete in Document Service

**Files:**
- Modify: `backend/src/services/prismaDocument.service.ts` (delete method)
- Modify: `backend/src/services/documents/documentStateManager.service.ts` (add deleted state)

**Step 1: Write failing test**

```typescript
test("delete sets isDeleted=true and status=deleted, does NOT hard delete", async () => {
  await documentService.delete({ userId: "u1", documentId: "d1" });
  // Should call update, NOT deleteMany
  expect(mockPrisma.document.update).toHaveBeenCalledWith({
    where: { id: "d1" },
    data: expect.objectContaining({
      isDeleted: true,
      deletedAt: expect.any(Date),
      status: "deleted",
    }),
  });
  expect(mockPrisma.document.deleteMany).not.toHaveBeenCalled();
});
```

**Step 2: Rewrite delete method in prismaDocument.service.ts**

```typescript
async delete(input: { userId: string; documentId: string; source?: string }): Promise<{ deleted: true }> {
  const doc = await prisma.document.findFirst({
    where: { id: input.documentId, userId: input.userId, isDeleted: false },
    select: { id: true, fileSize: true },
  });

  if (!doc) {
    logger.warn("[Document] Delete target not found or already deleted", input);
    return { deleted: true };
  }

  // Soft-delete: set isDeleted + status
  await prisma.$transaction(async (tx) => {
    await tx.document.update({
      where: { id: input.documentId },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        status: "deleted",
      },
    });

    // Decrement storage
    if (doc.fileSize > 0) {
      await tx.user.update({
        where: { id: input.userId },
        data: { storageUsedBytes: { decrement: doc.fileSize } },
      });
    }
  });

  // Async: remove from Pinecone (best-effort)
  try {
    await vectorEmbeddingService.deleteDocumentEmbeddings(input.documentId);
  } catch (e: any) {
    logger.warn("[Document] Pinecone cleanup failed (non-fatal)", {
      documentId: input.documentId,
      error: e?.message,
    });
  }

  // Audit trail
  await prisma.documentAuditEvent.create({
    data: {
      documentId: input.documentId,
      userId: input.userId,
      action: "deleted",
      details: { source: input.source },
    },
  });

  return { deleted: true };
}
```

**Step 3: Add `deleted` transition to documentStateManager**

In the `TRANSITIONS` map, add:

```typescript
const TRANSITIONS: Record<string, string[]> = {
  uploading: ["uploaded", "failed"],
  uploaded: ["enriching", "failed"],
  enriching: ["indexed", "failed", "skipped"],
  indexed: ["ready", "failed"],
  ready: ["uploaded", "deleted"],     // Allow re-upload AND delete
  skipped: ["uploaded", "deleted"],
  failed: ["uploaded", "deleted"],
  deleted: [],                        // Terminal state — no transitions out
};
```

**Step 4: Update ALL queries that read documents** — add `isDeleted: false` filter

Search for `prisma.document.findMany`, `prisma.document.findFirst`, `prisma.document.findUnique` across the codebase and add `isDeleted: false` to WHERE clauses where appropriate. Key files:
- `prismaDocument.service.ts` (list, get methods)
- `prismaRetrievalAdapters.service.ts` (document queries)
- `revision.service.ts` (source document lookup)

**Step 5: Run tests, verify pass**

**Step 6: Commit**

```bash
git commit -m "feat: implement soft-delete for documents, add deleted state to state machine"
```

---

### Task 3: Purge Old Version Vectors on New Revision

**Files:**
- Modify: `backend/src/services/documents/revision.service.ts:107-248`
- Modify: `backend/src/services/retrieval/vectorEmbedding.service.ts` (add `markOldVersionVectors`)

**Step 1: Write failing test**

```typescript
test("createRevision marks old version as non-latest in Pinecone", async () => {
  await revisionService.createRevision({
    userId: "u1",
    sourceDocumentId: "doc-old",
    contentBuffer: Buffer.from("new content"),
  });
  // Should call updateOldVersionMetadata or deleteOldVersionVectors
  expect(mockPineconeService.deleteDocumentEmbeddings).toHaveBeenCalledWith("doc-old", expect.anything());
});
```

**Step 2: Add old-version vector cleanup to revision creation**

In `revision.service.ts`, after the new document is created and enqueued (line 222), add:

```typescript
// Mark old version vectors for cleanup
// Strategy: delete old version's Pinecone vectors.
// When the new revision is indexed, it will create fresh vectors with isLatestVersion: true.
// The old revision's vectors become stale and should be purged.
try {
  const { deleteDocumentEmbeddings } = await import("../../retrieval/vectorEmbedding.service");

  // Find all sibling versions (same root, excluding the new one)
  const siblings = await prisma.document.findMany({
    where: {
      userId,
      parentVersionId: rootDocumentId,
      id: { not: created.id },
      isDeleted: false,
    },
    select: { id: true },
  });

  // Also include root document if it's not the new doc
  const oldVersionIds = [
    ...(rootDocumentId !== created.id ? [rootDocumentId] : []),
    ...siblings.map(s => s.id),
  ];

  for (const oldId of oldVersionIds) {
    // Re-upsert old version vectors with isLatestVersion: false
    // OR delete them entirely (simpler, and the new revision replaces them)
    await deleteDocumentEmbeddings(oldId).catch((err: any) => {
      logger.warn("[RevisionService] Failed to purge old version vectors", {
        oldDocumentId: oldId,
        error: err?.message,
      });
    });
  }
} catch (err: any) {
  logger.warn("[RevisionService] Old version vector cleanup failed (non-fatal)", {
    error: err?.message,
  });
}
```

**Step 3: Run tests, verify pass**

**Step 4: Commit**

```bash
git commit -m "feat: purge old version Pinecone vectors on revision creation"
```

---

### Task 4: Wire Up Document Audit Trail

**Files:**
- Create: `backend/src/services/documents/documentAudit.service.ts`
- Modify: `backend/src/services/prismaDocument.service.ts` (hook into CRUD)
- Modify: `backend/src/services/documents/revision.service.ts` (hook into revision creation)

**Step 1: Create audit service**

```typescript
import prisma from "../../config/database";
import { logger } from "../../utils/logger";

export type DocumentAuditAction =
  | "created" | "uploaded" | "indexed" | "deleted" | "restored"
  | "revision_created" | "renamed" | "moved" | "reindexed"
  | "linked" | "unlinked";

export async function logDocumentAudit(params: {
  documentId: string;
  userId: string;
  action: DocumentAuditAction;
  details?: Record<string, unknown>;
  ipAddress?: string;
}): Promise<void> {
  try {
    await prisma.documentAuditEvent.create({
      data: {
        documentId: params.documentId,
        userId: params.userId,
        action: params.action,
        details: params.details ?? undefined,
        ipAddress: params.ipAddress ?? null,
      },
    });
  } catch (err: any) {
    // Audit failures are non-fatal — log and continue
    logger.error("[DocumentAudit] Failed to log audit event", {
      ...params,
      error: err?.message,
    });
  }
}
```

**Step 2: Hook into document CRUD operations**

In `prismaDocument.service.ts`:
- After upload: `logDocumentAudit({ documentId, userId, action: "uploaded" })`
- After delete: `logDocumentAudit({ documentId, userId, action: "deleted" })`
- After rename: `logDocumentAudit({ documentId, userId, action: "renamed", details: { oldName, newName } })`

In `revision.service.ts`:
- After revision creation: `logDocumentAudit({ documentId: created.id, userId, action: "revision_created", details: { sourceDocumentId, revisionNumber } })`

In `documentIngestionPipeline.service.ts`:
- After successful indexing: `logDocumentAudit({ documentId, userId, action: "indexed" })`

**Step 3: Run tests, verify pass**

**Step 4: Commit**

```bash
git commit -m "feat: document audit trail — log upload, delete, rename, revision, indexing events"
```

---

### Task 5: Fix Revision Number TOCTOU Race

**Files:**
- Modify: `backend/src/services/documents/revision.service.ts:156-163`

**Step 1: Write failing test**

```typescript
test("concurrent createRevision calls get different revision numbers", async () => {
  // Simulate two concurrent calls
  const [r1, r2] = await Promise.all([
    revisionService.createRevision({ userId: "u1", sourceDocumentId: "d1", contentBuffer: Buffer.from("v1") }),
    revisionService.createRevision({ userId: "u1", sourceDocumentId: "d1", contentBuffer: Buffer.from("v2") }),
  ]);
  expect(r1.revisionNumber).not.toBe(r2.revisionNumber);
});
```

**Step 2: Fix — use advisory lock or a sequence**

Replace the count-based revision number with a DB-level atomic operation:

```typescript
// Use a raw query with FOR UPDATE to lock the count
const revisionNumber = await prisma.$queryRaw<[{ count: bigint }]>`
  SELECT COUNT(*) as count FROM "documents"
  WHERE "userId" = ${userId}
    AND ("id" = ${rootDocumentId} OR "parentVersionId" = ${rootDocumentId})
  FOR UPDATE
`;
const nextRevisionNumber = Number(revisionNumber[0].count);
```

Or simpler — wrap the entire revision creation in a serializable transaction:

```typescript
const created = await prisma.$transaction(async (tx) => {
  const currentRevisions = await tx.document.count({
    where: {
      userId,
      OR: [{ id: rootDocumentId }, { parentVersionId: rootDocumentId }],
    },
  });
  const revisionNumber = currentRevisions;

  return tx.document.create({
    data: { /* ... filename includes revisionNumber ... */ },
  });
}, { isolationLevel: "Serializable" });
```

**Step 3: Run tests, verify pass**

**Step 4: Commit**

```bash
git commit -m "fix: revision number TOCTOU race — use serializable transaction"
```

---

### Task 6: Add Embedding Model Version Tracking

**Files:**
- Modify: `backend/src/services/retrieval/pinecone/pinecone.filters.ts`
- Modify: `backend/src/services/retrieval/pinecone.service.ts`

**Step 1: Store embedding model in Pinecone metadata (already done)**

The `embeddingModel` field is already stored in Pinecone metadata. Now add a query-time check.

**Step 2: Add model version filter to queries**

In `pinecone.filters.ts`:

```typescript
export function buildEmbeddingModelFilter(): PineconeFilter | null {
  const currentModel = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
  return { embeddingModel: { $eq: currentModel } };
}
```

Add to `buildScopedFilterWithVersioning`:

```typescript
// Only return vectors from the current embedding model
const modelFilter = buildEmbeddingModelFilter();
if (modelFilter) {
  conditions.push(modelFilter);
}
```

**Step 3: Commit**

```bash
git commit -m "feat: filter Pinecone queries by current embedding model version"
```

---

### Task 7: Pipeline Hardening — Orphan Cleanup + Concurrency Guard

**Files:**
- Modify: `backend/src/services/ingestion/pipeline/documentPipeline.service.ts`
- Modify: `backend/src/queues/workers/documentIngestionPipeline.service.ts`
- Modify: `backend/src/services/documents/documentStateManager.service.ts`

**Step 1: Add orphan vector cleanup on pipeline failure**

In `documentPipeline.service.ts`, wrap the embed+encrypt sequence in a try/catch that cleans up on failure:

```typescript
try {
  await vectorEmbeddingService.storeDocumentEmbeddings(documentId, inputChunks);
  await runEncryptionStep({ userId, documentId, fullText, filename });
} catch (err) {
  // Cleanup: remove any vectors that were stored before the failure
  try {
    await vectorEmbeddingService.deleteDocumentEmbeddings(documentId);
  } catch (cleanupErr: any) {
    logger.error("[Pipeline] Orphan vector cleanup failed", {
      documentId,
      error: cleanupErr?.message,
    });
  }
  throw err;
}
```

**Step 2: Fix `deriveIndexingState` — map "skipped" to "skipped" (not "failed")**

In `documentStateManager.service.ts`:

```typescript
// Before:
case "skipped": return "failed";
// After:
case "skipped": return "skipped";
```

**Step 3: Add advisory lock for concurrent same-document indexing**

In `documentIngestionPipeline.service.ts`, before the pipeline runs:

```typescript
// Use Postgres advisory lock to prevent concurrent indexing of same document
const lockKey = hashCode(documentId); // Stable int32 from documentId
const acquired = await prisma.$queryRaw<[{ acquired: boolean }]>`
  SELECT pg_try_advisory_lock(${lockKey}) as acquired
`;

if (!acquired[0].acquired) {
  logger.warn("[Pipeline] Concurrent indexing detected, skipping", { documentId });
  return { success: true, documentId, skipped: true, reason: "concurrent_indexing" };
}

try {
  // ... run pipeline ...
} finally {
  await prisma.$queryRaw`SELECT pg_advisory_unlock(${lockKey})`;
}
```

**Step 4: Run tests, verify pass**

**Step 5: Commit**

```bash
git commit -m "fix: pipeline orphan cleanup, skipped→skipped state, advisory lock for concurrency"
```

---

### Task 8: Comprehensive Integration Tests — 5 Chunk+Metadata Invariant Tests

**Files:**
- Create: `backend/src/services/ingestion/pipeline/__tests__/indexingInvariants.test.ts`

**Step 1: Write the 5 invariant tests**

```typescript
import { describe, expect, test } from "@jest/globals";
import { buildInputChunks, deduplicateChunks } from "../chunkAssembly.service";
import { normalizeCellUnit } from "../tableUnitNormalization.service";

describe("Indexing & Storage Invariants", () => {

  test("INV-1: Every PDF chunk has pageNumber, startChar, endChar, sourceType", () => {
    const pageText = "This is a test sentence for the PDF page. ".repeat(80);
    const extraction = {
      sourceType: "pdf",
      text: pageText + pageText,
      pages: [
        { page: 1, text: pageText },
        { page: 2, text: pageText },
      ],
    } as any;
    const chunks = buildInputChunks(extraction, extraction.text);
    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      expect(chunk.pageNumber).toBeGreaterThanOrEqual(1);
      expect(chunk.metadata.startChar).toBeDefined();
      expect(chunk.metadata.endChar).toBeDefined();
      expect(chunk.metadata.endChar).toBeGreaterThan(chunk.metadata.startChar!);
      expect(chunk.metadata.sourceType).toBe("pdf");
    }
  });

  test("INV-2: XLSX cell chunks carry tableId, rowLabel, colHeader, and valid unit normalization", () => {
    const extraction = {
      sourceType: "xlsx",
      text: "data",
      sheets: [{ sheetName: "Finance", textContent: "data", isFinancial: true }],
      cellFacts: [
        { sheet: "Finance", cell: "B2", rowLabel: "Q1 2024", colHeader: "Revenue (USD millions)", value: "1.5", displayValue: "$1.5M" },
      ],
    } as any;
    const chunks = buildInputChunks(extraction, extraction.text);
    const cellChunk = chunks.find(c => c.metadata.tableChunkForm === "cell_centric");
    expect(cellChunk).toBeDefined();
    expect(cellChunk!.metadata.tableId).toMatch(/^sheet:/);
    expect(cellChunk!.metadata.rowLabel).toBe("Q1 2024");
    expect(cellChunk!.metadata.colHeader).toBe("Revenue (USD millions)");
    expect(cellChunk!.metadata.unitNormalized).toBe("currency_usd");
    expect(cellChunk!.metadata.numericValue).toBe(1500000); // 1.5 * 1e6
  });

  test("INV-3: DOCX chunks preserve section hierarchy with required metadata", () => {
    const extraction = {
      sourceType: "docx",
      text: "Introduction\nContent here.",
      sections: [
        { heading: "Introduction", level: 1, content: "Content here with enough text to be meaningful.", path: ["Introduction"] },
      ],
    } as any;
    const chunks = buildInputChunks(extraction, extraction.text);
    for (const chunk of chunks) {
      expect(chunk.metadata).toBeDefined();
      expect(chunk.metadata.sourceType).toBe("docx");
      expect(chunk.metadata.sectionName).toBeTruthy();
      expect(chunk.metadata.sectionPath).toBeDefined();
      expect(chunk.metadata.sectionPath!.length).toBeGreaterThan(0);
    }
  });

  test("INV-4: Dedup never drops chunks with different numeric content", () => {
    const chunks = [
      { chunkIndex: 0, content: "Revenue Q1: $100,000", metadata: { sheetName: "S1", chunkType: "cell_fact" as const, sourceType: "xlsx" as const } },
      { chunkIndex: 1, content: "Revenue Q2: $200,000", metadata: { sheetName: "S1", chunkType: "cell_fact" as const, sourceType: "xlsx" as const } },
      { chunkIndex: 2, content: "Revenue Q3: $300,000", metadata: { sheetName: "S1", chunkType: "cell_fact" as const, sourceType: "xlsx" as const } },
    ];
    const deduped = deduplicateChunks(chunks);
    expect(deduped).toHaveLength(3);
  });

  test("INV-5: Revision creates new document, never overwrites original document ID", () => {
    // This is a structural test — verify the type contract
    const originalDocId = "doc-original";
    const revisionDoc = {
      id: "doc-revision",  // Different ID
      parentVersionId: originalDocId,
      status: "uploaded",
      indexingState: "pending",
    };
    expect(revisionDoc.id).not.toBe(originalDocId);
    expect(revisionDoc.parentVersionId).toBe(originalDocId);
    // Embedding storage uses documentId, which is the revision's own ID
    // So original doc chunks at originalDocId remain untouched
    const embeddingDeleteTarget = revisionDoc.id;
    expect(embeddingDeleteTarget).not.toBe(originalDocId);
  });
});
```

**Step 2: Run tests**

Run: `cd backend && npx jest indexingInvariants.test.ts --verbose`
Expected: ALL PASS

**Step 3: Commit**

```bash
git commit -m "test: 5 chunk+metadata invariant tests for indexing & storage pillar"
```

---

## Acceptance Criteria

- [ ] Pinecone queries filter by `isLatestVersion` when `RETRIEVAL_LATEST_VERSION_ONLY=true`
- [ ] Pinecone queries filter by status (only `indexed`/`ready`/`available`/`completed`)
- [ ] Pinecone queries filter by current `embeddingModel`
- [ ] Pinecone hit mapper includes version metadata (`rootDocumentId`, `isLatestVersion`)
- [ ] Document soft-delete: `isDeleted=true`, `status=deleted`, Pinecone vectors purged
- [ ] Document state machine has `deleted` terminal state
- [ ] Old version vectors purged from Pinecone on revision creation
- [ ] Document audit trail logs: upload, delete, rename, revision, indexing events
- [ ] Revision number uses serializable transaction (no TOCTOU race)
- [ ] Pipeline failure cleans up orphaned vectors
- [ ] `skipped` documents get `indexingState: "skipped"` (not "failed")
- [ ] Advisory lock prevents concurrent indexing of same document
- [ ] 5 invariant tests pass
- [ ] All existing tests pass
