const { existsSync, readdirSync, readFileSync } = require("node:fs");
const { dirname, join, relative, resolve } = require("node:path");

const forbiddenPatterns = [
  { label: "prisma db push", regex: /\b(?:npx\s+)?prisma\s+db\s+push\b/i },
  { label: "--accept-data-loss", regex: /\b--accept-data-loss\b/i },
  {
    label: "prisma migrate reset",
    regex: /\b(?:npx\s+)?prisma\s+migrate\s+reset\b/i,
  },
  {
    label: "prisma migrate dev",
    regex: /\b(?:npx\s+)?prisma\s+migrate\s+dev\b/i,
  },
  {
    label: "prisma db execute",
    regex: /\b(?:npx\s+)?prisma\s+db\s+execute\b/i,
  },
];

const runScriptPatterns = [
  /\bnpm(?:\.cmd)?\s+(?:--prefix\s+\S+\s+)?run(?:\s+-s)?\s+([A-Za-z0-9:_-]+)/gi,
  /\bpnpm(?:\.cmd)?\s+run(?:\s+-s)?\s+([A-Za-z0-9:_-]+)/gi,
  /\byarn(?:\.cmd)?\s+run\s+([A-Za-z0-9:_-]+)/gi,
  /\bbun(?:\.exe)?\s+run\s+([A-Za-z0-9:_-]+)/gi,
];

const shellScriptRunPatterns = [
  /\b(?:bash|sh)\s+([^\s"'`|&;]+(?:\.sh|\.bash))\b/gi,
  /\b(?:pwsh|powershell(?:\.exe)?)\s+(?:-File\s+)?([^\s"'`|&;]+\.ps1)\b/gi,
  /(?:^|\s)(\.\/[^\s"'`|&;]+\.(?:sh|ps1))\b/gi,
  /(?:^|\s)(scripts\/[^\s"'`|&;]+\.(?:sh|ps1))\b/gi,
];

function collectWorkflowFiles(workflowsDir) {
  const files = [];
  for (const name of readdirSync(workflowsDir)) {
    if (!name.endsWith(".yml") && !name.endsWith(".yaml")) continue;
    files.push(join(workflowsDir, name));
  }
  return files;
}

function normalizePathForLabel(pathValue) {
  return String(pathValue || "").replace(/\\/g, "/");
}

function extractScriptNames(commandText) {
  const names = new Set();
  for (const pattern of runScriptPatterns) {
    let match = null;
    while ((match = pattern.exec(commandText)) !== null) {
      const scriptName = match[1];
      if (scriptName) names.add(scriptName);
    }
    pattern.lastIndex = 0;
  }
  return names;
}

function extractShellScriptPaths(commandText) {
  const refs = new Set();
  for (const pattern of shellScriptRunPatterns) {
    let match = null;
    while ((match = pattern.exec(commandText)) !== null) {
      const raw = String(match[1] || "").trim();
      if (!raw) continue;
      refs.add(raw.replace(/^["']|["']$/g, ""));
    }
    pattern.lastIndex = 0;
  }
  return refs;
}

function isLocalScriptPath(ref) {
  return (
    ref.startsWith("./") ||
    ref.startsWith("../") ||
    ref.includes("/") ||
    ref.includes("\\")
  );
}

function findForbiddenInReferencedShellScripts(commandText, baseDir, repoRoot) {
  const offenders = [];
  const refs = extractShellScriptPaths(commandText);
  for (const ref of refs) {
    if (!isLocalScriptPath(ref)) continue;
    const absolute = resolve(baseDir, ref);
    const normalizedRepoRoot = resolve(repoRoot);
    if (!absolute.startsWith(normalizedRepoRoot)) continue;
    if (!existsSync(absolute)) continue;
    const content = readFileSync(absolute, "utf8");
    const rel = normalizePathForLabel(relative(normalizedRepoRoot, absolute));
    offenders.push(...findForbiddenInText(rel, content));
  }
  return offenders;
}

function findForbiddenInText(path, content) {
  const matched = forbiddenPatterns
    .filter((rule) => rule.regex.test(content))
    .map((rule) => rule.label);
  return matched.length > 0 ? [{ path, matched }] : [];
}

function loadPackageScripts(packageJsonPath) {
  if (!existsSync(packageJsonPath)) return {};
  const parsed = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  return parsed && parsed.scripts && typeof parsed.scripts === "object"
    ? parsed.scripts
    : {};
}

function expandScriptCommand(scriptName, scripts, stack = new Set()) {
  const raw = scripts[scriptName];
  if (typeof raw !== "string") return "";
  if (stack.has(scriptName)) return raw;

  const next = new Set(stack);
  next.add(scriptName);
  const referenced = extractScriptNames(raw);
  const expansions = [];
  for (const name of referenced) {
    if (next.has(name)) continue;
    const nested = expandScriptCommand(name, scripts, next);
    if (nested) expansions.push(nested);
  }
  return [raw, ...expansions].join("\n");
}

function findForbiddenInReferencedScripts(workflowsDir, packageJsonPath) {
  const scripts = loadPackageScripts(packageJsonPath);
  const offenders = [];
  const referencedNames = new Set();
  const repoRoot = resolve(workflowsDir, "..", "..");
  const packageDir = dirname(packageJsonPath);

  for (const fullPath of collectWorkflowFiles(workflowsDir)) {
    const content = readFileSync(fullPath, "utf8");
    for (const scriptName of extractScriptNames(content)) {
      referencedNames.add(scriptName);
    }
  }

  for (const scriptName of referencedNames) {
    const expanded = expandScriptCommand(scriptName, scripts);
    if (!expanded) continue;
    offenders.push(
      ...findForbiddenInText(
        `${packageJsonPath}#scripts.${scriptName}`,
        expanded,
      ),
    );
    offenders.push(
      ...findForbiddenInReferencedShellScripts(expanded, packageDir, repoRoot),
    );
  }

  return offenders;
}

function findForbiddenCiPrismaPatterns(workflowsDir, packageJsonPath) {
  const offenders = [];
  const repoRoot = resolve(workflowsDir, "..", "..");
  for (const fullPath of collectWorkflowFiles(workflowsDir)) {
    const content = readFileSync(fullPath, "utf8");
    offenders.push(...findForbiddenInText(normalizePathForLabel(fullPath), content));
    offenders.push(
      ...findForbiddenInReferencedShellScripts(content, repoRoot, repoRoot),
    );
  }

  offenders.push(
    ...findForbiddenInReferencedScripts(workflowsDir, packageJsonPath),
  );
  return offenders;
}

function assertNoCiDbPush(workflowsDir, packageJsonPath) {
  const offenders = findForbiddenCiPrismaPatterns(workflowsDir, packageJsonPath);
  if (offenders.length > 0) {
    const lines = [
      "[prisma:ci:policy:check] Forbidden Prisma CI patterns found.",
      ...offenders.map(
        (offender) => ` - ${offender.path}: ${offender.matched.join(", ")}`,
      ),
    ];
    throw new Error(lines.join("\n"));
  }
  return true;
}

module.exports = {
  forbiddenPatterns,
  runScriptPatterns,
  shellScriptRunPatterns,
  findForbiddenCiPrismaPatterns,
  assertNoCiDbPush,
};
