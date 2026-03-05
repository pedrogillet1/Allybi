#!/usr/bin/env node
/* eslint-disable no-console */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const policyPath = path.resolve(__dirname, "model-governance-policy.json");
const perimeterPath = path.resolve(__dirname, "model-governance-perimeter.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

const policy = readJson(policyPath);
const perimeter = readJson(perimeterPath);
const roots = (Array.isArray(perimeter.roots) ? perimeter.roots : [])
  .map((rel) => path.resolve(repoRoot, String(rel || "")));
const includeFiles = (Array.isArray(perimeter.includeFiles) ? perimeter.includeFiles : [])
  .map((rel) => path.resolve(repoRoot, String(rel || "")));
const ignoredPathSuffixes = new Set(
  (Array.isArray(perimeter.ignoredPathSuffixes) ? perimeter.ignoredPathSuffixes : [])
    .map((value) => String(value || "").replace(/\\/g, "/")),
);
const exts = new Set(
  (Array.isArray(perimeter.allowedExtensions) ? perimeter.allowedExtensions : [".ts", ".js", ".mjs", ".json"])
    .map((value) => String(value || "").toLowerCase()),
);
const allowedModelPrefixes = (Array.isArray(policy.allowedModelFamilies) ? policy.allowedModelFamilies : [])
  .map((entry) => String(entry?.family || "").trim().toLowerCase())
  .filter(Boolean);
const disallowedTokens = (Array.isArray(policy.disallowedTokenPatterns) ? policy.disallowedTokenPatterns : [])
  .map((pattern) => new RegExp(String(pattern), "gi"));
const legacyExceptions = Array.isArray(perimeter.legacyExceptions)
  ? perimeter.legacyExceptions.map((entry) => ({
      path: String(entry?.path || "").replace(/\\/g, "/"),
      owner: String(entry?.owner || "").trim() || "unknown",
      ticket: String(entry?.ticket || "").trim() || "missing-ticket",
      expiresOn: String(entry?.expiresOn || "").trim(),
      tokens: Array.isArray(entry?.tokens)
        ? entry.tokens.map((token) => String(token || "").toLowerCase())
        : [],
    }))
  : [];

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
      if (["node_modules", "dist", "coverage", "reports"].includes(entry.name)) {
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

function isException(relPath, token) {
  const normalizedRel = String(relPath || "").replace(/\\/g, "/");
  const normalizedToken = String(token || "").toLowerCase();
  for (const exception of legacyExceptions) {
    if (exception.path !== normalizedRel) continue;
    if (exception.tokens.some((allowedToken) => normalizedToken.includes(allowedToken))) {
      return exception;
    }
  }
  return null;
}

function isExpired(dateText) {
  const ts = Date.parse(String(dateText || ""));
  if (!Number.isFinite(ts)) return true;
  return Date.now() > ts;
}

const files = Array.from(
  new Set([
    ...roots.flatMap((root) => (isFile(root) ? [root] : walk(root))),
    ...includeFiles.filter((filePath) => fs.existsSync(filePath)),
  ]),
).filter((filePath) => shouldScanFile(filePath));

const findings = [];
const exceptionHits = [];
const exceptionPolicyFailures = [];
for (const exception of legacyExceptions) {
  if (!exception.expiresOn || isExpired(exception.expiresOn)) {
    exceptionPolicyFailures.push(
      `${exception.path}:exception_expired_or_invalid:${exception.ticket}`,
    );
  }
}

for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  const rel = path.relative(repoRoot, file).replace(/\\/g, "/");

  for (const re of disallowedTokens) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(text))) {
      const token = String(match[0] || "").trim();
      const exception = isException(rel, token);
      if (exception) {
        exceptionHits.push({
          file: rel,
          line: lineAt(text, match.index),
          token,
          ticket: exception.ticket,
        });
        continue;
      }
      findings.push({
        file: rel,
        line: lineAt(text, match.index),
        token,
        reason: "disallowed_token",
      });
    }
  }

  modelTokenRe.lastIndex = 0;
  let modelMatch;
  while ((modelMatch = modelTokenRe.exec(text))) {
    const token = String(modelMatch[0] || "").trim();
    if (isAllowedModelToken(token)) continue;
    const exception = isException(rel, token);
    if (exception) {
      exceptionHits.push({
        file: rel,
        line: lineAt(text, modelMatch.index),
        token,
        ticket: exception.ticket,
      });
      continue;
    }
    findings.push({
      file: rel,
      line: lineAt(text, modelMatch.index),
      token,
      reason: "unsupported_model_id",
    });
  }
}

if (exceptionPolicyFailures.length > 0) {
  console.error("[audit:models:strict] invalid legacy exception policy:");
  for (const failure of exceptionPolicyFailures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
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
  `[audit:models:strict] ok - scanned ${files.length} files; allowed families: ${allowedModelPrefixes.join(", ")}`,
);
if (exceptionHits.length > 0) {
  console.log(`[audit:models:strict] legacy exceptions in use: ${exceptionHits.length}`);
}
