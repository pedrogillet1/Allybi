#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const backendDir = path.join(repoRoot, 'backend');
const allowlistPath = path.join(
  repoRoot,
  'scripts',
  'unreferenced-entrypoints-allowlist.txt',
);

const allowlist = new Set([
  'backend/jest.config.cjs',
  'backend/package.json',
  'backend/tsconfig.json',
  'backend/tsconfig.build.json',
]);

if (fs.existsSync(allowlistPath)) {
  const extraAllowlist = fs
    .readFileSync(allowlistPath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
  for (const relPath of extraAllowlist) allowlist.add(relPath);
}

const candidates = fs
  .readdirSync(backendDir, { withFileTypes: true })
  .filter((d) => d.isFile() && /\.(ts|js|cjs|mjs|sh)$/.test(d.name))
  .map((d) => `backend/${d.name}`)
  .filter((p) => !allowlist.has(p));
const allowlistedInBackendRoot = fs
  .readdirSync(backendDir, { withFileTypes: true })
  .filter((d) => d.isFile() && /\.(ts|js|cjs|mjs|sh)$/.test(d.name))
  .map((d) => `backend/${d.name}`)
  .filter((p) => allowlist.has(p));

const likelyOrphans = [];
for (const rel of candidates) {
  const name = path.basename(rel);
  const rg = spawnSync('rg', ['-n', name, '--glob', '!**/node_modules/**', '--glob', '!**/package-lock.json', '.'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  const out = `${rg.stdout || ''}`.trim().split('\n').filter(Boolean);
  const refsOutsideSelf = out.filter((line) => !line.startsWith(`${rel}:`));
  if (refsOutsideSelf.length === 0) likelyOrphans.push(rel);
}

console.log('[unreferenced-entrypoints-report] candidates:', candidates.length);
console.log(
  '[unreferenced-entrypoints-report] allowlisted:',
  allowlistedInBackendRoot.length,
);
console.log('[unreferenced-entrypoints-report] likelyOrphans:', likelyOrphans.length);
for (const rel of likelyOrphans) console.log(`  - ${rel}`);
