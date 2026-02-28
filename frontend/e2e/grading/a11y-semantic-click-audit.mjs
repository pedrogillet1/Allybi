#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(__dirname, '..', '..');

function parseArgs(argv) {
  const out = { maxViolations: 30, json: false, verbose: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--max-violations') out.maxViolations = Number(argv[++i] || 30);
    else if (arg === '--json') out.json = true;
    else if (arg === '--verbose') out.verbose = true;
  }
  if (!Number.isFinite(out.maxViolations) || out.maxViolations < 0) out.maxViolations = 30;
  return out;
}

function collectFiles(root) {
  const out = [];
  if (!fs.existsSync(root)) return out;
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!/\.(js|jsx|ts|tsx)$/.test(entry.name)) continue;
      out.push(full);
    }
  }
  out.sort((a, b) => a.localeCompare(b));
  return out;
}

function lineFromIndex(text, index) {
  if (index <= 0) return 1;
  let line = 1;
  for (let i = 0; i < index && i < text.length; i += 1) {
    if (text[i] === '\n') line += 1;
  }
  return line;
}

function auditFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const findings = [];
  const pattern = /<(div|span)\b[^>]*\bonClick\s*=\s*\{[^}]*\}[^>]*>/gim;
  let match = pattern.exec(text);
  while (match) {
    const tag = match[0];
    const hasRole = /\brole\s*=\s*\{?['"][^'"]+['"]\}?/i.test(tag);
    const hasTabIndex = /\btabIndex\s*=\s*\{?[-]?\d+\}?/i.test(tag);
    const hasKeyboardHandler = /\bonKey(Down|Up|Press)\s*=\s*\{/i.test(tag);
    if (!(hasRole && hasTabIndex && hasKeyboardHandler)) {
      findings.push({
        filePath,
        line: lineFromIndex(text, match.index),
        tag: tag.replace(/\s+/g, ' ').trim().slice(0, 220),
      });
    }
    match = pattern.exec(text);
  }
  return findings;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const roots = [
    path.join(FRONTEND_DIR, 'src', 'components'),
    path.join(FRONTEND_DIR, 'src', 'pages'),
  ];

  const files = roots.flatMap((root) => collectFiles(root));
  const findings = [];
  for (const filePath of files) {
    findings.push(...auditFile(filePath));
  }

  const report = {
    maxViolations: opts.maxViolations,
    totalViolations: findings.length,
    scannedFiles: files.length,
    findings,
  };

  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(
      `[a11y-semantic-click-audit] scanned=${report.scannedFiles} violations=${report.totalViolations} max=${report.maxViolations}`,
    );
    const shouldPrintFindings = opts.verbose || report.totalViolations > report.maxViolations;
    if (shouldPrintFindings) {
      for (const finding of findings.slice(0, 40)) {
        const rel = path.relative(FRONTEND_DIR, finding.filePath);
        console.log(`- ${rel}:${finding.line} ${finding.tag}`);
      }
      if (findings.length > 40) {
        console.log(`... ${findings.length - 40} additional violations omitted`);
      }
    }
  }

  if (report.totalViolations > report.maxViolations) {
    console.error(
      `[a11y-semantic-click-audit] FAIL: violations ${report.totalViolations} exceed max ${report.maxViolations}`,
    );
    process.exit(1);
  }
  console.log('[a11y-semantic-click-audit] PASS');
}

main();
