/**
 * Render Sources Verification
 *
 * Validates that sources returned by backend can be rendered by frontend components.
 * This simulates what DocumentSources.jsx, SourcesList.jsx, and ClickableDocumentName.jsx expect.
 *
 * Checks:
 * - All required fields present for rendering
 * - Document IDs are valid
 * - Filenames are displayable
 * - Clickable elements would render
 *
 * Usage: node scripts/verification/render_sources_test.mjs
 */

import fs from 'fs';
import path from 'path';

const API_URL = process.env.API_URL || 'http://localhost:5001';
const TEST_EMAIL = 'test@koda.com';
const TEST_PASSWORD = 'test123';

// ============================================================================
// FRONTEND COMPONENT REQUIREMENTS
// Based on: DocumentSources.jsx, SourcesList.jsx, ClickableDocumentName.jsx
// ============================================================================

const COMPONENT_REQUIREMENTS = {
  // DocumentSources.jsx expects these for InlineDocumentButton
  DocumentSources: {
    required: ['documentId'],
    optional: ['documentName', 'filename', 'title', 'mimeType', 'type', 'fileSize', 'size', 'folderPath'],
    // At least one of these name fields must exist
    nameFields: ['documentName', 'filename', 'title'],
  },

  // SourcesList.jsx expects these
  SourcesList: {
    required: ['documentId'],
    optional: ['filename', 'location', 'relevanceScore', 'folderPath', 'categoryName', 'relevanceExplanation', 'viewUrl', 'downloadUrl'],
    nameFields: ['filename'],
  },

  // ClickableDocumentName.jsx expects these
  ClickableDocumentName: {
    required: ['documentName', 'documentId'],
    optional: ['onOpenPreview'],
  },
};

// ============================================================================
// TEST QUERIES THAT SHOULD RETURN SOURCES
// ============================================================================

const TEST_QUERIES = [
  {
    query: 'what are the profit totals in Rosewood Fund?',
    name: 'Doc QnA - numbers',
    expectSources: true,
  },
  {
    query: 'summarize Rosewood Fund v3.xlsx',
    name: 'Single doc summary',
    expectSources: true,
  },
  {
    query: 'what documents mention revenue?',
    name: 'Doc search with sources',
    expectSources: true,
  },
  {
    query: 'compare Baxter Hotel and Lone Mountain Ranch',
    name: 'Comparison with sources',
    expectSources: true,
  },
  // This should NOT have sources
  {
    query: 'summarize my documents',
    name: 'Workspace catalog',
    expectSources: false,
  },
  {
    query: 'hello',
    name: 'Conversation',
    expectSources: false,
  },
];

// ============================================================================
// Validation Functions
// ============================================================================

function validateSourceForComponent(source, componentName) {
  const requirements = COMPONENT_REQUIREMENTS[componentName];
  if (!requirements) return { valid: true, errors: [] };

  const errors = [];

  // Check required fields
  for (const field of requirements.required) {
    if (!source[field]) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Check that at least one name field exists
  if (requirements.nameFields) {
    const hasName = requirements.nameFields.some(f => source[f]);
    if (!hasName) {
      errors.push(`Missing name field (need one of: ${requirements.nameFields.join(', ')})`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function validateSource(source) {
  const results = {};

  for (const componentName of Object.keys(COMPONENT_REQUIREMENTS)) {
    results[componentName] = validateSourceForComponent(source, componentName);
  }

  return results;
}

function simulateRender(sources) {
  /**
   * Simulates what the frontend would render.
   * Returns a structure representing what would be displayed.
   */
  const rendered = {
    documentButtons: [],
    sourceListItems: [],
    clickableNames: [],
    errors: [],
  };

  for (const source of sources) {
    // DocumentSources -> InlineDocumentButton
    const docId = source.documentId || source.id;
    const docName = source.documentName || source.filename || source.title || 'Unknown';

    if (docId) {
      rendered.documentButtons.push({
        documentId: docId,
        documentName: docName,
        mimeType: source.mimeType || source.type,
        isClickable: true,
        wouldRender: true,
      });
    } else {
      rendered.errors.push(`Source missing documentId, cannot render button`);
    }

    // SourcesList items
    if (source.filename || docName) {
      rendered.sourceListItems.push({
        filename: source.filename || docName,
        location: source.location || 'Document',
        relevanceScore: source.relevanceScore,
        hasViewUrl: !!source.viewUrl,
        hasDownloadUrl: !!source.downloadUrl,
        wouldRender: true,
      });
    }

    // ClickableDocumentName
    if (docName && docId) {
      rendered.clickableNames.push({
        documentName: docName,
        documentId: docId,
        isClickable: true,
        wouldRender: true,
      });
    }
  }

  return rendered;
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
    body: JSON.stringify({ title: 'Render Test' }),
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

async function runRenderTests() {
  console.log('🎨 Render Sources Verification\n');
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

  console.log('\n📊 Render Validation Results');
  console.log('-'.repeat(60));

  const results = [];
  let passCount = 0;

  for (const test of TEST_QUERIES) {
    console.log(`\n🔍 ${test.name}`);
    console.log(`   Query: "${test.query}"`);
    console.log(`   Expect sources: ${test.expectSources}`);

    try {
      const donePayload = await querySSE(token, conversationId, test.query);

      if (!donePayload) {
        console.log('   ❌ No done payload received');
        results.push({ ...test, status: 'ERROR', error: 'No done payload' });
        continue;
      }

      const sources = donePayload.sources || [];
      console.log(`   📎 Sources received: ${sources.length}`);

      // Check if sources presence matches expectation
      if (test.expectSources && sources.length === 0) {
        console.log('   ❌ FAIL: Expected sources but got none');
        results.push({
          ...test,
          status: 'FAIL',
          error: 'Expected sources but got none',
          sourcesCount: 0,
        });
        continue;
      }

      if (!test.expectSources && sources.length > 0) {
        // This is a warning, not a failure
        console.log(`   ⚠️  Got ${sources.length} sources when none expected (acceptable)`);
      }

      // Validate each source for renderability
      let allValid = true;
      const validationResults = [];

      for (let i = 0; i < sources.length; i++) {
        const source = sources[i];
        const validation = validateSource(source);

        const sourceValid = Object.values(validation).every(v => v.valid);
        if (!sourceValid) {
          allValid = false;
          console.log(`   ⚠️  Source[${i}] validation issues:`);
          for (const [comp, result] of Object.entries(validation)) {
            if (!result.valid) {
              console.log(`      - ${comp}: ${result.errors.join(', ')}`);
            }
          }
        }

        validationResults.push({
          index: i,
          documentId: source.documentId,
          filename: source.filename || source.documentName,
          valid: sourceValid,
          validation,
        });
      }

      // Simulate render
      const rendered = simulateRender(sources);
      console.log(`   🎨 Would render:`);
      console.log(`      - ${rendered.documentButtons.length} document buttons`);
      console.log(`      - ${rendered.sourceListItems.length} source list items`);
      console.log(`      - ${rendered.clickableNames.length} clickable names`);

      if (rendered.errors.length > 0) {
        console.log(`   ⚠️  Render errors: ${rendered.errors.length}`);
        for (const err of rendered.errors) {
          console.log(`      - ${err}`);
        }
      }

      // Determine pass/fail
      const passed = (!test.expectSources || sources.length > 0) &&
                     (sources.length === 0 || allValid) &&
                     rendered.errors.length === 0;

      console.log(passed ? '   ✅ PASS' : '   ❌ FAIL');

      if (passed) passCount++;

      results.push({
        query: test.query,
        name: test.name,
        status: passed ? 'PASS' : 'FAIL',
        sourcesCount: sources.length,
        expectSources: test.expectSources,
        validationResults,
        rendered: {
          documentButtons: rendered.documentButtons.length,
          sourceListItems: rendered.sourceListItems.length,
          clickableNames: rendered.clickableNames.length,
          errors: rendered.errors,
        },
      });

    } catch (error) {
      console.log(`   ❌ ERROR: ${error.message}`);
      results.push({ ...test, status: 'ERROR', error: error.message });
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Summary');
  console.log(`   Total queries: ${TEST_QUERIES.length}`);
  console.log(`   ✅ Passed: ${passCount}`);
  console.log(`   ❌ Failed: ${TEST_QUERIES.length - passCount}`);
  console.log('='.repeat(60));

  // Save results
  const outputDir = '/tmp/verification';
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, 'render_results.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n📁 Results saved to: ${outputPath}`);

  // Exit with error if any failures
  process.exit(passCount < TEST_QUERIES.length ? 1 : 0);
}

runRenderTests().catch(console.error);
