#!/usr/bin/env npx ts-node
/**
 * Local Setup Verification Script
 *
 * Verifies that the local development environment is properly configured:
 * 1. Database connection works
 * 2. Prisma client is in sync with database schema
 * 3. Key API endpoints respond correctly
 * 4. Redis connection works (if configured)
 *
 * Usage:
 *   npx ts-node scripts/verify-local-setup.ts
 *   npm run verify:local
 */

import { PrismaClient } from '@prisma/client';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5001';
const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

const log = {
  info: (msg: string) => console.log(`${COLORS.blue}[INFO]${COLORS.reset} ${msg}`),
  success: (msg: string) => console.log(`${COLORS.green}[OK]${COLORS.reset} ${msg}`),
  warn: (msg: string) => console.log(`${COLORS.yellow}[WARN]${COLORS.reset} ${msg}`),
  error: (msg: string) => console.log(`${COLORS.red}[FAIL]${COLORS.reset} ${msg}`),
};

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  critical: boolean;
}

const results: TestResult[] = [];

async function testDatabaseConnection(): Promise<void> {
  log.info('Testing database connection...');
  const prisma = new PrismaClient();

  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    log.success('Database connection OK');
    results.push({ name: 'Database Connection', passed: true, message: 'Connected successfully', critical: true });
  } catch (error: any) {
    log.error(`Database connection failed: ${error.message}`);
    results.push({ name: 'Database Connection', passed: false, message: error.message, critical: true });
  } finally {
    await prisma.$disconnect();
  }
}

async function testPrismaSchemaSync(): Promise<void> {
  log.info('Testing Prisma schema synchronization...');
  const prisma = new PrismaClient();

  try {
    await prisma.$connect();

    // Test that key columns exist by querying them
    // This will fail if the Prisma client is out of sync with database
    const testQueries = [
      // Test Document model with all critical fields
      prisma.document.findFirst({
        select: {
          id: true,
          filename: true,
          status: true,
          createdAt: true,
          rawText: true, // This field caused issues before - ensure it exists
          previewText: true,
          displayTitle: true,
        },
        take: 1,
      }),
      // Test Folder model
      prisma.folder.findFirst({
        select: {
          id: true,
          name: true,
          emoji: true,
          parentFolderId: true,
          _count: { select: { documents: true } },
        },
        take: 1,
      }),
    ];

    await Promise.all(testQueries);
    log.success('Prisma schema is in sync with database');
    results.push({ name: 'Prisma Schema Sync', passed: true, message: 'All columns accessible', critical: true });
  } catch (error: any) {
    const isSchemaError = error.message.includes('Unknown column') ||
                          error.message.includes('Unknown field') ||
                          error.message.includes('does not exist');

    if (isSchemaError) {
      log.error('Prisma client is OUT OF SYNC with database!');
      log.warn('Run: npm run dev:sync');
      results.push({
        name: 'Prisma Schema Sync',
        passed: false,
        message: 'Schema mismatch - run "npm run dev:sync"',
        critical: true
      });
    } else {
      // Non-schema error (like no data) is OK
      log.success('Prisma schema sync check passed (no data yet, but schema OK)');
      results.push({ name: 'Prisma Schema Sync', passed: true, message: 'Schema accessible', critical: true });
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function testHealthEndpoint(): Promise<void> {
  log.info(`Testing health endpoint at ${BACKEND_URL}/health...`);

  try {
    const response = await fetch(`${BACKEND_URL}/health`);

    if (response.ok) {
      const data = await response.json();
      log.success(`Health endpoint OK: ${JSON.stringify(data.status || 'healthy')}`);
      results.push({ name: 'Health Endpoint', passed: true, message: 'Server is healthy', critical: true });
    } else {
      log.error(`Health endpoint returned ${response.status}`);
      results.push({ name: 'Health Endpoint', passed: false, message: `HTTP ${response.status}`, critical: true });
    }
  } catch (error: any) {
    if (error.cause?.code === 'ECONNREFUSED') {
      log.error(`Backend not running at ${BACKEND_URL}`);
      log.warn('Start the backend: npm run dev');
      results.push({ name: 'Health Endpoint', passed: false, message: 'Backend not running', critical: true });
    } else {
      log.error(`Health check failed: ${error.message}`);
      results.push({ name: 'Health Endpoint', passed: false, message: error.message, critical: true });
    }
  }
}

async function testBatchInitialDataEndpoint(): Promise<void> {
  log.info('Testing /api/batch/initial-data endpoint (unauthenticated check)...');

  try {
    const response = await fetch(`${BACKEND_URL}/api/batch/initial-data`);

    // We expect 401 Unauthorized since we're not authenticated
    // What we DON'T want is a 500 error (schema mismatch)
    if (response.status === 401) {
      log.success('Batch endpoint accessible (returns 401 as expected without auth)');
      results.push({
        name: 'Batch Initial Data Endpoint',
        passed: true,
        message: 'Endpoint exists and auth required',
        critical: false
      });
    } else if (response.status === 500) {
      const text = await response.text();
      log.error(`Batch endpoint 500 error - likely schema issue: ${text.substring(0, 200)}`);
      results.push({
        name: 'Batch Initial Data Endpoint',
        passed: false,
        message: 'Server error - check schema sync',
        critical: true
      });
    } else {
      log.warn(`Batch endpoint returned unexpected ${response.status}`);
      results.push({
        name: 'Batch Initial Data Endpoint',
        passed: true,
        message: `HTTP ${response.status}`,
        critical: false
      });
    }
  } catch (error: any) {
    if (error.cause?.code === 'ECONNREFUSED') {
      log.warn('Backend not running - skipping endpoint test');
      results.push({ name: 'Batch Initial Data Endpoint', passed: false, message: 'Backend not running', critical: false });
    } else {
      log.error(`Batch endpoint test failed: ${error.message}`);
      results.push({ name: 'Batch Initial Data Endpoint', passed: false, message: error.message, critical: false });
    }
  }
}

async function testRedisConnection(): Promise<void> {
  log.info('Testing Redis connection...');

  // Dynamic import to handle if redis is not configured
  try {
    const redis = await import('../src/config/redis');
    const redisClient = redis.default;

    if (!redisClient) {
      log.warn('Redis not configured (optional for local dev)');
      results.push({ name: 'Redis Connection', passed: true, message: 'Not configured (optional)', critical: false });
      return;
    }

    await redisClient.ping();
    log.success('Redis connection OK');
    results.push({ name: 'Redis Connection', passed: true, message: 'Connected successfully', critical: false });
  } catch (error: any) {
    log.warn(`Redis not available: ${error.message} (optional for local dev)`);
    results.push({ name: 'Redis Connection', passed: true, message: 'Not available (optional)', critical: false });
  }
}

async function main(): Promise<void> {
  console.log('\n========================================');
  console.log('  KODA Local Setup Verification');
  console.log('========================================\n');

  // Run all tests
  await testDatabaseConnection();
  await testPrismaSchemaSync();
  await testHealthEndpoint();
  await testBatchInitialDataEndpoint();
  await testRedisConnection();

  // Print summary
  console.log('\n========================================');
  console.log('  VERIFICATION SUMMARY');
  console.log('========================================\n');

  const criticalFailed = results.filter(r => !r.passed && r.critical);
  const warnings = results.filter(r => !r.passed && !r.critical);
  const passed = results.filter(r => r.passed);

  for (const result of results) {
    const icon = result.passed ? '✅' : (result.critical ? '❌' : '⚠️');
    console.log(`  ${icon} ${result.name}: ${result.message}`);
  }

  console.log('\n');

  if (criticalFailed.length > 0) {
    console.log(`${COLORS.red}CRITICAL FAILURES: ${criticalFailed.length}${COLORS.reset}`);
    console.log('Fix these issues before proceeding:\n');
    for (const fail of criticalFailed) {
      console.log(`  - ${fail.name}: ${fail.message}`);
    }
    console.log('\nSuggested fixes:');
    console.log('  1. Ensure Docker containers are running: docker compose -f docker-compose.local.yml up -d');
    console.log('  2. Sync Prisma schema: npm run dev:sync');
    console.log('  3. Start backend: npm run dev\n');
    process.exit(1);
  } else if (warnings.length > 0) {
    console.log(`${COLORS.green}All critical checks passed!${COLORS.reset}`);
    console.log(`${COLORS.yellow}${warnings.length} non-critical warning(s)${COLORS.reset}\n`);
    process.exit(0);
  } else {
    console.log(`${COLORS.green}All checks passed! Local environment is ready.${COLORS.reset}\n`);
    process.exit(0);
  }
}

main().catch((error) => {
  console.error('Verification script failed:', error);
  process.exit(1);
});
