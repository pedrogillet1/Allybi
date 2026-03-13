import * as fs from "fs";
import * as path from "path";

import { getOptionalBank } from "./bankLoader.service";
import {
  CHAT_ANSWER_MODES,
  COMPOSE_ANSWER_TEMPLATE_MODES,
  RETRIEVAL_ANSWER_MODES,
} from "../../../modules/chat/domain/answerModes";

export interface RuntimeWiringIntegrityResult {
  ok: boolean;
  missingBanks: string[];
  missingLlmRoutingPolicyBanks: string[];
  missingRuntimePolicyConsumers: string[];
  runtimePolicyEnvGaps: string[];
  missingOperatorContracts: string[];
  missingOperatorOutputShapes: string[];
  missingEditingCatalogOperators: string[];
  missingEditingCapabilities: string[];
  invalidPromptLayers: string[];
  invalidPromptTemplateOutputModes: string[];
  missingBuilderPolicyBank: string[];
  invalidBuilderPolicy: string[];
  legacyChatRuntimeImports: string[];
  dormantCoreRoutingImports: string[];
  turnRoutePolicyDynamicFallback: string[];
  hardcodedRuntimeHeuristics: string[];
  rawConsoleRuntimeUsage: string[];
  memoryDelegateDirectInstantiation: string[];
  memoryRawPersistencePatterns: string[];
  memoryPolicyHookEngineMissing: string[];
  dormantIntentConfigUsage: string[];
  composeAnswerModeTemplateGaps: string[];
  answerModeContractDrift: string[];
  productHelpRuntimeUsageMissing: string[];
}

export const RUNTIME_REQUIRED_BANKS = [
  "intent_config",
  "intent_patterns",
  "operator_families",
  "operator_contracts",
  "operator_output_shapes",
  "operator_collision_matrix",
  "render_policy",
  "answer_style_policy",
  "truncation_and_limits",
  "banned_phrases",
  "bullet_rules",
  "table_rules",
  "bolding_rules",
  "list_styles",
  "table_styles",
  "quote_styles",
  "citation_styles",
  "prompt_registry",
  "language_triggers",
  "processing_messages",
  "no_docs_messages",
  "scoped_not_found_messages",
  "disambiguation_microcopy",
  "edit_error_catalog",
  "operator_catalog",
  "allybi_capabilities",
  "intent_patterns_docx_en",
  "intent_patterns_docx_pt",
  "intent_patterns_excel_en",
  "intent_patterns_excel_pt",
  "document_intelligence_bank_map",
  "task_answer_with_sources",
  "task_plan_generation",
  "editing_task_prompts",
  "llm_builder_policy",
  "fallback_prompt",
  "fallback_router",
  "fallback_processing",
  "fallback_scope_empty",
  "fallback_not_found_scope",
  "fallback_extraction_recovery",
  "koda_product_help",
  "doc_grounding_checks",
  "hallucination_guards",
  "dedupe_and_repetition",
  "privacy_minimal_rules",
  "pii_field_labels",
  "clarification_policy",
  "compliance_policy",
  "logging_policy",
  "rate_limit_policy",
  "refusal_policy",
  "provider_capabilities",
  "provider_fallbacks",
  "llm_cost_table",
  "composition_lane_policy",
] as const;

export const RUNTIME_REQUIRED_LLM_ROUTING_BANKS = [
  "provider_capabilities",
  "provider_fallbacks",
  "llm_cost_table",
  "composition_lane_policy",
] as const;

export const RUNTIME_REQUIRED_POLICIES = [
  "clarification_policy",
  "compliance_policy",
  "logging_policy",
  "rate_limit_policy",
  "refusal_policy",
  "fallback_policy",
  "editing_policy",
  "editing_agent_policy",
  "viewer_locked_chat_policy",
  "memory_policy",
  "orchestrator_certification",
  "llm_builder_policy",
  "assumption_policy",
  "access_control_policy",
  "incident_response_policy",
  "data_retention_deletion_policy",
  "secrets_rotation_policy",
  "model_release_policy",
  "policy_exceptions_policy",
] as const;

const RUNTIME_POLICY_CONSUMER_MARKERS: Record<string, string[]> = {
  clarification_policy: ["ClarificationPolicyService"],
  compliance_policy: ["CompliancePolicyService"],
  logging_policy: ["LoggingPolicyService"],
  rate_limit_policy: ["rate_limit_policy"],
  refusal_policy: ["RefusalPolicyService"],
  fallback_policy: ["FallbackDecisionPolicyService"],
  editing_policy: ["EditingPolicyService"],
  editing_agent_policy: ["editing_agent_policy"],
  viewer_locked_chat_policy: ["ViewerLockedChatPolicyService"],
  memory_policy: ["memory_policy"],
  orchestrator_certification: ["orchestrator_certification"],
  llm_builder_policy: ["llm_builder_policy"],
  assumption_policy: ["assumption_policy"],
  access_control_policy: ["GovernanceRuntimePolicyService"],
  incident_response_policy: ["GovernanceRuntimePolicyService"],
  data_retention_deletion_policy: ["GovernanceRuntimePolicyService"],
  secrets_rotation_policy: ["GovernanceRuntimePolicyService"],
  model_release_policy: ["GovernanceRuntimePolicyService"],
  policy_exceptions_policy: ["GovernanceRuntimePolicyService"],
};

function collectRenderPolicyHookBankIds(bank: Record<string, unknown> | null): string[] {
  const config = bank?.config as Record<string, unknown> | undefined;
  const hooks = config?.integrationHooks;
  if (!hooks || typeof hooks !== "object") return [];
  const ids = new Set<string>();
  for (const value of Object.values(hooks)) {
    const id = asTrimmedString(value);
    if (id) ids.add(id);
  }
  return Array.from(ids);
}

function asTrimmedString(value: unknown): string {
  return String(value || "").trim();
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function normalizeLower(value: unknown): string {
  return asTrimmedString(value).toLowerCase();
}

function normalizeUpper(value: unknown): string {
  return asTrimmedString(value).toUpperCase();
}

function collectOperatorIdsFromIntentConfig(bank: Record<string, unknown> | null): Set<string> {
  const out = new Set<string>();
  const families = Array.isArray(bank?.intentFamilies)
    ? (bank.intentFamilies as Array<Record<string, unknown>>)
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

function collectOperatorIdsFromOperatorFamilies(bank: Record<string, unknown> | null): Set<string> {
  const out = new Set<string>();
  const families = Array.isArray(bank?.families) ? (bank.families as Array<Record<string, unknown>>) : [];
  for (const family of families) {
    const ops = Array.isArray(family?.operators) ? family.operators : [];
    for (const op of ops) {
      const id = normalizeLower(op);
      if (id) out.add(id);
    }
  }
  return out;
}

function collectOperatorIdsFromIntentPatterns(bank: Record<string, unknown> | null): Set<string> {
  const out = new Set<string>();
  const patterns = Array.isArray(bank?.patterns) ? (bank.patterns as Array<Record<string, unknown>>) : [];
  for (const pattern of patterns) {
    const op = normalizeLower(pattern?.operator);
    if (op) out.add(op);
  }
  return out;
}

function collectContractOperatorIds(bank: Record<string, unknown> | null): Set<string> {
  const out = new Set<string>();
  const operators = bank?.operators as unknown;
  if (Array.isArray(operators)) {
    for (const entry of operators) {
      const id = normalizeLower((entry as Record<string, unknown>)?.id);
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

function collectOutputShapeOperatorIds(bank: Record<string, unknown> | null): Set<string> {
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

function collectEditingOpsFromPatternBank(bank: Record<string, unknown> | null): Set<string> {
  const out = new Set<string>();
  const patterns = Array.isArray(bank?.patterns) ? (bank.patterns as Array<Record<string, unknown>>) : [];
  for (const pattern of patterns) {
    const operator = normalizeUpper(pattern?.operator);
    if (operator) out.add(operator);
    const planTemplate = Array.isArray(pattern?.planTemplate)
      ? (pattern.planTemplate as Array<Record<string, unknown>>)
      : [];
    for (const step of planTemplate) {
      const op = normalizeUpper(step?.op);
      if (op) out.add(op);
    }
  }
  return out;
}

function collectPromptRegistryInvalidLayers(promptRegistry: Record<string, unknown> | null): string[] {
  const layers =
    promptRegistry?.layersByKind && typeof promptRegistry.layersByKind === "object"
      ? (promptRegistry.layersByKind as Record<string, unknown>)
      : null;
  if (!layers) return [];

  const promptFiles = Array.isArray(promptRegistry?.promptFiles)
    ? promptRegistry.promptFiles
    : [];
  const knownPromptIds = new Set<string>(
    promptFiles
      .map((row: unknown) => asTrimmedString((row as Record<string, unknown>)?.id))
      .filter((id: string) => id.length > 0),
  );

  const failures: string[] = [];
  for (const [kind, rawIds] of Object.entries(layers)) {
    if (!Array.isArray(rawIds)) {
      failures.push(`invalid_layer_shape:${kind}`);
      continue;
    }
    const seen = new Set<string>();
    for (const rawId of rawIds) {
      const id = asTrimmedString(rawId);
      if (!id) {
        failures.push(`empty_layer_id:${kind}`);
        continue;
      }
      if (seen.has(id)) {
        failures.push(`duplicate_layer_id:${kind}:${id}`);
        continue;
      }
      seen.add(id);
      if (knownPromptIds.size > 0 && !knownPromptIds.has(id)) {
        failures.push(`unknown_layer_id:${kind}:${id}`);
      }
    }
  }

  return failures;
}

function collectPromptTemplateOutputModeIssues(
  bank: Record<string, unknown> | null,
  bankId: string,
): string[] {
  if (!bank || typeof bank !== "object") return [];
  const templates = Array.isArray(bank.templates) ? (bank.templates as Array<Record<string, unknown>>) : [];
  const failures: string[] = [];
  const allowedModes = new Set(["machine_json", "user_text"]);
  for (const template of templates) {
    const templateId = asTrimmedString(template?.id) || "template";
    const outputMode = normalizeLower(template?.outputMode);
    if (!outputMode) {
      failures.push(`missing_output_mode:${bankId}:${templateId}`);
      continue;
    }
    if (!allowedModes.has(outputMode)) {
      failures.push(`invalid_output_mode:${bankId}:${templateId}:${outputMode}`);
    }
    if (bankId === "task_plan_generation" && outputMode !== "machine_json") {
      failures.push(`planner_requires_machine_json:${bankId}:${templateId}`);
    }
  }
  return failures;
}

function collectBuilderPolicyIssues(policyBank: Record<string, unknown> | null): string[] {
  if (!policyBank || typeof policyBank !== "object") {
    return ["missing_llm_builder_policy_bank"];
  }
  const config =
    policyBank.config && typeof policyBank.config === "object"
      ? (policyBank.config as Record<string, unknown>)
      : null;
  if (!config) return ["invalid_llm_builder_policy_config_shape"];

  const failures: string[] = [];
  const floors = config.docGroundedMinOutputTokensByMode;
  if (!floors || typeof floors !== "object" || Array.isArray(floors)) {
    failures.push("invalid_doc_grounded_min_output_tokens_by_mode");
  }
  const styleClampModes = config.styleClampModes;
  if (!Array.isArray(styleClampModes) || styleClampModes.length === 0) {
    failures.push("invalid_style_clamp_modes");
  }
  const payloadCaps = config.payloadCaps;
  if (!payloadCaps || typeof payloadCaps !== "object" || Array.isArray(payloadCaps)) {
    failures.push("invalid_payload_caps");
  } else {
    const keys = [
      "memoryCharsDefault",
      "memoryCharsDocGrounded",
      "userSectionCharsMax",
      "toolContextCharsMax",
      "totalUserPayloadCharsMax",
    ];
    for (const key of keys) {
      const value = Number((payloadCaps as Record<string, unknown>)[key]);
      if (!Number.isFinite(value) || value <= 0) {
        failures.push(`invalid_payload_cap:${key}`);
      }
    }
  }
  const evidenceCaps = config.evidenceCapsByMode;
  if (!evidenceCaps || typeof evidenceCaps !== "object" || Array.isArray(evidenceCaps)) {
    failures.push("invalid_evidence_caps_by_mode");
  }
  return failures;
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
    path.join(
      process.cwd(),
      "backend/src/modules/chat/runtime/ScopeService.ts",
    ),
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

function resolveRuntimePathCandidates(paths: string[]): string[] {
  const cwd = process.cwd();
  const cwdBase = path.basename(cwd).toLowerCase();
  const roots =
    cwdBase === "backend"
      ? [cwd, path.dirname(cwd)]
      : [cwd, path.join(cwd, "backend")];
  const resolved = new Set<string>();
  for (const rawPath of paths) {
    const normalized = asTrimmedString(rawPath).replace(/\\/g, "/");
    if (!normalized) continue;
    if (path.isAbsolute(normalized)) {
      resolved.add(normalized);
      continue;
    }
    if (normalized.startsWith("backend/")) {
      const relativeToBackend = normalized.slice("backend/".length);
      for (const root of roots) {
        if (path.basename(root).toLowerCase() === "backend") {
          resolved.add(path.join(root, relativeToBackend));
        } else {
          resolved.add(path.join(root, normalized));
        }
      }
      continue;
    }
    for (const root of roots) {
      resolved.add(path.join(root, normalized));
    }
  }
  return Array.from(resolved);
}

function collectRawConsoleRuntimeUsage(): string[] {
  const defaultCandidatePaths = [
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
  const loggingPolicy = getOptionalBank<Record<string, unknown>>("logging_policy");
  const loggingConfig = asRecord(loggingPolicy?.config);
  const policyEnabled = loggingConfig.enabled !== false;
  const policyPaths = Array.isArray(loggingConfig.runtimePathsNoRawConsole)
    ? loggingConfig.runtimePathsNoRawConsole
        .map((value: unknown) => asTrimmedString(value))
        .filter(Boolean)
    : [];
  const candidatePaths =
    policyEnabled && policyPaths.length > 0
      ? resolveRuntimePathCandidates(policyPaths)
      : defaultCandidatePaths;

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
  const candidatePaths = resolveRuntimePathCandidates([
    "backend/src/services/memory/memoryPolicyEngine.service.ts",
    "src/services/memory/memoryPolicyEngine.service.ts",
  ]).map((candidate) => candidate.replace(/\\/g, "/"));
  const failures: string[] = [];
  const existingCandidates: string[] = [];
  for (const filePath of candidatePaths) {
    if (!fs.existsSync(filePath)) {
      continue;
    }
    existingCandidates.push(filePath);
    try {
      const src = String(fs.readFileSync(filePath, "utf8") || "");
      if (
        !/integrationHooks/.test(src) ||
        !/memory_policy integration hook banks missing/.test(src)
      ) {
        continue;
      }
      return [];
    } catch {
      continue;
    }
  }
  return existingCandidates.length > 0 ? existingCandidates : candidatePaths;
}

function collectDormantIntentConfigUsage(): string[] {
  const candidatePaths = [
    path.join(process.cwd(), "backend/src/services/chat/turnRouter.service.ts"),
    path.join(process.cwd(), "src/services/chat/turnRouter.service.ts"),
  ];
  const failures: string[] = [];
  for (const filePath of candidatePaths) {
    if (!fs.existsSync(filePath)) continue;
    try {
      const src = fs.readFileSync(filePath, "utf8");
      const hasServiceRef = /\bIntentConfigService\b/.test(src);
      const hasDecideCall = /\bintentConfig\.(?:decide)\(/.test(src);
      if (!hasServiceRef || !hasDecideCall) {
        failures.push(filePath);
      }
    } catch {
      failures.push(filePath);
    }
  }
  return failures;
}

function collectComposeAnswerModeTemplateGaps(taskAnswerBank: Record<string, unknown> | null): string[] {
  const templates = Array.isArray(taskAnswerBank?.templates)
    ? (taskAnswerBank.templates as Array<Record<string, unknown>>)
    : [];
  if (templates.length === 0) {
    return ["task_answer_with_sources:templates_missing"];
  }

  const presentModes = new Set<string>();
  for (const template of templates) {
    const when = template?.when as Record<string, unknown> | undefined;
    const modes = Array.isArray(when?.answerModes)
      ? when.answerModes
      : [];
    for (const mode of modes) {
      const normalized = asTrimmedString(mode);
      if (normalized) presentModes.add(normalized);
    }
  }

  const gaps: string[] = [];
  for (const mode of COMPOSE_ANSWER_TEMPLATE_MODES) {
    if (!presentModes.has(mode)) gaps.push(mode);
  }
  return gaps;
}

function collectAnswerModeContractDrift(): string[] {
  const chatModes = new Set(CHAT_ANSWER_MODES);
  const drift: string[] = [];

  for (const mode of RETRIEVAL_ANSWER_MODES) {
    if (!chatModes.has(mode)) {
      drift.push(`retrieval_not_in_chat:${mode}`);
    }
  }
  for (const mode of COMPOSE_ANSWER_TEMPLATE_MODES) {
    if (!chatModes.has(mode)) {
      drift.push(`compose_not_in_chat:${mode}`);
    }
  }

  return drift;
}

function collectProductHelpRuntimeUsageMissing(): string[] {
  const checks: Array<{ filePaths: string[]; patterns: RegExp[] }> = [
    {
      filePaths: [
        path.join(
          process.cwd(),
          "backend/src/services/llm/core/llmGateway.service.ts",
        ),
        path.join(process.cwd(), "src/services/llm/core/llmGateway.service.ts"),
      ],
      patterns: [
        /\bgetProductHelpService\b|\bProductHelpService\b/,
        /\bproductHelpSnippet\b/,
        /\bproductHelpTopic\b/,
      ],
    },
    {
      filePaths: [
        path.join(
          process.cwd(),
          "backend/src/services/llm/core/llmRequestBuilder.service.ts",
        ),
        path.join(
          process.cwd(),
          "src/services/llm/core/llmRequestBuilder.service.ts",
        ),
      ],
      patterns: [/\bproductHelpSnippet\b/, /\bproductHelpTopic\b/],
    },
  ];

  const failures: string[] = [];
  for (const check of checks) {
    const filePath = check.filePaths.find((candidate) =>
      fs.existsSync(candidate),
    );
    if (!filePath) {
      continue;
    }
    try {
      const src = fs.readFileSync(filePath, "utf8");
      if (!check.patterns.every((pattern) => pattern.test(src))) {
        failures.push(filePath);
      }
    } catch {
      failures.push(filePath);
    }
  }

  return failures;
}

function listRuntimeSourceFiles(): string[] {
  const roots = [
    path.join(process.cwd(), "backend", "src"),
    path.join(process.cwd(), "src"),
  ];
  const out: string[] = [];
  const stack = roots.filter((root) => fs.existsSync(root));
  while (stack.length > 0) {
    const current = stack.pop() as string;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!/\.(ts|tsx|js|mjs|cjs)$/.test(entry.name)) continue;
      if (/\.test\./.test(entry.name) || /\.spec\./.test(entry.name)) continue;
      const normalized = abs.replace(/\\/g, "/");
      if (normalized.includes("/data_banks/")) continue;
      if (normalized.includes("/services/core/policy/")) continue;
      out.push(abs);
    }
  }
  return out;
}

function collectMissingRuntimePolicyConsumers(): string[] {
  const files = listRuntimeSourceFiles();
  if (files.length < 1) return [];
  const content = new Map<string, string>();
  for (const filePath of files) {
    try {
      content.set(filePath, fs.readFileSync(filePath, "utf8"));
    } catch {
      // Ignore unreadable files; they are non-deterministic in this static check.
    }
  }

  const missing: string[] = [];
  for (const policyId of RUNTIME_REQUIRED_POLICIES) {
    const markers = RUNTIME_POLICY_CONSUMER_MARKERS[policyId] || [policyId];
    let found = false;
    for (const src of content.values()) {
      if (markers.some((marker) => src.includes(marker))) {
        found = true;
        break;
      }
    }
    if (!found) missing.push(policyId);
  }
  return missing.sort((a, b) => a.localeCompare(b));
}

function resolveRegistryPath(): string | null {
  const candidates = [
    path.join(
      process.cwd(),
      "backend",
      "src",
      "data_banks",
      "manifest",
      "bank_registry.any.json",
    ),
    path.join(
      process.cwd(),
      "src",
      "data_banks",
      "manifest",
      "bank_registry.any.json",
    ),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function collectRuntimePolicyEnvGaps(): string[] {
  const registryPath = resolveRegistryPath();
  if (!registryPath) return [];
  try {
    const raw = fs.readFileSync(registryPath, "utf8");
    const parsed = JSON.parse(raw) as {
      banks?: Array<{
        id?: string;
        requiredByEnv?: Record<string, boolean>;
      }>;
    };
    const byId = new Map<string, Record<string, boolean>>();
    const banks = Array.isArray(parsed?.banks) ? parsed.banks : [];
    for (const entry of banks) {
      const id = asTrimmedString(entry?.id);
      if (!id) continue;
      const envMap =
        entry?.requiredByEnv && typeof entry.requiredByEnv === "object"
          ? entry.requiredByEnv
          : {};
      byId.set(id, envMap);
    }
    const gaps: string[] = [];
    for (const policyId of RUNTIME_REQUIRED_POLICIES) {
      const envMap = byId.get(policyId);
      if (!envMap) {
        gaps.push(`${policyId}:missing_registry_entry`);
        continue;
      }
      if (envMap.production !== true) {
        gaps.push(`${policyId}:requiredByEnv.production!=true`);
      }
      if (envMap.staging !== true) {
        gaps.push(`${policyId}:requiredByEnv.staging!=true`);
      }
    }
    return gaps.sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

export class RuntimeWiringIntegrityService {
  validate(): RuntimeWiringIntegrityResult {
    const renderPolicy = getOptionalBank<Record<string, unknown>>("render_policy");
    const hookRequiredBanks = collectRenderPolicyHookBankIds(renderPolicy);
    const requiredBanks = Array.from(
      new Set<string>([...RUNTIME_REQUIRED_BANKS, ...hookRequiredBanks]),
    );
    const missingBanks = requiredBanks.filter((id) => !getOptionalBank(id));
    const missingLlmRoutingPolicyBanks = RUNTIME_REQUIRED_LLM_ROUTING_BANKS.filter(
      (id) => !getOptionalBank(id),
    );
    const missingRuntimePolicyConsumers = collectMissingRuntimePolicyConsumers();
    const runtimePolicyEnvGaps = collectRuntimePolicyEnvGaps();

    const intentConfig = getOptionalBank<Record<string, unknown>>("intent_config");
    const operatorFamilies = getOptionalBank<Record<string, unknown>>("operator_families");
    const intentPatterns = getOptionalBank<Record<string, unknown>>("intent_patterns");
    const operatorContracts = getOptionalBank<Record<string, unknown>>("operator_contracts");
    const operatorOutputShapes = getOptionalBank<Record<string, unknown>>("operator_output_shapes");
    const promptRegistry = getOptionalBank<Record<string, unknown>>("prompt_registry");
    const taskAnswerWithSources = getOptionalBank<Record<string, unknown>>(
      "task_answer_with_sources",
    );
    const taskPlanGeneration = getOptionalBank<Record<string, unknown>>("task_plan_generation");
    const editingTaskPrompts = getOptionalBank<Record<string, unknown>>("editing_task_prompts");
    const llmBuilderPolicy = getOptionalBank<Record<string, unknown>>("llm_builder_policy");

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

    const operatorCatalog = getOptionalBank<Record<string, unknown>>("operator_catalog");
    const allybiCapabilities = getOptionalBank<Record<string, unknown>>("allybi_capabilities");
    const catalogOperators = new Set<string>(
      Object.keys(operatorCatalog?.operators || {}).map(normalizeUpper),
    );
    const capabilityOperators = new Set<string>(
      Object.keys(allybiCapabilities?.operators || {}).map(normalizeUpper),
    );

    const editingPatternBanks = [
      getOptionalBank<Record<string, unknown>>("intent_patterns_docx_en"),
      getOptionalBank<Record<string, unknown>>("intent_patterns_docx_pt"),
      getOptionalBank<Record<string, unknown>>("intent_patterns_excel_en"),
      getOptionalBank<Record<string, unknown>>("intent_patterns_excel_pt"),
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

    const invalidPromptLayers = collectPromptRegistryInvalidLayers(promptRegistry);
    const invalidPromptTemplateOutputModes = [
      ...collectPromptTemplateOutputModeIssues(
        taskPlanGeneration,
        "task_plan_generation",
      ),
      ...collectPromptTemplateOutputModeIssues(
        editingTaskPrompts,
        "editing_task_prompts",
      ),
    ];
    const builderPolicyIssues = collectBuilderPolicyIssues(llmBuilderPolicy);
    const missingBuilderPolicyBank = builderPolicyIssues.includes(
      "missing_llm_builder_policy_bank",
    )
      ? ["llm_builder_policy"]
      : [];
    const invalidBuilderPolicy = builderPolicyIssues.filter(
      (issue) => issue !== "missing_llm_builder_policy_bank",
    );
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
    const dormantIntentConfigUsage = collectDormantIntentConfigUsage();
    const composeAnswerModeTemplateGaps = collectComposeAnswerModeTemplateGaps(
      taskAnswerWithSources,
    );
    const answerModeContractDrift = collectAnswerModeContractDrift();
    const productHelpRuntimeUsageMissing =
      collectProductHelpRuntimeUsageMissing();

    return {
      ok:
        missingBanks.length === 0 &&
        missingLlmRoutingPolicyBanks.length === 0 &&
        missingRuntimePolicyConsumers.length === 0 &&
        runtimePolicyEnvGaps.length === 0 &&
        missingOperatorContracts.length === 0 &&
        missingOperatorOutputShapes.length === 0 &&
        missingEditingCatalogOperators.length === 0 &&
        missingEditingCapabilities.length === 0 &&
        invalidPromptLayers.length === 0 &&
        invalidPromptTemplateOutputModes.length === 0 &&
        missingBuilderPolicyBank.length === 0 &&
        invalidBuilderPolicy.length === 0 &&
        legacyChatRuntimeImports.length === 0 &&
        dormantCoreRoutingImports.length === 0 &&
        turnRoutePolicyDynamicFallback.length === 0 &&
        hardcodedRuntimeHeuristics.length === 0 &&
        rawConsoleRuntimeUsage.length === 0 &&
        memoryDelegateDirectInstantiation.length === 0 &&
        memoryRawPersistencePatterns.length === 0 &&
        memoryPolicyHookEngineMissing.length === 0 &&
        dormantIntentConfigUsage.length === 0 &&
        composeAnswerModeTemplateGaps.length === 0 &&
        answerModeContractDrift.length === 0 &&
        productHelpRuntimeUsageMissing.length === 0,
      missingBanks,
      missingLlmRoutingPolicyBanks,
      missingRuntimePolicyConsumers,
      runtimePolicyEnvGaps,
      missingOperatorContracts,
      missingOperatorOutputShapes,
      missingEditingCatalogOperators,
      missingEditingCapabilities,
      invalidPromptLayers,
      invalidPromptTemplateOutputModes,
      missingBuilderPolicyBank,
      invalidBuilderPolicy,
      legacyChatRuntimeImports,
      dormantCoreRoutingImports,
      turnRoutePolicyDynamicFallback,
      hardcodedRuntimeHeuristics,
      rawConsoleRuntimeUsage,
      memoryDelegateDirectInstantiation,
      memoryRawPersistencePatterns,
      memoryPolicyHookEngineMissing,
      dormantIntentConfigUsage,
      composeAnswerModeTemplateGaps,
      answerModeContractDrift,
      productHelpRuntimeUsageMissing,
    };
  }
}
