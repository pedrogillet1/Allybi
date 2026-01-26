#!/usr/bin/env npx ts-node --transpile-only
/**
 * Quick test: 15 queries against analise_mezanino_guarda_moveis.pdf
 */

import prisma from './src/config/database';
import { initializeContainer, getContainer } from './src/bootstrap/container';

const QUERIES = [
  "Hey — can you open analise_mezanino_guarda_moveis.pdf for me?",
  "What's this document about?",
  "What's the total investment in this mezzanine project?",
  "How many m² is the mezzanine, and what R$/m² did they use?",
  "Can you pull the main assumptions from the analysis?",
  "What are the biggest risks or constraints mentioned?",
  "Where does it talk about ROI / payback / retorno? Point me to the page/section.",
  "Is there any timeline or schedule in here? If yes, extract it.",
  "Explain the financial logic in one clear paragraph.",
  "Put the cost breakdown into a small table (item → value → note).",
  "Can you quote the exact line where the total investment is stated?",
  "What operational changes does this mezzanine create (capacity, access, safety, flow)?",
  "What variables would change the outcome of the analysis the most?",
  "If I'm presenting this to an investor, what are the top 3 points that matter?",
  "Does it mention any recommendations or next steps? If yes, list them.",
];

const FALLBACK_PATTERNS = [
  /no documents/i,
  /nenhum documento/i,
  /no relevant/i,
  /couldn't find/i,
  /didn't find/i,
  /não encontr/i,
  /not found/i,
  /no information/i,
  /upload a (pdf|doc|file)/i,
  /knowledge base is empty/i,
  /still being processed/i,
  /having trouble/i,
  /try again/i,
  /tente novamente/i,
];

async function main() {
  console.log('🔍 Initializing test...\n');

  // Ensure prisma is connected
  await prisma.$connect();

  // Find user with the document
  const user = await prisma.user.findFirst({
    where: {
      documents: {
        some: {
          filename: { contains: 'mezanino', mode: 'insensitive' }
        }
      }
    },
    select: { id: true, email: true }
  });

  if (!user) {
    console.error('❌ No user found with mezanino document');
    process.exit(1);
  }
  console.log(`✓ User: ${user.email}`);

  // Find the document
  const doc = await prisma.document.findFirst({
    where: {
      userId: user.id,
      filename: { contains: 'mezanino', mode: 'insensitive' }
    },
    select: { id: true, filename: true, status: true }
  });

  if (!doc) {
    console.error('❌ Document not found');
    process.exit(1);
  }
  console.log(`✓ Document: ${doc.filename} (status: ${doc.status})`);

  // Initialize container
  console.log('\n🔧 Initializing services...');
  await initializeContainer();
  const container = getContainer();
  const orchestrator = container.getOrchestrator();
  console.log('✓ Orchestrator ready\n');

  // Create conversation
  const conversation = await prisma.conversation.create({
    data: { userId: user.id, title: 'Mezanino Test' }
  });
  console.log(`✓ Conversation: ${conversation.id}\n`);

  console.log('='.repeat(80));
  console.log('RUNNING 15 QUERIES');
  console.log('='.repeat(80));

  let failures = 0;
  const results: Array<{q: number; ok: boolean; preview: string; reasonCode?: string}> = [];

  for (let i = 0; i < QUERIES.length; i++) {
    const query = QUERIES[i];
    console.log(`\n[${i+1}/15] ${query.substring(0, 60)}...`);

    try {
      const stream = orchestrator.orchestrateStream({
        userId: user.id,
        conversationId: conversation.id,
        text: query,
        language: 'pt',
        context: { attachedDocumentIds: [doc.id] }
      });

      let fullText = '';
      let reasonCode: string | undefined;

      for await (const event of stream) {
        if (event.type === 'content') {
          fullText += event.text || '';
        }
        if (event.type === 'done') {
          fullText = event.formatted || fullText;
          reasonCode = (event as any).trace?.retrieval?.summary?.reasonCode;
        }
      }

      // Check for fallback patterns
      let isFallback = false;
      for (const pattern of FALLBACK_PATTERNS) {
        if (pattern.test(fullText)) {
          isFallback = true;
          break;
        }
      }

      const preview = fullText.substring(0, 100).replace(/\n/g, ' ');

      if (isFallback) {
        failures++;
        console.log(`   ❌ FALLBACK: "${preview}..."`);
      } else {
        console.log(`   ✓ OK (${fullText.length} chars) reasonCode=${reasonCode || 'N/A'}`);
        console.log(`   Preview: "${preview}..."`);
      }

      results.push({ q: i+1, ok: !isFallback, preview, reasonCode });

    } catch (err: any) {
      failures++;
      console.log(`   ❌ ERROR: ${err.message}`);
      results.push({ q: i+1, ok: false, preview: `ERROR: ${err.message}` });
    }

    // Brief pause
    await new Promise(r => setTimeout(r, 300));
  }

  // Cleanup
  await prisma.conversation.delete({ where: { id: conversation.id } });

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total: ${QUERIES.length}`);
  console.log(`✓ Success: ${QUERIES.length - failures}`);
  console.log(`❌ Failures: ${failures}`);
  console.log(`Rate: ${((QUERIES.length - failures) / QUERIES.length * 100).toFixed(0)}%`);

  if (failures > 0) {
    console.log('\nFailed queries:');
    results.filter(r => !r.ok).forEach(r => {
      console.log(`  [${r.q}] ${r.preview}`);
    });
  }

  await prisma.$disconnect();
  process.exit(failures > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
