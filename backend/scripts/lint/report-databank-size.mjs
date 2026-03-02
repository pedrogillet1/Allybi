#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

let encodeText = null;
try {
  const mod = await import('gpt-tokenizer');
  if (typeof mod.encode === 'function') {
    encodeText = mod.encode;
  }
} catch {
  encodeText = null;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const dataBanksRoot = path.join(repoRoot, 'src', 'data_banks');
const notesRoot = path.join(repoRoot, 'notes');

function listFilesRecursive(rootDir) {
  const out = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      out.push(fullPath);
    }
  }
  return out.sort((a, b) => a.localeCompare(b));
}

function countWords(text) {
  if (!text) return 0;
  const tokens = text.match(/[\p{L}\p{N}_'-]+/gu);
  return Array.isArray(tokens) ? tokens.length : 0;
}

function countTokens(text) {
  if (!text) return 0;
  if (typeof encodeText === 'function') {
    try {
      return encodeText(text).length;
    } catch {
      // fall through to approximation
    }
  }
  return Math.max(1, Math.ceil(countWords(text) * 1.33));
}

function toMb(bytes) {
  return Number((bytes / (1024 * 1024)).toFixed(2));
}

if (!fs.existsSync(dataBanksRoot)) {
  console.error(`[databank-size] data_banks not found: ${dataBanksRoot}`);
  process.exit(1);
}

const files = listFilesRecursive(dataBanksRoot);
let totalBytes = 0;
let totalWords = 0;
let totalTokens = 0;

const byTopLevel = new Map();

for (const fullPath of files) {
  const rel = path.relative(dataBanksRoot, fullPath);
  const topLevel = rel.split(path.sep)[0] || '<root>';
  const stat = fs.statSync(fullPath);
  const raw = fs.readFileSync(fullPath, 'utf8');
  const words = countWords(raw);
  const tokens = countTokens(raw);

  totalBytes += stat.size;
  totalWords += words;
  totalTokens += tokens;

  if (!byTopLevel.has(topLevel)) {
    byTopLevel.set(topLevel, {
      files: 0,
      bytes: 0,
      words: 0,
      tokens: 0,
    });
  }
  const bucket = byTopLevel.get(topLevel);
  bucket.files += 1;
  bucket.bytes += stat.size;
  bucket.words += words;
  bucket.tokens += tokens;
}

const byDirectory = Array.from(byTopLevel.entries())
  .map(([name, stats]) => ({ name, ...stats, mb: toMb(stats.bytes) }))
  .sort((a, b) => b.tokens - a.tokens);

const report = {
  generatedAt: new Date().toISOString(),
  tokenizer: encodeText ? 'gpt-tokenizer.encode' : 'approx(words*1.33)',
  dataBanksRoot,
  totals: {
    files: files.length,
    bytes: totalBytes,
    mb: toMb(totalBytes),
    words: totalWords,
    tokens: totalTokens,
  },
  byDirectory,
};

fs.mkdirSync(notesRoot, { recursive: true });
const outJson = path.join(notesRoot, 'DATABANK_SIZE_REPORT.json');
const outMd = path.join(notesRoot, 'DATABANK_SIZE_REPORT.md');
fs.writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

let md = '# Data Bank Size Report\n\n';
md += `- Generated: ${report.generatedAt}\n`;
md += `- Tokenizer: ${report.tokenizer}\n`;
md += `- Root: ${report.dataBanksRoot}\n\n`;
md += '## Totals\n\n';
md += `- Files: **${report.totals.files}**\n`;
md += `- Size: **${report.totals.mb} MB** (${report.totals.bytes} bytes)\n`;
md += `- Words: **${report.totals.words}**\n`;
md += `- Tokens: **${report.totals.tokens}**\n\n`;
md += '## By Directory\n\n';
md += '| Directory | Files | MB | Words | Tokens |\n';
md += '|---|---:|---:|---:|---:|\n';
for (const row of byDirectory) {
  md += `| ${row.name} | ${row.files} | ${row.mb} | ${row.words} | ${row.tokens} |\n`;
}

fs.writeFileSync(outMd, md, 'utf8');

console.log(`[databank-size] files=${report.totals.files} words=${report.totals.words} tokens=${report.totals.tokens} sizeMB=${report.totals.mb}`);
console.log(`[databank-size] wrote ${outJson}`);
console.log(`[databank-size] wrote ${outMd}`);
