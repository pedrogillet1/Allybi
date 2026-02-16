#!/usr/bin/env node

import process from 'node:process';

const DASHBOARD_BASE = process.env.DASHBOARD_BASE_URL || 'http://localhost:3001';
const ADMIN_KEY = process.env.ADMIN_KEY || '';
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';

const endpoints = [
  { screen: '/admin', key: 'overview', path: '/api/admin/overview?range=7d&env=prod' },
  { screen: '/admin/users', key: 'users', path: '/api/admin/users?range=7d&env=prod' },
  { screen: '/admin/files', key: 'files', path: '/api/admin/files?range=7d&env=prod' },
  { screen: '/admin/queries', key: 'queries', path: '/api/admin/queries?range=7d' },
  { screen: '/admin/quality', key: 'answer_quality', path: '/api/admin/answer-quality?range=7d' },
  { screen: '/admin/llm', key: 'llm_cost', path: '/api/admin/llm-cost?range=7d' },
  { screen: '/admin/reliability', key: 'reliability', path: '/api/admin/reliability?range=7d' },
  { screen: '/admin/security', key: 'security', path: '/api/admin/security?range=7d' },
];

function classify(status, contentType, body) {
  if (status >= 200 && status < 300 && contentType.includes('application/json')) return 'PASS';
  if (status >= 500 && !contentType.includes('application/json')) return 'PROXY_FAIL';
  if (status >= 500) return 'BACKEND_FAIL';
  if (status === 401 || status === 403) return 'AUTH_FAIL';
  if (status >= 400) return 'CLIENT_FAIL';
  if (!body) return 'EMPTY_BODY';
  return 'UNKNOWN';
}

async function checkOne(target) {
  const url = `${DASHBOARD_BASE}${target.path}`;
  const headers = {
    'Content-Type': 'application/json',
  };
  if (ADMIN_KEY) headers['X-Admin-Key'] = ADMIN_KEY;
  if (AUTH_TOKEN) headers.Authorization = `Bearer ${AUTH_TOKEN}`;

  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers,
      credentials: 'include',
    });

    const latencyMs = Date.now() - start;
    const contentType = res.headers.get('content-type') || '';
    const text = await res.text();
    const bodySnippet = text.replace(/\s+/g, ' ').slice(0, 140);

    return {
      ...target,
      status: res.status,
      contentType,
      latencyMs,
      classification: classify(res.status, contentType, text),
      bodySnippet,
    };
  } catch (error) {
    return {
      ...target,
      status: -1,
      contentType: '',
      latencyMs: Date.now() - start,
      classification: 'NETWORK_FAIL',
      bodySnippet: error instanceof Error ? error.message : String(error),
    };
  }
}

function renderTable(results) {
  const pad = (v, n) => String(v).padEnd(n, ' ');
  console.log(
    `${pad('SCREEN', 20)} ${pad('ENDPOINT', 16)} ${pad('STATUS', 8)} ${pad('CLASS', 14)} ${pad('LAT(ms)', 8)} DETAILS`
  );
  console.log('-'.repeat(110));
  for (const r of results) {
    console.log(
      `${pad(r.screen, 20)} ${pad(r.key, 16)} ${pad(r.status, 8)} ${pad(r.classification, 14)} ${pad(r.latencyMs, 8)} ${r.bodySnippet}`
    );
  }
}

async function main() {
  console.log(`[connectivity] checking ${endpoints.length} admin endpoints via ${DASHBOARD_BASE}`);
  if (!ADMIN_KEY && !AUTH_TOKEN) {
    console.log('[connectivity] warning: ADMIN_KEY/AUTH_TOKEN not set. If admin auth is enabled, AUTH_FAIL is expected.');
  }

  const results = [];
  for (const endpoint of endpoints) {
    results.push(await checkOne(endpoint));
  }

  renderTable(results);

  const hardFailures = results.filter((r) =>
    ['PROXY_FAIL', 'BACKEND_FAIL', 'NETWORK_FAIL', 'EMPTY_BODY'].includes(r.classification)
  );

  if (hardFailures.length > 0) {
    console.error(`\n[connectivity] failed: ${hardFailures.length} hard failures detected.`);
    process.exit(1);
  }

  console.log('\n[connectivity] success: no hard failures.');
}

main().catch((err) => {
  console.error('[connectivity] fatal error:', err);
  process.exit(1);
});
