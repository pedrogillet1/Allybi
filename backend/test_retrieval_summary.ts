/**
 * Test script to verify retrieval summary implementation
 * Runs 15 queries against analise_mezanino_guarda_moveis.pdf in one conversation
 */

import prisma from './src/config/database';

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

// Fallback patterns to detect
const FALLBACK_PATTERNS = [
  /no documents/i,
  /no relevant/i,
  /couldn't find/i,
  /didn't find/i,
  /not found/i,
  /no information/i,
  /upload a (pdf|doc|file)/i,
  /knowledge base is empty/i,
  /still being processed/i,
  /having trouble/i,
  /try again/i,
];

interface TestResult {
  queryNum: number;
  query: string;
  responsePreview: string;
  isFallback: boolean;
  fallbackPattern?: string;
  hasContent: boolean;
  hasCitations: boolean;
  reasonCode?: string;
}

async function findTestUser(): Promise<{ id: string; email: string } | null> {
  const user = await prisma.user.findFirst({
    where: {
      documents: {
        some: {
          filename: { contains: 'mezanino' }
        }
      }
    },
    select: { id: true, email: true }
  });
  return user;
}

async function findDocument(userId: string): Promise<{ id: string; filename: string } | null> {
  const doc = await prisma.document.findFirst({
    where: {
      userId,
      filename: { contains: 'mezanino' }
    },
    select: { id: true, filename: true }
  });
  return doc;
}

async function sendQuery(
  userId: string,
  conversationId: string,
  query: string,
  documentId?: string
): Promise<{ text: string; reasonCode?: string; hasCitations: boolean }> {
  // Import the orchestrator directly for testing
  const { default: KodaOrchestratorV3 } = await import('./src/services/core/kodaOrchestratorV3.service');
  const { createContainer } = await import('./src/bootstrap/container');

  const container = await createContainer();
  const orchestrator = container.resolve<typeof KodaOrchestratorV3>('kodaOrchestrator');

  const result = await orchestrator.handleRequest({
    userId,
    conversationId,
    text: query,
    language: 'pt',
    context: documentId ? {
      attachedDocumentIds: [documentId]
    } : undefined
  });

  // Collect full response from stream
  let fullText = '';
  let reasonCode: string | undefined;
  let hasCitations = false;

  for await (const event of result) {
    if (event.type === 'content') {
      fullText += event.text || '';
    }
    if (event.type === 'done') {
      fullText = event.formatted || fullText;
      hasCitations = (event.citations?.length || 0) > 0;
      reasonCode = (event as any).trace?.retrieval?.summary?.reasonCode;
    }
  }

  return { text: fullText, reasonCode, hasCitations };
}

function detectFallback(text: string): { isFallback: boolean; pattern?: string } {
  for (const pattern of FALLBACK_PATTERNS) {
    if (pattern.test(text)) {
      return { isFallback: true, pattern: pattern.toString() };
    }
  }
  return { isFallback: false };
}

async function runTest() {
  console.log('🔍 Finding test user with mezanino document...');

  const user = await findTestUser();
  if (!user) {
    console.error('❌ No user found with mezanino document. Please upload it first.');
    process.exit(1);
  }
  console.log(`✓ Found user: ${user.email}`);

  const doc = await findDocument(user.id);
  if (!doc) {
    console.error('❌ Document not found');
    process.exit(1);
  }
  console.log(`✓ Found document: ${doc.filename} (${doc.id})`);

  // Create a new conversation
  const conversation = await prisma.chatConversation.create({
    data: {
      userId: user.id,
      title: 'Retrieval Summary Test',
    }
  });
  console.log(`✓ Created conversation: ${conversation.id}\n`);

  const results: TestResult[] = [];
  let fallbackCount = 0;

  console.log('=' .repeat(80));
  console.log('RUNNING 15 QUERIES');
  console.log('=' .repeat(80));

  for (let i = 0; i < QUERIES.length; i++) {
    const query = QUERIES[i];
    console.log(`\n[${i + 1}/15] "${query.substring(0, 50)}..."`);

    try {
      const response = await sendQuery(user.id, conversation.id, query, doc.id);
      const { isFallback, pattern } = detectFallback(response.text);

      const result: TestResult = {
        queryNum: i + 1,
        query,
        responsePreview: response.text.substring(0, 150).replace(/\n/g, ' '),
        isFallback,
        fallbackPattern: pattern,
        hasContent: response.text.length > 50,
        hasCitations: response.hasCitations,
        reasonCode: response.reasonCode,
      };

      results.push(result);

      if (isFallback) {
        fallbackCount++;
        console.log(`  ❌ FALLBACK DETECTED: ${pattern}`);
        console.log(`     Preview: ${result.responsePreview}...`);
      } else {
        console.log(`  ✓ OK (${response.text.length} chars, citations: ${response.hasCitations})`);
        if (response.reasonCode) {
          console.log(`     reasonCode: ${response.reasonCode}`);
        }
      }

    } catch (error: any) {
      console.log(`  ❌ ERROR: ${error.message}`);
      results.push({
        queryNum: i + 1,
        query,
        responsePreview: `ERROR: ${error.message}`,
        isFallback: true,
        hasContent: false,
        hasCitations: false,
      });
      fallbackCount++;
    }

    // Small delay between queries
    await new Promise(r => setTimeout(r, 500));
  }

  // Summary
  console.log('\n' + '=' .repeat(80));
  console.log('SUMMARY');
  console.log('=' .repeat(80));
  console.log(`Total queries: ${QUERIES.length}`);
  console.log(`Successful: ${QUERIES.length - fallbackCount}`);
  console.log(`Fallbacks: ${fallbackCount}`);
  console.log(`Success rate: ${((QUERIES.length - fallbackCount) / QUERIES.length * 100).toFixed(1)}%`);

  if (fallbackCount > 0) {
    console.log('\n❌ FAILED QUERIES:');
    for (const r of results.filter(r => r.isFallback)) {
      console.log(`  [${r.queryNum}] ${r.query.substring(0, 40)}...`);
      console.log(`      Pattern: ${r.fallbackPattern || 'ERROR'}`);
      console.log(`      Preview: ${r.responsePreview}`);
    }
  }

  // Cleanup
  await prisma.chatConversation.delete({ where: { id: conversation.id } });
  await prisma.$disconnect();

  process.exit(fallbackCount > 0 ? 1 : 0);
}

runTest().catch(console.error);
