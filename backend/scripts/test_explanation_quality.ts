/**
 * Test Script: Explanation Pipeline Quality Verification
 *
 * Tests the explanation pipeline including:
 * - Chain of Thought generation
 * - Fact extraction and verification
 * - Web search integration (SerpAPI)
 * - Source attribution
 *
 * Run with: npx ts-node --transpile-only src/scripts/test_explanation_quality.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env from backend directory
dotenv.config({ path: path.join(__dirname, '../../.env') });

import { explanationService } from '../services/explanation.service';

async function runTest() {
  console.log('═'.repeat(60));
  console.log('  Testing Explanation Pipeline');
  console.log('═'.repeat(60));

  const query = 'Explain the theory of general relativity in simple terms.';
  const systemPrompt = 'You are Koda, a helpful AI assistant.';

  console.log(`\nUser Query: "${query}"`);
  console.log(`System Prompt: "${systemPrompt}"`);
  console.log('\n' + '─'.repeat(60));
  console.log('Generating explanation...');
  console.log('─'.repeat(60));

  try {
    const response = await explanationService.generateExplanation(query, systemPrompt);

    console.log('\n--- Koda Final Response ---\n');
    console.log(response);

    // Check for sources
    if (response.includes('**Sources:**')) {
      console.log('\n✅ SUCCESS: Explanation includes sources.');
    } else {
      console.log(
        "\n⚠️ WARNING: Explanation does not include sources. This may be okay if no facts were checked."
      );
    }

    // Additional test: Full pipeline with context
    console.log('\n' + '═'.repeat(60));
    console.log('  Testing Full Pipeline (with context)');
    console.log('═'.repeat(60));

    const context = `
      General relativity is a theory of gravitation developed by Albert Einstein between 1907 and 1915.
      The theory states that massive objects cause a distortion in space-time, which is felt as gravity.
      This was confirmed during a solar eclipse in 1919 when light from stars was observed to bend around the sun.
    `;

    const fullResult = await explanationService.processExplanation(query, context, systemPrompt);

    console.log('\n--- Chain of Thought Steps ---');
    fullResult.chainOfThought.forEach((step) => {
      console.log(`  Step ${step.step}: ${step.description}`);
      console.log(`    Reason: ${step.reasoning}`);
    });

    console.log('\n--- Fact Claims ---');
    fullResult.factClaims.forEach((claim) => {
      const status = claim.verified ? '✓' : '?';
      console.log(`  [${status}] ${claim.claim} (${Math.round(claim.confidence * 100)}%)`);
    });

    console.log('\n--- Sources ---');
    if (fullResult.sources.length > 0) {
      fullResult.sources.forEach((source) => {
        console.log(`  - ${source}`);
      });
    } else {
      console.log('  No external sources used.');
    }

    console.log('\n--- Final Response ---\n');
    console.log(fullResult.finalResponse);

    console.log('\n' + '═'.repeat(60));
    console.log('  TEST COMPLETE');
    console.log('═'.repeat(60));

    // Summary
    const hasCoT = fullResult.chainOfThought.length > 0;
    const hasFacts = fullResult.factClaims.length > 0;
    const hasSources = fullResult.sources.length > 0 || response.includes('**Sources:**');

    console.log('\n📊 Results Summary:');
    console.log(`  Chain of Thought: ${hasCoT ? '✅' : '❌'} (${fullResult.chainOfThought.length} steps)`);
    console.log(`  Fact Claims: ${hasFacts ? '✅' : '❌'} (${fullResult.factClaims.length} claims)`);
    console.log(`  Sources: ${hasSources ? '✅' : '⚠️'} (${fullResult.sources.length} sources)`);

    if (hasCoT && hasFacts) {
      console.log('\n🎉 SUCCESS: Explanation pipeline is working correctly!\n');
    } else {
      console.log('\n⚠️ WARNING: Some pipeline components may not be working as expected.\n');
    }
  } catch (error) {
    console.error('\n❌ FAILED: The test encountered an error:', error);
    process.exit(1);
  }

  console.log('--- End Test ---');
}

runTest();
