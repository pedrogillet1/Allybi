/**
 * Test Script: Intent Detection Validation
 *
 * Tests CREATE_FILE intent detection with various query types
 * Expected success rate: 80%+ (at least 6/7 queries should detect CREATE_FILE)
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env from backend directory
dotenv.config({ path: path.join(__dirname, '../../.env') });

import { llmIntentDetectorService } from '../services/llmIntentDetector.service';

// Test queries for CREATE_FILE intent
const testQueries = [
  {
    query: "create a markdown file about Q4 sales performance",
    expectedIntent: "create_file",
    expectedEntities: {
      topic: "Q4 sales performance",
      fileType: "md"
    }
  },
  {
    query: "generate a PDF report on customer retention rates",
    expectedIntent: "create_file",
    expectedEntities: {
      topic: "customer retention rates",
      fileType: "pdf"
    }
  },
  {
    query: "make a document about our product roadmap for 2025",
    expectedIntent: "create_file",
    expectedEntities: {
      topic: "product roadmap for 2025"
    }
  },
  {
    query: "write me a markdown file summarizing this week's sprint",
    expectedIntent: "create_file",
    expectedEntities: {
      topic: "this week's sprint",
      fileType: "md"
    }
  },
  {
    query: "create a document about employee onboarding process",
    expectedIntent: "create_file",
    expectedEntities: {
      topic: "employee onboarding process"
    }
  },
  {
    query: "criar um arquivo markdown sobre vendas do Q4",
    expectedIntent: "create_file",
    expectedEntities: {
      topic: "vendas do Q4",
      fileType: "md"
    }
  },
  {
    query: "generate a PowerPoint presentation on market analysis",
    expectedIntent: "create_file",
    expectedEntities: {
      topic: "market analysis",
      fileType: "pptx"
    }
  }
];

async function runTests() {
  console.log('🧪 Starting Intent Detection Tests for CREATE_FILE\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  let passed = 0;
  let failed = 0;

  for (let i = 0; i < testQueries.length; i++) {
    const test = testQueries[i];

    console.log(`Test ${i + 1}/${testQueries.length}: "${test.query}"`);

    try {
      const result = await llmIntentDetectorService.detectIntent(test.query, []);

      // Check if intent matches
      const intentMatch = result.intent === test.expectedIntent;

      // Check if topic is extracted
      const topicExtracted = result.parameters?.topic && result.parameters.topic.length > 0;

      // Check if fileType matches (if specified in query)
      let fileTypeMatch = true;
      if (test.expectedEntities.fileType) {
        fileTypeMatch = result.parameters?.fileType === test.expectedEntities.fileType;
      }

      const testPassed = intentMatch && topicExtracted;

      if (testPassed) {
        passed++;
        console.log(`✅ PASS`);
        console.log(`   Intent: ${result.intent}`);
        console.log(`   Topic: "${result.parameters?.topic || 'NOT EXTRACTED'}"`);
        console.log(`   FileType: ${result.parameters?.fileType || 'default (md)'}`);
        if (!fileTypeMatch) {
          console.log(`   ⚠️  Warning: FileType mismatch (expected: ${test.expectedEntities.fileType}, got: ${result.parameters?.fileType})`);
        }
      } else {
        failed++;
        console.log(`❌ FAIL`);
        console.log(`   Expected Intent: ${test.expectedIntent}`);
        console.log(`   Detected Intent: ${result.intent}`);
        console.log(`   Expected Topic: "${test.expectedEntities.topic}"`);
        console.log(`   Extracted Topic: "${result.parameters?.topic || 'NOT EXTRACTED'}"`);
      }

      console.log('');
    } catch (error: any) {
      failed++;
      console.log(`❌ ERROR: ${error.message}\n`);
    }
  }

  // Print summary
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('📊 TEST RESULTS:\n');
  console.log(`✅ Passed: ${passed}/${testQueries.length}`);
  console.log(`❌ Failed: ${failed}/${testQueries.length}`);

  const successRate = (passed / testQueries.length) * 100;
  console.log(`\n📈 Success Rate: ${successRate.toFixed(1)}%`);

  if (successRate >= 80) {
    console.log('\n🎉 SUCCESS! Intent detection is working correctly (>80% accuracy)\n');
    process.exit(0);
  } else {
    console.log(`\n⚠️  WARNING: Success rate below 80% threshold (got ${successRate.toFixed(1)}%)`);
    console.log('   Review the failed tests and improve intent detection prompts.\n');
    process.exit(1);
  }
}

// Run tests
runTests().catch((error) => {
  console.error('❌ Test script failed:', error);
  process.exit(1);
});
