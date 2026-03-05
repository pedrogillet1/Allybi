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
  path.join(repoRoot, "backend", "src", "tests", "certification"),
  path.join(repoRoot, "backend", "src", "config", "env.ts"),
  path.join(repoRoot, "backend", ".env.example"),
  path.join(repoRoot, "backend", "scripts", "audit"),
  path.join(repoRoot, "backend", "scripts", "certification"),
  path.join(repoRoot, "backend", "scripts", "gcp", "deploy-all.sh"),
  path.join(repoRoot, "backend", "package.json"),
];

const ignoredPathSuffixes = new Set([
  "backend/scripts/audit/model-governance-strict.mjs",
]);

const exts = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".cjs",
  ".mjs",
  ".json",
  ".sh",
]);

const allowedModelPrefixes = [
  "gemini-2.5-flash",
  "gpt-5.2",
];

const disallowedTokens = [
  /\bgpt-5-mini(?:[-.\w]*)?\b/gi,
  /\bgpt-4[a-z0-9.-]*\b/gi,
  /\bgemini-3[a-z0-9.-]*\b/gi,
  /\banthropic\b/gi,
  /\bclaude(?:[-_.\w]*)\b/gi,
  /\bmistral[-_.](?:small|medium|large|tiny|7b|8x7b|nemo|codestral|mixtral)[\w.-]*\b/gi,
  /\bollama\b/gi,
  /\bmeta[-_. ]?llama(?:[-_.\w]*)\b/gi,
  /\bllama[-_.]?\d[\w.-]*\b/gi,
  /\blocal-default\b/gi,
];

const modelTokenRe =
  /\b(?:gpt-\d+(?:\.\d+)?(?:-[a-z0-9.]+)+|gemini-\d+(?:\.\d+)?(?:-[a-z0-9.]+)+)\b/gi;

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
      if (
        entry.name === "node_modules" ||
        entry.name === "dist" ||
        entry.name === "coverage" ||
        entry.name === "reports"
      ) {
        continue;
      }
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

function isAllowedModelToken(token) {
  const normalized = String(token || "").trim().toLowerCase();
  return allowedModelPrefixes.some((prefix) => normalized.startsWith(prefix));
}

function shouldScanFile(filePath) {
  const rel = path.relative(repoRoot, filePath).replace(/\\/g, "/");
  if (ignoredPathSuffixes.has(rel)) return false;
  return exts.has(path.extname(filePath).toLowerCase());
}

const files = roots
  .flatMap((root) => (isFile(root) ? [root] : walk(root)))
  .filter((filePath) => shouldScanFile(filePath));

const findings = [];
for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  const rel = path.relative(repoRoot, file).replace(/\\/g, "/");

  for (const re of disallowedTokens) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(text))) {
      findings.push({
        file: rel,
        line: lineAt(text, match.index),
        token: String(match[0] || "").trim(),
        reason: "disallowed_token",
      });
    }
  }

  modelTokenRe.lastIndex = 0;
  let modelMatch;
  while ((modelMatch = modelTokenRe.exec(text))) {
    const token = String(modelMatch[0] || "").trim();
    if (isAllowedModelToken(token)) continue;
    findings.push({
      file: rel,
      line: lineAt(text, modelMatch.index),
      token,
      reason: "unsupported_model_id",
    });
  }
}

if (findings.length > 0) {
  console.error("[audit:models:strict] non-compliant model/provider references found:");
  for (const finding of findings) {
    console.error(
      `- ${finding.file}:${finding.line} -> ${finding.token} (${finding.reason})`,
    );
  }
  process.exit(1);
}

console.log(
  `[audit:models:strict] ok - scanned ${files.length} files; only allowed model families: ${allowedModelPrefixes.join(", ")}`,
);
