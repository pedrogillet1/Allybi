#!/usr/bin/env npx ts-node
import prisma from "../../src/config/database";
import { documentContentVault } from "../../src/services/documents/documentContentVault.service";

type BackfillDoc = {
  id: string;
  userId: string;
  rawText: string | null;
  previewText: string | null;
  renderableContent: string | null;
};

const BATCH_SIZE = Number(process.env.SECURITY_BACKFILL_BATCH_SIZE || 100);
const DRY_RUN = process.argv.includes("--dry-run");

function hasPlaintext(doc: BackfillDoc): boolean {
  return Boolean(doc.rawText || doc.previewText || doc.renderableContent);
}

async function loadBatch(cursorId: string | null): Promise<BackfillDoc[]> {
  const docs = await prisma.document.findMany({
    where: {
      OR: [
        { rawText: { not: null } },
        { previewText: { not: null } },
        { renderableContent: { not: null } },
      ],
    },
    ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    orderBy: { id: "asc" },
    take: BATCH_SIZE,
    select: {
      id: true,
      userId: true,
      rawText: true,
      previewText: true,
      renderableContent: true,
    },
  });

  return docs;
}

async function main(): Promise<void> {
  if (!documentContentVault.isEnabled()) {
    throw new Error(
      "Document encryption runtime is not enabled. Set KODA_MASTER_KEY_BASE64 before backfill.",
    );
  }

  let cursorId: string | null = null;
  let totalScanned = 0;
  let totalEncrypted = 0;

  while (true) {
    const batch = await loadBatch(cursorId);
    if (!batch.length) break;

    for (const doc of batch) {
      totalScanned += 1;
      if (!hasPlaintext(doc)) continue;

      if (DRY_RUN) {
        totalEncrypted += 1;
        continue;
      }

      await documentContentVault.encryptDocumentFields(doc.userId, doc.id, {
        rawText: doc.rawText ?? undefined,
        previewText: doc.previewText ?? undefined,
        renderableContent: doc.renderableContent ?? undefined,
      });

      await prisma.documentMetadata.updateMany({
        where: {
          documentId: doc.id,
          extractedText: { not: null },
        },
        data: {
          extractedText: null,
        },
      });

      totalEncrypted += 1;
    }

    cursorId = batch[batch.length - 1]?.id || null;
    if (batch.length < BATCH_SIZE) break;
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        dryRun: DRY_RUN,
        scanned: totalScanned,
        encrypted: totalEncrypted,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error("[backfill-document-encryption] failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
