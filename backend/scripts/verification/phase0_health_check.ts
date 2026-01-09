/**
 * PHASE 0 — BASELINE ASSERTIONS
 * Verify all services are running before testing wiring
 */

import axios from 'axios';

interface HealthCheckResult {
  service: string;
  url: string;
  status: 'OK' | 'FAIL';
  response?: any;
  error?: string;
}

const SERVICES = {
  backend: process.env.BACKEND_URL || 'http://localhost:5000',
  mathEngine: process.env.MATH_ENGINE_URL || 'http://127.0.0.1:5050',
};

async function checkHealth(name: string, url: string): Promise<HealthCheckResult> {
  try {
    const response = await axios.get(`${url}/health`, { timeout: 5000 });
    return {
      service: name,
      url: `${url}/health`,
      status: response.status === 200 ? 'OK' : 'FAIL',
      response: response.data,
    };
  } catch (error: any) {
    return {
      service: name,
      url: `${url}/health`,
      status: 'FAIL',
      error: error.message,
    };
  }
}

async function runHealthChecks(): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('PHASE 0 — BASELINE HEALTH CHECK');
  console.log('='.repeat(60) + '\n');

  const results: HealthCheckResult[] = [];

  // Check each service
  for (const [name, url] of Object.entries(SERVICES)) {
    console.log(`Checking ${name}...`);
    const result = await checkHealth(name, url);
    results.push(result);

    if (result.status === 'OK') {
      console.log(`  ✓ ${name}: OK`);
      if (result.response) {
        console.log(`    Response: ${JSON.stringify(result.response)}`);
      }
    } else {
      console.log(`  ✗ ${name}: FAIL`);
      console.log(`    Error: ${result.error}`);
    }
  }

  console.log('\n' + '-'.repeat(60));

  // Summary
  const passed = results.filter(r => r.status === 'OK').length;
  const failed = results.filter(r => r.status === 'FAIL').length;

  console.log(`\nResults: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    console.log('\n❌ HEALTH CHECK FAILED — Cannot proceed with wiring verification');
    console.log('\nFailed services:');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`  - ${r.service}: ${r.error}`);
    });
    process.exit(1);
  }

  console.log('\n✅ All services healthy — Ready for wiring verification');
  console.log('='.repeat(60) + '\n');
}

// Run
runHealthChecks().catch(err => {
  console.error('Health check error:', err);
  process.exit(1);
});
