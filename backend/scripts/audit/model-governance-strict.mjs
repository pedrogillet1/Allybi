#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..", "..");

const roots = [
  path.join(repoRoot, "backend", "src", "services", "llm"),
  path.join(repoRoot, "backend", "src", "data_banks", "llm"),
  path.join(repoRoot, "backend", "src", "services", "ingestion", "titleGeneration.service.ts"),
  path.join(repoRoot, "dashboard", "client", "src", "pages"),
];

const allowedModels = new Set([
  "gemini-2.5-flash",
  "gemini-2.5-flash-001",
  "gpt-5.2",
  "gpt-5.2-2026-01-15",
]);

const disallowedTokens = [
  /\bgpt-5-mini\b/gi,
  /\bgpt-4(?:\.\d+)?\b/gi,
  /\bgemini\s*3\.0\s*flash\b/gi,
  /\banthropic\b/gi,
  /\bclaude(?:[-\w.]*)\b/gi,
  /\bllama(?:[-\w.]*)\b/gi,
  /\bollama\b/gi,
  /\blocal-default\b/gi,
];

const exts = new Set([".ts", ".tsx", ".json", ".md"]);

function isFile(target) {
  try {
    return fs.statSync(target).isFile();
  } catch {
    return false;
  }
}

function walk(target, out = []) {
  if (!fs.existsSync(target)) return out;
  const stat = fs.statSync(target);
  if (stat.isFile()) {
    out.push(target);
    return out;
  }
  const entries = fs.readdirSync(target, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(target, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      walk(full, out);
      continue;
    }
    out.push(full);
  }
  return out;
}

function lineAt(text, idx) {
  let line = 1;
  for (let i = 0; i < idx; i += 1) {
    if (text.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

const files = roots
  .flatMap((r) => (isFile(r) ? [r] : walk(r)))
  .filter((f) => exts.has(path.extname(f).toLowerCase()));

const findings = [];
for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  for (const re of disallowedTokens) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(text))) {
      const token = String(match[0] || "").trim().toLowerCase();
      if (allowedModels.has(token)) continue;
      findings.push({
        file: path.relative(repoRoot, file).replace(/\\/g, "/"),
        line: lineAt(text, match.index),
        token: match[0],
      });
    }
  }
}

if (findings.length > 0) {
  console.error("[audit:models:strict] disallowed model/provider tokens found:");
  for (const f of findings) {
    console.error(`- ${f.file}:${f.line} -> ${f.token}`);
  }
  process.exit(1);
}

console.log(
  `[audit:models:strict] ok — scanned ${files.length} files; allowed families: ${Array.from(allowedModels).join(", ")}`,
);
