#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();

const bannedExact = [
  'backend/check-docs.cjs',
  'backend/check-docs2.cjs',
  'backend/check-docs3.cjs',
  'backend/check-docs4.cjs',
  'backend/check-excel.ts',
  'backend/queue-stuck.ts',
  'backend/requeue-stuck.ts',
  'backend/requeue-zero-chunks.ts',
  'backend/requeue.js',
  'backend/run-cleanup.js',
  'backend/test-excel-edit.ts',
  'backend/test-frontend-actions.ts',
  'backend/jest.config.ts',
  'dashboard/client/src/pages/files/FailuresPage.tsx',
  'dashboard/client/src/pages/files/FileDetailPage.tsx',
  'dashboard/client/src/pages/files/PipelinePage.tsx',
  'dashboard/client/src/pages/files/StoragePage.tsx',
  'dashboard/client/src/pages/llm/ErrorsPage.tsx',
  'dashboard/client/src/pages/llm/LatencyPage.tsx',
  'dashboard/client/src/pages/llm/ProvidersPage.tsx',
  'dashboard/client/src/pages/overview/TrendsPage.tsx',
  'dashboard/client/src/pages/quality/NoEvidencePage.tsx',
  'dashboard/client/src/pages/quality/TestSuitePage.tsx',
  'dashboard/client/src/pages/quality/WeakEvidencePage.tsx',
  'dashboard/client/src/pages/queries/GapsPage.tsx',
  'dashboard/client/src/pages/queries/PatternsPage.tsx',
  'dashboard/client/src/pages/queries/QueryTracePage.tsx',
  'dashboard/client/src/pages/queries/RetrievalPage.tsx',
  'dashboard/client/src/pages/queries/RoutingPage.tsx',
  'dashboard/client/src/pages/reliability/DatabasePage.tsx',
  'dashboard/client/src/pages/reliability/IncidentsPage.tsx',
  'dashboard/client/src/pages/reliability/JobsPage.tsx',
  'dashboard/client/src/pages/security/AccessLogsPage.tsx',
  'dashboard/client/src/pages/security/AuditLogPage.tsx',
  'dashboard/client/src/pages/security/ThreatsPage.tsx',
  'dashboard/client/src/pages/users/CohortsPage.tsx',
  'dashboard/client/src/pages/users/UserDetailPage.tsx',
  'dashboard/client/src/pages/marketing/AcquisitionPage.tsx',
  'dashboard/client/src/pages/marketing/DomainsPage.tsx',
  'dashboard/client/src/pages/marketing/IntentsPage.tsx',
  'dashboard/client/src/pages/marketing/SocialPresencePage.tsx',
  'dashboard/client/src/pages/marketing/index.ts',
  'dashboard/client/src/components/waterfall/WaterfallTimeline.tsx',
  'dashboard/client/src/components/waterfall/index.ts',
];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === 'build') continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(abs, out);
    else out.push(abs);
  }
  return out;
}

const foundExact = bannedExact.filter((rel) => fs.existsSync(path.join(repoRoot, rel)));
const allFiles = walk(repoRoot);
const backupLike = allFiles
  .map((abs) => path.relative(repoRoot, abs))
  .filter((rel) => /\.backup-\d{8}-\d{6}$/.test(rel));

const violations = [...foundExact, ...backupLike];

if (violations.length > 0) {
  console.error('[dead-artifacts-check] FAIL: found banned legacy artifacts:');
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}

console.log('[dead-artifacts-check] PASS: no banned legacy artifacts found.');
