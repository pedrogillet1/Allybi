import prisma from "../../config/database";
import { resolveIndexingPolicySnapshot } from "./indexingPolicy.service";
import pineconeService from "./pinecone.service";
import {
  deleteChunkEmbeddings as deleteChunkEmbeddingsV1,
  generateEmbedding as generateEmbeddingV1,
  storeDocumentEmbeddings as storeDocumentEmbeddingsV1,
  type InputChunk,
  type StoreEmbeddingsOptions,
} from "./vectorEmbedding.service";

async function verifyIndexedVectorCount(params: {
  documentId: string;
  userId: string;
}): Promise<void> {
  const expectedCount = await prisma.documentChunk.count({
    where: { documentId: params.documentId },
  });
  if (expectedCount <= 0) {
    throw new Error(
      `[vectorEmbedding.v2] verification failed: no chunk rows found for ${params.documentId}`,
    );
  }
  const verifyResult = await pineconeService.verifyDocumentEmbeddings(
    params.documentId,
    {
      userId: params.userId,
      minCount: expectedCount,
      expectedCount,
      topK: Math.max(expectedCount + 20, 1000),
    },
  );
  if (!verifyResult.success) {
    throw new Error(
      `[vectorEmbedding.v2] Pinecone verification mismatch for ${params.documentId}: ${verifyResult.message}`,
    );
  }
}

export async function generateEmbedding(text: string): Promise<number[]> {
  return generateEmbeddingV1(text);
}

export async function storeDocumentEmbeddings(
  documentId: string,
  chunks: InputChunk[],
  options: StoreEmbeddingsOptions = {},
): Promise<void> {
  const indexingPolicy = resolveIndexingPolicySnapshot();
  const docBefore = await prisma.document.findUnique({
    where: { id: documentId },
    select: { id: true, userId: true, indexingOperationId: true },
  });
  if (!docBefore) {
    throw new Error(`Document not found: ${documentId}`);
  }

  const previousOperationId = String(docBefore.indexingOperationId || "").trim();
  const strictVerify = options.strictVerify ?? indexingPolicy.strictFailClosed;
  const requireVerificationBeforeCleanup = indexingPolicy.verifyRequired;
  const allowUnverifiedPreviousOpDelete =
    indexingPolicy.allowUnverifiedPreviousOperationDelete;

  await storeDocumentEmbeddingsV1(documentId, chunks, {
    ...options,
    // v2 flow writes new vectors first and only deletes previous operation vectors
    // after successful write+verification to avoid pre-delete loss.
    preDeleteVectors: false,
    strictVerify: false,
    verifyAfterStore: false,
  });

  const docAfter = await prisma.document.findUnique({
    where: { id: documentId },
    select: { id: true, userId: true, indexingOperationId: true },
  });
  if (!docAfter) {
    throw new Error(`Document not found after indexing: ${documentId}`);
  }
  const currentOperationId = String(docAfter.indexingOperationId || "").trim();
  const userId = String(docAfter.userId || "").trim();
  const shouldVerify =
    pineconeService.isAvailable() &&
    (strictVerify || requireVerificationBeforeCleanup);
  let verificationPassed = false;

  if (shouldVerify) {
    try {
      await verifyIndexedVectorCount({ documentId, userId });
      verificationPassed = true;
    } catch (error: any) {
      const message = String(error?.message || error || "unknown_error");
      if (currentOperationId) {
        try {
          await pineconeService.deleteEmbeddingsByOperationId(
            documentId,
            currentOperationId,
            { userId },
          );
        } catch {
          // best effort rollback; preserve original error surface
        }
      }
      throw new Error(message);
    }
  }

  // Delete previous operation vectors only after verification succeeds, unless
  // explicitly overridden for emergency rollback scenarios.
  const mayDeletePreviousOperation =
    verificationPassed || allowUnverifiedPreviousOpDelete;
  if (
    mayDeletePreviousOperation &&
    previousOperationId &&
    currentOperationId &&
    previousOperationId !== currentOperationId &&
    pineconeService.isAvailable()
  ) {
    await pineconeService.deleteEmbeddingsByOperationId(
      documentId,
      previousOperationId,
      { userId },
    );
  }
}

export async function deleteDocumentEmbeddings(
  documentId: string,
): Promise<void> {
  if (!documentId) return;

  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: { userId: true },
  });
  const userId = String(doc?.userId || "").trim();

  if (pineconeService.isAvailable() && userId) {
    await pineconeService.deleteDocumentEmbeddings(documentId, { userId });
  }

  const txTimeout = parseInt(
    process.env.PRISMA_TRANSACTION_TIMEOUT || "120000",
    10,
  );
  await prisma.$transaction(
    async (tx) => {
      await tx.documentChunk.deleteMany({ where: { documentId } });
    },
    { maxWait: 10000, timeout: txTimeout },
  );
}

export async function deleteChunkEmbeddings(chunkIds: string[]): Promise<void> {
  return deleteChunkEmbeddingsV1(chunkIds);
}

const vectorEmbeddingServiceV2 = {
  generateEmbedding,
  storeDocumentEmbeddings,
  deleteDocumentEmbeddings,
  deleteChunkEmbeddings,
};

export default vectorEmbeddingServiceV2;
