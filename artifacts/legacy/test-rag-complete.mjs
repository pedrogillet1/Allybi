#!/usr/bin/env node

/**
 * 🧪 COMPREHENSIVE RAG TESTING SCRIPT
 *
 * Tests:
 * - Authentication
 * - Document retrieval
 * - Answer generation
 * - Format compliance
 * - Source verification
 */

import fetch from 'node-fetch';
import crypto from 'crypto';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  BASE_URL: 'http://localhost:5000',
  EMAIL: 'localhost@koda.com',
  PASSWORD: 'localhost123',

  // Test queries to run
  TEST_QUERIES: [
    {
      name: 'Simple Greeting',
      query: 'Hello',
      expectedType: 'simple',
      shouldHaveTitle: false,
      shouldHaveSources: false
    },
    {
      name: 'Data Query',
      query: 'What is the total revenue?',
      expectedType: 'complex',
      shouldHaveTitle: true,
      shouldHaveSources: true
    },
    {
      name: 'Document List',
      query: 'Show me all my documents',
      expectedType: 'complex',
      shouldHaveTitle: false,
      shouldHaveSources: false
    },
    {
      name: 'Analysis Query',
      query: 'Analyze the key themes across all my documents',
      expectedType: 'complex',
      shouldHaveTitle: true,
      shouldHaveSources: true
    }
  ]
};

// ============================================================================
// UTILITIES
// ============================================================================

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(80));
  log(title, 'bright');
  console.log('='.repeat(80) + '\n');
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'cyan');
}

// ============================================================================
// AUTHENTICATION
// ============================================================================

async function login() {
  logSection('🔐 AUTHENTICATION');

  try {
    const response = await fetch(`${CONFIG.BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: CONFIG.EMAIL,
        password: CONFIG.PASSWORD
      })
    });

    if (!response.ok) {
      throw new Error(`Login failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.accessToken) {
      throw new Error('No token in response');
    }

    logSuccess(`Logged in as: ${CONFIG.EMAIL}`);
    logInfo(`Token: ${data.accessToken.substring(0, 20)}...`);

    return data.accessToken;
  } catch (error) {
    logError(`Authentication failed: ${error.message}`);
    throw error;
  }
}

// ============================================================================
// FORMAT VALIDATION
// ============================================================================

function validateFormat(answer, expectedType, shouldHaveTitle) {
  const issues = [];
  const warnings = [];

  // Check length
  const wordCount = answer.split(/\s+/).length;

  if (expectedType === 'simple') {
    if (wordCount > 50) {
      warnings.push(`Simple answer too long: ${wordCount} words (expected < 50)`);
    }
    if (answer.includes('##')) {
      issues.push('Simple answer should not have title (##)');
    }
  } else {
    if (wordCount < 50) {
      warnings.push(`Complex answer too short: ${wordCount} words (expected 200-350)`);
    }
    if (wordCount > 400) {
      warnings.push(`Complex answer too long: ${wordCount} words (expected 200-350)`);
    }

    if (shouldHaveTitle && !answer.includes('##')) {
      issues.push('Complex answer missing title (##)');
    }
  }

  // Check for multiple consecutive blank lines
  if (answer.includes('\n\n\n')) {
    issues.push('Contains multiple consecutive blank lines');
  }

  // Check for proper spacing after headers
  const headerMatches = answer.match(/^#{1,3}\s+.+$/gm);
  if (headerMatches) {
    headerMatches.forEach(header => {
      const headerIndex = answer.indexOf(header);
      const afterHeader = answer.substring(headerIndex + header.length, headerIndex + header.length + 2);
      if (afterHeader !== '\n\n') {
        warnings.push(`Header "${header}" should be followed by blank line`);
      }
    });
  }

  // Check bullet points
  const bulletLines = answer.split('\n').filter(line => line.trim().match(/^[•\-\*]\s/));
  if (bulletLines.length > 7) {
    warnings.push(`Too many bullet points: ${bulletLines.length} (max 7 per section)`);
  }

  return { issues, warnings, wordCount };
}

// ============================================================================
// RAG QUERY
// ============================================================================

async function queryRAG(token, query, testName, conversationId) {
  logSection(`🔍 TEST: ${testName}`);
  logInfo(`Query: "${query}"`);

  try {
    const response = await fetch(`${CONFIG.BASE_URL}/api/rag/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ query, conversationId })
    });

    if (!response.ok) {
      throw new Error(`Query failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    return data;
  } catch (error) {
    logError(`Query failed: ${error.message}`);
    return null;
  }
}

// ============================================================================
// RESULT DISPLAY
// ============================================================================

function displayResult(result, testConfig) {
  if (!result) {
    logError('No result received');
    return { passed: false };
  }

  console.log('\n' + '-'.repeat(80));
  log('📄 ANSWER:', 'bright');
  console.log('-'.repeat(80));
  console.log(result.answer);
  console.log('-'.repeat(80));

  // Metadata
  console.log('\n' + '-'.repeat(80));
  log('📊 METADATA:', 'bright');
  console.log('-'.repeat(80));

  const metadata = result.metadata || {};
  console.log(`Intent: ${metadata.intent || 'N/A'}`);
  console.log(`Route: ${metadata.route || 'N/A'}`);
  console.log(`Is Fallback: ${metadata.isFallback || false}`);
  console.log(`Confidence: ${metadata.confidence || 'N/A'}`);

  // Sources
  console.log('\n' + '-'.repeat(80));
  log('📚 SOURCES:', 'bright');
  console.log('-'.repeat(80));

  const sources = result.sources || [];
  console.log(`Source Count: ${sources.length}`);

  if (sources.length > 0) {
    sources.slice(0, 3).forEach((source, i) => {
      console.log(`\n  ${i + 1}. ${source.filename || 'Unknown'}`);
      console.log(`     Similarity: ${source.similarity?.toFixed(3) || 'N/A'}`);
      console.log(`     Content: ${(source.content || '').substring(0, 100)}...`);
    });
  }

  // Format Validation
  console.log('\n' + '-'.repeat(80));
  log('✓ FORMAT VALIDATION:', 'bright');
  console.log('-'.repeat(80));

  const validation = validateFormat(
    result.answer,
    testConfig.expectedType,
    testConfig.shouldHaveTitle
  );

  console.log(`Word Count: ${validation.wordCount}`);
  console.log(`Issues: ${validation.issues.length}`);
  console.log(`Warnings: ${validation.warnings.length}`);

  if (validation.issues.length > 0) {
    console.log('\n❌ Issues:');
    validation.issues.forEach(issue => logError(`  - ${issue}`));
  }

  if (validation.warnings.length > 0) {
    console.log('\n⚠️  Warnings:');
    validation.warnings.forEach(warning => logWarning(`  - ${warning}`));
  }

  // Test Results
  console.log('\n' + '-'.repeat(80));
  log('🎯 TEST RESULTS:', 'bright');
  console.log('-'.repeat(80));

  const checks = [];

  // Check if fallback when shouldn't be
  if (testConfig.shouldHaveSources && metadata.isFallback) {
    checks.push({ name: 'Not a fallback', passed: false });
  } else {
    checks.push({ name: 'Fallback status correct', passed: true });
  }

  // Check sources
  if (testConfig.shouldHaveSources) {
    checks.push({
      name: 'Has sources',
      passed: sources.length > 0
    });
  }

  // Check format issues
  checks.push({
    name: 'No format issues',
    passed: validation.issues.length === 0
  });

  // Check word count
  if (testConfig.expectedType === 'simple') {
    checks.push({
      name: 'Word count appropriate',
      passed: validation.wordCount <= 50
    });
  } else {
    checks.push({
      name: 'Word count appropriate',
      passed: validation.wordCount >= 50 && validation.wordCount <= 400
    });
  }

  checks.forEach(check => {
    if (check.passed) {
      logSuccess(check.name);
    } else {
      logError(check.name);
    }
  });

  const allPassed = checks.every(c => c.passed);
  const hasWarnings = validation.warnings.length > 0;

  console.log('\n' + '='.repeat(80));
  if (allPassed && !hasWarnings) {
    log('✅ TEST PASSED', 'green');
  } else if (allPassed && hasWarnings) {
    log('⚠️  TEST PASSED WITH WARNINGS', 'yellow');
  } else {
    log('❌ TEST FAILED', 'red');
  }
  console.log('='.repeat(80));

  return {
    passed: allPassed,
    hasWarnings,
    checks,
    validation
  };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.clear();

  logSection('🧪 RAG COMPREHENSIVE TEST SUITE');
  logInfo(`Backend: ${CONFIG.BASE_URL}`);
  logInfo(`User: ${CONFIG.EMAIL}`);
  logInfo(`Tests: ${CONFIG.TEST_QUERIES.length}`);

  // Login
  let token;
  try {
    token = await login();
  } catch (error) {
    logError('Cannot proceed without authentication');
    process.exit(1);
  }

  // Run tests
  const results = [];

  // Generate a unique conversation ID for this test session
  const conversationId = crypto.randomUUID();
  logInfo(`Conversation ID: ${conversationId}`);

  for (const testConfig of CONFIG.TEST_QUERIES) {
    const result = await queryRAG(token, testConfig.query, testConfig.name, conversationId);
    const testResult = displayResult(result, testConfig);

    results.push({
      name: testConfig.name,
      ...testResult
    });

    // Wait between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Summary
  logSection('📊 TEST SUMMARY');

  const passed = results.filter(r => r.passed && !r.hasWarnings).length;
  const passedWithWarnings = results.filter(r => r.passed && r.hasWarnings).length;
  const failed = results.filter(r => !r.passed).length;

  console.log(`Total Tests: ${results.length}`);
  logSuccess(`Passed: ${passed}`);
  if (passedWithWarnings > 0) {
    logWarning(`Passed with Warnings: ${passedWithWarnings}`);
  }
  if (failed > 0) {
    logError(`Failed: ${failed}`);
  }

  console.log('\nDetailed Results:');
  results.forEach(r => {
    const status = r.passed ? (r.hasWarnings ? '⚠️ ' : '✅') : '❌';
    console.log(`  ${status} ${r.name}`);
  });

  console.log('\n' + '='.repeat(80));
  if (failed === 0 && passedWithWarnings === 0) {
    log('🎉 ALL TESTS PASSED!', 'green');
  } else if (failed === 0) {
    log('✅ ALL TESTS PASSED (with warnings)', 'yellow');
  } else {
    log(`❌ ${failed} TEST(S) FAILED`, 'red');
  }
  console.log('='.repeat(80));

  process.exit(failed > 0 ? 1 : 0);
}

// Run
main().catch(error => {
  logError(`Fatal error: ${error.message}`);
  console.error(error);
  process.exit(1);
});
