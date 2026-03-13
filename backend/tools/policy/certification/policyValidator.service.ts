import * as fs from "fs";
import * as path from "path";

import {
  extractPolicyRules,
  PolicyRuntimeEngine,
} from "../../shared/policyRuntimeEngine";
import {
  POLICY_CRITICALITIES,
  type PolicyBankContract,
  type PolicyCertificationReport,
  type PolicyCriticality,
  type PolicyTestCase,
  type PolicyValidationIssue,
  type PolicyValidationResult,
} from "./policyContracts";

const POLICY_SUBPATH = path.join("src", "data_banks", "policies");

type GradeMode = "health" | "a";

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asTrimmed(value: unknown): string {
  return String(value || "").trim();
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => asTrimmed(entry)).filter(Boolean);
}

function toInt(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.floor(parsed);
}

function normalizeCriticality(value: unknown): PolicyCriticality | "unknown" {
  const raw = asTrimmed(value).toLowerCase();
  if ((POLICY_CRITICALITIES as readonly string[]).includes(raw)) {
    return raw as PolicyCriticality;
  }
  return "unknown";
}

function listJsonFilesRecursive(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  const out: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith(".any.json")) continue;
      out.push(abs);
    }
  }
  return out.sort((a, b) => a.localeCompare(b));
}

function loadBankFromFile(filePath: string): PolicyBankContract {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Invalid policy bank JSON object: ${filePath}`);
  }
  return parsed as PolicyBankContract;
}

function countTestCases(bank: PolicyBankContract): number {
  const tests = asObject(bank.tests);
  const testCases = Array.isArray(tests.cases) ? tests.cases.length : 0;
  const topCases = Array.isArray(bank.cases) ? bank.cases.length : 0;
  return testCases + topCases;
}

function collectCaseRows(bank: PolicyBankContract): PolicyTestCase[] {
  return [
    ...(Array.isArray(bank.tests?.cases) ? bank.tests.cases : []),
    ...(Array.isArray(bank.cases) ? bank.cases : []),
  ];
}

function collectDuplicateTestCaseIds(bank: PolicyBankContract): string[] {
  const rows = collectCaseRows(bank);
  const counts = new Map<string, number>();
  for (const row of rows) {
    const id = asTrimmed(asObject(row).id);
    if (!id) continue;
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  return Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([id]) => id)
    .sort((a, b) => a.localeCompare(b));
}

function collectDuplicatePromptTriples(bank: PolicyBankContract): string[] {
  const rows = Array.isArray(bank.cases) ? bank.cases : [];
  const counts = new Map<string, number>();
  for (const row of rows) {
    const item = asObject(row);
    const language = asTrimmed(item.language).toLowerCase();
    const category = asTrimmed(item.category).toLowerCase();
    const prompt = asTrimmed(item.prompt).toLowerCase();
    if (!language || !category || !prompt) continue;
    const key = `${language}\t${category}\t${prompt}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([key]) => key)
    .sort((a, b) => a.localeCompare(b));
}

function runtimeFromCase(row: PolicyTestCase): Record<string, unknown> | null {
  const runtime = asObject(row.runtime);
  if (Object.keys(runtime).length > 0) return runtime;
  const input = asObject(row.input);
  if (Object.keys(input).length > 0) return input;
  return null;
}

function expectedFromCase(row: PolicyTestCase): Record<string, unknown> | null {
  const expect = asObject(row.expect);
  return Object.keys(expect).length > 0 ? expect : null;
}

function hasLegacyAssert(row: PolicyTestCase): boolean {
  return asTrimmed((row as any).assert).length > 0;
}

function deepMatch(actual: unknown, expected: unknown): boolean {
  if (
    expected == null ||
    typeof expected !== "object" ||
    Array.isArray(expected)
  ) {
    return actual === expected;
  }
  if (!actual || typeof actual !== "object" || Array.isArray(actual)) return false;

  const actualObj = actual as Record<string, unknown>;
  const expectedObj = expected as Record<string, unknown>;
  return Object.entries(expectedObj).every(([key, value]) =>
    deepMatch(actualObj[key], value),
  );
}

function minTestCasesForCriticality(criticality: PolicyCriticality | "unknown"): number {
  if (criticality === "critical") return 2;
  if (criticality === "high") return 1;
  return 0;
}

function aGradeTargetCases(input: {
  criticality: PolicyCriticality | "unknown";
  ruleCount: number;
  configModeOnly: boolean;
}): number {
  if (input.configModeOnly) {
    return input.criticality === "high" || input.criticality === "critical" ? 6 : 4;
  }

  let base = 2;
  if (input.criticality === "critical") base = 4;
  else if (input.criticality === "high") base = 3;
  else if (input.ruleCount > 0) base = 4;

  const density = input.ruleCount >= 20 ? 6 : Math.min(4, Math.ceil(input.ruleCount / 4));
  return Math.max(base, density);
}

function gradeFromScore(score: number): PolicyValidationResult["grade"] {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

function makeIssue(input: {
  code: string;
  severity: "error" | "warning";
  message: string;
  filePath: string;
  bankId: string;
}): PolicyValidationIssue {
  return {
    code: input.code,
    severity: input.severity,
    message: input.message,
    filePath: input.filePath,
    bankId: input.bankId,
  };
}

function normalizeLoggingConfig(bank: PolicyBankContract): Record<string, unknown> {
  const config = asObject(bank.config);
  const redactKeys = asStringArray(config.redactKeys)
    .map((value) =>
      value
        .toLowerCase()
        .replace(/[^a-z0-9]/g, ""),
    )
    .filter(Boolean);
  const runtimePaths = asStringArray(config.runtimePathsNoRawConsole);
  return {
    enabled: config.enabled !== false,
    strict: config.strict !== false,
    failClosedInProd: config.failClosedInProd !== false,
    redactKeys:
      redactKeys.length > 0
        ? redactKeys
        : ["password", "token", "authorization", "apikey", "secret", "ssn", "creditcard"],
    runtimePathsNoRawConsole:
      runtimePaths.length > 0
        ? runtimePaths
        : [
            "src/modules/chat/runtime/ChatTurnExecutor.ts",
            "src/modules/chat/runtime/ChatRuntimeOrchestrator.ts",
            "src/services/core/retrieval/evidenceGate.service.ts",
            "src/services/llm/core/llmGateway.service.ts",
          ],
  };
}

function sanitizeLoggingContext(
  value: unknown,
  sensitiveKeys: Set<string>,
  seen: WeakSet<object>,
): unknown {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeLoggingContext(entry, sensitiveKeys, seen));
  }
  if (seen.has(value as object)) return "[Circular]";
  seen.add(value as object);
  const out: Record<string, unknown> = {};
  for (const [key, current] of Object.entries(value as Record<string, unknown>)) {
    const normalized = key
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    if (normalized && sensitiveKeys.has(normalized)) {
      out[key] = "[REDACTED]";
      continue;
    }
    out[key] = sanitizeLoggingContext(current, sensitiveKeys, seen);
  }
  return out;
}

function normalizeViewerLockedPolicy(bank: PolicyBankContract): Record<string, unknown> {
  const config = asObject(bank.config);
  const policy = asObject((bank as any).policy);
  const scope = asObject(policy.scope);
  const emitScopeSignals = asStringArray(scope.emitScopeSignals);
  return {
    enabled: config.enabled !== false,
    strict: config.strict !== false,
    defaultViewerIntent: asTrimmed(policy.defaultViewerIntent) || "qa_locked",
    defaultAnswerMode: asTrimmed(policy.defaultAnswerMode) || "doc_grounded_single",
    lockToActiveDocument:
      typeof scope.lockToActiveDocument === "boolean" ? scope.lockToActiveDocument : true,
    emitScopeSignals:
      emitScopeSignals.length > 0
        ? emitScopeSignals
        : ["explicitDocLock", "singleDocIntent", "hardScopeActive"],
  };
}

function normalizeBuilderPolicy(bank: PolicyBankContract): Record<string, unknown> {
  const source =
    bank.config && typeof bank.config === "object"
      ? (bank.config as Record<string, unknown>)
      : (bank as Record<string, unknown>);
  const payloadCaps = asObject(source.payloadCaps);
  const evidenceCapsByMode = asObject(source.evidenceCapsByMode);
  const input = asObject(source);
  return {
    payloadCaps: {
      memoryCharsDefault: toInt(payloadCaps.memoryCharsDefault) ?? 4800,
      memoryCharsDocGrounded: toInt(payloadCaps.memoryCharsDocGrounded) ?? 6800,
      userSectionCharsMax: toInt(payloadCaps.userSectionCharsMax) ?? 4200,
      toolContextCharsMax: toInt(payloadCaps.toolContextCharsMax) ?? 1400,
      totalUserPayloadCharsMax: toInt(payloadCaps.totalUserPayloadCharsMax) ?? 32000,
    },
    evidenceCapsByMode: Object.keys(evidenceCapsByMode).length > 0 ? evidenceCapsByMode : input.evidenceCapsByMode,
  };
}

function resolveRateLimitRoute(bank: PolicyBankContract, runtime: Record<string, unknown>): Record<string, unknown> {
  const routeKey = asTrimmed(runtime.route);
  const env = asTrimmed(runtime.env).toLowerCase();
  const routes = asObject((bank as any).routes);
  const resolved = asObject(routes[routeKey]);
  const isProd = env === "production";
  return {
    windowMs: toInt(resolved.windowMs) ?? 0,
    maxProd: toInt(resolved.maxProd) ?? 0,
    maxNonProd: toInt(resolved.maxNonProd) ?? 0,
    max: isProd ? toInt(resolved.maxProd) ?? 0 : toInt(resolved.maxNonProd) ?? 0,
    message: asTrimmed(resolved.message),
  };
}

function resolveTokenRateLimit(bank: PolicyBankContract, runtime: Record<string, unknown>): Record<string, unknown> {
  const scope = asTrimmed(runtime.scope) || "perUserPerHour";
  return asObject(asObject(asObject(bank).limits)[scope]);
}

function resolveOrchestratorCertification(bank: PolicyBankContract): Record<string, unknown> {
  const config = asObject(bank.config);
  const gateScores = asObject(config.gateScores);
  const coverage = asObject(config.coverage);
  const regressionSuite = asObject(config.regressionSuite);
  const memorySemantics = asObject(config.memorySemantics);
  return {
    gateScoreCount: Object.keys(gateScores).length,
    orchestratorFileCount: asStringArray(config.orchestratorFiles).length,
    coverageThresholdCount: Array.isArray(coverage.thresholds) ? coverage.thresholds.length : 0,
    regressionPathCount: asStringArray(regressionSuite.testPaths).length,
    memorySemanticsCheckCount: Array.isArray(memorySemantics.checks)
      ? memorySemantics.checks.length
      : 0,
  };
}

function resolveAssumptionPolicy(bank: PolicyBankContract): Record<string, unknown> {
  const config = asObject(bank.config);
  return {
    maxAssumptionsPerAnswer: toInt(config.maxAssumptionsPerAnswer) ?? 2,
    templateCount: Array.isArray((bank as any).templates) ? (bank as any).templates.length : 0,
    patternCount: Array.isArray((bank as any).patterns) ? (bank as any).patterns.length : 0,
  };
}

function resolveDecisionSupport(bank: PolicyBankContract): Record<string, unknown> {
  const framework = asObject((bank as any).framework);
  const optionsFramework = Array.isArray(framework.optionsFramework)
    ? framework.optionsFramework
    : [];
  return {
    domain: asTrimmed((bank as any).domain),
    requireOptions: framework.requireOptions === true,
    requireRiskTradeoffs: framework.requireRiskTradeoffs === true,
    requireEvidenceSummary: framework.requireEvidenceSummary === true,
    requireUncertaintyStatement: framework.requireUncertaintyStatement === true,
    requireWhatChangesMyMind: framework.requireWhatChangesMyMind === true,
    minimumOptionCount: toInt(framework.minimumOptionCount) ?? 0,
    optionFrameworkCount: optionsFramework.length,
  };
}

function resolveExplainStyle(bank: PolicyBankContract, runtime: Record<string, unknown>): Record<string, unknown> {
  const templates = Array.isArray((bank as any).templates) ? (bank as any).templates : [];
  const wantedLanguage = asTrimmed(runtime.language).toLowerCase();
  const wantedDepth = asTrimmed(runtime.depth).toLowerCase();
  const template =
    templates.find((entry: Record<string, unknown>) => {
      const language = asTrimmed(entry.language).toLowerCase();
      const depth = asTrimmed(entry.depth).toLowerCase();
      const languageOk = !wantedLanguage || language === wantedLanguage || language === "any";
      const depthOk = !wantedDepth || depth === wantedDepth;
      return languageOk && depthOk;
    }) ||
    templates[0] ||
    {};
  const evidenceConstraints = asObject(asObject(template).evidenceConstraints);
  const structure = Array.isArray(asObject(template).structure)
    ? (asObject(template).structure as unknown[])
    : [];
  return {
    templateCount: templates.length,
    minCitations: toInt(evidenceConstraints.minCitations) ?? 0,
    requireConfidenceLabel: evidenceConstraints.requireConfidenceLabel === true,
    forbidFabrication: evidenceConstraints.forbidFabrication === true,
    structureCount: structure.length,
    language: asTrimmed(asObject(template).language),
    depth: asTrimmed(asObject(template).depth),
  };
}

function resolvePythonSandbox(bank: PolicyBankContract, runtime: Record<string, unknown>): Record<string, unknown> {
  const rules = Array.isArray(bank.rules) ? bank.rules : [];
  const requestedImport = asTrimmed(runtime.import);
  const requestedRuleId = asTrimmed(runtime.ruleId);
  const match = rules.find((rule) => {
    const row = asObject(rule);
    if (requestedRuleId && asTrimmed(row.id) === requestedRuleId) return true;
    return requestedImport && asTrimmed(row.module) === requestedImport;
  });
  const selected = asObject(match);
  return {
    enforcement: asTrimmed(selected.enforcement) || "deny",
    id: asTrimmed(selected.id),
    module: asTrimmed(selected.module),
  };
}

function resolveConnectorPermissions(
  bank: PolicyBankContract,
  runtime: Record<string, unknown>,
): Record<string, unknown> {
  const action = asTrimmed(runtime.action);
  const actionConfig = asObject(asObject((bank as any).actions)[action]);
  return {
    ...actionConfig,
    viewerModeBlocksConnectorFallback:
      asObject(bank.config).viewerModeBlocksConnectorFallback === true,
    requireExplicitSendClick: asObject(bank.config).requireExplicitSendClick === true,
  };
}

function resolveMemorySemantics(runtime: Record<string, unknown>): Record<string, unknown> {
  const signals = asObject(runtime.signals);
  const state = asObject(runtime.state);
  const activeDocRef = asObject(state.activeDocRef);
  const retrieval = asObject(runtime.retrieval);
  const query = asObject(runtime.query);
  const runtimeTuning = asObject(runtime.runtimeTuning);
  const semanticRetrieval = asObject(runtimeTuning.semanticRetrieval);
  const minChars = toInt(semanticRetrieval.globalSearchMinQueryChars) ?? 12;
  const queryText = asTrimmed(query.text);
  return {
    shouldAllowHardLockOverwrite:
      signals.hasExplicitDocRef === true && asTrimmed(activeDocRef.lockType) === "hard",
    refreshTtl: signals.isFollowup === true && (toInt(activeDocRef.ttlTurns) ?? 0) > 0,
    shouldNotSwitchDoc:
      signals.isFollowup === true && signals.hasExplicitDocRef !== true,
    shouldClearActiveDocRef:
      signals.searchAllDocsRequested === true || signals.userRequestedUnlock === true,
    allowGlobalScope:
      signals.searchAllDocsRequested === true && queryText.length >= minChars,
    answerMode:
      signals.userAskedForQuote === true && (toInt(retrieval.evidenceCount) ?? 0) > 0
        ? "doc_grounded_quote"
        : "general_answer",
  };
}

function resolveFallbackSemantics(runtime: Record<string, unknown>): Record<string, unknown> {
  return {
    shouldAllowHardLockOverwrite: asObject(runtime.signals).hasExplicitDocRef === true,
    refreshTtl: asObject(runtime.signals).isFollowup === true,
    shouldNotSwitchDoc: asObject(runtime.signals).isFollowup === true,
    shouldClearActiveDocRef: asObject(runtime.signals).searchAllDocsRequested === true,
  };
}

function resolveMemoryPolicyTests(bank: PolicyBankContract): Record<string, unknown> {
  const certification = asObject((bank as any).certification);
  const families = asStringArray(certification.scenarioFamilies);
  return {
    promptCaseCount: toInt(certification.promptCaseCount) ?? 0,
    scenarioFamilyCount: families.length,
  };
}

function evaluateCase(
  bankId: string,
  bank: PolicyBankContract,
  row: PolicyTestCase,
): { actual: Record<string, unknown> | null; validated: boolean; skippedReason?: string } {
  const runtime = runtimeFromCase(row);
  if (bankId === "logging_policy") {
    if (!runtime) return { actual: null, validated: false, skippedReason: "missing_input" };
    const config = normalizeLoggingConfig(bank);
    const sensitiveKeys = new Set((config.redactKeys as string[]).map((value) => value.toLowerCase()));
    const sanitized = sanitizeLoggingContext(runtime, sensitiveKeys, new WeakSet());
    return {
      actual: {
        ...config,
        redacted: JSON.stringify(sanitized) !== JSON.stringify(runtime),
      },
      validated: true,
    };
  }

  if (bankId === "viewer_locked_chat_policy") {
    return { actual: normalizeViewerLockedPolicy(bank), validated: true };
  }

  if (bankId === "llm_builder_policy") {
    return { actual: normalizeBuilderPolicy(bank), validated: true };
  }

  if (bankId === "rate_limit_policy") {
    if (!runtime) return { actual: null, validated: false, skippedReason: "missing_input" };
    return { actual: resolveRateLimitRoute(bank, runtime), validated: true };
  }

  if (bankId === "token_rate_limits") {
    if (!runtime) return { actual: null, validated: false, skippedReason: "missing_input" };
    return { actual: resolveTokenRateLimit(bank, runtime), validated: true };
  }

  if (bankId === "orchestrator_certification") {
    return { actual: resolveOrchestratorCertification(bank), validated: true };
  }

  if (bankId === "assumption_policy") {
    return { actual: resolveAssumptionPolicy(bank), validated: true };
  }

  if (bankId.startsWith("decision_support_")) {
    return { actual: resolveDecisionSupport(bank), validated: true };
  }

  if (bankId.startsWith("explain_style_")) {
    return { actual: resolveExplainStyle(bank, runtime || {}), validated: true };
  }

  if (bankId === "python_sandbox_policy") {
    if (!runtime) return { actual: null, validated: false, skippedReason: "missing_input" };
    return { actual: resolvePythonSandbox(bank, runtime), validated: true };
  }

  if (bankId === "allybi_connector_permissions") {
    if (!runtime) return { actual: null, validated: false, skippedReason: "missing_input" };
    return { actual: resolveConnectorPermissions(bank, runtime), validated: true };
  }

  if (bankId === "memory_policy") {
    if (!runtime) return { actual: null, validated: false, skippedReason: "missing_input" };
    return { actual: resolveMemorySemantics(runtime), validated: true };
  }

  if (bankId === "fallback_policy") {
    if (!runtime) return { actual: null, validated: false, skippedReason: "missing_input" };
    return { actual: resolveFallbackSemantics(runtime), validated: true };
  }

  if (bankId === "memory_policy_tests") {
    return { actual: resolveMemoryPolicyTests(bank), validated: true };
  }

  const rules = extractPolicyRules(bank);
  if (rules.length > 0) {
    if (!runtime) return { actual: null, validated: false, skippedReason: "missing_runtime" };
    const engine = new PolicyRuntimeEngine();
    const match = engine.firstMatch({
      policyBank: bank,
      runtime,
    });
    return {
      actual: match
        ? {
            ...asObject(match.then),
            reasonCode: match.reasonCode,
            ruleId: match.ruleId,
          }
        : {},
      validated: true,
    };
  }

  return { actual: null, validated: false, skippedReason: "no_evaluator" };
}

export class PolicyValidatorService {
  private resolvePolicyRoots(): string[] {
    const cwd = process.cwd();
    return [
      path.join(cwd, POLICY_SUBPATH),
      path.join(cwd, "backend", POLICY_SUBPATH),
    ].filter((candidate, index, arr) => arr.indexOf(candidate) === index);
  }

  listPolicyFiles(): string[] {
    const roots = this.resolvePolicyRoots();
    const out = new Set<string>();
    for (const root of roots) {
      for (const filePath of listJsonFilesRecursive(root)) out.add(filePath);
    }
    return [...out].sort((a, b) => a.localeCompare(b));
  }

  validateFile(
    filePath: string,
    opts?: { gradeMode?: GradeMode },
  ): PolicyValidationResult {
    const gradeMode = opts?.gradeMode || "health";
    const bank = loadBankFromFile(filePath);
    const meta = asObject(bank._meta);
    const bankId = asTrimmed(meta.id) || path.basename(filePath, ".any.json");
    const criticality = normalizeCriticality(meta.criticality);
    const issues: PolicyValidationIssue[] = [];

    const requireMeta = (key: string, predicate: (value: unknown) => boolean) => {
      const value = meta[key];
      if (predicate(value)) return;
      issues.push(
        makeIssue({
          code: `meta_missing_${key}`,
          severity: "error",
          message: `_meta.${key} is required`,
          filePath,
          bankId,
        }),
      );
    };

    requireMeta("id", (v) => asTrimmed(v).length > 0);
    requireMeta("version", (v) => asTrimmed(v).length > 0);
    requireMeta("description", (v) => asTrimmed(v).length > 0);
    requireMeta("lastUpdated", (v) => asTrimmed(v).length > 0);
    requireMeta("owner", (v) => asTrimmed(v).length > 0);
    requireMeta("reviewCadenceDays", (v) => {
      const value = toInt(v);
      return value != null && value > 0;
    });
    requireMeta("criticality", (v) => normalizeCriticality(v) !== "unknown");

    const config = asObject(bank.config);
    if (
      Object.prototype.hasOwnProperty.call(config, "enabled") &&
      typeof config.enabled !== "boolean"
    ) {
      issues.push(
        makeIssue({
          code: "config_enabled_invalid",
          severity: "error",
          message: "config.enabled must be a boolean when present",
          filePath,
          bankId,
        }),
      );
    }

    const ruleCount = extractPolicyRules(bank).length;
    const testCaseCount = countTestCases(bank);
    const configModeOnly = config.configModeOnly === true;
    const minTests = minTestCasesForCriticality(criticality);
    if (minTests > 0 && testCaseCount < minTests) {
      issues.push(
        makeIssue({
          code: "critical_policy_missing_tests",
          severity: "error",
          message: `${criticality} policy banks must declare at least ${minTests} test case(s)`,
          filePath,
          bankId,
        }),
      );
    }

    if (
      (criticality === "critical" || criticality === "high") &&
      ruleCount < 1 &&
      !configModeOnly
    ) {
      issues.push(
        makeIssue({
          code: "critical_policy_missing_rules",
          severity: "error",
          message:
            "critical/high policy banks must declare executable rules, or set config.configModeOnly=true",
          filePath,
          bankId,
        }),
      );
    }

    if (ruleCount > 0 && testCaseCount < 1) {
      issues.push(
        makeIssue({
          code: "rules_without_tests",
          severity: "warning",
          message: "policy has rules but no in-bank test cases",
          filePath,
          bankId,
        }),
      );
    }

    const duplicateTestIds = collectDuplicateTestCaseIds(bank);
    for (const duplicateId of duplicateTestIds) {
      issues.push(
        makeIssue({
          code: "duplicate_test_case_id",
          severity: "error",
          message: `duplicate policy test id: ${duplicateId}`,
          filePath,
          bankId,
        }),
      );
    }

    const duplicatePromptTriples = collectDuplicatePromptTriples(bank);
    for (const duplicatePromptKey of duplicatePromptTriples) {
      issues.push(
        makeIssue({
          code: "duplicate_prompt_case",
          severity: "warning",
          message: `duplicate case prompt tuple: ${duplicatePromptKey}`,
          filePath,
          bankId,
        }),
      );
    }

    const rows = collectCaseRows(bank);
    let validatedCaseCount = 0;
    let skippedCaseCount = 0;
    for (const row of rows) {
      const caseId = asTrimmed(asObject(row).id) || "unknown_case";
      if (hasLegacyAssert(row)) {
        skippedCaseCount += 1;
        issues.push(
          makeIssue({
            code: "policy_case_uses_legacy_assert",
            severity: gradeMode === "a" ? "error" : "warning",
            message: `policy case ${caseId} uses legacy assert text and must be migrated to expect`,
            filePath,
            bankId,
          }),
        );
        continue;
      }

      const expected = expectedFromCase(row);
      if (!expected) {
        skippedCaseCount += 1;
        issues.push(
          makeIssue({
            code: "policy_case_missing_expect",
            severity: gradeMode === "a" ? "error" : "warning",
            message: `policy case ${caseId} is missing structured expect`,
            filePath,
            bankId,
          }),
        );
        continue;
      }

      const evaluation = evaluateCase(bankId, bank, row);
      if (!evaluation.validated || !evaluation.actual) {
        skippedCaseCount += 1;
        issues.push(
          makeIssue({
            code: "policy_case_skipped",
            severity: gradeMode === "a" ? "error" : "warning",
            message: `policy case ${caseId} could not be evaluated (${evaluation.skippedReason || "unknown"})`,
            filePath,
            bankId,
          }),
        );
        continue;
      }

      if (!deepMatch(evaluation.actual, expected)) {
        issues.push(
          makeIssue({
            code: "policy_case_expectation_mismatch",
            severity: "error",
            message: `policy case ${caseId} expectation mismatch`,
            filePath,
            bankId,
          }),
        );
        continue;
      }
      validatedCaseCount += 1;
    }

    const aTarget = aGradeTargetCases({
      criticality,
      ruleCount,
      configModeOnly,
    });
    if (gradeMode === "a") {
      if (!configModeOnly && ruleCount < 1) {
        issues.push(
          makeIssue({
            code: "a_grade_requires_executable_rules_or_config_mode",
            severity: "error",
            message: "A-grade banks must be executable or explicitly configModeOnly",
            filePath,
            bankId,
          }),
        );
      }
      if (validatedCaseCount < aTarget) {
        issues.push(
          makeIssue({
            code: "a_grade_insufficient_validated_cases",
            severity: "error",
            message: `A-grade requires at least ${aTarget} validated case(s); found ${validatedCaseCount}`,
            filePath,
            bankId,
          }),
        );
      }
      if (skippedCaseCount > 0) {
        issues.push(
          makeIssue({
            code: "a_grade_disallows_skipped_cases",
            severity: "error",
            message: `A-grade disallows skipped/unstructured cases; found ${skippedCaseCount}`,
            filePath,
            bankId,
          }),
        );
      }
    }

    let score = 100;
    const caseGap = Math.max(0, aTarget - validatedCaseCount);
    score -= caseGap * 8;
    score -= skippedCaseCount * 10;
    if (!configModeOnly && ruleCount < 1) score -= 25;
    if (issues.some((issue) => issue.severity === "error")) {
      score = Math.min(score, 69);
    }
    score = Math.max(0, score);

    return {
      bankId,
      filePath,
      ok: !issues.some((issue) => issue.severity === "error"),
      criticality,
      grade: gradeFromScore(score),
      score,
      issues,
      ruleCount,
      testCaseCount,
      validatedCaseCount,
      skippedCaseCount,
      configModeOnly,
    };
  }

  validateAll(opts?: { gradeMode?: GradeMode }): PolicyCertificationReport {
    const files = this.listPolicyFiles();
    const results = files.map((filePath) => this.validateFile(filePath, opts));
    const errors = results.flatMap((result) =>
      result.issues.filter((issue) => issue.severity === "error"),
    );
    const warnings = results.flatMap((result) =>
      result.issues.filter((issue) => issue.severity === "warning"),
    );

    return {
      ok: errors.length === 0,
      checkedAt: new Date().toISOString(),
      totalBanks: results.length,
      failedBanks: results.filter((result) => !result.ok).map((result) => result.bankId),
      warningBanks: results
        .filter((result) =>
          result.issues.some((issue) => issue.severity === "warning"),
        )
        .map((result) => result.bankId),
      issueCounts: {
        errors: errors.length,
        warnings: warnings.length,
      },
      results,
    };
  }
}
