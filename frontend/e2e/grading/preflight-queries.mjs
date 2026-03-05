#!/usr/bin/env node
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(__dirname, '..', '..');
const BACKEND_DIR = path.resolve(FRONTEND_DIR, '..', 'backend');
const REPORTS_DIR = path.resolve(FRONTEND_DIR, 'e2e', 'reports');
const LATEST_DIR = path.join(REPORTS_DIR, 'latest');
const PLAYWRIGHT_RESULTS_FILE = path.join(REPORTS_DIR, 'results.json');

const args = new Set(process.argv.slice(2));
const include100 = args.has('--run-100');
const API_BASE = String(
  process.env.E2E_API_BASE_URL ||
  process.env.REACT_APP_API_URL ||
  'http://localhost:5000',
).trim().replace(/\/+$/, '');

function quoteCmdArg(value) {
  const raw = String(value ?? '');
  if (!/[\s"]/g.test(raw)) return raw;
  return `"${raw.replace(/"/g, '\\"')}"`;
}

function spawnPortable(cmd, cmdArgs, options) {
  if (process.platform === 'win32' && (cmd === 'npm' || cmd === 'npx')) {
    const shellCmd = cmd === 'npm' ? 'npm.cmd' : 'npx.cmd';
    const command = [shellCmd, ...cmdArgs].map((arg) => quoteCmdArg(arg)).join(' ');
    return spawnSync('cmd.exe', ['/d', '/s', '/c', command], options);
  }
  return spawnSync(cmd, cmdArgs, options);
}

function run(cmd, cmdArgs, cwd, extraEnv = {}) {
  console.log(`\n$ ${cmd} ${cmdArgs.join(' ')}`);
  const result = spawnPortable(cmd, cmdArgs, {
    cwd,
    stdio: 'inherit',
    env: {
      ...process.env,
      E2E_API_BASE_URL: API_BASE,
      REACT_APP_API_URL: API_BASE,
      ...extraEnv,
    },
    shell: false,
  });
  if (result.error) {
    throw new Error(`Command failed to launch: ${cmd} ${cmdArgs.join(' ')} (${result.error.message})`);
  }
  if (result.status !== 0) {
    throw new Error(`Command failed: ${cmd} ${cmdArgs.join(' ')} (exit ${result.status})`);
  }
}

async function probeApi(base) {
  const candidates = [`${base}/api/health`, `${base}/health`];
  const errors = [];
  for (const url of candidates) {
    try {
      const res = await fetch(url, { method: 'GET' });
      if (res.ok) return { ok: true, url, status: res.status };
      errors.push(`${url} -> HTTP ${res.status}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${url} -> ${message}`);
    }
  }
  return { ok: false, errors };
}

function writeSummary(summary) {
  fs.mkdirSync(LATEST_DIR, { recursive: true });
  const outPath = path.join(LATEST_DIR, 'preflight-summary.json');
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
  console.log(`\n[preflight] summary written: ${outPath}`);
}

function loadLatestScorecard() {
  const p = path.join(LATEST_DIR, 'scorecard.json');
  if (!fs.existsSync(p)) {
    throw new Error(`Missing scorecard after grading: ${p}`);
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function assertFileExistsNonEmpty(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing ${label}: ${filePath}`);
  }
  const stats = fs.statSync(filePath);
  if (!Number.isFinite(stats.size) || stats.size < 8) {
    throw new Error(`Invalid/empty ${label}: ${filePath} (size=${stats.size})`);
  }
}

function collectPlaywrightTests(report) {
  const out = [];
  const visit = (suite) => {
    const specs = Array.isArray(suite?.specs) ? suite.specs : [];
    for (const spec of specs) {
      const tests = Array.isArray(spec?.tests) ? spec.tests : [];
      out.push(...tests);
    }
    const children = Array.isArray(suite?.suites) ? suite.suites : [];
    for (const child of children) visit(child);
  };
  const roots = Array.isArray(report?.suites) ? report.suites : [];
  for (const suite of roots) visit(suite);
  return out;
}

function assertPlaywrightRunHealth(label) {
  assertFileExistsNonEmpty(PLAYWRIGHT_RESULTS_FILE, `${label} playwright results`);
  let report = null;
  try {
    report = JSON.parse(fs.readFileSync(PLAYWRIGHT_RESULTS_FILE, 'utf8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid playwright JSON for ${label}: ${message}`);
  }
  const expected = Number(report?.stats?.expected || 0);
  const skipped = Number(report?.stats?.skipped || 0);
  if (expected < 1) {
    throw new Error(
      `${label} produced no expected tests (expected=${expected}, skipped=${skipped}). Refusing to grade.`,
    );
  }
  if (skipped > 0) {
    throw new Error(
      `${label} contains skipped tests (skipped=${skipped}). Refusing to grade.`,
    );
  }
  const tests = collectPlaywrightTests(report);
  const skippedTest = tests.find((testEntry) => String(testEntry?.status || '').toLowerCase() === 'skipped');
  if (skippedTest) {
    throw new Error(`${label} includes a skipped test entry. Refusing to grade.`);
  }
}

function assertGo(scorecard, pack) {
  const verdict = String(scorecard?.summary?.verdict || 'NO_GO');
  const finalScore = Number(scorecard?.summary?.finalScore || 0);
  if (verdict !== 'GO' || finalScore < 95) {
    throw new Error(`Pack ${pack} did not pass readiness gate (verdict=${verdict}, score=${finalScore})`);
  }
}

async function main() {
  const summary = {
    startedAt: new Date().toISOString(),
    include100,
    apiBase: API_BASE,
    steps: [],
  };

  try {
    const apiProbe = await probeApi(API_BASE);
    if (!apiProbe.ok) {
      throw new Error(
        [
          `API unreachable at ${API_BASE}.`,
          'Probe attempts:',
          ...(apiProbe.errors || []).map((line) => `- ${line}`),
          'Start backend or set E2E_API_BASE_URL / REACT_APP_API_URL to a reachable API.',
        ].join('\n'),
      );
    }
    summary.steps.push({ step: 'api_probe', status: 'PASS', url: apiProbe.url, httpStatus: apiProbe.status });

    // 1) Backend P0 gates (independent of frontend grading artifacts)
    run('npm', ['run', 'audit:p0:strict'], BACKEND_DIR);
    summary.steps.push({ step: 'backend_audit_p0_strict', status: 'PASS' });

    // 2) Frontend semantic accessibility regression gate
    run('node', ['e2e/grading/a11y-semantic-click-audit.mjs', '--max-violations', '225'], FRONTEND_DIR);
    summary.steps.push({ step: 'frontend_a11y_semantic_click_audit', status: 'PASS' });

    // 3) Report hygiene
    run('node', ['e2e/grading/report-hygiene.mjs', '--prepare'], FRONTEND_DIR);
    summary.steps.push({ step: 'report_hygiene_prepare', status: 'PASS' });

    // 4) Pack 40
    run('node', ['e2e/regression-runner.mjs', '--base', API_BASE], FRONTEND_DIR);
    assertFileExistsNonEmpty(
      path.join(REPORTS_DIR, 'queries-40-run.json'),
      'pack40 regression artifact',
    );
    summary.steps.push({ step: 'pack40_run', status: 'PASS' });

    run('node', ['e2e/grading/run-harsh-rubric.mjs', '--pack', '40', '--input', 'e2e/reports/queries-40-run.json'], FRONTEND_DIR);
    const score40 = loadLatestScorecard();
    assertGo(score40, 40);
    run('node', ['e2e/grading/validate-report-lineage.mjs'], FRONTEND_DIR);
    summary.steps.push({ step: 'pack40_grade', status: 'PASS', score: score40.summary.finalScore });

    // 5) Backend strict certification (requires per_query lineage generated above)
    run('npm', ['run', 'audit:cert:strict'], BACKEND_DIR);
    summary.steps.push({ step: 'backend_audit_cert_strict', status: 'PASS' });

    // 6) Pack 50
    run('npx', ['playwright', 'test', 'e2e/query-test-50-gate.spec.ts', '--project=chromium'], FRONTEND_DIR);
    assertPlaywrightRunHealth('pack50');
    assertFileExistsNonEmpty(
      path.join(REPORTS_DIR, 'query-test-50-gate-results.json'),
      'pack50 artifact',
    );
    summary.steps.push({ step: 'pack50_run', status: 'PASS' });

    run('node', ['e2e/grading/run-harsh-rubric.mjs', '--pack', '50', '--input', 'e2e/reports/query-test-50-gate-results.json'], FRONTEND_DIR);
    const score50 = loadLatestScorecard();
    assertGo(score50, 50);
    run('node', ['e2e/grading/validate-report-lineage.mjs'], FRONTEND_DIR);
    summary.steps.push({ step: 'pack50_grade', status: 'PASS', score: score50.summary.finalScore });

    // 7) Optional pack 100
    if (include100) {
      run('npx', ['playwright', 'test', 'e2e/query-test-100.spec.ts', '--project=chromium'], FRONTEND_DIR);
      assertPlaywrightRunHealth('pack100');
      assertFileExistsNonEmpty(
        path.join(REPORTS_DIR, 'query-test-100-results.json'),
        'pack100 artifact',
      );
      summary.steps.push({ step: 'pack100_run', status: 'PASS' });

      run('node', ['e2e/grading/run-harsh-rubric.mjs', '--pack', '100', '--input', 'e2e/reports/query-test-100-results.json'], FRONTEND_DIR);
      const score100 = loadLatestScorecard();
      if (String(score100?.summary?.verdict || 'NO_GO') !== 'GO' || Number(score100?.summary?.finalScore || 0) < 95) {
        throw new Error(`Pack 100 did not pass full readiness gate (verdict=${score100.summary.verdict}, score=${score100.summary.finalScore})`);
      }
      run('node', ['e2e/grading/validate-report-lineage.mjs'], FRONTEND_DIR);
      summary.steps.push({ step: 'pack100_grade', status: 'PASS', score: score100.summary.finalScore });
    }

    // 8) Report hygiene check (must be canonical)
    run('node', ['e2e/grading/report-hygiene.mjs', '--check'], FRONTEND_DIR);
    summary.steps.push({ step: 'report_hygiene_check', status: 'PASS' });

    summary.finishedAt = new Date().toISOString();
    summary.verdict = 'GO';
    writeSummary(summary);
    console.log('\n[preflight] GO: frontend query testing prerequisites passed');
  } catch (error) {
    summary.finishedAt = new Date().toISOString();
    summary.verdict = 'NO_GO';
    summary.error = error instanceof Error ? error.message : String(error);
    writeSummary(summary);
    console.error(`\n[preflight] NO_GO: ${summary.error}`);
    process.exit(1);
  }
}

main();
