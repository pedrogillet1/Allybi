import ragService from '../services/rag.service';
import prisma from '../config/database';

/**
 * RAG Query Performance Testing Script
 *
 * This script tests RAG query performance with verification disabled.
 * It measures response times, token usage, and overall system performance.
 *
 * Usage:
 *   ts-node backend/src/scripts/test-rag-performance.ts
 */

interface PerformanceMetrics {
  queryNumber: number;
  query: string;
  totalTime: number;
  documentSearchTime?: number;
  answerGenerationTime?: number;
  verificationTime?: number;
  sourcesFound: number;
  hasWebSources: boolean;
  confidence?: string;
  confidenceScore?: number;
  isMultiStep?: boolean;
  verified?: boolean;
  verificationScore?: number;
  error?: string;
}

// Test configuration - UPDATE THIS USER ID with your actual user ID
const TEST_USER_ID = '03ec97ac-1934-4188-8471-524366d87521'; // Replace with your user ID

// Test queries covering different complexity levels
const TEST_QUERIES = [
  // Simple queries (single fact retrieval)
  {
    query: 'What is KODA?',
    type: 'simple',
    expectedTime: 3000 // Expected response time in ms
  },
  {
    query: 'What is the company mission?',
    type: 'simple',
    expectedTime: 3000
  },

  // Medium complexity (requires synthesis)
  {
    query: 'What are the key features of the product?',
    type: 'medium',
    expectedTime: 5000
  },
  {
    query: 'What are the main revenue streams?',
    type: 'medium',
    expectedTime: 5000
  },

  // Complex queries (multi-step reasoning)
  {
    query: 'Compare the revenue models and explain the key differences',
    type: 'complex',
    expectedTime: 8000
  },
  {
    query: 'What are the main competitive advantages and how do they relate to the market strategy?',
    type: 'complex',
    expectedTime: 8000
  },

  // Excel-specific queries
  {
    query: 'What is in cell B2 on sheet ex2?',
    type: 'excel',
    expectedTime: 4000
  },
  {
    query: 'Show me the data in the first row of the spreadsheet',
    type: 'excel',
    expectedTime: 4000
  },

  // Research mode queries (with web search)
  {
    query: 'What are the latest trends in AI document processing?',
    type: 'research',
    researchMode: true,
    expectedTime: 10000
  }
];

/**
 * Format time in human-readable format
 */
function formatTime(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  } else if (ms < 60000) {
    return `${(ms / 1000).toFixed(2)}s`;
  } else {
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(2);
    return `${minutes}m ${seconds}s`;
  }
}

/**
 * Run a single query and measure performance
 */
async function runQuery(
  queryConfig: typeof TEST_QUERIES[0],
  queryNumber: number
): Promise<PerformanceMetrics> {
  const { query, type, researchMode = false, expectedTime } = queryConfig;

  console.log(`\n${'='.repeat(80)}`);
  console.log(`Query ${queryNumber}: ${query}`);
  console.log(`Type: ${type} | Research Mode: ${researchMode}`);
  console.log('='.repeat(80));

  const metrics: PerformanceMetrics = {
    queryNumber,
    query,
    totalTime: 0,
    sourcesFound: 0,
    hasWebSources: false
  };

  try {
    // Create a conversation for this test
    const conversation = await prisma.conversation.create({
      data: {
        userId: TEST_USER_ID,
        title: `Performance Test ${queryNumber}: ${query.substring(0, 30)}...`
      }
    });

    const startTime = Date.now();

    // Run the RAG query
    console.log('⏱️  Starting query...');
    const result = await ragService.generateAnswer(
      TEST_USER_ID,
      query,
      conversation.id,
      researchMode
    );

    const endTime = Date.now();
    metrics.totalTime = endTime - startTime;

    // Collect metrics
    metrics.sourcesFound = result.sources?.length || 0;
    metrics.hasWebSources = (result.webSources?.length || 0) > 0;
    metrics.confidence = result.confidence;
    metrics.confidenceScore = result.confidenceScore;
    metrics.isMultiStep = result.isMultiStep;

    // Verification metrics (if enabled)
    if (result.verification) {
      metrics.verified = true;
      metrics.verificationScore = result.verification.verificationScore;
      metrics.verificationTime = 0; // We'd need to add timing to the service
    } else {
      metrics.verified = false;
    }

    // Display results
    console.log(`\n✅ Query completed successfully`);
    console.log(`⏱️  Total time: ${formatTime(metrics.totalTime)}`);
    console.log(`📊 Expected: ${formatTime(expectedTime)} | Actual: ${formatTime(metrics.totalTime)}`);

    const timeRatio = (metrics.totalTime / expectedTime) * 100;
    if (timeRatio <= 100) {
      console.log(`🎯 Performance: EXCELLENT (${timeRatio.toFixed(0)}% of expected time)`);
    } else if (timeRatio <= 150) {
      console.log(`⚠️  Performance: ACCEPTABLE (${timeRatio.toFixed(0)}% of expected time)`);
    } else {
      console.log(`❌ Performance: SLOW (${timeRatio.toFixed(0)}% of expected time)`);
    }

    console.log(`\n📄 Sources found: ${metrics.sourcesFound}`);
    console.log(`🌐 Web sources: ${metrics.hasWebSources ? 'Yes' : 'No'}`);

    if (metrics.confidence) {
      console.log(`🎯 Confidence: ${metrics.confidence} (${(metrics.confidenceScore! * 100).toFixed(0)}%)`);
    }

    if (metrics.isMultiStep) {
      console.log(`🔍 Multi-step reasoning: Yes`);
      if (result.subQuestions) {
        console.log(`   Sub-questions: ${result.subQuestions.length}`);
      }
    }

    if (metrics.verified) {
      console.log(`✓ Verification: ${(metrics.verificationScore! * 100).toFixed(0)}% verified`);
    } else {
      console.log(`⚠️  Verification: DISABLED (performance mode)`);
    }

    console.log(`\n📝 Answer preview:`);
    const answerPreview = result.answer.substring(0, 200).replace(/\n/g, ' ');
    console.log(`   "${answerPreview}..."`);

    // Cleanup - delete test conversation
    await prisma.conversation.delete({
      where: { id: conversation.id }
    });

  } catch (error: any) {
    metrics.error = error.message || String(error);
    console.error(`\n❌ Query failed: ${metrics.error}`);
  }

  return metrics;
}

/**
 * Calculate aggregate statistics
 */
function calculateStats(metrics: PerformanceMetrics[]): any {
  const successful = metrics.filter(m => !m.error);
  const failed = metrics.filter(m => m.error);

  const times = successful.map(m => m.totalTime);
  const avgTime = times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0;
  const minTime = times.length > 0 ? Math.min(...times) : 0;
  const maxTime = times.length > 0 ? Math.max(...times) : 0;

  const totalSources = successful.reduce((sum, m) => sum + m.sourcesFound, 0);
  const avgSources = successful.length > 0 ? totalSources / successful.length : 0;

  const withWebSources = successful.filter(m => m.hasWebSources).length;
  const multiStepQueries = successful.filter(m => m.isMultiStep).length;

  const verifiedQueries = successful.filter(m => m.verified).length;
  const avgVerificationScore = successful
    .filter(m => m.verified && m.verificationScore !== undefined)
    .reduce((sum, m) => sum + (m.verificationScore || 0), 0) / (verifiedQueries || 1);

  return {
    total: metrics.length,
    successful: successful.length,
    failed: failed.length,
    avgTime,
    minTime,
    maxTime,
    avgSources,
    withWebSources,
    multiStepQueries,
    verifiedQueries,
    avgVerificationScore
  };
}

/**
 * Display summary statistics
 */
function displaySummary(metrics: PerformanceMetrics[]) {
  console.log(`\n\n${'='.repeat(80)}`);
  console.log('📊 PERFORMANCE TEST SUMMARY');
  console.log('='.repeat(80));

  const stats = calculateStats(metrics);

  console.log(`\n✅ Successful queries: ${stats.successful}/${stats.total}`);
  console.log(`❌ Failed queries: ${stats.failed}/${stats.total}`);

  console.log(`\n⏱️  Response Time Statistics:`);
  console.log(`   Average: ${formatTime(stats.avgTime)}`);
  console.log(`   Fastest: ${formatTime(stats.minTime)}`);
  console.log(`   Slowest: ${formatTime(stats.maxTime)}`);

  console.log(`\n📄 Source Statistics:`);
  console.log(`   Average sources per query: ${stats.avgSources.toFixed(1)}`);
  console.log(`   Queries with web sources: ${stats.withWebSources}`);
  console.log(`   Multi-step queries: ${stats.multiStepQueries}`);

  console.log(`\n✓ Verification Statistics:`);
  console.log(`   Queries with verification: ${stats.verifiedQueries}/${stats.successful}`);
  if (stats.verifiedQueries > 0) {
    console.log(`   Average verification score: ${(stats.avgVerificationScore * 100).toFixed(0)}%`);
  } else {
    console.log(`   ⚠️  Verification DISABLED for all queries (performance mode)`);
  }

  // Performance assessment
  console.log(`\n🎯 Overall Performance Assessment:`);
  if (stats.avgTime < 4000) {
    console.log(`   ⭐ EXCELLENT - Average response time under 4 seconds`);
  } else if (stats.avgTime < 6000) {
    console.log(`   ✅ GOOD - Average response time under 6 seconds`);
  } else if (stats.avgTime < 10000) {
    console.log(`   ⚠️  ACCEPTABLE - Average response time under 10 seconds`);
  } else {
    console.log(`   ❌ NEEDS IMPROVEMENT - Average response time over 10 seconds`);
  }

  if (stats.failed > 0) {
    console.log(`\n❌ Failed Queries:`);
    metrics.filter(m => m.error).forEach(m => {
      console.log(`   ${m.queryNumber}. ${m.query}`);
      console.log(`      Error: ${m.error}`);
    });
  }

  console.log('\n' + '='.repeat(80));
}

/**
 * Export results to JSON
 */
function exportResults(metrics: PerformanceMetrics[]) {
  const results = {
    timestamp: new Date().toISOString(),
    verificationEnabled: false, // Currently disabled
    testConfiguration: {
      userId: TEST_USER_ID,
      totalQueries: TEST_QUERIES.length,
      queryTypes: [...new Set(TEST_QUERIES.map(q => q.type))]
    },
    metrics,
    summary: calculateStats(metrics)
  };

  const fs = require('fs');
  const filename = `rag-performance-${Date.now()}.json`;
  fs.writeFileSync(filename, JSON.stringify(results, null, 2));
  console.log(`\n💾 Results exported to: ${filename}`);
}

/**
 * Main test runner
 */
async function main() {
  console.log('🚀 Starting RAG Performance Test Suite');
  console.log(`📅 Timestamp: ${new Date().toISOString()}`);
  console.log(`👤 Test User ID: ${TEST_USER_ID}`);
  console.log(`📊 Total queries: ${TEST_QUERIES.length}`);
  console.log(`⚠️  Verification status: DISABLED (performance mode)`);

  // Verify user exists
  console.log('\n🔍 Verifying user and documents...');
  const user = await prisma.user.findUnique({
    where: { id: TEST_USER_ID }
  });

  if (!user) {
    console.error(`❌ User ${TEST_USER_ID} not found. Please update TEST_USER_ID in the script.`);
    process.exit(1);
  }

  const documents = await prisma.document.findMany({
    where: { userId: TEST_USER_ID }
  });

  console.log(`✅ User found: ${user.email}`);
  console.log(`📄 Documents available: ${documents.length}`);

  if (documents.length === 0) {
    console.warn('⚠️  Warning: No documents found for this user. Some queries may fail.');
  } else {
    console.log('   Documents:');
    documents.forEach(doc => {
      console.log(`   - ${doc.filename}`);
    });
  }

  // Run all test queries
  const allMetrics: PerformanceMetrics[] = [];

  for (let i = 0; i < TEST_QUERIES.length; i++) {
    const metrics = await runQuery(TEST_QUERIES[i], i + 1);
    allMetrics.push(metrics);

    // Small delay between queries to avoid rate limiting
    if (i < TEST_QUERIES.length - 1) {
      console.log('\n⏳ Waiting 2 seconds before next query...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  // Display summary
  displaySummary(allMetrics);

  // Export results
  exportResults(allMetrics);

  console.log('\n✅ Performance test completed!');
}

// Run the tests
main()
  .catch(error => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
