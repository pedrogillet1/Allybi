#!/usr/bin/env npx ts-node --transpile-only
/**
 * Test queries through the frontend API endpoint (SSE stream)
 */

const BASE_URL = 'http://localhost:5000/api';
const USER_ID = 'test-user-001';
const DOC_ID = 'e60211ee-5274-40f9-8cc3-4ea376bfbd8c';

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

async function createConversation(): Promise<string> {
  const res = await fetch(`${BASE_URL}/chat/conversations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Dev-Auth': '1',  // Dev bypass - uses test-user-001
    },
    body: JSON.stringify({ title: 'Mezanino Test - Frontend API' }),
  });

  if (!res.ok) {
    throw new Error(`Failed to create conversation: ${res.status} ${await res.text()}`);
  }

  const data = await res.json() as any;
  return data.id;
}

async function sendMessage(conversationId: string, text: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/chat/conversations/${conversationId}/messages/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Dev-Auth': '1',  // Dev bypass - uses test-user-001
    },
    body: JSON.stringify({
      text,
      language: 'en',
      attachedDocumentIds: [DOC_ID],
    }),
  });

  if (!res.ok) {
    throw new Error(`Failed to send message: ${res.status} ${await res.text()}`);
  }

  // Read SSE stream
  const body = await res.text();

  // Parse SSE events to get final response
  const lines = body.split('\n');
  let fullText = '';

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      try {
        const data = JSON.parse(line.slice(6));
        if (data.type === 'content' && data.text) {
          fullText += data.text;
        }
        if (data.type === 'done' && data.formatted) {
          fullText = data.formatted;
        }
      } catch (e) {
        // Skip non-JSON lines
      }
    }
  }

  return fullText;
}

async function main() {
  console.log('🚀 Testing queries through Frontend API\n');

  // Create conversation
  const conversationId = await createConversation();
  console.log(`✓ Created conversation: ${conversationId}\n`);

  console.log('='.repeat(80));
  console.log('RUNNING 15 QUERIES');
  console.log('='.repeat(80));

  let failures = 0;
  const results: Array<{ q: number; ok: boolean; preview: string }> = [];

  for (let i = 0; i < QUERIES.length; i++) {
    const query = QUERIES[i];
    console.log(`\n[${i + 1}/15] ${query.substring(0, 60)}...`);

    try {
      const response = await sendMessage(conversationId, query);

      // Check for fallback patterns
      let isFallback = false;
      for (const pattern of FALLBACK_PATTERNS) {
        if (pattern.test(response)) {
          isFallback = true;
          break;
        }
      }

      const preview = response.substring(0, 100).replace(/\n/g, ' ');

      if (isFallback) {
        failures++;
        console.log(`   ❌ FALLBACK: "${preview}..."`);
      } else {
        console.log(`   ✓ OK (${response.length} chars)`);
        console.log(`   Preview: "${preview}..."`);
      }

      results.push({ q: i + 1, ok: !isFallback, preview });

    } catch (err: any) {
      failures++;
      console.log(`   ❌ ERROR: ${err.message}`);
      results.push({ q: i + 1, ok: false, preview: `ERROR: ${err.message}` });
    }

    // Brief pause between queries
    await new Promise(r => setTimeout(r, 500));
  }

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

  process.exit(failures > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
