#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const STRICT = process.argv.includes("--strict");
const CWD = process.cwd();
const BACKEND_ROOT = fs.existsSync(path.resolve(CWD, "backend/src"))
  ? path.resolve(CWD, "backend")
  : CWD;
const SRC = path.resolve(BACKEND_ROOT, "src");

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function exists(relPath) {
  return fs.existsSync(path.resolve(BACKEND_ROOT, relPath));
}

function hasPattern(relPath, pattern) {
  const full = path.resolve(BACKEND_ROOT, relPath);
  if (!fs.existsSync(full)) return false;
  return pattern.test(read(full));
}

function scoreBucket(ok, maxPoints) {
  return ok ? maxPoints : 0;
}

const activeRuntimeFiles = [
  "src/services/prismaChat.service.ts",
  "src/services/chat/chatKernel.service.ts",
  "src/services/chat/turnRouter.service.ts",
  "src/services/chat/turnRoutePolicy.service.ts",
  "src/modules/chat/application/chat-runtime.service.ts",
];

const activeRuntimeMissing = activeRuntimeFiles.filter((f) => !exists(f));
const activeRuntimeCoreRoutingImports = activeRuntimeFiles.filter((f) =>
  hasPattern(f, /\bservices\/core\/routing\//),
);
const runtimePathOk =
  activeRuntimeMissing.length === 0 &&
  activeRuntimeCoreRoutingImports.length === 0;

const dormantRoutingFiles = [
  "src/services/core/routing/router.service.ts",
  "src/services/core/routing/intentEngine.service.ts",
  "src/services/core/routing/operatorResolver.service.ts",
  "src/services/core/routing/operatorTiebreakers.service.ts",
  "src/services/core/routing/domainEnforcement.service.ts",
  "src/services/core/routing/answerModeRouter.service.ts",
  "src/services/core/routing/queryRewriter.service.ts",
  "src/services/core/routing/routingSignals.ts",
];
const dormantStillPresent = dormantRoutingFiles.filter((f) => exists(f));
const dormantRemovedOk = dormantStillPresent.length === 0;

const turnPolicyFile = "src/services/chat/turnRoutePolicy.service.ts";
const turnPolicyNoDynamicFallback =
  exists(turnPolicyFile) &&
  !hasPattern(
    turnPolicyFile,
    /\bloadRoutingBankFallback\b|\brequire\(|path\.resolve\(process\.cwd\(\),\s*["'](?:src|backend\/src)\/data_banks/,
  );
const turnPolicyHasBankLoader =
  exists(turnPolicyFile) &&
  hasPattern(
    turnPolicyFile,
    /(?:getOptionalBank<RoutingBank>|getRoutingBank)\("connectors_routing"\)/,
  ) &&
  hasPattern(
    turnPolicyFile,
    /(?:getOptionalBank<RoutingBank>|getRoutingBank)\("email_routing"\)/,
  );
const bankOnlyPolicyOk = turnPolicyNoDynamicFallback && turnPolicyHasBankLoader;

const containerFile = "src/bootstrap/container.ts";
const containerClean =
  exists(containerFile) &&
  !hasPattern(containerFile, /services\/core\/routing\/intentEngine\.service/);

const requiredTests = [
  "src/services/chat/turnRouter.service.test.ts",
  "src/services/chat/guardrails/editorMode.guard.test.ts",
  "src/services/chat/turnRoutePolicy.service.test.ts",
];
const missingTests = requiredTests.filter((f) => !exists(f));
const testsPresent = missingTests.length === 0;

const scoreBreakdown = {
  runtimePath: scoreBucket(runtimePathOk, 3),
  dormantRemoved: scoreBucket(dormantRemovedOk, 3),
  bankOnlyPolicy: scoreBucket(bankOnlyPolicyOk, 2),
  containerClean: scoreBucket(containerClean, 1),
  testsPresent: scoreBucket(testsPresent, 1),
};

const score =
  scoreBreakdown.runtimePath +
  scoreBreakdown.dormantRemoved +
  scoreBreakdown.bankOnlyPolicy +
  scoreBreakdown.containerClean +
  scoreBreakdown.testsPresent;

const lines = [];
lines.push(`[intent-audit] score: ${score}/10`);
lines.push(`[intent-audit] runtime-path: ${scoreBreakdown.runtimePath}/3`);
lines.push(`[intent-audit] dormant-removed: ${scoreBreakdown.dormantRemoved}/3`);
lines.push(`[intent-audit] bank-only-policy: ${scoreBreakdown.bankOnlyPolicy}/2`);
lines.push(`[intent-audit] container-clean: ${scoreBreakdown.containerClean}/1`);
lines.push(`[intent-audit] tests-present: ${scoreBreakdown.testsPresent}/1`);

if (activeRuntimeMissing.length > 0) {
  lines.push(
    `[intent-audit] FAIL missing active runtime files: ${activeRuntimeMissing.join(", ")}`,
  );
}
if (activeRuntimeCoreRoutingImports.length > 0) {
  lines.push(
    `[intent-audit] FAIL active runtime imports dormant core routing: ${activeRuntimeCoreRoutingImports.join(", ")}`,
  );
}
if (dormantStillPresent.length > 0) {
  lines.push(
    `[intent-audit] FAIL dormant routing files still present: ${dormantStillPresent.join(", ")}`,
  );
}
if (!turnPolicyNoDynamicFallback) {
  lines.push(
    "[intent-audit] FAIL turnRoutePolicy has dynamic fallback file loading",
  );
}
if (!turnPolicyHasBankLoader) {
  lines.push(
    "[intent-audit] FAIL turnRoutePolicy is not loading required banks through bank loader",
  );
}
if (!containerClean) {
  lines.push(
    "[intent-audit] FAIL container still imports dormant intent engine",
  );
}
if (missingTests.length > 0) {
  lines.push(
    `[intent-audit] FAIL missing required intent runtime tests: ${missingTests.join(", ")}`,
  );
}

for (const line of lines) {
  // eslint-disable-next-line no-console
  console.log(line);
}

const strictFail =
  !runtimePathOk ||
  !dormantRemovedOk ||
  !bankOnlyPolicyOk ||
  !containerClean ||
  !testsPresent ||
  score < 10;

if (STRICT && strictFail) {
  process.exit(1);
}
