/* eslint-disable @typescript-eslint/no-explicit-any */

import * as fs from "fs";
import * as path from "path";

import { getOptionalBank } from "./bankLoader.service";

export interface RuntimeWiringIntegrityResult {
  ok: boolean;
  missingBanks: string[];
  missingOperatorContracts: string[];
  missingOperatorOutputShapes: string[];
  missingEditingCatalogOperators: string[];
  missingEditingCapabilities: string[];
  unreachablePromptSelectionRules: string[];
  legacyChatRuntimeImports: string[];
  dormantCoreRoutingImports: string[];
  turnRoutePolicyDynamicFallback: string[];
  hardcodedRuntimeHeuristics: string[];
  rawConsoleRuntimeUsage: string[];
  memoryDelegateDirectInstantiation: string[];
  memoryRawPersistencePatterns: string[];
  memoryPolicyHookEngineMissing: string[];
}

function asTrimmedString(value: unknown): string {
  return String(value || "").trim();
}

function normalizeLower(value: unknown): string {
  return asTrimmedString(value).toLowerCase();
}

function normalizeUpper(value: unknown): string {
  return asTrimmedString(value).toUpperCase();
}

function collectOperatorIdsFromIntentConfig(bank: any): Set<string> {
  const out = new Set<string>();
  const families = Array.isArray(bank?.intentFamilies)
    ? bank.intentFamilies
    : [];
  for (const family of families) {
    const allowed = Array.isArray(family?.operatorsAllowed)
      ? family.operatorsAllowed
      : [];
    for (const op of allowed) {
      const id = normalizeLower(op);
      if (id) out.add(id);
    }
  }
  return out;
}

function collectOperatorIdsFromOperatorFamilies(bank: any): Set<string> {
  const out = new Set<string>();
  const families = Array.isArray(bank?.families) ? bank.families : [];
  for (const family of families) {
    const ops = Array.isArray(family?.operators) ? family.operators : [];
    for (const op of ops) {
      const id = normalizeLower(op);
      if (id) out.add(id);
    }
  }
  return out;
}

function collectOperatorIdsFromIntentPatterns(bank: any): Set<string> {
  const out = new Set<string>();
  const patterns = Array.isArray(bank?.patterns) ? bank.patterns : [];
  for (const pattern of patterns) {
    const op = normalizeLower(pattern?.operator);
    if (op) out.add(op);
  }
  return out;
}

function collectContractOperatorIds(bank: any): Set<string> {
  const out = new Set<string>();
  const operators = bank?.operators;
  if (Array.isArray(operators)) {
    for (const entry of operators) {
      const id = normalizeLower(entry?.id);
      if (id) out.add(id);
    }
    return out;
  }
  if (operators && typeof operators === "object") {
    for (const id of Object.keys(operators)) {
      const norm = normalizeLower(id);
      if (norm) out.add(norm);
    }
  }
  return out;
}

function collectOutputShapeOperatorIds(bank: any): Set<string> {
  const out = new Set<string>();
  const mapping =
    bank?.mapping && typeof bank.mapping === "object" ? bank.mapping : {};
  const operators =
    bank?.operators && typeof bank.operators === "object" ? bank.operators : {};
  for (const id of Object.keys(mapping)) {
    const norm = normalizeLower(id);
    if (norm) out.add(norm);
  }
  for (const id of Object.keys(operators)) {
    const norm = normalizeLower(id);
    if (norm) out.add(norm);
  }
  return out;
}

function collectEditingOpsFromPatternBank(bank: any): Set<string> {
  const out = new Set<string>();
  const patterns = Array.isArray(bank?.patterns) ? bank.patterns : [];
  for (const pattern of patterns) {
    const operator = normalizeUpper(pattern?.operator);
    if (operator) out.add(operator);
    const planTemplate = Array.isArray(pattern?.planTemplate)
      ? pattern.planTemplate
      : [];
    for (const step of planTemplate) {
      const op = normalizeUpper(step?.op);
      if (op) out.add(op);
    }
  }
  return out;
}

function collectPromptRegistryUnreachableRules(promptRegistry: any): string[] {
  const rules = Array.isArray(promptRegistry?.selectionRules?.rules)
    ? promptRegistry.selectionRules.rules
    : [];
  const unreachable: string[] = [];
  let sawCatchAll = false;
  for (const rule of rules) {
    const id = asTrimmedString(rule?.id) || "rule";
    if (sawCatchAll) unreachable.push(id);
    if (rule?.when?.any === true) sawCatchAll = true;
  }
  return unreachable;
}

function collectLegacyChatRuntimeImports(): string[] {
  const candidatePaths = [
    path.join(
      process.cwd(),
      "src/modules/chat/application/chat-runtime.service.ts",
    ),
    path.join(
      process.cwd(),
      "backend/src/modules/chat/application/chat-runtime.service.ts",
    ),
  ];

  const failures: string[] = [];
  for (const filePath of candidatePaths) {
    if (!fs.existsSync(filePath)) continue;
    try {
      const src = fs.readFileSync(filePath, "utf8");
      if (/\bchatRuntime\.legacy\.service\b/.test(src)) {
        failures.push(filePath);
      }
    } catch {
      failures.push(filePath);
    }
  }
  return failures;
}

function collectDormantCoreRoutingImports(): string[] {
  const candidatePaths = [
    path.join(process.cwd(), "src/services/prismaChat.service.ts"),
    path.join(process.cwd(), "backend/src/services/prismaChat.service.ts"),
    path.join(process.cwd(), "src/services/chat/chatKernel.service.ts"),
    path.join(process.cwd(), "backend/src/services/chat/chatKernel.service.ts"),
    path.join(
      process.cwd(),
      "src/modules/chat/application/chat-runtime.service.ts",
    ),
    path.join(
      process.cwd(),
      "backend/src/modules/chat/application/chat-runtime.service.ts",
    ),
    path.join(process.cwd(), "src/services/chat/turnRouter.service.ts"),
    path.join(process.cwd(), "backend/src/services/chat/turnRouter.service.ts"),
  ];

  const failures: string[] = [];
  for (const filePath of candidatePaths) {
    if (!fs.existsSync(filePath)) continue;
    try {
      const src = fs.readFileSync(filePath, "utf8");
      if (/\bservices\/core\/routing\//.test(src)) {
        failures.push(filePath);
      }
    } catch {
      failures.push(filePath);
    }
  }
  return failures;
}

function collectTurnRoutePolicyDynamicFallback(): string[] {
  const candidatePaths = [
    path.join(process.cwd(), "src/services/chat/turnRoutePolicy.service.ts"),
    path.join(
      process.cwd(),
      "backend/src/services/chat/turnRoutePolicy.service.ts",
    ),
  ];

  const failures: string[] = [];
  for (const filePath of candidatePaths) {
    if (!fs.existsSync(filePath)) continue;
    try {
      const src = fs.readFileSync(filePath, "utf8");
      if (
        /\bloadRoutingBankFallback\b|\brequire\(|path\.resolve\(process\.cwd\(\),\s*["'](?:src|backend\/src)\/data_banks/.test(
          src,
        )
      ) {
        failures.push(filePath);
      }
    } catch {
      failures.push(filePath);
    }
  }
  return failures;
}

function collectHardcodedRuntimeHeuristics(): string[] {
  const candidatePaths = [
    path.join(
      process.cwd(),
      "backend/src/modules/chat/runtime/ChatRuntimeOrchestrator.ts",
    ),
    path.join(process.cwd(), "backend/src/modules/chat/runtime/ScopeService.ts"),
    path.join(
      process.cwd(),
      "backend/src/services/core/retrieval/evidenceGate.service.ts",
    ),
    path.join(
      process.cwd(),
      "backend/src/services/chat/guardrails/editorMode.guard.ts",
    ),
  ];

  const suspectPatterns = [
    /\bFILE_EXT_RE\b/,
    /\bDOC_REF_PHRASES_RE\b/,
    /\bMAX_SCOPE_DOCS\b/,
    /\bEXPLICIT_CONNECTOR_PATTERN\b/,
    /\bFACT_REQUIRING_PATTERNS\b/,
    /\bNARRATIVE_RISK_PATTERNS\b/,
    /\bEVIDENCE_KEYWORDS\b/,
  ];

  const failures: string[] = [];
  for (const filePath of candidatePaths) {
    if (!fs.existsSync(filePath)) continue;
    try {
      const src = fs.readFileSync(filePath, "utf8");
      if (suspectPatterns.some((pattern) => pattern.test(src))) {
        failures.push(filePath);
      }
    } catch {
      failures.push(filePath);
    }
  }
  return failures;
}

function collectRawConsoleRuntimeUsage(): string[] {
  const candidatePaths = [
    path.join(
      process.cwd(),
      "backend/src/modules/chat/runtime/ChatRuntimeOrchestrator.ts",
    ),
    path.join(
      process.cwd(),
      "backend/src/modules/chat/runtime/CentralizedChatRuntimeDelegate.ts",
    ),
    path.join(
      process.cwd(),
      "backend/src/services/preview/previewOrchestrator.service.ts",
    ),
    path.join(
      process.cwd(),
      "backend/src/services/creative/creativeOrchestrator.service.ts",
    ),
  ];
  const failures: string[] = [];
  for (const filePath of candidatePaths) {
    if (!fs.existsSync(filePath)) continue;
    try {
      const src = fs.readFileSync(filePath, "utf8");
      if (/console\.(log|warn|error|info|debug)\(/.test(src)) {
        failures.push(filePath);
      }
    } catch {
      failures.push(filePath);
    }
  }
  return failures;
}

function collectMemoryDelegateDirectInstantiation(): string[] {
  const candidatePaths = [
    path.join(
      process.cwd(),
      "backend/src/modules/chat/runtime/CentralizedChatRuntimeDelegate.ts",
    ),
    path.join(
      process.cwd(),
      "src/modules/chat/runtime/CentralizedChatRuntimeDelegate.ts",
    ),
  ];
  const failures: string[] = [];
  for (const filePath of candidatePaths) {
    if (!fs.existsSync(filePath)) continue;
    try {
      const src = fs.readFileSync(filePath, "utf8");
      if (/\bnew ConversationMemoryService\(/.test(src)) {
        failures.push(filePath);
      }
    } catch {
      failures.push(filePath);
    }
  }
  return failures;
}

function collectMemoryRawPersistencePatterns(): string[] {
  const candidatePaths = [
    path.join(
      process.cwd(),
      "backend/src/modules/chat/runtime/CentralizedChatRuntimeDelegate.ts",
    ),
    path.join(
      process.cwd(),
      "src/modules/chat/runtime/CentralizedChatRuntimeDelegate.ts",
    ),
  ];
  const failures: string[] = [];
  for (const filePath of candidatePaths) {
    if (!fs.existsSync(filePath)) continue;
    try {
      const src = fs.readFileSync(filePath, "utf8");
      if (
        /content:\s*sanitizeSnippet\(input\.content|summary:\s*summary\b|summary:\s*nextConversationSummary\b/.test(
          src,
        )
      ) {
        failures.push(filePath);
      }
    } catch {
      failures.push(filePath);
    }
  }
  return failures;
}

function collectMemoryPolicyHookEngineMissing(): string[] {
  const candidatePaths = [
    path.join(process.cwd(), "backend/src/services/memory/memoryPolicyEngine.service.ts"),
    path.join(process.cwd(), "src/services/memory/memoryPolicyEngine.service.ts"),
  ];
  const failures: string[] = [];
  for (const filePath of candidatePaths) {
    if (!fs.existsSync(filePath)) {
      failures.push(filePath);
      continue;
    }
    try {
      const src = fs.readFileSync(filePath, "utf8");
      if (
        !/integrationHooks/.test(src) ||
        !/memory_policy integration hook banks missing/.test(src)
      ) {
        failures.push(filePath);
      }
    } catch {
      failures.push(filePath);
    }
  }
  return failures;
}

export class RuntimeWiringIntegrityService {
  validate(): RuntimeWiringIntegrityResult {
    const requiredBanks = [
      "intent_config",
      "intent_patterns",
      "operator_families",
      "operator_contracts",
      "operator_output_shapes",
      "prompt_registry",
      "language_triggers",
      "processing_messages",
      "edit_error_catalog",
      "operator_catalog",
      "allybi_capabilities",
      "intent_patterns_docx_en",
      "intent_patterns_docx_pt",
      "intent_patterns_excel_en",
      "intent_patterns_excel_pt",
    ];

    const missingBanks = requiredBanks.filter((id) => !getOptionalBank(id));

    const intentConfig = getOptionalBank<any>("intent_config");
    const operatorFamilies = getOptionalBank<any>("operator_families");
    const intentPatterns = getOptionalBank<any>("intent_patterns");
    const operatorContracts = getOptionalBank<any>("operator_contracts");
    const operatorOutputShapes = getOptionalBank<any>("operator_output_shapes");
    const promptRegistry = getOptionalBank<any>("prompt_registry");

    const routingOps = new Set<string>([
      ...collectOperatorIdsFromIntentConfig(intentConfig),
      ...collectOperatorIdsFromOperatorFamilies(operatorFamilies),
      ...collectOperatorIdsFromIntentPatterns(intentPatterns),
    ]);

    const contractOps = collectContractOperatorIds(operatorContracts);
    const outputShapeOps = collectOutputShapeOperatorIds(operatorOutputShapes);

    const missingOperatorContracts = Array.from(routingOps).filter(
      (op) => !contractOps.has(op),
    );
    const missingOperatorOutputShapes = Array.from(routingOps).filter(
      (op) => !outputShapeOps.has(op),
    );

    const operatorCatalog = getOptionalBank<any>("operator_catalog");
    const allybiCapabilities = getOptionalBank<any>("allybi_capabilities");
    const catalogOperators = new Set<string>(
      Object.keys(operatorCatalog?.operators || {}).map(normalizeUpper),
    );
    const capabilityOperators = new Set<string>(
      Object.keys(allybiCapabilities?.operators || {}).map(normalizeUpper),
    );

    const editingPatternBanks = [
      getOptionalBank<any>("intent_patterns_docx_en"),
      getOptionalBank<any>("intent_patterns_docx_pt"),
      getOptionalBank<any>("intent_patterns_excel_en"),
      getOptionalBank<any>("intent_patterns_excel_pt"),
    ];
    const editingOps = new Set<string>();
    for (const bank of editingPatternBanks) {
      for (const op of collectEditingOpsFromPatternBank(bank)) {
        editingOps.add(op);
      }
    }

    const missingEditingCatalogOperators = Array.from(editingOps).filter(
      (op) => !catalogOperators.has(op),
    );
    const missingEditingCapabilities = Array.from(editingOps).filter(
      (op) => !capabilityOperators.has(op),
    );

    const unreachablePromptSelectionRules =
      collectPromptRegistryUnreachableRules(promptRegistry);
    const legacyChatRuntimeImports = collectLegacyChatRuntimeImports();
    const dormantCoreRoutingImports = collectDormantCoreRoutingImports();
    const turnRoutePolicyDynamicFallback =
      collectTurnRoutePolicyDynamicFallback();
    const hardcodedRuntimeHeuristics = collectHardcodedRuntimeHeuristics();
    const rawConsoleRuntimeUsage = collectRawConsoleRuntimeUsage();
    const memoryDelegateDirectInstantiation =
      collectMemoryDelegateDirectInstantiation();
    const memoryRawPersistencePatterns = collectMemoryRawPersistencePatterns();
    const memoryPolicyHookEngineMissing =
      collectMemoryPolicyHookEngineMissing();

    return {
      ok:
        missingBanks.length === 0 &&
        missingOperatorContracts.length === 0 &&
        missingOperatorOutputShapes.length === 0 &&
        missingEditingCatalogOperators.length === 0 &&
        missingEditingCapabilities.length === 0 &&
        unreachablePromptSelectionRules.length === 0 &&
        legacyChatRuntimeImports.length === 0 &&
        dormantCoreRoutingImports.length === 0 &&
        turnRoutePolicyDynamicFallback.length === 0 &&
        hardcodedRuntimeHeuristics.length === 0 &&
        rawConsoleRuntimeUsage.length === 0 &&
        memoryDelegateDirectInstantiation.length === 0 &&
        memoryRawPersistencePatterns.length === 0 &&
        memoryPolicyHookEngineMissing.length === 0,
      missingBanks,
      missingOperatorContracts,
      missingOperatorOutputShapes,
      missingEditingCatalogOperators,
      missingEditingCapabilities,
      unreachablePromptSelectionRules,
      legacyChatRuntimeImports,
      dormantCoreRoutingImports,
      turnRoutePolicyDynamicFallback,
      hardcodedRuntimeHeuristics,
      rawConsoleRuntimeUsage,
      memoryDelegateDirectInstantiation,
      memoryRawPersistencePatterns,
      memoryPolicyHookEngineMissing,
    };
  }
}
