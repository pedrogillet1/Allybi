import * as fs from "fs";
import * as path from "path";

import { extractPolicyRules, PolicyRuntimeEngine } from "./policyRuntimeEngine.service";
import { UiContractInterpreterService } from "../enforcement/uiContractInterpreter.service";
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
const POLICY_AUX_FILES = [
  path.join("src", "data_banks", "overlays", "ui_contracts.any.json"),
  path.join("src", "data_banks", "patterns", "ui", "receipt_shapes.any.json"),
  path.join("backend", "src", "data_banks", "overlays", "ui_contracts.any.json"),
  path.join("backend", "src", "data_banks", "patterns", "ui", "receipt_shapes.any.json"),
];

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asTrimmed(value: unknown): string {
  return String(value || "").trim();
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
  const testsCases = Array.isArray(tests.cases) ? tests.cases.length : 0;
  const topCases = Array.isArray(bank.cases) ? bank.cases.length : 0;
  return testsCases + topCases;
}

function collectDuplicateTestCaseIds(bank: PolicyBankContract): string[] {
  const rows = [
    ...(Array.isArray(bank.tests?.cases) ? bank.tests?.cases : []),
    ...(Array.isArray(bank.cases) ? bank.cases : []),
  ];
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

function minTestCasesForCriticality(criticality: PolicyCriticality | "unknown"): number {
  if (criticality === "critical") return 2;
  if (criticality === "high") return 1;
  return 0;
}

function collectCaseRows(bank: PolicyBankContract): PolicyTestCase[] {
  return [
    ...(Array.isArray(bank.tests?.cases) ? bank.tests.cases : []),
    ...(Array.isArray(bank.cases) ? bank.cases : []),
  ];
}

function runtimeFromCase(row: PolicyTestCase): Record<string, unknown> | null {
  const runtime = asObject(row.runtime);
  if (Object.keys(runtime).length > 0) return runtime;
  const input = asObject(row.input);
  if (Object.keys(input).length > 0) return input;
  return null;
}

function expectedActionFromCase(row: PolicyTestCase): string | null {
  const expectObj = asObject(row.expect);
  const action = asTrimmed(expectObj.action);
  return action || null;
}

function parseDateValue(value: unknown): Date | null {
  const raw = asTrimmed(value);
  if (!raw) return null;
  const parsedMs = Date.parse(raw);
  if (!Number.isFinite(parsedMs)) return null;
  const parsed = new Date(parsedMs);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function elapsedDaysSince(value: Date): number {
  const deltaMs = Date.now() - value.getTime();
  return Math.floor(deltaMs / 86_400_000);
}

function normalizeUiLanguage(value: unknown): "en" | "pt" | "es" {
  const normalized = asTrimmed(value).toLowerCase();
  if (normalized === "pt") return "pt";
  if (normalized === "es") return "es";
  return "en";
}

function asCaseInputText(value: unknown): string {
  if (typeof value === "string") return value;
  const record = asObject(value);
  const content = asTrimmed(record.content);
  return content || "";
}

function behavioralIssuesForCases(input: {
  bank: PolicyBankContract;
  filePath: string;
  bankId: string;
}): PolicyValidationIssue[] {
  const rows = collectCaseRows(input.bank);
  const issues: PolicyValidationIssue[] = [];
  const ruleCount = extractPolicyRules(input.bank).length;
  if (ruleCount < 1 || rows.length < 1) return issues;

  const engine = new PolicyRuntimeEngine();
  for (const row of rows) {
    const caseId = asTrimmed(asObject(row).id) || "unknown_case";
    const runtime = runtimeFromCase(row);
    const expectedAction = expectedActionFromCase(row);
    if (!runtime || !expectedAction) continue;

    const match = engine.firstMatch({
      policyBank: input.bank,
      runtime,
    });
    const got = asTrimmed(asObject(match?.then).action);
    if (!got) {
      issues.push(
        makeIssue({
          code: "behavior_case_missing_action",
          severity: "error",
          message: `behavior case ${caseId} expected action=${expectedAction} but no action matched`,
          filePath: input.filePath,
          bankId: input.bankId,
        }),
      );
      continue;
    }
    if (got !== expectedAction) {
      issues.push(
        makeIssue({
          code: "behavior_case_action_mismatch",
          severity: "error",
          message: `behavior case ${caseId} expected action=${expectedAction} got=${got}`,
          filePath: input.filePath,
          bankId: input.bankId,
        }),
      );
    }
  }

  return issues;
}

function uiContractBehaviorIssuesForCases(input: {
  bank: PolicyBankContract;
  filePath: string;
  bankId: string;
}): PolicyValidationIssue[] {
  if (input.bankId !== "ui_contracts") return [];
  const rows = collectCaseRows(input.bank);
  if (rows.length < 1) return [];
  const interpreter = new UiContractInterpreterService();
  const issues: PolicyValidationIssue[] = [];

  for (const row of rows) {
    const rowObj = asObject(row);
    const caseId = asTrimmed(rowObj.id) || "unknown_case";
    const expectObj = asObject(rowObj.expect);
    const context = asObject(rowObj.context);
    const runtime = runtimeFromCase(row) || {};
    const merged = { ...runtime, ...context };
    const answerMode = asTrimmed((merged as Record<string, unknown>).answerMode);
    const decision = interpreter.resolve({
      bank: input.bank as any,
      answerMode: answerMode || "general_answer",
      language: normalizeUiLanguage(
        (merged as Record<string, unknown>).language || rowObj.language,
      ),
      signals: asObject((merged as Record<string, unknown>).signals),
      metrics: asObject((merged as Record<string, unknown>).metrics),
      content: asCaseInputText(rowObj.input),
    });

    if (typeof expectObj.blocked === "boolean") {
      const expectedBlocked = expectObj.blocked === true;
      if (decision.shouldHardBlock !== expectedBlocked) {
        issues.push(
          makeIssue({
            code: "behavior_case_block_mismatch",
            severity: "error",
            message: `behavior case ${caseId} expected blocked=${expectedBlocked} got=${decision.shouldHardBlock}`,
            filePath: input.filePath,
            bankId: input.bankId,
          }),
        );
      }
    }
    if (typeof expectObj.actionLanguageSuppressed === "boolean") {
      const expectedSuppressed = expectObj.actionLanguageSuppressed === true;
      if (decision.suppressActionLanguage !== expectedSuppressed) {
        issues.push(
          makeIssue({
            code: "behavior_case_action_language_mismatch",
            severity: "error",
            message: `behavior case ${caseId} expected actionLanguageSuppressed=${expectedSuppressed} got=${decision.suppressActionLanguage}`,
            filePath: input.filePath,
            bankId: input.bankId,
          }),
        );
      }
    }
    const expectedIntroMax = toInt(expectObj.maxIntroSentences);
    if (expectedIntroMax != null) {
      if (decision.navPills.maxIntroSentences !== expectedIntroMax) {
        issues.push(
          makeIssue({
            code: "behavior_case_nav_intro_sentences_mismatch",
            severity: "error",
            message: `behavior case ${caseId} expected maxIntroSentences=${expectedIntroMax} got=${decision.navPills.maxIntroSentences}`,
            filePath: input.filePath,
            bankId: input.bankId,
          }),
        );
      }
    }
    if (Array.isArray(expectObj.allowedOutputShapes)) {
      const expectedShapes = expectObj.allowedOutputShapes
        .map((value) => asTrimmed(value).toLowerCase())
        .filter(Boolean);
      if (expectedShapes.length > 0) {
        const actual = new Set(
          decision.navPills.allowedOutputShapes.map((value) =>
            asTrimmed(value).toLowerCase(),
          ),
        );
        const missing = expectedShapes.filter((value) => !actual.has(value));
        if (missing.length > 0) {
          issues.push(
            makeIssue({
              code: "behavior_case_allowed_output_shapes_mismatch",
              severity: "error",
              message: `behavior case ${caseId} missing allowedOutputShapes=${missing.join(",")}`,
              filePath: input.filePath,
              bankId: input.bankId,
            }),
          );
        }
      }
    }
  }
  return issues;
}

function uiContractSchemaIntegrityIssues(input: {
  bank: PolicyBankContract;
  filePath: string;
  bankId: string;
}): PolicyValidationIssue[] {
  if (input.bankId !== "ui_contracts") return [];
  const issues: PolicyValidationIssue[] = [];
  const config = asObject(input.bank.config);
  const configContracts = asObject(config.contracts);
  const legacyContracts = asObject((input.bank as Record<string, unknown>).contracts);
  const hasConfigContracts = Object.keys(configContracts).length > 0;
  const hasLegacyContracts = Object.keys(legacyContracts).length > 0;

  if (!hasConfigContracts && hasLegacyContracts) {
    issues.push(
      makeIssue({
        code: "ui_contracts_legacy_contracts_path",
        severity: "error",
        message:
          "ui_contracts must use config.contracts; legacy top-level contracts path is not allowed",
        filePath: input.filePath,
        bankId: input.bankId,
      }),
    );
  }
  if (hasConfigContracts && hasLegacyContracts) {
    issues.push(
      makeIssue({
        code: "ui_contracts_duplicate_contract_paths",
        severity: "error",
        message:
          "ui_contracts contains both config.contracts and legacy contracts path; keep only config.contracts",
        filePath: input.filePath,
        bankId: input.bankId,
      }),
    );
  }
  if (!hasConfigContracts) {
    issues.push(
      makeIssue({
        code: "ui_contracts_missing_config_contracts",
        severity: "error",
        message: "ui_contracts config.contracts is required",
        filePath: input.filePath,
        bankId: input.bankId,
      }),
    );
    return issues;
  }

  const allowedContractKeys = new Set([
    "maxIntroSentences",
    "maxIntroChars",
    "noSourcesHeader",
    "noInlineCitations",
    "disallowedTextPatterns",
    "allowedOutputShapes",
    "allowedAttachments",
    "disallowedAttachments",
    "suppressActions",
  ]);
  for (const [contractId, contractValue] of Object.entries(configContracts)) {
    const contract = asObject(contractValue);
    for (const key of Object.keys(contract)) {
      if (allowedContractKeys.has(key)) continue;
      issues.push(
        makeIssue({
          code: "ui_contracts_decorative_contract_field",
          severity: "error",
          message: `ui_contracts contract ${contractId} has unsupported decorative field: ${key}`,
          filePath: input.filePath,
          bankId: input.bankId,
        }),
      );
    }
  }

  return issues;
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
    const cwd = process.cwd();
    for (const relativePath of POLICY_AUX_FILES) {
      const candidate = path.join(cwd, relativePath);
      if (fs.existsSync(candidate)) out.add(candidate);
    }
    return [...out].sort((a, b) => a.localeCompare(b));
  }

  validateFile(filePath: string): PolicyValidationResult {
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

    const parsedLastUpdated = parseDateValue(meta.lastUpdated);
    if (asTrimmed(meta.lastUpdated) && !parsedLastUpdated) {
      issues.push(
        makeIssue({
          code: "meta_invalid_lastUpdated",
          severity: "error",
          message: "_meta.lastUpdated must be a valid date string",
          filePath,
          bankId,
        }),
      );
    }
    const reviewCadenceDays = toInt(meta.reviewCadenceDays);
    const staleGraceDays = Math.max(
      0,
      toInt(process.env.POLICY_REVIEW_STALE_GRACE_DAYS) || 0,
    );
    if (
      parsedLastUpdated &&
      reviewCadenceDays != null &&
      reviewCadenceDays > 0
    ) {
      const ageDays = elapsedDaysSince(parsedLastUpdated);
      if (ageDays > reviewCadenceDays + staleGraceDays) {
        issues.push(
          makeIssue({
            code: "meta_review_stale",
            severity:
              criticality === "critical" || criticality === "high"
                ? "error"
                : "warning",
            message: `policy review stale by ${ageDays - reviewCadenceDays} day(s): lastUpdated=${asTrimmed(meta.lastUpdated)} reviewCadenceDays=${reviewCadenceDays}`,
            filePath,
            bankId,
          }),
        );
      }
    }

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

    const configModeOnly = config.configModeOnly === true;
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

    issues.push(
      ...behavioralIssuesForCases({
        bank,
        filePath,
        bankId,
      }),
    );
    issues.push(
      ...uiContractBehaviorIssuesForCases({
        bank,
        filePath,
        bankId,
      }),
    );
    issues.push(
      ...uiContractSchemaIntegrityIssues({
        bank,
        filePath,
        bankId,
      }),
    );

    return {
      bankId,
      filePath,
      ok: !issues.some((issue) => issue.severity === "error"),
      criticality,
      issues,
      ruleCount,
      testCaseCount,
    };
  }

  validateAll(): PolicyCertificationReport {
    const files = this.listPolicyFiles();
    const results = files.map((filePath) => this.validateFile(filePath));
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
