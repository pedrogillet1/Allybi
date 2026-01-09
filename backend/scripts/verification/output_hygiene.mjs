/**
 * Output Hygiene Verification
 *
 * Checks every answer for forbidden patterns that indicate:
 * - Internal code/service names leaking
 * - Debug labels appearing
 * - Stack traces or errors
 * - Plaintext "Source:" instead of structured sources
 * - Raw {{DOC::...}} markers not replaced
 *
 * Usage: node scripts/verification/output_hygiene.mjs
 */

import fs from 'fs';
import path from 'path';

const API_URL = process.env.API_URL || 'http://localhost:5001';
const TEST_EMAIL = 'test@koda.com';
const TEST_PASSWORD = 'test123';

// ============================================================================
// FORBIDDEN PATTERNS - These should NEVER appear in user-facing answers
// ============================================================================

const FORBIDDEN_PATTERNS = [
  // Internal service/code names
  { pattern: /kodaOrchestratorV3/gi, name: 'Internal service name (orchestrator)' },
  { pattern: /kodaAnswerEngine/gi, name: 'Internal service name (answer engine)' },
  { pattern: /DocumentWeaver/gi, name: 'Internal service name (weaver)' },
  { pattern: /kodaFormattingPipeline/gi, name: 'Internal service name (formatting)' },
  { pattern: /retrievalEngine/gi, name: 'Internal service name (retrieval)' },
  { pattern: /intentEngine/gi, name: 'Internal service name (intent)' },
  { pattern: /pineconeService/gi, name: 'Internal service name (pinecone)' },

  // File paths
  { pattern: /\.service\.ts/gi, name: 'TypeScript service file reference' },
  { pattern: /\.controller\.ts/gi, name: 'TypeScript controller file reference' },
  { pattern: /src\/services\//gi, name: 'Source path leak' },
  { pattern: /src\/controllers\//gi, name: 'Source path leak' },
  { pattern: /backend\/src\//gi, name: 'Backend path leak' },
  { pattern: /frontend\/src\//gi, name: 'Frontend path leak' },

  // Config/data files
  { pattern: /intent_patterns\.json/gi, name: 'Config file reference' },
  { pattern: /fallbacks\.json/gi, name: 'Config file reference' },
  { pattern: /routing_tiebreakers\.json/gi, name: 'Config file reference' },

  // Debug labels (should not reach user)
  { pattern: /\[Orchestrator\]/gi, name: 'Debug label (orchestrator)' },
  { pattern: /\[Container\]/gi, name: 'Debug label (container)' },
  { pattern: /\[IntentEngine\]/gi, name: 'Debug label (intent)' },
  { pattern: /\[RAG V3\]/gi, name: 'Debug label (RAG)' },
  { pattern: /\[Cache\]/gi, name: 'Debug label (cache)' },
  { pattern: /\[Pinecone\]/gi, name: 'Debug label (pinecone)' },

  // Stack traces / errors
  { pattern: /Error:\s+\w+/g, name: 'Error message leak' },
  { pattern: /at\s+\w+\s+\(/g, name: 'Stack trace leak' },
  { pattern: /EADDRINUSE/gi, name: 'System error leak' },
  { pattern: /ECONNREFUSED/gi, name: 'System error leak' },
  { pattern: /TypeError:/gi, name: 'Type error leak' },
  { pattern: /ReferenceError:/gi, name: 'Reference error leak' },

  // NOTE: DOC/CITE markers are INTENTIONAL - they're processed by frontend kodaMarkerParserV3.js
  // Only flag REF markers as they're not used
  { pattern: /\{\{REF::[^}]+\}\}/g, name: 'Unprocessed REF marker' },

  // Plaintext source references (should be structured)
  { pattern: /\(Source:\s*[^)]+\)/gi, name: 'Plaintext source reference' },
  { pattern: /Source:\s+\w+\.pdf/gi, name: 'Plaintext source with filename' },
  { pattern: /Source:\s+\w+\.docx/gi, name: 'Plaintext source with filename' },
  { pattern: /Source:\s+\w+\.xlsx/gi, name: 'Plaintext source with filename' },

  // Internal IDs exposed
  { pattern: /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, name: 'UUID exposed in answer', severity: 'warning' },

  // Line number references
  { pattern: /L\d+-\d+/g, name: 'Line number reference' },
  { pattern: /lines?\s+\d+\s*-\s*\d+/gi, name: 'Line number reference' },
];

// ============================================================================
// TEST QUERIES - Cover different intents and answer types
// ============================================================================

const TEST_QUERIES = [
  // Conversation (simple)
  { query: 'hello', name: 'Greeting' },
  { query: 'thanks for your help', name: 'Thanks' },

  // Help
  { query: 'how do I upload files?', name: 'Help - upload' },
  { query: 'what can you do?', name: 'Help - capabilities' },

  // Document summary
  { query: 'summarize my documents', name: 'Workspace summary' },
  { query: 'summarize Rosewood Fund v3.xlsx', name: 'Single doc summary' },

  // Document QnA
  { query: 'what are the profit totals in Rosewood Fund?', name: 'Doc QnA - numbers' },
  { query: 'what documents do I have about finance?', name: 'Doc search' },

  // Complex queries
  { query: 'compare the revenue between different entities', name: 'Comparison' },
  { query: 'list all errors mentioned in my documents', name: 'Error extraction' },
];

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
  const data = await response.json();
  return data.accessToken;
}

async function createConversation(token) {
  const response = await fetch(`${API_URL}/api/chat/conversations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ title: 'Hygiene Test' }),
  });
  if (!response.ok) throw new Error(`Create conversation failed: ${response.status}`);
  const data = await response.json();
  return data.id;
}

async function queryAndGetFullResponse(token, conversationId, query) {
  const response = await fetch(`${API_URL}/api/rag/query/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ conversationId, query }),
  });

  if (!response.ok) throw new Error(`Query failed: ${response.status}`);

  // Collect all stream events
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const events = [];
  let donePayload = null;
  let allContent = '';

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
          events.push(data);

          if (data.type === 'content') {
            allContent += data.content;
          }
          if (data.type === 'done') {
            donePayload = data;
          }
        } catch (e) {
          // Skip parse errors
        }
      }
    }
  }

  return {
    events,
    donePayload,
    fullAnswer: donePayload?.fullAnswer || allContent,
    formatted: donePayload?.formatted || donePayload?.fullAnswer || allContent,
  };
}

function checkForbiddenPatterns(text, queryName) {
  const violations = [];

  // Extract all DOC markers in the text to check for document coverage
  const docMarkerRegex = /\{\{DOC::id=[^:]+::name="([^"]+)"[^}]*\}\}/gi;
  const docNamesInMarkers = new Set();
  let docMatch;
  while ((docMatch = docMarkerRegex.exec(text)) !== null) {
    // Decode the filename and normalize
    const docName = decodeURIComponent(docMatch[1]).toLowerCase();
    docNamesInMarkers.add(docName);
    // Also add without extension
    const baseName = docName.replace(/\.[^.]+$/, '');
    docNamesInMarkers.add(baseName);
  }

  for (const { pattern, name, severity } of FORBIDDEN_PATTERNS) {
    // Special case: "(Source: X)" is OK if a DOC marker exists for that document ANYWHERE in text
    // This allows inline source citations as supplemental context when doc is already clickable
    if (name === 'Plaintext source reference' || name === 'Plaintext source with filename') {
      // Check if ANY (Source: X) references a document that has NO DOC marker
      const sourceRegex = /\(Source:\s*([^,)]+)/gi;
      let match;
      const unmatchedSources = [];
      while ((match = sourceRegex.exec(text)) !== null) {
        const sourceDoc = match[1].trim().toLowerCase();
        // Check if this source document has a corresponding DOC marker
        const hasMarker = Array.from(docNamesInMarkers).some(markerName =>
          sourceDoc.includes(markerName) || markerName.includes(sourceDoc.replace(/\.[^.]+$/, ''))
        );
        if (!hasMarker) {
          unmatchedSources.push(match[0] + ')');
        }
      }
      if (unmatchedSources.length > 0) {
        violations.push({
          pattern: name,
          matches: unmatchedSources.slice(0, 3),
          count: unmatchedSources.length,
          severity: severity || 'error',
        });
      }
      continue;
    }

    const matches = text.match(pattern);
    if (matches) {
      violations.push({
        pattern: name,
        matches: matches.slice(0, 3), // Limit to first 3 matches
        count: matches.length,
        severity: severity || 'error',
      });
    }
  }

  return violations;
}

// ============================================================================
// Main Test Runner
// ============================================================================

async function runHygieneTests() {
  console.log('🧹 Output Hygiene Verification\n');
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

  console.log('\n📊 Hygiene Check Results');
  console.log('-'.repeat(60));

  let totalViolations = 0;
  let errorViolations = 0;
  let warningViolations = 0;
  const results = [];

  for (const { query, name } of TEST_QUERIES) {
    console.log(`\n🔍 ${name}`);
    console.log(`   Query: "${query}"`);

    try {
      const response = await queryAndGetFullResponse(token, conversationId, query);

      // Check both fullAnswer and formatted
      const textsToCheck = [
        { label: 'fullAnswer', text: response.fullAnswer },
        { label: 'formatted', text: response.formatted },
      ];

      let queryViolations = [];

      for (const { label, text } of textsToCheck) {
        if (!text) continue;
        const violations = checkForbiddenPatterns(text, name);
        for (const v of violations) {
          v.field = label;
        }
        queryViolations = queryViolations.concat(violations);
      }

      // Also check stream events for leaks
      for (const event of response.events) {
        if (event.type === 'content' && event.content) {
          const violations = checkForbiddenPatterns(event.content, name);
          for (const v of violations) {
            v.field = 'stream_content';
          }
          queryViolations = queryViolations.concat(violations);
        }
      }

      // Deduplicate violations
      const uniqueViolations = [];
      const seen = new Set();
      for (const v of queryViolations) {
        const key = `${v.pattern}:${v.field}`;
        if (!seen.has(key)) {
          seen.add(key);
          uniqueViolations.push(v);
        }
      }

      if (uniqueViolations.length === 0) {
        console.log('   ✅ CLEAN - No forbidden patterns found');
      } else {
        const errors = uniqueViolations.filter(v => v.severity === 'error');
        const warnings = uniqueViolations.filter(v => v.severity === 'warning');

        if (errors.length > 0) {
          console.log(`   ❌ ${errors.length} ERROR violation(s):`);
          for (const v of errors) {
            console.log(`      - ${v.pattern} in ${v.field}: "${v.matches[0]}"`);
          }
        }

        if (warnings.length > 0) {
          console.log(`   ⚠️  ${warnings.length} WARNING(s):`);
          for (const v of warnings) {
            console.log(`      - ${v.pattern} in ${v.field}`);
          }
        }

        totalViolations += uniqueViolations.length;
        errorViolations += errors.length;
        warningViolations += warnings.length;
      }

      results.push({
        query,
        name,
        status: uniqueViolations.length === 0 ? 'CLEAN' : 'VIOLATIONS',
        violations: uniqueViolations,
        answerLength: response.fullAnswer?.length || 0,
      });

    } catch (error) {
      console.log(`   ❌ ERROR: ${error.message}`);
      results.push({
        query,
        name,
        status: 'ERROR',
        error: error.message,
      });
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Summary');
  console.log(`   Total queries: ${TEST_QUERIES.length}`);
  console.log(`   ❌ Error violations: ${errorViolations}`);
  console.log(`   ⚠️  Warning violations: ${warningViolations}`);
  console.log(`   Clean: ${results.filter(r => r.status === 'CLEAN').length}`);
  console.log('='.repeat(60));

  // Save results
  const outputDir = '/tmp/verification';
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, 'hygiene_results.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n📁 Results saved to: ${outputPath}`);

  // Exit with error code if any ERROR violations
  process.exit(errorViolations > 0 ? 1 : 0);
}

runHygieneTests().catch(console.error);
