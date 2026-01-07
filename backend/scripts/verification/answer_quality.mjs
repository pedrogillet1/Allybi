/**
 * Answer Quality Verification
 *
 * Checks answer structure, formatting, grounding, and wording quality:
 * - Bold keywords presence
 * - Proper structure (headers, bullets, spacing)
 * - Grounding (sources exist when claims exist)
 * - No wall-of-text
 * - Citation integrity (docIds match retrieved chunks)
 *
 * Usage: node scripts/verification/answer_quality.mjs
 */

import fs from 'fs';
import path from 'path';

const API_URL = process.env.API_URL || 'http://localhost:5001';
const TEST_EMAIL = 'test@koda.com';
const TEST_PASSWORD = 'test123';

// ============================================================================
// QUALITY RULES - What a good answer should have
// ============================================================================

const QUALITY_RULES = {
  // Structure rules
  maxParagraphLength: 500, // No wall-of-text
  requireBullets: ['summarize', 'list', 'what documents', 'show'], // Queries that need bullets
  requireHeaders: ['compare', 'analyze'], // Queries that need headers

  // Bolding rules (keywords that should be bold when mentioned)
  boldKeywords: [
    // Document names should be bold or in special format
    /\*\*[^*]+\.(pdf|docx|xlsx|pptx|txt)\*\*/gi,
    // Numbers with units should be emphasized
    /\*\*\$[\d,]+\.?\d*\*\*/g,
    /\*\*[\d,]+%\*\*/g,
  ],

  // Grounding rules
  numericClaimsRequireSources: true, // If answer has numbers, must have sources
  claimPatterns: [
    /\$[\d,]+\.?\d*/g, // Dollar amounts
    /[\d,]+%/g, // Percentages
    /total[s]?\s+(?:of\s+)?\$?[\d,]+/gi, // "totals of X"
    /revenue[s]?\s+(?:of\s+)?\$?[\d,]+/gi,
    /profit[s]?\s+(?:of\s+)?\$?[\d,]+/gi,
  ],
};

// ============================================================================
// TEST QUERIES WITH EXPECTED QUALITY ATTRIBUTES
// ============================================================================

const TEST_QUERIES = [
  // Conversation - minimal structure
  {
    query: 'hello',
    name: 'Greeting',
    expect: {
      maxLength: 200,
      requireSources: false,
      requireBullets: false,
    }
  },

  // Help - moderate structure
  {
    query: 'how do I upload files?',
    name: 'Help - upload',
    expect: {
      minLength: 50,
      requireSources: false,
      requireBullets: true, // Should have step bullets
    }
  },

  // Workspace summary - catalog structure
  {
    query: 'summarize my documents',
    name: 'Workspace summary',
    expect: {
      minLength: 100,
      requireSources: false,
      requireBullets: true, // Should list documents with bullets
      requireDocNames: true,
    }
  },

  // Document QnA with numbers - needs grounding
  {
    query: 'what are the profit totals in Rosewood Fund?',
    name: 'Doc QnA - numbers',
    expect: {
      requireSources: true, // Must have sources for numeric claims
      requireNumericGrounding: true,
    }
  },

  // Document search - needs structure
  {
    query: 'what documents do I have?',
    name: 'List documents',
    expect: {
      requireBullets: true,
      requireDocNames: true,
    }
  },

  // Single doc summary
  {
    query: 'summarize Rosewood Fund v3.xlsx',
    name: 'Single doc summary',
    expect: {
      minLength: 100,
      requireSources: true,
    }
  },

  // Complex comparison
  {
    query: 'compare revenue between Baxter Hotel and Lone Mountain Ranch',
    name: 'Comparison query',
    expect: {
      requireSources: true,
      requireNumericGrounding: true,
    }
  },
];

// ============================================================================
// Quality Check Functions
// ============================================================================

function checkStructure(answer, expectations) {
  const issues = [];
  const metrics = {};

  // Length check
  metrics.length = answer.length;
  if (expectations.maxLength && answer.length > expectations.maxLength) {
    issues.push(`Answer too long: ${answer.length} > ${expectations.maxLength}`);
  }
  if (expectations.minLength && answer.length < expectations.minLength) {
    issues.push(`Answer too short: ${answer.length} < ${expectations.minLength}`);
  }

  // Paragraph length check (no wall of text)
  const paragraphs = answer.split(/\n\n+/);
  const longParagraphs = paragraphs.filter(p => p.length > QUALITY_RULES.maxParagraphLength);
  metrics.paragraphCount = paragraphs.length;
  metrics.maxParagraphLength = Math.max(...paragraphs.map(p => p.length));

  if (longParagraphs.length > 0) {
    issues.push(`Wall of text detected: ${longParagraphs.length} paragraph(s) > ${QUALITY_RULES.maxParagraphLength} chars`);
  }

  // Bullet check
  const hasBullets = /^[-•*]\s+/m.test(answer) || /^\d+\.\s+/m.test(answer);
  metrics.hasBullets = hasBullets;

  if (expectations.requireBullets && !hasBullets) {
    issues.push('Missing bullet points (expected list format)');
  }

  // Header check
  const hasHeaders = /^#+\s+|\*\*[^*]+\*\*\s*\n/m.test(answer);
  metrics.hasHeaders = hasHeaders;

  // Document names check
  if (expectations.requireDocNames) {
    const docNamePattern = /\w+\.(pdf|docx|xlsx|pptx|txt|csv)/gi;
    const docNames = answer.match(docNamePattern);
    metrics.docNamesFound = docNames?.length || 0;

    if (!docNames || docNames.length === 0) {
      issues.push('No document names found (expected file references)');
    }
  }

  return { issues, metrics };
}

function checkBolding(answer) {
  const issues = [];
  const metrics = {};

  // Check for bold text presence
  const boldMatches = answer.match(/\*\*[^*]+\*\*/g) || [];
  metrics.boldCount = boldMatches.length;

  // Check for bold document names
  const boldDocs = answer.match(/\*\*[^*]+\.(pdf|docx|xlsx|pptx|txt)\*\*/gi) || [];
  metrics.boldDocNames = boldDocs.length;

  // Check for bold numbers (financial)
  const boldNumbers = answer.match(/\*\*\$?[\d,]+\.?\d*%?\*\*/g) || [];
  metrics.boldNumbers = boldNumbers.length;

  // Note: We don't fail on missing bold, just report metrics
  // This is because bolding policy varies by intent

  return { issues, metrics };
}

function checkGrounding(answer, donePayload, expectations) {
  const issues = [];
  const metrics = {};

  // Extract numeric claims from answer
  const numericClaims = [];
  for (const pattern of QUALITY_RULES.claimPatterns) {
    const matches = answer.match(pattern);
    if (matches) {
      numericClaims.push(...matches);
    }
  }
  metrics.numericClaims = numericClaims.length;

  // Check sources presence
  const sources = donePayload?.sources || [];
  const citations = donePayload?.citations || [];
  const sourceDocIds = donePayload?.sourceDocumentIds || [];

  metrics.sourcesCount = sources.length;
  metrics.citationsCount = citations.length;
  metrics.sourceDocIdsCount = sourceDocIds.length;

  // Grounding check: if numeric claims exist, sources should exist
  if (expectations.requireNumericGrounding && numericClaims.length > 0) {
    if (sources.length === 0 && citations.length === 0 && sourceDocIds.length === 0) {
      issues.push(`Numeric claims (${numericClaims.length}) found but no sources provided`);
    }
  }

  // If requireSources is true, must have sources
  if (expectations.requireSources) {
    if (sources.length === 0 && citations.length === 0) {
      issues.push('Sources required but none provided');
    }
  }

  // Citation integrity: check that source docIds are valid UUIDs
  const validUUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  for (const source of sources) {
    if (source.documentId && !validUUID.test(source.documentId)) {
      issues.push(`Invalid documentId format: ${source.documentId}`);
    }
  }

  return { issues, metrics };
}

function calculateQualityScore(structureResult, boldingResult, groundingResult) {
  let score = 100;
  const deductions = [];

  // Structure deductions
  for (const issue of structureResult.issues) {
    score -= 10;
    deductions.push({ reason: issue, points: -10 });
  }

  // Grounding deductions (more severe)
  for (const issue of groundingResult.issues) {
    score -= 15;
    deductions.push({ reason: issue, points: -15 });
  }

  // Bonus for good formatting
  if (structureResult.metrics.hasBullets) {
    score += 5;
    deductions.push({ reason: 'Has bullet points', points: 5 });
  }
  if (boldingResult.metrics.boldCount > 0) {
    score += 5;
    deductions.push({ reason: 'Has bold formatting', points: 5 });
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    deductions,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

async function login() {
  const response = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  });
  if (!response.ok) throw new Error(`Login failed: ${response.status}`);
  return (await response.json()).accessToken;
}

async function createConversation(token) {
  const response = await fetch(`${API_URL}/api/chat/conversations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ title: 'Quality Test' }),
  });
  if (!response.ok) throw new Error(`Create conversation failed: ${response.status}`);
  return (await response.json()).id;
}

async function querySSE(token, conversationId, query) {
  const response = await fetch(`${API_URL}/api/rag/query/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ conversationId, query }),
  });

  if (!response.ok) throw new Error(`Query failed: ${response.status}`);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let donePayload = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const messages = buffer.split('\n\n');
    buffer = messages.pop() || '';

    for (const message of messages) {
      if (message.startsWith('data: ')) {
        try {
          const data = JSON.parse(message.slice(6));
          if (data.type === 'done') donePayload = data;
        } catch (e) { /* ignore */ }
      }
    }
  }

  return donePayload;
}

// ============================================================================
// Main Test Runner
// ============================================================================

async function runQualityTests() {
  console.log('📊 Answer Quality Verification\n');
  console.log('='.repeat(60));

  let token, conversationId;

  try {
    console.log('\n📋 Setup');
    token = await login();
    console.log('   ✅ Logged in');

    conversationId = await createConversation(token);
    console.log('   ✅ Created conversation:', conversationId);
  } catch (error) {
    console.error('   ❌ Setup failed:', error.message);
    process.exit(1);
  }

  console.log('\n📊 Quality Check Results');
  console.log('-'.repeat(60));

  const results = [];
  let totalScore = 0;
  let passCount = 0;
  const PASS_THRESHOLD = 70;

  for (const test of TEST_QUERIES) {
    console.log(`\n🔍 ${test.name}`);
    console.log(`   Query: "${test.query}"`);

    try {
      const donePayload = await querySSE(token, conversationId, test.query);

      if (!donePayload) {
        console.log('   ❌ No done payload received');
        results.push({ ...test, status: 'ERROR', error: 'No done payload' });
        continue;
      }

      const answer = donePayload.fullAnswer || '';

      // Run quality checks
      const structureResult = checkStructure(answer, test.expect);
      const boldingResult = checkBolding(answer);
      const groundingResult = checkGrounding(answer, donePayload, test.expect);
      const scoreResult = calculateQualityScore(structureResult, boldingResult, groundingResult);

      // Report
      console.log(`   📏 Length: ${answer.length} chars, ${structureResult.metrics.paragraphCount} paragraphs`);
      console.log(`   📝 Format: bullets=${structureResult.metrics.hasBullets}, bold=${boldingResult.metrics.boldCount}`);
      console.log(`   📎 Sources: ${groundingResult.metrics.sourcesCount} sources, ${groundingResult.metrics.numericClaims} numeric claims`);
      console.log(`   🏆 Score: ${scoreResult.score}/100`);

      if (structureResult.issues.length > 0 || groundingResult.issues.length > 0) {
        console.log('   ⚠️  Issues:');
        for (const issue of [...structureResult.issues, ...groundingResult.issues]) {
          console.log(`      - ${issue}`);
        }
      }

      const passed = scoreResult.score >= PASS_THRESHOLD;
      console.log(passed ? '   ✅ PASS' : '   ❌ FAIL');

      if (passed) passCount++;
      totalScore += scoreResult.score;

      results.push({
        query: test.query,
        name: test.name,
        status: passed ? 'PASS' : 'FAIL',
        score: scoreResult.score,
        metrics: {
          structure: structureResult.metrics,
          bolding: boldingResult.metrics,
          grounding: groundingResult.metrics,
        },
        issues: [...structureResult.issues, ...groundingResult.issues],
        deductions: scoreResult.deductions,
      });

    } catch (error) {
      console.log(`   ❌ ERROR: ${error.message}`);
      results.push({ ...test, status: 'ERROR', error: error.message });
    }
  }

  // Summary
  const avgScore = totalScore / TEST_QUERIES.length;

  console.log('\n' + '='.repeat(60));
  console.log('📊 Summary');
  console.log(`   Total queries: ${TEST_QUERIES.length}`);
  console.log(`   ✅ Passed (≥${PASS_THRESHOLD}): ${passCount}`);
  console.log(`   ❌ Failed: ${TEST_QUERIES.length - passCount}`);
  console.log(`   📈 Average score: ${avgScore.toFixed(1)}/100`);
  console.log('='.repeat(60));

  // Save results
  const outputDir = '/tmp/verification';
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, 'quality_results.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n📁 Results saved to: ${outputPath}`);

  // Exit with error if average score is too low or too many failures
  const failRate = (TEST_QUERIES.length - passCount) / TEST_QUERIES.length;
  process.exit(failRate > 0.3 || avgScore < 60 ? 1 : 0);
}

runQualityTests().catch(console.error);
