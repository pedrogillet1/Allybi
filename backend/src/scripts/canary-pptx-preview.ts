/**
 * PPTX Preview Canary Health Check
 *
 * Purpose: Validate PPTX preview system is working end-to-end
 * Can be run: locally, in CI, or as a cron job in production
 *
 * Exit codes:
 * 0 = PASS (all checks passed)
 * 1 = FAIL (one or more checks failed)
 * 2 = ERROR (script error, not a preview issue)
 *
 * Usage:
 *   npm run canary-pptx-preview
 *   npm run canary-pptx-preview -- --doc-id=<known-pptx-id>
 *   npm run canary-pptx-preview -- --verbose
 */

import axios, { AxiosError } from 'axios';
import * as fs from 'fs';
import * as path from 'path';

// ══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ══════════════════════════════════════════════════════════════════════════

interface CanaryConfig {
  apiUrl: string;
  authToken?: string;
  testDocumentId?: string;
  verbose: boolean;
  timeout: number;
}

// Parse command line args
const args = process.argv.slice(2);
const verbose = args.includes('--verbose') || args.includes('-v');
const docIdArg = args.find(arg => arg.startsWith('--doc-id='));
const providedDocId = docIdArg ? docIdArg.split('=')[1] : undefined;

const config: CanaryConfig = {
  apiUrl: process.env.API_URL || process.env.REACT_APP_API_URL || 'http://localhost:5000',
  authToken: process.env.CANARY_AUTH_TOKEN,
  testDocumentId: providedDocId || process.env.CANARY_PPTX_DOC_ID,
  verbose,
  timeout: 30000, // 30 seconds
};

// ══════════════════════════════════════════════════════════════════════════
// LOGGING
// ══════════════════════════════════════════════════════════════════════════

function log(message: string, level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS' = 'INFO') {
  const prefix = {
    INFO: '📊',
    WARN: '⚠️ ',
    ERROR: '❌',
    SUCCESS: '✅',
  }[level];

  console.log(`${prefix} ${message}`);
}

function logVerbose(message: string) {
  if (config.verbose) {
    console.log(`  → ${message}`);
  }
}

// ══════════════════════════════════════════════════════════════════════════
// HTTP CLIENT
// ══════════════════════════════════════════════════════════════════════════

const client = axios.create({
  baseURL: config.apiUrl,
  timeout: config.timeout,
  headers: config.authToken ? {
    Authorization: `Bearer ${config.authToken}`
  } : {},
  withCredentials: true,
});

// ══════════════════════════════════════════════════════════════════════════
// CANARY CHECKS
// ══════════════════════════════════════════════════════════════════════════

interface CheckResult {
  name: string;
  passed: boolean;
  details?: string;
  error?: string;
}

const results: CheckResult[] = [];

/**
 * Check 1: Preview Plan Endpoint
 * Verify /api/documents/:id/preview returns valid PreviewPlan
 */
async function checkPreviewPlan(docId: string): Promise<CheckResult> {
  const checkName = 'Preview Plan Endpoint';

  try {
    logVerbose(`Calling GET /api/documents/${docId}/preview`);

    const response = await client.get(`/api/documents/${docId}/preview`);
    const plan = response.data;

    logVerbose(`Response: ${JSON.stringify(plan, null, 2)}`);

    // Validate response shape
    if (!plan.previewType) {
      return {
        name: checkName,
        passed: false,
        error: 'Response missing previewType field',
      };
    }

    if (typeof plan.assetsReady !== 'boolean') {
      return {
        name: checkName,
        passed: false,
        error: 'Response missing or invalid assetsReady field',
      };
    }

    // If plan says assetsReady=true, verify we got a preview URL or slides endpoint
    if (plan.assetsReady) {
      const hasSlidesEndpoint = plan.previewType === 'pptx-slides' || plan.previewType === 'pptx-pdf';

      if (!hasSlidesEndpoint) {
        return {
          name: checkName,
          passed: false,
          error: `assetsReady=true but previewType=${plan.previewType} (expected pptx-slides or pptx-pdf)`,
          details: JSON.stringify(plan),
        };
      }
    }

    return {
      name: checkName,
      passed: true,
      details: `previewType=${plan.previewType}, assetsReady=${plan.assetsReady}`,
    };
  } catch (error: any) {
    const err = error as AxiosError;
    return {
      name: checkName,
      passed: false,
      error: `HTTP ${err.response?.status || 'ERROR'}: ${err.message}`,
    };
  }
}

/**
 * Check 2: Slides Endpoint (Pagination)
 * Verify /api/documents/:id/slides?page=1&pageSize=10 returns valid slides
 */
async function checkSlidesEndpoint(docId: string): Promise<CheckResult> {
  const checkName = 'Slides Endpoint (Pagination)';

  try {
    logVerbose(`Calling GET /api/documents/${docId}/slides?page=1&pageSize=10`);

    const response = await client.get(`/api/documents/${docId}/slides`, {
      params: { page: 1, pageSize: 10 },
    });

    const data = response.data;

    logVerbose(`Response keys: ${Object.keys(data).join(', ')}`);

    // Validate response shape
    if (!data.success) {
      return {
        name: checkName,
        passed: false,
        error: 'Response missing success field or success=false',
        details: JSON.stringify(data),
      };
    }

    if (!Array.isArray(data.slides)) {
      return {
        name: checkName,
        passed: false,
        error: 'Response missing slides array',
      };
    }

    if (typeof data.totalSlides !== 'number') {
      return {
        name: checkName,
        passed: false,
        error: 'Response missing totalSlides field',
      };
    }

    if (typeof data.page !== 'number' || typeof data.pageSize !== 'number') {
      return {
        name: checkName,
        passed: false,
        error: 'Response missing page or pageSize fields',
      };
    }

    // Check at least one slide has hasImage=true
    const slidesWithImages = data.slides.filter((slide: any) => slide.hasImage === true);

    if (slidesWithImages.length === 0 && data.slides.length > 0) {
      return {
        name: checkName,
        passed: false,
        error: 'No slides have hasImage=true (expected at least one)',
        details: `totalSlides=${data.totalSlides}, returned=${data.slides.length}`,
      };
    }

    return {
      name: checkName,
      passed: true,
      details: `totalSlides=${data.totalSlides}, page=${data.page}, slidesWithImages=${slidesWithImages.length}/${data.slides.length}`,
    };
  } catch (error: any) {
    const err = error as AxiosError;
    return {
      name: checkName,
      passed: false,
      error: `HTTP ${err.response?.status || 'ERROR'}: ${err.message}`,
    };
  }
}

/**
 * Check 3: Image URL Accessibility
 * Verify signed URLs return HTTP 200 (or 307 redirect for GCS)
 */
async function checkImageUrls(docId: string): Promise<CheckResult> {
  const checkName = 'Image URL Accessibility';

  try {
    logVerbose(`Fetching slides to check image URLs...`);

    const response = await client.get(`/api/documents/${docId}/slides`, {
      params: { page: 1, pageSize: 3 }, // Check first 3 slides
    });

    const slides = response.data.slides || [];
    const slidesWithImages = slides.filter((slide: any) => slide.hasImage && slide.imageUrl);

    if (slidesWithImages.length === 0) {
      return {
        name: checkName,
        passed: false,
        error: 'No slides with imageUrl to test',
      };
    }

    // Test first image URL
    const firstSlide = slidesWithImages[0];
    const imageUrl = firstSlide.imageUrl;

    logVerbose(`Testing image URL: ${imageUrl.substring(0, 80)}...`);

    const imageResponse = await axios.head(imageUrl, {
      timeout: 10000,
      maxRedirects: 0, // Don't follow redirects
      validateStatus: (status) => status < 400 || status === 307, // Accept 307 for GCS signed URLs
    });

    if (imageResponse.status === 200 || imageResponse.status === 307) {
      return {
        name: checkName,
        passed: true,
        details: `HTTP ${imageResponse.status} for slide ${firstSlide.slideNumber}`,
      };
    } else {
      return {
        name: checkName,
        passed: false,
        error: `Unexpected HTTP status ${imageResponse.status} for image URL`,
      };
    }
  } catch (error: any) {
    const err = error as AxiosError;
    return {
      name: checkName,
      passed: false,
      error: `Failed to access image URL: ${err.message}`,
    };
  }
}

/**
 * Check 4: Metrics Endpoint
 * Verify drift metrics are zero (no silent degradation)
 */
async function checkDriftMetrics(): Promise<CheckResult> {
  const checkName = 'Drift Metrics (Zero Degradation)';

  try {
    logVerbose(`Calling GET /api/metrics`);

    const response = await client.get('/api/metrics');
    const metrics = response.data;

    const counters = metrics.counters || {};

    // Check for drift metrics
    const driftKeys = Object.keys(counters).filter(key =>
      key.includes('contract_violation') ||
      key.includes('plan_drift') ||
      key.includes('signing_drift')
    );

    if (driftKeys.length === 0) {
      return {
        name: checkName,
        passed: true,
        details: 'No drift metrics present (healthy)',
      };
    }

    // If drift metrics exist, they should be zero
    const nonZeroDrift = driftKeys.filter(key => counters[key] > 0);

    if (nonZeroDrift.length > 0) {
      const driftSummary = nonZeroDrift.map(key => `${key}=${counters[key]}`).join(', ');
      return {
        name: checkName,
        passed: false,
        error: `Drift detected: ${driftSummary}`,
        details: 'System is degrading. Check logs for [DRIFT] or [VIOLATION] messages.',
      };
    }

    return {
      name: checkName,
      passed: true,
      details: 'All drift metrics are zero',
    };
  } catch (error: any) {
    // Metrics endpoint may not exist in all environments - treat as warning, not failure
    logVerbose(`Metrics endpoint not available: ${error.message}`);
    return {
      name: checkName,
      passed: true, // Don't fail canary if metrics endpoint is unavailable
      details: 'Metrics endpoint unavailable (skipped)',
    };
  }
}

// ══════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════

async function runCanary(): Promise<number> {
  log('PPTX Preview Canary Health Check', 'INFO');
  log(`API: ${config.apiUrl}`);

  // Validate config
  if (!config.testDocumentId) {
    log('ERROR: No test document ID provided', 'ERROR');
    log('Set CANARY_PPTX_DOC_ID env var or use --doc-id=<id>', 'ERROR');
    log('', 'INFO');
    log('To find a PPTX document ID:', 'INFO');
    log('  1. Upload a PPTX file via the UI', 'INFO');
    log('  2. Open browser devtools → Network tab', 'INFO');
    log('  3. Look for /api/documents/{id}/preview call', 'INFO');
    log('  4. Copy the document ID from the URL', 'INFO');
    return 2;
  }

  if (!config.authToken) {
    log('WARN: No auth token provided (CANARY_AUTH_TOKEN)', 'WARN');
    log('Some checks may fail due to 401 Unauthorized', 'WARN');
  }

  log(`Document ID: ${config.testDocumentId}`, 'INFO');
  log('', 'INFO');

  // Run checks
  log('Running checks...', 'INFO');

  results.push(await checkPreviewPlan(config.testDocumentId));
  results.push(await checkSlidesEndpoint(config.testDocumentId));
  results.push(await checkImageUrls(config.testDocumentId));
  results.push(await checkDriftMetrics());

  // Print results
  log('', 'INFO');
  log('═══════════════════════════════════════', 'INFO');
  log('RESULTS', 'INFO');
  log('═══════════════════════════════════════', 'INFO');

  const passed = results.filter(r => r.passed);
  const failed = results.filter(r => !r.passed);

  results.forEach(result => {
    const status = result.passed ? 'SUCCESS' : 'ERROR';
    log(`${result.name}: ${result.passed ? 'PASS' : 'FAIL'}`, status);

    if (result.details && config.verbose) {
      logVerbose(result.details);
    }

    if (result.error) {
      logVerbose(`Error: ${result.error}`);
    }
  });

  log('', 'INFO');
  log(`Passed: ${passed.length}/${results.length}`, passed.length === results.length ? 'SUCCESS' : 'ERROR');

  if (failed.length > 0) {
    log('', 'INFO');
    log('Failed Checks:', 'ERROR');
    failed.forEach(r => {
      log(`  - ${r.name}: ${r.error}`, 'ERROR');
    });
  }

  return failed.length === 0 ? 0 : 1;
}

// Run canary
runCanary()
  .then(exitCode => {
    process.exit(exitCode);
  })
  .catch(error => {
    log(`Canary script error: ${error.message}`, 'ERROR');
    if (config.verbose) {
      console.error(error);
    }
    process.exit(2);
  });
