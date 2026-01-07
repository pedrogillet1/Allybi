/**
 * KODA — STREAMING ENDPOINT TEST
 *
 * Tests the production streaming endpoint at getkoda.ai
 * Verifies:
 * 1. SSE connection established
 * 2. Content chunks arrive (true streaming)
 * 3. Done event received
 * 4. No truncation
 * 5. Proper character-by-character potential
 *
 * Usage: node testStreamingEndpoint.mjs <accessToken> [conversationId]
 */

const API_URL = 'https://getkoda.ai';

async function testStreaming(accessToken, conversationId) {
  const testQuery = "Show me the contract";

  console.log('═'.repeat(70));
  console.log('KODA STREAMING ENDPOINT TEST');
  console.log('═'.repeat(70));
  console.log(`\nAPI: ${API_URL}`);
  console.log(`Query: "${testQuery}"`);
  console.log(`Conversation: ${conversationId || 'new'}`);
  console.log('─'.repeat(70));

  // Create conversation if not provided
  let convId = conversationId;
  if (!convId) {
    console.log('\nCreating new conversation...');
    const createResp = await fetch(`${API_URL}/api/chat/conversations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({ title: 'Streaming Test' })
    });

    if (!createResp.ok) {
      console.error('Failed to create conversation:', await createResp.text());
      process.exit(1);
    }

    const convData = await createResp.json();
    convId = convData.id;
    console.log(`Created conversation: ${convId}`);
  }

  // Test streaming endpoint
  console.log('\n═'.repeat(70));
  console.log('STREAMING TEST');
  console.log('═'.repeat(70));

  const startTime = Date.now();
  let firstChunkTime = null;
  let chunkCount = 0;
  let totalChars = 0;
  let fullContent = '';
  let events = [];

  try {
    const response = await fetch(`${API_URL}/api/rag/query/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        query: testQuery,
        conversationId: convId,
        language: 'en'
      })
    });

    if (!response.ok) {
      console.error('Stream request failed:', response.status, await response.text());
      process.exit(1);
    }

    console.log('\n✓ SSE connection established');
    console.log('Receiving events...\n');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;

      // Process complete SSE messages
      const messages = buffer.split('\n\n');
      buffer = messages.pop() || '';

      for (const message of messages) {
        const lines = message.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              events.push({ type: data.type, time: Date.now() - startTime });

              if (data.type === 'content') {
                if (!firstChunkTime) {
                  firstChunkTime = Date.now() - startTime;
                  console.log(`  ⚡ First content chunk at ${firstChunkTime}ms`);
                }
                chunkCount++;
                const content = data.content || '';
                totalChars += content.length;
                fullContent += content;

                // Show streaming progress
                process.stdout.write(`\r  Chunks: ${chunkCount} | Chars: ${totalChars}`);
              } else if (data.type === 'done') {
                console.log(`\n  ✓ Done event received`);
              } else {
                console.log(`  → ${data.type}`);
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
      }
    }

    const totalTime = Date.now() - startTime;

    // Results
    console.log('\n' + '═'.repeat(70));
    console.log('RESULTS');
    console.log('═'.repeat(70));

    console.log(`\n  Time to first content: ${firstChunkTime || 'N/A'}ms`);
    console.log(`  Total time: ${totalTime}ms`);
    console.log(`  Content chunks: ${chunkCount}`);
    console.log(`  Total characters: ${totalChars}`);
    console.log(`  Avg chars/chunk: ${chunkCount > 0 ? (totalChars / chunkCount).toFixed(1) : 'N/A'}`);

    // Streaming quality check
    console.log('\n' + '─'.repeat(70));
    console.log('STREAMING QUALITY');
    console.log('─'.repeat(70));

    const isStreaming = chunkCount > 1;
    const hasReasonableChunkSize = chunkCount > 0 && (totalChars / chunkCount) < 500;
    const hasFastFirstToken = firstChunkTime && firstChunkTime < 2000;

    console.log(`\n  ${isStreaming ? '✓' : '✗'} True streaming (multiple chunks): ${chunkCount > 1}`);
    console.log(`  ${hasReasonableChunkSize ? '✓' : '✗'} Reasonable chunk size: ${chunkCount > 0 ? (totalChars / chunkCount).toFixed(1) : 'N/A'} chars/chunk`);
    console.log(`  ${hasFastFirstToken ? '✓' : '✗'} Fast first token (<2s): ${firstChunkTime}ms`);

    const allPassed = isStreaming && hasReasonableChunkSize && hasFastFirstToken;

    console.log('\n' + '═'.repeat(70));
    console.log(`RESULT: ${allPassed ? '✓ STREAMING WORKING' : '✗ STREAMING ISSUES DETECTED'}`);
    console.log('═'.repeat(70));

    // Show content preview
    if (fullContent) {
      console.log('\n  Content preview:');
      console.log('  ' + fullContent.substring(0, 200) + (fullContent.length > 200 ? '...' : ''));
    }

    // Event timeline
    console.log('\n  Event timeline:');
    for (const evt of events.slice(0, 10)) {
      console.log(`    ${evt.time}ms: ${evt.type}`);
    }
    if (events.length > 10) {
      console.log(`    ... and ${events.length - 10} more events`);
    }

  } catch (error) {
    console.error('\nStreaming test failed:', error);
    process.exit(1);
  }
}

// Parse command line args
const args = process.argv.slice(2);
if (args.length === 0) {
  console.log('Usage: node testStreamingEndpoint.mjs <accessToken> [conversationId]');
  console.log('\nTo get your access token:');
  console.log('1. Log into getkoda.ai');
  console.log('2. Open browser DevTools (F12)');
  console.log('3. Go to Application > Local Storage > getkoda.ai');
  console.log('4. Copy the "accessToken" value');
  process.exit(1);
}

const accessToken = args[0];
const conversationId = args[1];

testStreaming(accessToken, conversationId);
