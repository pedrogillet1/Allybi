/**
 * Trace help query routing to understand why help queries are being stolen
 */

import { router } from '../services/core/router.service';
import { classifyQuery } from '../services/core/contentGuard.service';

async function testRouting() {
  const testQueries = [
    "what can you do",
    "help",
    "what file types do you support",
    "how do i use this",
    "supported file formats",
    "your capabilities",
    "capabilities",
    "features",
  ];

  console.log("=== ContentGuard Classification ===");
  for (const q of testQueries) {
    const cg = classifyQuery(q, 'en');
    const matched = cg.matchedPattern ? cg.matchedPattern.slice(0, 40) : 'none';
    console.log(`"${q}" -> isContent: ${cg.isContentQuestion}, isFileAction: ${cg.isFileAction}, matched: ${matched}`);
  }

  console.log("\n=== Router Results ===");
  for (const q of testQueries) {
    const result = await router.route({
      text: q,
      userId: 'test-user',
      language: 'en',
      hasDocuments: true,
    });
    console.log(`"${q}" -> ${result.intentFamily}/${result.operator} (conf: ${result.confidence.toFixed(2)})`);
  }
}

testRouting().catch(console.error);
