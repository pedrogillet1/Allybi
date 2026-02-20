/* eslint-disable no-console */
import * as fs from "fs";
import * as path from "path";

const STRICT = process.argv.includes("--strict");

function read(relPath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), relPath), "utf8");
}

function exists(relPath: string): boolean {
  return fs.existsSync(path.resolve(process.cwd(), relPath));
}

function has(text: string, pattern: RegExp): boolean {
  return pattern.test(text);
}

type Check = {
  id: string;
  points: number;
  ok: boolean;
  failMessage: string;
};

function main() {
  const delegatePath =
    "src/modules/chat/runtime/CentralizedChatRuntimeDelegate.ts";
  const chatRuntimePath = "src/modules/chat/application/chat-runtime.service.ts";
  const memorySvcPath = "src/services/memory/conversationMemory.service.ts";
  const memoryPolicyEnginePath = "src/services/memory/memoryPolicyEngine.service.ts";
  const memoryRedactionPath = "src/services/memory/memoryRedaction.service.ts";
  const packageJsonPath = "package.json";
  const memoryPolicyPath = "src/data_banks/policies/memory_policy.any.json";
  const runtimeWiringTestPath =
    "src/services/core/banks/runtimeWiringIntegrity.service.test.ts";
  const memoryContinuityTestPath = "src/tests/memory-semantic-continuity.test.ts";

  const delegate = read(delegatePath);
  const chatRuntime = read(chatRuntimePath);
  const memorySvc = read(memorySvcPath);
  const pkg = JSON.parse(read(packageJsonPath));
  const memoryPolicy = JSON.parse(read(memoryPolicyPath));
  const policyEngine = exists(memoryPolicyEnginePath)
    ? read(memoryPolicyEnginePath)
    : "";
  const memoryRedaction = exists(memoryRedactionPath)
    ? read(memoryRedactionPath)
    : "";

  const checks: Check[] = [];

  checks.push({
    id: "centralized_memory_dependency",
    points: 2,
    ok:
      !has(delegate, /\bnew ConversationMemoryService\(/) &&
      has(chatRuntime, /conversationMemory\s*\|\|\s*new ConversationMemoryService\(/),
    failMessage:
      "Memory service is still directly instantiated in delegate or not centralized in chat runtime composition.",
  });

  checks.push({
    id: "hook_enforcement_runtime",
    points: 2,
    ok:
      exists(memoryPolicyEnginePath) &&
      has(policyEngine, /integrationHooks/) &&
      has(policyEngine, /memory_policy integration hook banks missing/) &&
      has(delegate, /getMemoryPolicyRuntimeConfig\(/),
    failMessage:
      "Memory policy integration hooks are not enforced through a dedicated runtime policy engine.",
  });

  checks.push({
    id: "privacy_safe_persistence",
    points: 2,
    ok:
      exists(memoryRedactionPath) &&
      has(delegate, /buildPersistedRecallEntry\(/) &&
      has(delegate, /summaryMode:\s*"structural"/) &&
      !has(delegate, /content:\s*sanitizeSnippet\(input\.content/) &&
      !has(delegate, /summary:\s*summary\b/),
    failMessage:
      "Durable memory persistence still stores raw text or lacks structural-only redaction semantics.",
  });

  checks.push({
    id: "concurrency_safe_updates",
    points: 2,
    ok:
      has(delegate, /const maxAttempts = 3/) &&
      has(delegate, /updatedAt:\s*existing\.updatedAt/) &&
      has(delegate, /updateMany\(/),
    failMessage:
      "Memory artifact writes are not guarded by conflict-aware retry/update semantics.",
  });

  checks.push({
    id: "bounded_ttl_cache",
    points: 1,
    ok:
      has(memorySvc, /inMemoryConversationCacheLimit/) &&
      has(memorySvc, /inMemoryCacheTtlSeconds/) &&
      has(memorySvc, /evictIfNeeded\(/) &&
      has(memorySvc, /cacheKey\(/),
    failMessage:
      "Conversation memory cache is missing TTL, bounded size, or user-scoped keys.",
  });

  checks.push({
    id: "ci_gate_and_tests",
    points: 1,
    ok:
      typeof pkg?.scripts?.["audit:memory:strict"] === "string" &&
      typeof pkg?.scripts?.["check:all"] === "string" &&
      String(pkg.scripts["check:all"]).includes("audit:memory:strict") &&
      exists(runtimeWiringTestPath) &&
      exists(memoryContinuityTestPath),
    failMessage:
      "Memory strict audit is not wired into CI gates or required memory tests are missing.",
  });

  const maxScore = checks.reduce((sum, check) => sum + check.points, 0);
  const score = checks.reduce(
    (sum, check) => sum + (check.ok ? check.points : 0),
    0,
  );
  const failed = checks.filter((check) => !check.ok);

  console.log(`[memory-audit] score: ${score}/${maxScore}`);
  for (const check of checks) {
    const value = check.ok ? check.points : 0;
    console.log(`[memory-audit] ${check.id}: ${value}/${check.points}`);
  }
  if (failed.length > 0) {
    for (const check of failed) {
      console.log(`[memory-audit] FAIL ${check.id}: ${check.failMessage}`);
    }
  }

  const hooks = memoryPolicy?.config?.integrationHooks || {};
  const runtimeTuning = memoryPolicy?.config?.runtimeTuning || {};
  if (!hooks || !runtimeTuning) {
    console.log("[memory-audit] FAIL memory_policy missing integrationHooks/runtimeTuning");
  }

  if (STRICT && (failed.length > 0 || score < maxScore)) {
    process.exit(1);
  }
}

main();

