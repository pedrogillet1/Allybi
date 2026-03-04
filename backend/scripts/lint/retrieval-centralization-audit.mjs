#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const STRICT = process.argv.includes("--strict");
const CWD = process.cwd();
const SEED_RELATIVE_PATHS = ["server.ts", path.join("main", "server.ts"), "app.ts"];

function hasSeedAtRoot(rootDir) {
  return SEED_RELATIVE_PATHS.some((seedPath) =>
    fs.existsSync(path.join(rootDir, "src", seedPath)),
  );
}

function resolveBackendRoot() {
  const cwdRoot = CWD;
  const nestedRoot = path.resolve(CWD, "backend");
  const cwdHasSrc = fs.existsSync(path.join(cwdRoot, "src"));
  const nestedHasSrc = fs.existsSync(path.join(nestedRoot, "src"));

  if (cwdHasSrc && !nestedHasSrc) return cwdRoot;
  if (!cwdHasSrc && nestedHasSrc) return nestedRoot;
  if (cwdHasSrc && nestedHasSrc) {
    const cwdHasSeed = hasSeedAtRoot(cwdRoot);
    const nestedHasSeed = hasSeedAtRoot(nestedRoot);
    if (cwdHasSeed && !nestedHasSeed) return cwdRoot;
    if (!cwdHasSeed && nestedHasSeed) return nestedRoot;
    return cwdRoot;
  }
  return cwdRoot;
}

const BACKEND_ROOT = resolveBackendRoot();
const SRC = path.resolve(BACKEND_ROOT, "src");

function rel(filePath) {
  return path.relative(BACKEND_ROOT, filePath).replace(/\\/g, "/");
}

function listSourceFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    if (!current) continue;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!/\.(ts|tsx|js|cjs|mjs)$/.test(entry.name)) continue;
      out.push(full);
    }
  }
  return out;
}

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasPattern(filePath, pattern) {
  if (!fs.existsSync(filePath)) return false;
  return pattern.test(read(filePath));
}

function scoreBucket(ok, maxPoints) {
  return ok ? maxPoints : 0;
}

const allSourceFiles = listSourceFiles(SRC).filter(
  (f) =>
    !f.includes(`${path.sep}src${path.sep}docs${path.sep}`) &&
    !f.includes(`${path.sep}__tests__${path.sep}`),
);

const chatRuntimeSurfaceFiles = allSourceFiles.filter((f) => {
  const normalized = rel(f);
  return (
    normalized.startsWith("src/modules/chat/") ||
    normalized === "src/services/prismaChat.service.ts" ||
    normalized === "src/services/chatRuntime.service.ts" ||
    normalized === "src/controllers/chat.controller.ts" ||
    normalized === "src/controllers/rag.controller.ts"
  );
});

const runtimeLegacyRetrievalImports = [];
const runtimeCoreRetrievalImports = [];
for (const file of chatRuntimeSurfaceFiles) {
  const src = read(file);
  if (/services\/retrieval\//.test(src)) {
    runtimeLegacyRetrievalImports.push(rel(file));
  }
  if (/services\/core\/retrieval\//.test(src)) {
    runtimeCoreRetrievalImports.push(rel(file));
  }
}

const legacyRuntimeImportLeakFiles = [];
for (const file of chatRuntimeSurfaceFiles) {
  const src = read(file);
  if (/chatRuntime\.legacy\.service|runtime\/legacy\/chat-runtime\.legacy/.test(src)) {
    legacyRuntimeImportLeakFiles.push(rel(file));
  }
}

const sourceButtonsFile = path.join(
  SRC,
  "services/core/retrieval/sourceButtons.service.ts",
);
const delegateFile = path.join(
  SRC,
  "modules/chat/runtime/CentralizedChatRuntimeDelegate.ts",
);
const retrievalEngineFile = path.join(
  SRC,
  "services/core/retrieval/retrievalEngine.service.ts",
);
const sourceButtonsBankDriven = hasPattern(
  sourceButtonsFile,
  /getOptionalBank<SourceEngineDataBank>\("source_engine"\)/,
);
const sourceButtonsHasLegacyPathLoad = hasPattern(
  sourceButtonsFile,
  /source_engine\.any\.json|data_banks\/retrieval\/source_engine/,
);

const resolveDataDirFile = path.join(SRC, "utils/resolveDataDir.ts");
const missingLegacySystemPromptsRef = hasPattern(
  resolveDataDirFile,
  /system_prompts\.json|policies\/system_prompts\.any\.json/,
);

const healthRouteCandidates = [
  path.join(SRC, "entrypoints/http/routes/health.routes.ts"),
  path.join(SRC, "routes/health.routes.ts"),
];
const healthHasRetrievalChecks = healthRouteCandidates.some(
  (file) =>
    hasPattern(file, /retrievalStorage/) &&
    hasPattern(file, /retrievalEngineLoaded/) &&
    hasPattern(file, /answerEngineLoaded/) &&
    hasPattern(file, /health\/retrieval/),
);

const containerFile = path.join(SRC, "bootstrap/container.ts");
const containerHasRetrievalRegistration =
  hasPattern(containerFile, /tryLoad\("retrievalEngine"/) &&
  hasPattern(containerFile, /tryLoad\("answerEngine"/);

const legacyRetrievalDir = path.join(SRC, "services/retrieval");
const legacyRetrievalFiles = fs.existsSync(legacyRetrievalDir)
  ? fs
      .readdirSync(legacyRetrievalDir)
      .filter((name) => name.endsWith(".ts") && name !== "index.ts")
      .map((name) => ({
        name,
        file: path.join(legacyRetrievalDir, name),
      }))
  : [];

const legacyRetrievalUnused = [];
for (const entry of legacyRetrievalFiles) {
  const base = entry.name.replace(/\.ts$/, "");
  const importPattern = new RegExp(
    `(?:from\\s+['"][^'"]*${escapeRegex(base)}['"]|require\\(\\s*['"][^'"]*${escapeRegex(
      base,
    )}['"]\\s*\\)|import\\(\\s*['"][^'"]*${escapeRegex(base)}['"]\\s*\\))`,
  );
  const importUsers = allSourceFiles.filter((f) => {
    if (path.resolve(f) === path.resolve(entry.file)) return false;
    return importPattern.test(read(f));
  });
  if (importUsers.length === 0) {
    legacyRetrievalUnused.push(rel(entry.file));
  }
}

const centralizationOk =
  runtimeLegacyRetrievalImports.length === 0 &&
  runtimeCoreRetrievalImports.length > 0;
const runtimeIsolationOk = legacyRuntimeImportLeakFiles.length === 0;
const configIntegrityOk =
  sourceButtonsBankDriven &&
  !sourceButtonsHasLegacyPathLoad &&
  !missingLegacySystemPromptsRef;
const deployReadinessOk =
  healthHasRetrievalChecks && containerHasRetrievalRegistration;
const evidenceGateEnforced =
  hasPattern(delegateFile, /evaluateEvidenceGateDecision\(/) &&
  hasPattern(delegateFile, /resolveEvidenceGateBypass\(/) &&
  hasPattern(delegateFile, /applyEvidenceGatePostProcessText\(/);
const failClosedRequiredBanks =
  hasPattern(
    retrievalEngineFile,
    /getRequiredBank<any>\("semantic_search_config"\)/,
  ) &&
  hasPattern(
    retrievalEngineFile,
    /getRequiredBank<any>\("retrieval_ranker_config"\)/,
  ) &&
  hasPattern(
    retrievalEngineFile,
    /getRequiredBank<any>\("retrieval_negatives"\)/,
  ) &&
  hasPattern(retrievalEngineFile, /getRequiredBank<any>\("evidence_packaging"\)/) &&
  !hasPattern(
    retrievalEngineFile,
    /safeGetBank<any>\("retrieval_negatives"\)|safeGetBank<any>\("evidence_packaging"\)/,
  );
const retrievalPhaseCountersAccurate =
  hasPattern(retrievalEngineFile, /phaseCounts:\s*RetrievalPhaseCounts/) &&
  hasPattern(
    retrievalEngineFile,
    /candidatesAfterNegatives:\s*ctx\.phaseCounts\.afterNegatives/,
  ) &&
  hasPattern(
    retrievalEngineFile,
    /candidatesAfterBoosts:\s*ctx\.phaseCounts\.afterBoosts/,
  ) &&
  hasPattern(
    retrievalEngineFile,
    /candidatesAfterDiversification:\s*ctx\.phaseCounts\.afterDiversification/,
  );

const scoreBreakdown = {
  centralization: scoreBucket(centralizationOk, 4),
  runtimeIsolation: scoreBucket(runtimeIsolationOk, 3),
  configIntegrity: scoreBucket(configIntegrityOk, 2),
  deployReadiness: scoreBucket(deployReadinessOk, 1),
};

let score =
  scoreBreakdown.centralization +
  scoreBreakdown.runtimeIsolation +
  scoreBreakdown.configIntegrity +
  scoreBreakdown.deployReadiness;

const lines = [];
lines.push(`[retrieval-audit] score: ${score}/10`);
lines.push(
  `[retrieval-audit] centralization: ${scoreBreakdown.centralization}/4`,
);
lines.push(
  `[retrieval-audit] runtime-isolation: ${scoreBreakdown.runtimeIsolation}/3`,
);
lines.push(
  `[retrieval-audit] config-integrity: ${scoreBreakdown.configIntegrity}/2`,
);
lines.push(
  `[retrieval-audit] deploy-readiness: ${scoreBreakdown.deployReadiness}/1`,
);

if (runtimeLegacyRetrievalImports.length > 0) {
  lines.push(
    `[retrieval-audit] FAIL runtime imported legacy retrieval services: ${runtimeLegacyRetrievalImports.join(", ")}`,
  );
}
if (legacyRuntimeImportLeakFiles.length > 0) {
  lines.push(
    `[retrieval-audit] FAIL legacy chat runtime import leakage: ${legacyRuntimeImportLeakFiles.join(", ")}`,
  );
}
if (!sourceButtonsBankDriven) {
  lines.push(
    `[retrieval-audit] FAIL source buttons are not loaded from source_engine bank`,
  );
}
if (sourceButtonsHasLegacyPathLoad) {
  lines.push(
    `[retrieval-audit] FAIL source buttons still reference legacy source_engine file paths`,
  );
}
if (missingLegacySystemPromptsRef) {
  lines.push(
    `[retrieval-audit] FAIL resolveDataDir still references missing legacy system prompts`,
  );
}
if (!healthHasRetrievalChecks) {
  lines.push(
    `[retrieval-audit] FAIL health routes missing retrieval readiness checks`,
  );
}
if (!containerHasRetrievalRegistration) {
  lines.push(
    `[retrieval-audit] FAIL container missing retrieval/answer runtime registration`,
  );
}
if (!evidenceGateEnforced) {
  lines.push(
    `[retrieval-audit] FAIL evidence gate result is not enforced in centralized chat runtime`,
  );
}
if (!failClosedRequiredBanks) {
  lines.push(
    `[retrieval-audit] FAIL retrieval engine still allows fail-open required bank loading`,
  );
}
if (!retrievalPhaseCountersAccurate) {
  lines.push(
    `[retrieval-audit] FAIL retrieval stats counters are not phase-accurate`,
  );
}
if (legacyRetrievalUnused.length > 0) {
  lines.push(
    `[retrieval-audit] WARN unused legacy retrieval services: ${legacyRetrievalUnused.join(", ")}`,
  );
}

for (const line of lines) {
  // eslint-disable-next-line no-console
  console.log(line);
}

const strictFail =
  runtimeLegacyRetrievalImports.length > 0 ||
  legacyRuntimeImportLeakFiles.length > 0 ||
  !configIntegrityOk ||
  !deployReadinessOk ||
  !evidenceGateEnforced ||
  !failClosedRequiredBanks ||
  !retrievalPhaseCountersAccurate;

if (STRICT && strictFail) {
  process.exit(1);
}
