import prisma from '../src/config/database';
import { documentQueue } from '../src/queues/document.queue';

(async () => {
  // DB status
  const failedDocs = await prisma.document.findMany({
    where: { status: 'failed' },
    select: { id: true, filename: true, mimeType: true, error: true },
  });

  const categories: Record<string, string[]> = {};
  for (const d of failedDocs) {
    const err = (d.error || 'no error message').substring(0, 100);
    if (!categories[err]) categories[err] = [];
    categories[err].push(`${d.filename} (${d.mimeType})`);
  }

  console.log(`\n=== Failed documents by DB error (${failedDocs.length} total) ===`);
  for (const [err, files] of Object.entries(categories).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n  [${files.length}] ${err}`);
    for (const f of files.slice(0, 5)) {
      console.log(`      - ${f}`);
    }
    if (files.length > 5) console.log(`      ... and ${files.length - 5} more`);
  }

  // Queue status
  const failed = await documentQueue.getFailed(0, 200);
  const queueReasons: Record<string, number> = {};
  for (const j of failed) {
    const r = (j.failedReason || 'unknown').substring(0, 120);
    queueReasons[r] = (queueReasons[r] || 0) + 1;
  }

  console.log(`\n=== Queue failed jobs (${failed.length} total) ===`);
  for (const [r, c] of Object.entries(queueReasons).sort((a, b) => (b[1] as number) - (a[1] as number))) {
    console.log(`  [${c}] ${r}`);
  }

  // Overall summary
  const statusCounts = await prisma.document.groupBy({ by: ['status'], _count: true });
  const embeddingCount = await prisma.documentEmbedding.count();
  const docsWithEmbed = await prisma.documentEmbedding.groupBy({ by: ['documentId'], _count: true });

  console.log('\n=== SUMMARY ===');
  for (const s of statusCounts) {
    console.log(`  ${s.status}: ${s._count}`);
  }
  console.log(`  Documents with embeddings: ${docsWithEmbed.length}`);
  console.log(`  Total embedding vectors: ${embeddingCount}`);

  process.exit(0);
})();
