#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();
const root = path.basename(cwd) === 'dashboard' ? cwd : path.resolve(cwd, 'dashboard');
const appPath = path.join(root, 'client/src/App.tsx');
const useAdminApiPath = path.join(root, 'client/src/hooks/useAdminApi.ts');
const useTelemetryPath = path.join(root, 'client/src/hooks/useTelemetry.ts');

const expected = [
  {
    route: '/admin',
    pageRef: 'OverviewPage',
    pageFile: 'client/src/pages/overview/OverviewPage.tsx',
    hook: 'useOverview',
    hookFile: 'client/src/hooks/useAdminApi.ts',
  },
  {
    route: '/admin/users',
    pageRef: 'UsersPage',
    pageFile: 'client/src/pages/users/UsersPage.tsx',
    hook: 'useUsers',
    hookFile: 'client/src/hooks/useAdminApi.ts',
  },
  {
    route: '/admin/files',
    pageRef: 'FilesPage',
    pageFile: 'client/src/pages/files/FilesPage.tsx',
    hook: 'useFiles',
    hookFile: 'client/src/hooks/useAdminApi.ts',
  },
  {
    route: '/admin/queries',
    pageRef: 'QueriesPage',
    pageFile: 'client/src/pages/queries/QueriesPage.tsx',
    hook: 'useQueries',
    hookFile: 'client/src/hooks/useTelemetry.ts',
  },
  {
    route: '/admin/quality',
    pageRef: 'QualityPage',
    pageFile: 'client/src/pages/quality/QualityPage.tsx',
    hook: 'useQuality',
    hookFile: 'client/src/hooks/useTelemetry.ts',
  },
  {
    route: '/admin/llm',
    pageRef: 'LLMPage',
    pageFile: 'client/src/pages/llm/LLMPage.tsx',
    hook: 'useLLM',
    hookFile: 'client/src/hooks/useTelemetry.ts',
  },
  {
    route: '/admin/reliability',
    pageRef: 'ReliabilityPage',
    pageFile: 'client/src/pages/reliability/ReliabilityPage.tsx',
    hook: 'useReliability',
    hookFile: 'client/src/hooks/useTelemetry.ts',
  },
  {
    route: '/admin/security',
    pageRef: 'SecurityPage',
    pageFile: 'client/src/pages/security/SecurityPage.tsx',
    hook: 'useSecurity',
    hookFile: 'client/src/hooks/useTelemetry.ts',
  },
];

const appSource = fs.readFileSync(appPath, 'utf8');
const useAdminApiSource = fs.readFileSync(useAdminApiPath, 'utf8');
const useTelemetrySource = fs.readFileSync(useTelemetryPath, 'utf8');

const errors = [];
for (const item of expected) {
  const routeMatch = appSource.includes(`<Route path="${item.route}">`);
  if (!routeMatch) {
    errors.push(`missing route: ${item.route}`);
  }

  const pageRefMatch = appSource.includes(item.pageRef);
  if (!pageRefMatch) {
    errors.push(`missing page reference in router: ${item.pageRef}`);
  }

  const pagePath = path.join(root, item.pageFile);
  if (!fs.existsSync(pagePath)) {
    errors.push(`missing page file: ${item.pageFile}`);
  }

  const hookSource = item.hookFile.endsWith('useAdminApi.ts') ? useAdminApiSource : useTelemetrySource;
  if (!hookSource.includes(`function ${item.hook}`) && !hookSource.includes(`const ${item.hook}`)) {
    errors.push(`missing hook export: ${item.hook} in ${item.hookFile}`);
  }
}

if (errors.length > 0) {
  console.error('[wiring] failed with issues:');
  for (const err of errors) {
    console.error(` - ${err}`);
  }
  process.exit(1);
}

console.log(`[wiring] success: ${expected.length} mounted admin screens are wired.`);
