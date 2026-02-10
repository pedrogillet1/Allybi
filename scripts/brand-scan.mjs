import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const SCAN_ROOTS = [
  "frontend/src/components/chat",
  "frontend/src/components/documents",
  "frontend/src/components/app-shell",
  "backend/src/services/llm",
  "backend/src/services/config",
  "backend/src/services/creative",
  "backend/src/services/ingestion",
  "backend/src/services/prismaChat.service.ts",
];

const EXT_ALLOW = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".css",
  ".json",
  ".md",
]);

// These are the *brand regressions* we care about. Avoid overly broad "Koda" checks
// to prevent breaking internal identifiers (koda://source, koda- CSS, KODA_* env vars).
const RULES = [
  { id: "ask_koda", re: /\bAsk Koda\b/g },
  { id: "you_are_koda", re: /\bYou are Koda\b/g },
  { id: "kodas_possessive", re: /\bKoda's\b/g },
  { id: "alt_koda", re: /alt\s*=\s*["']Koda["']/g },
  { id: "placeholder_ask_koda", re: /placeholder\s*=\s*["']Ask Koda/g },
];

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function walkFiles(rootAbs, out) {
  const st = fs.statSync(rootAbs);
  if (st.isFile()) {
    out.push(rootAbs);
    return;
  }
  if (!st.isDirectory()) return;
  const entries = fs.readdirSync(rootAbs, { withFileTypes: true });
  for (const e of entries) {
    // skip heavy/unrelated
    if (e.name === "node_modules" || e.name === "dist" || e.name === "build" || e.name === ".next") continue;
    const full = path.join(rootAbs, e.name);
    if (e.isDirectory()) walkFiles(full, out);
    else if (e.isFile()) out.push(full);
  }
}

function rel(p) {
  return path.relative(ROOT, p);
}

function scanFile(absPath, issues) {
  const ext = path.extname(absPath);
  if (!EXT_ALLOW.has(ext)) return;

  const content = fs.readFileSync(absPath, "utf8");
  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Allow internal scheme/identifiers on any line.
    if (line.includes("koda://") || line.includes("KODA_") || line.includes("koda-") || line.includes("koda_")) {
      // Still allow strict phrases like "You are Koda" to be caught (those won't include the allowlist).
    }

    for (const rule of RULES) {
      if (rule.re.test(line)) {
        issues.push({
          file: rel(absPath),
          line: i + 1,
          rule: rule.id,
          text: line.trim().slice(0, 240),
        });
      }
      rule.re.lastIndex = 0; // reset /g state
    }
  }
}

function main() {
  const roots = [];
  for (const r of SCAN_ROOTS) {
    const abs = path.join(ROOT, r);
    if (isDir(abs) || isFile(abs)) roots.push(abs);
  }

  const files = [];
  for (const r of roots) walkFiles(r, files);

  const issues = [];
  for (const f of files) scanFile(f, issues);

  if (issues.length) {
    // eslint-disable-next-line no-console
    console.error(`Brand scan failed: found ${issues.length} forbidden Koda references.`);
    for (const it of issues.slice(0, 200)) {
      // eslint-disable-next-line no-console
      console.error(`${it.file}:${it.line} [${it.rule}] ${it.text}`);
    }
    process.exit(2);
  }

  // eslint-disable-next-line no-console
  console.log("Brand scan OK (no forbidden Koda references found).");
}

main();

