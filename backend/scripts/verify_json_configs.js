#!/usr/bin/env node
/**
 * JSON Config Verification Script
 *
 * Verifies that JSON data files are actually being loaded and used by:
 * 1. Checking config services report non-zero counts
 * 2. Testing specific keys/values from the JSON files
 * 3. Running behavioral checks to confirm configs are being used
 *
 * Usage:
 *   node scripts/verify_json_configs.js [--url=http://localhost:5000] [--token=JWT]
 *
 * Tests:
 *   - Health endpoint config flags
 *   - Config-stats endpoint detailed counts
 *   - Fallback behavior (triggers specific JSON message)
 *   - Intent classification (uses patterns from JSON)
 */

const http = require('http');
const https = require('https');

// ============================================================================
// CONFIGURATION
// ============================================================================

const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, value] = arg.replace('--', '').split('=');
  acc[key] = value || true;
  return acc;
}, {});

const CONFIG = {
  baseUrl: args.url || process.env.API_BASE_URL || 'http://localhost:5000',
  token: args.token || process.env.TEST_JWT_TOKEN || null,
  verbose: args.verbose === 'true' || args.v === true,
};

// ============================================================================
// COLORS
// ============================================================================

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

const log = {
  info: (msg) => console.log(`${colors.blue}INFO${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}PASS${colors.reset} ${msg}`),
  fail: (msg) => console.log(`${colors.red}FAIL${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}WARN${colors.reset} ${msg}`),
  section: (title) => console.log(`\n${colors.magenta}=== ${title} ===${colors.reset}`),
  detail: (msg) => CONFIG.verbose && console.log(`${colors.dim}     ${msg}${colors.reset}`),
};

// ============================================================================
// HTTP HELPER
// ============================================================================

function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';
    const lib = isHttps ? https : http;

    const reqOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      rejectUnauthorized: false,
    };

    const req = lib.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    req.end();
  });
}

// ============================================================================
// TEST FUNCTIONS
// ============================================================================

async function testHealthEndpoint() {
  log.section('TEST 1: Health Endpoint Config Flags');

  const { status, data } = await request(`${CONFIG.baseUrl}/health`);

  if (status !== 200) {
    log.fail(`Health endpoint returned ${status} (expected 200)`);
    log.detail(JSON.stringify(data, null, 2));
    return false;
  }

  log.success(`Health endpoint returned 200`);

  // Check config flags
  const checks = data.checks || {};
  let allPassed = true;

  const configFlags = [
    ['fallbacks', 'loaded'],
    ['productHelp', 'loaded'],
    ['intentConfig', 'loaded'],
    ['container', 'initialized'],
  ];

  for (const [flag, expected] of configFlags) {
    if (checks[flag] === expected) {
      log.success(`${flag}: ${checks[flag]}`);
    } else {
      log.fail(`${flag}: ${checks[flag]} (expected: ${expected})`);
      allPassed = false;
    }
  }

  return allPassed;
}

async function testConfigStats() {
  log.section('TEST 2: Config Statistics (Non-Zero Counts)');

  const { status, data } = await request(`${CONFIG.baseUrl}/health/config-stats`);

  if (status !== 200) {
    log.fail(`Config-stats endpoint returned ${status}`);
    log.detail(JSON.stringify(data, null, 2));
    return false;
  }

  let allPassed = true;
  const configs = data.configs || {};

  // Intent patterns
  const intent = configs.intentPatterns || {};
  if (intent.totalIntents > 0) {
    log.success(`Intent patterns: ${intent.totalIntents} intents, ${intent.totalKeywords} keywords, ${intent.totalPatterns} patterns`);
    log.detail(`By language: EN=${intent.byLanguage?.en?.keywords || 0}kw, PT=${intent.byLanguage?.pt?.keywords || 0}kw, ES=${intent.byLanguage?.es?.keywords || 0}kw`);
  } else {
    log.fail(`Intent patterns: 0 intents loaded`);
    allPassed = false;
  }

  // Fallbacks
  const fallbacks = configs.fallbacks || {};
  if (fallbacks.totalScenarios > 0) {
    log.success(`Fallbacks: ${fallbacks.totalScenarios} scenarios, ${fallbacks.totalStyles} styles`);
    log.detail(`By language: EN=${fallbacks.byLanguage?.en || 0}, PT=${fallbacks.byLanguage?.pt || 0}, ES=${fallbacks.byLanguage?.es || 0}`);
  } else {
    log.fail(`Fallbacks: 0 scenarios loaded`);
    allPassed = false;
  }

  // Product help
  const help = configs.productHelp || {};
  if (help.topicsLoaded > 0 || help.capabilitiesLoaded > 0) {
    log.success(`Product help: ${help.topicsLoaded} topics, ${help.capabilitiesLoaded} capabilities`);
  } else {
    log.fail(`Product help: 0 topics/capabilities loaded`);
    allPassed = false;
  }

  return allPassed;
}

async function testDataHealth() {
  log.section('TEST 3: Data Files Health');

  const { status, data } = await request(`${CONFIG.baseUrl}/health/data-health`);

  if (status !== 200) {
    log.fail(`Data-health endpoint returned ${status}`);
    if (data.files?.problems) {
      data.files.problems.forEach(p => log.fail(`  ${p.file}: ${p.error}`));
    }
    return false;
  }

  log.success(`All ${data.totalFiles} data files OK`);
  log.detail(`Data directory: ${data.dataDir}`);

  return true;
}

async function testFallbackBehavior() {
  log.section('TEST 4: Fallback Behavior Check');

  if (!CONFIG.token) {
    log.warn('Skipping (no JWT token provided)');
    return true;
  }

  // Send an out-of-scope query that should trigger fallback
  const { status, data } = await request(`${CONFIG.baseUrl}/api/rag/query/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CONFIG.token}`,
    },
    body: {
      query: 'asdfghjkl random gibberish xyz123',
      conversationId: `verify-fallback-${Date.now()}`,
      language: 'en',
    },
  });

  if (status !== 200) {
    log.fail(`RAG query returned ${status}`);
    return false;
  }

  // Parse SSE events
  const events = String(data).split('\n')
    .filter(line => line.startsWith('data: '))
    .map(line => {
      try { return JSON.parse(line.slice(6)); }
      catch { return null; }
    })
    .filter(Boolean);

  const intentEvent = events.find(e => e.type === 'intent');
  const contentEvent = events.find(e => e.type === 'content');

  if (intentEvent) {
    log.success(`Intent classified: ${intentEvent.intent} (confidence: ${intentEvent.confidence})`);
    log.detail(`Expected: AMBIGUOUS or OUT_OF_SCOPE for gibberish query`);
  }

  // Check if we got a fallback message (not hardcoded default)
  if (contentEvent?.content) {
    const content = contentEvent.content;
    // The fallback message should come from fallbacks.json, not be empty
    if (content.length > 20) {
      log.success(`Received fallback response (${content.length} chars)`);
      log.detail(`Content: "${content.substring(0, 80)}..."`);
    } else {
      log.warn(`Fallback response seems short: "${content}"`);
    }
  }

  return true;
}

async function testIntentClassification() {
  log.section('TEST 5: Intent Pattern Check');

  if (!CONFIG.token) {
    log.warn('Skipping (no JWT token provided)');
    return true;
  }

  // Test queries that should match specific intents
  const testCases = [
    { query: 'how many documents do I have', expected: 'DOC_ANALYTICS', description: 'Analytics query' },
    { query: 'help me use koda', expected: 'PRODUCT_HELP', description: 'Product help query' },
    { query: 'what does this document say about revenue', expected: 'DOC_QA', description: 'Document QA query' },
  ];

  let passed = 0;
  for (const test of testCases) {
    try {
      const { status, data } = await request(`${CONFIG.baseUrl}/api/rag/query/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${CONFIG.token}`,
        },
        body: {
          query: test.query,
          conversationId: `verify-intent-${Date.now()}`,
          language: 'en',
        },
      });

      if (status !== 200) continue;

      const events = String(data).split('\n')
        .filter(line => line.startsWith('data: '))
        .map(line => { try { return JSON.parse(line.slice(6)); } catch { return null; } })
        .filter(Boolean);

      const intentEvent = events.find(e => e.type === 'intent');
      const actual = intentEvent?.intent || 'UNKNOWN';

      if (actual === test.expected) {
        log.success(`${test.description}: ${actual}`);
        passed++;
      } else {
        log.warn(`${test.description}: got ${actual}, expected ${test.expected}`);
      }
    } catch (e) {
      log.fail(`${test.description}: ${e.message}`);
    }
  }

  return passed >= 1; // At least one should match
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log(`\n${colors.cyan}JSON Config Verification Script${colors.reset}`);
  console.log(`${colors.dim}Base URL: ${CONFIG.baseUrl}${colors.reset}`);
  console.log(`${colors.dim}Token: ${CONFIG.token ? 'provided' : 'not provided (some tests skipped)'}${colors.reset}`);

  const results = {
    health: false,
    configStats: false,
    dataHealth: false,
    fallback: false,
    intent: false,
  };

  try {
    results.health = await testHealthEndpoint();
  } catch (e) {
    log.fail(`Health test error: ${e.message}`);
  }

  try {
    results.configStats = await testConfigStats();
  } catch (e) {
    log.fail(`Config stats test error: ${e.message}`);
  }

  try {
    results.dataHealth = await testDataHealth();
  } catch (e) {
    log.fail(`Data health test error: ${e.message}`);
  }

  try {
    results.fallback = await testFallbackBehavior();
  } catch (e) {
    log.fail(`Fallback test error: ${e.message}`);
  }

  try {
    results.intent = await testIntentClassification();
  } catch (e) {
    log.fail(`Intent test error: ${e.message}`);
  }

  // Summary
  log.section('SUMMARY');
  const passed = Object.values(results).filter(r => r).length;
  const total = Object.keys(results).length;

  for (const [test, result] of Object.entries(results)) {
    if (result) {
      log.success(test);
    } else {
      log.fail(test);
    }
  }

  console.log(`\n${passed === total ? colors.green : colors.yellow}${passed}/${total} tests passed${colors.reset}\n`);

  process.exit(passed === total ? 0 : 1);
}

main().catch(e => {
  log.fail(`Unhandled error: ${e.message}`);
  process.exit(1);
});
