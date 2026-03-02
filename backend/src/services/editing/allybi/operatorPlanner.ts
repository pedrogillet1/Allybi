import { normalizeEditOperator } from "../editOperatorAliases.service";
import type { EditDomain } from "../editing.types";
import { loadAllybiBanks } from "./loadBanks";
import type { AllybiScopeResolution } from "./scopeResolver";
import type { ClassifiedIntent } from "./intentClassifier";

export interface AllybiOperatorPlan {
  canonicalOperator: string;
  runtimeOperator: string;
  planStatus?: "ok" | "blocked";
  blockedReasonCode?: string;
  blockedReasonMessage?: string;
  domain: EditDomain;
  requiresConfirmation: boolean;
  previewRenderType: string;
  operatorClass?: AllybiOperatorClass;
  targetHint?: string;
  scopeKind?: AllybiScopeResolution["scopeKind"];
  isFormattingOnly?: boolean;
  blockedRewrite?: boolean;
  fontFamily?: string;
  language?: "en" | "pt";
  clarificationRequired?: boolean;
  clarificationMessage?: string;
}

export interface AllybiOperatorStep extends AllybiOperatorPlan {
  stepId: string;
}

export type AllybiOperatorClass =
  | "targeting"
  | "rewrite"
  | "find_replace"
  | "translate"
  | "formatting"
  | "list_numbering"
  | "doc_feature"
  | "table"
  | "cross_document"
  | "review"
  | "xlsx_value"
  | "xlsx_formula"
  | "xlsx_formatting"
  | "xlsx_structural"
  | "xlsx_chart"
  | "unknown";

function operatorFromCatalog(
  domain: EditDomain,
  canonicalOperator: string,
): any | null {
  const banks = loadAllybiBanks();
  const catalog =
    banks.operatorCatalog?.operators &&
    typeof banks.operatorCatalog.operators === "object"
      ? (banks.operatorCatalog.operators as Record<string, any>)
      : {};
  const operator = catalog[canonicalOperator];
  if (!operator || typeof operator !== "object") return null;
  const opDomain = String((operator as any).domain || "")
    .trim()
    .toLowerCase();
  if (domain === "docx" && opDomain && opDomain !== "docx") return null;
  if (domain === "sheets" && opDomain && opDomain !== "excel") return null;
  return operator;
}

function isFormattingDirective(message: string): boolean {
  const low = String(message || "").toLowerCase();
  return /\b(format|style|bold|italic|underline|font|font family|font-size|size|color|colour|negrito|italico|itálico|sublinhad|fonte|cor)\b/.test(
    low,
  );
}

function isRewriteLikeOperator(
  canonicalOperator: string | null | undefined,
): boolean {
  const op = String(canonicalOperator || "");
  if (!op) return false;
  if (op === "DOCX_FIND_REPLACE") return false;
  return op.includes("REWRITE") || op === "DOCX_REPLACE_SPAN";
}

function operatorClassFromIntent(
  intentId: string | null | undefined,
  domain: EditDomain,
): AllybiOperatorClass {
  const key = String(intentId || "").toUpperCase();
  if (!key) return "unknown";

  if (domain === "docx") {
    if (key.includes("FORMAT")) return "formatting";
    if (key.includes("LIST") || key.includes("NUMBERING"))
      return "list_numbering";
    if (key.includes("TRANSLATE")) return "translate";
    if (key.includes("FIND_REPLACE")) return "find_replace";
    if (key.includes("TABLE")) return "table";
    if (
      key.includes("TOC") ||
      key.includes("HEADER") ||
      key.includes("FOOTER") ||
      key.includes("COVER")
    )
      return "doc_feature";
    if (key.includes("REVIEW") || key.includes("TRACK_CHANGES"))
      return "review";
    if (key.includes("CROSS_DOC") || key.includes("SOURCE"))
      return "cross_document";
    if (key.includes("REWRITE")) return "rewrite";
    return "unknown";
  }

  if (domain === "sheets") {
    if (key.includes("CHART")) return "xlsx_chart";
    if (key.includes("FORMULA") || key.includes("COMPUTE"))
      return "xlsx_formula";
    if (key.includes("FORMAT")) return "xlsx_formatting";
    if (
      key.includes("SORT") ||
      key.includes("FILTER") ||
      key.includes("TABLE") ||
      key.includes("FREEZE") ||
      key.includes("PIVOT")
    )
      return "xlsx_structural";
    if (key.includes("SET_VALUE") || key.includes("SET_CELL"))
      return "xlsx_value";
    return "unknown";
  }

  return "unknown";
}

export function operatorClassFromCanonical(
  domain: EditDomain,
  canonicalOperator: string | null | undefined,
): AllybiOperatorClass {
  const op = String(canonicalOperator || "").toUpperCase();
  if (!op) return "unknown";

  if (domain === "docx") {
    if (
      op.startsWith("DOCX_GET_TARGETS") ||
      op.startsWith("DOCX_LOCK_TARGETS") ||
      op.startsWith("DOCX_CLEAR_LOCK")
    )
      return "targeting";
    if (op === "DOCX_FIND_REPLACE") return "find_replace";
    if (op.includes("TRANSLATE")) return "translate";
    if (op.includes("LIST_") || op.includes("NUMBERING"))
      return "list_numbering";
    if (op.includes("TABLE")) return "table";
    if (
      op.includes("TOC") ||
      op.includes("WATERMARK") ||
      op.includes("HEADER") ||
      op.includes("FOOTER") ||
      op.includes("COVER") ||
      op.includes("PAGE_")
    )
      return "doc_feature";
    if (
      op.includes("TRACK_CHANGES") ||
      op.includes("REDLINE") ||
      op.includes("COMMENT")
    )
      return "review";
    if (
      op.includes("ENRICH_FROM_SOURCES") ||
      op.includes("CITATION") ||
      op.includes("MERGE_FROM_DOC")
    )
      return "cross_document";
    if (
      op.includes("STYLE") ||
      op.includes("FORMAT") ||
      op.includes("ALIGN") ||
      op.includes("INDENT") ||
      op.includes("SPACING")
    )
      return "formatting";
    if (op.includes("REWRITE") || op === "DOCX_REPLACE_SPAN") return "rewrite";
    if (
      op.includes("INSERT") ||
      op.includes("DELETE") ||
      op.includes("MERGE") ||
      op.includes("SPLIT")
    )
      return "doc_feature";
    return "unknown";
  }

  if (domain === "sheets") {
    if (op.startsWith("XLSX_CHART_")) return "xlsx_chart";
    if (
      op.includes("FORMULA") ||
      op.includes("COMPUTE") ||
      op.includes("FILL_")
    )
      return "xlsx_formula";
    if (
      op.includes("FORMAT") ||
      op.includes("NUMBER_FORMAT") ||
      op.includes("WRAP") ||
      op.includes("STYLE")
    )
      return "xlsx_formatting";
    if (
      op.includes("SORT") ||
      op.includes("FILTER") ||
      op.includes("TABLE") ||
      op.includes("FREEZE") ||
      op.includes("MERGE") ||
      op.includes("INSERT") ||
      op.includes("DELETE")
    )
      return "xlsx_structural";
    if (op.includes("SET_CELL_VALUE") || op.includes("SET_RANGE_VALUES"))
      return "xlsx_value";
    return "unknown";
  }

  return "unknown";
}

function blocksRewriteByClass(operatorClass: AllybiOperatorClass): boolean {
  return (
    operatorClass === "formatting" ||
    operatorClass === "list_numbering" ||
    operatorClass === "doc_feature" ||
    operatorClass === "table" ||
    operatorClass === "cross_document" ||
    operatorClass === "review" ||
    operatorClass === "xlsx_chart" ||
    operatorClass === "xlsx_formatting" ||
    operatorClass === "xlsx_structural" ||
    operatorClass === "targeting"
  );
}

function fallbackOperatorByClass(
  domain: EditDomain,
  operatorClass: AllybiOperatorClass,
): string | null {
  if (domain === "docx") {
    if (operatorClass === "formatting") return "DOCX_SET_RUN_STYLE";
    if (operatorClass === "list_numbering") return "DOCX_LIST_APPLY_BULLETS";
    if (operatorClass === "translate") return "DOCX_TRANSLATE_SCOPE";
    if (operatorClass === "find_replace") return "DOCX_FIND_REPLACE";
    if (operatorClass === "doc_feature") return "DOCX_UPDATE_TOC";
    if (operatorClass === "cross_document") return "DOCX_ENRICH_FROM_SOURCES";
    if (operatorClass === "targeting") return "DOCX_GET_TARGETS";
    return null;
  }

  if (domain === "sheets") {
    if (operatorClass === "xlsx_chart") return "XLSX_CHART_CREATE";
    if (operatorClass === "xlsx_formula") return "XLSX_SET_CELL_FORMULA";
    if (operatorClass === "xlsx_formatting") return "XLSX_FORMAT_RANGE";
    if (operatorClass === "xlsx_structural") return "XLSX_SORT_RANGE";
    if (operatorClass === "xlsx_value") return "XLSX_SET_RANGE_VALUES";
    return null;
  }

  return null;
}

function resolveExpectedOperatorClass(input: {
  domain: EditDomain;
  intentId?: string | null;
  candidate?: string | null;
  formattingOnly: boolean;
}): AllybiOperatorClass {
  if (input.formattingOnly)
    return input.domain === "sheets" ? "xlsx_formatting" : "formatting";

  const fromIntent = operatorClassFromIntent(input.intentId, input.domain);
  if (fromIntent !== "unknown") return fromIntent;

  const fromCandidate = operatorClassFromCanonical(
    input.domain,
    input.candidate,
  );
  if (fromCandidate !== "unknown") return fromCandidate;

  return "unknown";
}

function resolveClarificationMessage(
  language: "en" | "pt",
  candidates: string[],
): string {
  const banks = loadAllybiBanks();
  const template = String(
    banks.fontAliases?.errors?.FONT_AMBIGUOUS?.[language] || "",
  ).trim();
  if (!template) {
    return language === "pt"
      ? `Encontrei um nome de fonte ambíguo. Você quis dizer: ${candidates.join(", ")}?`
      : `I found an ambiguous font name. Did you mean: ${candidates.join(", ")}?`;
  }
  return template.replace("{candidates}", candidates.join(", "));
}

function preferFormattingOperator(domain: EditDomain): string {
  return domain === "sheets" ? "XLSX_FORMAT_RANGE" : "DOCX_SET_RUN_STYLE";
}

function resolveRuntimeOperator(input: {
  domain: EditDomain;
  canonicalOperator: string;
  instruction: string;
}): string | null {
  const mapped = normalizeEditOperator(input.canonicalOperator, {
    domain: input.domain,
    instruction: input.instruction,
  });
  if (mapped.operator) return mapped.operator;

  const fromCatalog = String(
    operatorFromCatalog(input.domain, input.canonicalOperator)
      ?.runtimeOperator || "",
  ).trim();
  return fromCatalog || null;
}

function buildBlockedPlan(input: {
  domain: EditDomain;
  canonicalOperator: string;
  scope: AllybiScopeResolution;
  language: "en" | "pt";
  formattingOnly: boolean;
  blockedRewrite: boolean;
  fontFamily?: string;
  operatorClass: AllybiOperatorClass;
  reasonCode: string;
  reasonMessage: string;
  clarificationRequired?: boolean;
  clarificationMessage?: string;
}): AllybiOperatorPlan {
  return {
    canonicalOperator: input.canonicalOperator,
    runtimeOperator: "",
    planStatus: "blocked",
    blockedReasonCode: input.reasonCode,
    blockedReasonMessage: input.reasonMessage,
    domain: input.domain,
    requiresConfirmation: true,
    previewRenderType: mapRenderType(
      input.domain,
      input.canonicalOperator,
      input.formattingOnly ? "inline_format_diff" : "text_diff",
    ),
    operatorClass: input.operatorClass,
    targetHint: input.scope.targetHint,
    scopeKind: input.scope.scopeKind,
    isFormattingOnly: input.formattingOnly,
    blockedRewrite: input.blockedRewrite,
    fontFamily: input.fontFamily,
    language: input.language,
    clarificationRequired: input.clarificationRequired,
    clarificationMessage: input.clarificationMessage,
  };
}

function mapRenderType(
  domain: EditDomain,
  canonicalOperator: string,
  rawPreviewType: string,
): string {
  const banks = loadAllybiBanks();
  const cards =
    banks.renderCards?.cards && typeof banks.renderCards.cards === "object"
      ? (banks.renderCards.cards as Record<string, any>)
      : {};
  const capabilitiesOps =
    banks.capabilities?.operators &&
    typeof banks.capabilities.operators === "object"
      ? (banks.capabilities.operators as Record<string, any>)
      : {};

  const capabilityRenderCard = String(
    capabilitiesOps?.[canonicalOperator]?.renderCard || "",
  ).trim();
  if (capabilityRenderCard && cards[capabilityRenderCard])
    return capabilityRenderCard;

  const normalized = String(rawPreviewType || "")
    .trim()
    .toLowerCase();
  if (normalized && cards[normalized]) return normalized;

  const isSheets = domain === "sheets";
  const defaultDocx = "docx_text_diff";
  const defaultSheets = "xlsx_range_diff";

  if (normalized === "target_resolution") return "target_resolution";
  if (normalized === "text_diff")
    return isSheets ? "xlsx_range_diff" : "docx_text_diff";
  if (normalized === "inline_format_diff")
    return isSheets ? "xlsx_format_diff" : "docx_inline_format_diff";
  if (normalized === "format_diff")
    return isSheets ? "xlsx_format_diff" : "docx_format_diff";
  if (normalized === "structural_diff")
    return isSheets ? "xlsx_structural_diff" : "docx_structural_diff";
  if (normalized === "cell_diff") return "xlsx_cell_diff";
  if (normalized === "range_diff") return "xlsx_range_diff";
  if (normalized === "formula_diff") return "xlsx_formula_diff";
  if (normalized === "chart_diff") return "xlsx_chart_diff";

  if (isSheets) {
    if (canonicalOperator.startsWith("XLSX_CHART_")) return "xlsx_chart_diff";
    if (canonicalOperator.includes("FORMULA")) return "xlsx_formula_diff";
    if (
      canonicalOperator.includes("FORMAT") ||
      canonicalOperator.includes("COND_FORMAT")
    )
      return "xlsx_format_diff";
    if (
      canonicalOperator.includes("SORT") ||
      canonicalOperator.includes("FILTER") ||
      canonicalOperator.includes("TABLE")
    )
      return "xlsx_structural_diff";
    if (canonicalOperator === "XLSX_SET_CELL_VALUE") return "xlsx_cell_diff";
    return defaultSheets;
  }

  if (
    canonicalOperator.includes("LIST_") ||
    canonicalOperator.includes("INSERT") ||
    canonicalOperator.includes("DELETE") ||
    canonicalOperator.includes("TOC")
  ) {
    return "docx_structural_diff";
  }
  if (
    canonicalOperator.includes("STYLE") ||
    canonicalOperator.includes("FORMAT")
  )
    return "docx_inline_format_diff";
  return defaultDocx;
}

// ---------------------------------------------------------------------------
// Routing guardrails (bank-driven)
// ---------------------------------------------------------------------------

export interface RoutingGuardrailResult {
  id: string;
  action: "block" | "require_confirmation" | "noop" | "pass";
  code?: string;
  message?: string;
}

function connectorPermissionActionForOperator(
  canonicalOperator: string,
): "CONNECTOR_READ_LIST" | "CONNECTOR_DRAFT" | "CONNECTOR_SEND_CONFIRM" | null {
  const op = String(canonicalOperator || "")
    .trim()
    .toUpperCase();
  if (!op) return null;
  if (op === "EMAIL_SEND") return "CONNECTOR_SEND_CONFIRM";
  if (op === "EMAIL_DRAFT") return "CONNECTOR_DRAFT";
  if (op.startsWith("CONNECTOR_") || op.startsWith("EMAIL_")) {
    return "CONNECTOR_READ_LIST";
  }
  return null;
}

function applyConnectorPermissionPolicy(input: {
  plan: AllybiOperatorPlan;
  language: "en" | "pt";
}): RoutingGuardrailResult | null {
  const banks = loadAllybiBanks();
  const connectorPermissions = banks.connectorPermissions;
  if (!connectorPermissions?.config?.enabled) return null;

  const actionId = connectorPermissionActionForOperator(
    input.plan.canonicalOperator,
  );
  if (!actionId) return null;

  const actionPolicy =
    connectorPermissions?.actions &&
    typeof connectorPermissions.actions === "object"
      ? connectorPermissions.actions[actionId]
      : null;
  if (!actionPolicy || typeof actionPolicy !== "object") return null;

  if (actionPolicy.requiresExplicitActivation === true) {
    return {
      id: "connector_permissions_explicit_activation",
      action: "require_confirmation",
      code: "CONNECTOR_EXPLICIT_ACTIVATION_REQUIRED",
      message:
        input.language === "pt"
          ? "Esta ação de integração exige ativação explícita."
          : "This integration action requires explicit activation.",
    };
  }

  const requiresSendClick =
    actionPolicy.requiresSendClick === true ||
    connectorPermissions?.config?.requireExplicitSendClick === true;
  if (actionId === "CONNECTOR_SEND_CONFIRM" && requiresSendClick) {
    return {
      id: "connector_permissions_send_click",
      action: "require_confirmation",
      code: "CONNECTOR_SEND_CLICK_REQUIRED",
      message:
        input.language === "pt"
          ? "O envio exige clique explícito de confirmação."
          : "Sending requires an explicit confirmation click.",
    };
  }

  return null;
}

function loadGuardrails(): any[] {
  const banks = loadAllybiBanks();
  const routing = banks.editingRouting;
  if (!routing || !Array.isArray(routing.guardrails)) return [];
  return routing.guardrails;
}

function matchesOperatorPattern(operator: string, patterns: string[]): boolean {
  const op = String(operator || "").toUpperCase();
  return patterns.some((p) => op.includes(p.toUpperCase()));
}

function userSaysEntireDocument(message: string): boolean {
  const low = String(message || "").toLowerCase();
  return /\b(entire document|whole document|documento inteiro|todo o documento)\b/.test(
    low,
  );
}

/**
 * Apply pre-phase guardrails before operator selection.
 * Returns a blocked plan if a pre-phase rule fires, else null.
 */
function applyPreGuardrails(input: {
  domain: EditDomain;
  message: string;
  scope: AllybiScopeResolution;
  language: "en" | "pt";
  candidateOperator: string | null;
}): RoutingGuardrailResult | null {
  const guardrails = loadGuardrails();
  for (const rule of guardrails) {
    if (rule.phase !== "pre" || !rule.condition) continue;

    // no_bulk_override_selection
    if (rule.id === "no_bulk_override_selection") {
      const hasSelection =
        input.scope.source === "frozen_selection" ||
        input.scope.source === "live_selection";
      const isBulkScope = [
        "document",
        "all_headings",
        "all_paragraphs",
      ].includes(input.scope.scopeKind);
      if (
        hasSelection &&
        isBulkScope &&
        !userSaysEntireDocument(input.message)
      ) {
        const msg =
          rule.blockMessage?.[input.language] ||
          rule.blockMessage?.en ||
          "Bulk operation blocked while selection is active.";
        return {
          id: rule.id,
          action: "block",
          code: rule.blockCode || "ROUTING_BULK_OVERRIDE_BLOCKED",
          message: msg,
        };
      }
    }

    // engine_capability_gate
    if (rule.id === "engine_capability_gate" && input.candidateOperator) {
      const capMap =
        rule.capabilityMap && typeof rule.capabilityMap === "object"
          ? (rule.capabilityMap as Record<string, any>)
          : {};
      const entry = capMap[input.candidateOperator];
      if (entry) {
        const requiredDomain = String(entry.requiresDomain || "");
        if (requiredDomain && requiredDomain !== input.domain) {
          const msg =
            rule.blockMessage?.[input.language] ||
            rule.blockMessage?.en ||
            "Operation not supported by this document engine.";
          return {
            id: rule.id,
            action: "block",
            code: rule.blockCode || "ROUTING_ENGINE_UNSUPPORTED",
            message: msg,
          };
        }
      }
    }
  }
  return null;
}

/**
 * Apply post-phase guardrails after operator selection.
 * Returns a guardrail result if a rule fires, else null.
 */
export function applyPostGuardrails(input: {
  plan: AllybiOperatorPlan;
  language: "en" | "pt";
  isFormattingIntent: boolean;
  operatorClass: AllybiOperatorClass;
}): RoutingGuardrailResult | null {
  const guardrails = loadGuardrails();
  for (const rule of guardrails) {
    if (rule.phase !== "post" || !rule.condition) continue;

    // formatting_never_rewrite
    if (rule.id === "formatting_never_rewrite") {
      if (
        input.isFormattingIntent &&
        rule.condition.operatorMatches &&
        matchesOperatorPattern(
          input.plan.canonicalOperator,
          rule.condition.operatorMatches,
        )
      ) {
        const msg =
          rule.blockMessage?.[input.language] ||
          rule.blockMessage?.en ||
          "Formatting cannot use rewrite operator.";
        return {
          id: rule.id,
          action: "block",
          code: rule.blockCode || "ROUTING_FORMATTING_REWRITE_BLOCKED",
          message: msg,
        };
      }
    }

    // structural_never_paragraph_rewrite
    if (rule.id === "structural_never_paragraph_rewrite") {
      const classesMatch =
        Array.isArray(rule.condition.operatorClassIn) &&
        rule.condition.operatorClassIn.includes(input.operatorClass);
      if (
        classesMatch &&
        rule.condition.operatorMatches &&
        matchesOperatorPattern(
          input.plan.canonicalOperator,
          rule.condition.operatorMatches,
        )
      ) {
        const msg =
          rule.blockMessage?.[input.language] ||
          rule.blockMessage?.en ||
          "Structural ops cannot fall back to paragraph rewrite.";
        return {
          id: rule.id,
          action: "block",
          code: rule.blockCode || "ROUTING_STRUCTURAL_REWRITE_BLOCKED",
          message: msg,
        };
      }
    }

    // destructive_ops_confirm
    if (rule.id === "destructive_ops_confirm") {
      if (
        Array.isArray(rule.condition.operatorMatchesAny) &&
        matchesOperatorPattern(
          input.plan.canonicalOperator,
          rule.condition.operatorMatchesAny,
        )
      ) {
        const msg =
          rule.confirmMessage?.[input.language] ||
          rule.confirmMessage?.en ||
          "Destructive operation requires confirmation.";
        return {
          id: rule.id,
          action: "require_confirmation",
          code: rule.confirmCode || "ROUTING_DESTRUCTIVE_CONFIRM",
          message: msg,
        };
      }
    }
  }
  return null;
}

export function planAllybiOperator(input: {
  domain: EditDomain;
  message: string;
  classifiedIntent: ClassifiedIntent | null;
  scope: AllybiScopeResolution;
}): AllybiOperatorPlan | null {
  const language = input.classifiedIntent?.language || "en";
  const formattingOnly =
    Boolean(input.classifiedIntent?.isFormattingIntent) ||
    isFormattingDirective(input.message);
  const expectedOperatorClass = resolveExpectedOperatorClass({
    domain: input.domain,
    intentId: input.classifiedIntent?.intentId,
    candidate: input.classifiedIntent?.operatorCandidates?.[0] || null,
    formattingOnly,
  });

  const preferredFormattingOp = preferFormattingOperator(input.domain);
  const candidateRaw = input.classifiedIntent?.operatorCandidates?.[0] || null;
  const candidateClass = operatorClassFromCanonical(input.domain, candidateRaw);
  const mustForceFormatting =
    formattingOnly &&
    (!candidateRaw ||
      isRewriteLikeOperator(candidateRaw) ||
      candidateClass !== expectedOperatorClass);
  const classSpecificFallback = fallbackOperatorByClass(
    input.domain,
    expectedOperatorClass,
  );
  const classMismatch =
    expectedOperatorClass !== "unknown" &&
    candidateRaw &&
    candidateClass !== "unknown" &&
    candidateClass !== expectedOperatorClass;
  const blockedRewrite =
    formattingOnly || blocksRewriteByClass(expectedOperatorClass);
  const candidate = mustForceFormatting
    ? preferredFormattingOp
    : classMismatch
      ? classSpecificFallback || candidateRaw
      : candidateRaw;

  // --- Pre-phase routing guardrails (bank-driven) ---
  const preGuard = applyPreGuardrails({
    domain: input.domain,
    message: input.message,
    scope: input.scope,
    language,
    candidateOperator: candidate,
  });
  if (preGuard && preGuard.action === "block") {
    return buildBlockedPlan({
      domain: input.domain,
      canonicalOperator: candidate || preferredFormattingOp,
      scope: input.scope,
      language,
      formattingOnly,
      blockedRewrite,
      fontFamily: input.classifiedIntent?.fontFamily,
      operatorClass: expectedOperatorClass,
      reasonCode: preGuard.code || "ROUTING_PRE_GUARD",
      reasonMessage: preGuard.message || "Pre-guard blocked this operation.",
    });
  }

  if (input.classifiedIntent?.clarificationRequired) {
    const clarificationOperator =
      candidate || classSpecificFallback || preferredFormattingOp;
    const clarificationRuntime = resolveRuntimeOperator({
      domain: input.domain,
      canonicalOperator: clarificationOperator,
      instruction: input.message,
    });
    const clarificationMessage = resolveClarificationMessage(
      language,
      input.classifiedIntent?.fontCandidates || [],
    );
    if (!clarificationRuntime) {
      return buildBlockedPlan({
        domain: input.domain,
        canonicalOperator: clarificationOperator,
        scope: input.scope,
        language,
        formattingOnly: true,
        blockedRewrite,
        fontFamily: input.classifiedIntent?.fontFamily,
        operatorClass: expectedOperatorClass,
        reasonCode: "OPERATOR_MAPPING_MISSING",
        reasonMessage: `No runtime operator mapping found for ${clarificationOperator}.`,
        clarificationRequired: true,
        clarificationMessage,
      });
    }
    return {
      canonicalOperator: clarificationOperator,
      runtimeOperator: clarificationRuntime,
      planStatus: "ok",
      domain: input.domain,
      requiresConfirmation: true,
      previewRenderType: mapRenderType(
        input.domain,
        clarificationOperator,
        "inline_format_diff",
      ),
      operatorClass: expectedOperatorClass,
      targetHint: input.scope.targetHint,
      scopeKind: input.scope.scopeKind,
      isFormattingOnly: true,
      blockedRewrite,
      language,
      clarificationRequired: true,
      clarificationMessage,
    };
  }

  if (candidate) {
    const info = operatorFromCatalog(input.domain, candidate) || {};
    const runtimeOperator = resolveRuntimeOperator({
      domain: input.domain,
      canonicalOperator: candidate,
      instruction: input.message,
    });
    if (!runtimeOperator) {
      return buildBlockedPlan({
        domain: input.domain,
        canonicalOperator: candidate,
        scope: input.scope,
        language,
        formattingOnly,
        blockedRewrite,
        fontFamily: input.classifiedIntent?.fontFamily,
        operatorClass: expectedOperatorClass,
        reasonCode: "OPERATOR_MAPPING_MISSING",
        reasonMessage: `No runtime operator mapping found for ${candidate}.`,
      });
    }
    const candidatePlan: AllybiOperatorPlan = {
      canonicalOperator: candidate,
      runtimeOperator,
      planStatus: "ok",
      domain: input.domain,
      requiresConfirmation: Boolean(
        info?.confirmationPolicy?.requiresExplicitConfirm ??
        info?.requires_confirmation ??
        false,
      ),
      previewRenderType: mapRenderType(
        input.domain,
        candidate,
        String(
          info?.previewType ||
            info?.preview_render_type ||
            info?.diffType ||
            "text_diff",
        ),
      ),
      operatorClass: expectedOperatorClass,
      targetHint: input.scope.targetHint,
      scopeKind: input.scope.scopeKind,
      isFormattingOnly: formattingOnly,
      blockedRewrite,
      fontFamily: input.classifiedIntent?.fontFamily,
      language,
    };
    // --- Post-phase routing guardrails ---
    const postGuard = applyPostGuardrails({
      plan: candidatePlan,
      language,
      isFormattingIntent: formattingOnly,
      operatorClass: expectedOperatorClass,
    });
    if (postGuard) {
      if (postGuard.action === "block") {
        return buildBlockedPlan({
          domain: input.domain,
          canonicalOperator: candidate,
          scope: input.scope,
          language,
          formattingOnly,
          blockedRewrite,
          fontFamily: input.classifiedIntent?.fontFamily,
          operatorClass: expectedOperatorClass,
          reasonCode: postGuard.code || "ROUTING_POST_GUARD",
          reasonMessage:
            postGuard.message || "Post-guard blocked this operation.",
        });
      }
      if (postGuard.action === "require_confirmation") {
        candidatePlan.requiresConfirmation = true;
      }
    }
    const connectorPolicy = applyConnectorPermissionPolicy({
      plan: candidatePlan,
      language,
    });
    if (connectorPolicy?.action === "block") {
      return buildBlockedPlan({
        domain: input.domain,
        canonicalOperator: candidate,
        scope: input.scope,
        language,
        formattingOnly,
        blockedRewrite,
        fontFamily: input.classifiedIntent?.fontFamily,
        operatorClass: expectedOperatorClass,
        reasonCode: connectorPolicy.code || "CONNECTOR_PERMISSION_BLOCKED",
        reasonMessage:
          connectorPolicy.message || "Connector permission policy blocked operation.",
      });
    }
    if (connectorPolicy?.action === "require_confirmation") {
      candidatePlan.requiresConfirmation = true;
    }
    return candidatePlan;
  }

  const canonicalFallback = classSpecificFallback
    ? classSpecificFallback
    : formattingOnly
      ? preferredFormattingOp
      : input.domain === "sheets"
        ? "XLSX_SET_RANGE_VALUES"
        : null;
  if (!canonicalFallback) {
    return buildBlockedPlan({
      domain: input.domain,
      canonicalOperator: preferredFormattingOp,
      scope: input.scope,
      language,
      formattingOnly,
      blockedRewrite,
      fontFamily: input.classifiedIntent?.fontFamily,
      operatorClass: expectedOperatorClass,
      reasonCode: "INTENT_PLAN_NOT_RESOLVED",
      reasonMessage: "No operator candidate satisfied intent constraints.",
    });
  }
  const runtimeFallback = resolveRuntimeOperator({
    domain: input.domain,
    canonicalOperator: canonicalFallback,
    instruction: input.message,
  });
  if (!runtimeFallback) {
    return buildBlockedPlan({
      domain: input.domain,
      canonicalOperator: canonicalFallback,
      scope: input.scope,
      language,
      formattingOnly,
      blockedRewrite,
      fontFamily: input.classifiedIntent?.fontFamily,
      operatorClass: expectedOperatorClass,
      reasonCode: "OPERATOR_MAPPING_MISSING",
      reasonMessage: `No runtime operator mapping found for ${canonicalFallback}.`,
    });
  }

  const fallbackPlan: AllybiOperatorPlan = {
    canonicalOperator: canonicalFallback,
    runtimeOperator: runtimeFallback,
    planStatus: "ok",
    domain: input.domain,
    requiresConfirmation: input.scope.requiresDisambiguation,
    previewRenderType: mapRenderType(
      input.domain,
      canonicalFallback,
      formattingOnly ? "inline_format_diff" : "text_diff",
    ),
    operatorClass: expectedOperatorClass,
    targetHint: input.scope.targetHint,
    scopeKind: input.scope.scopeKind,
    isFormattingOnly: formattingOnly,
    blockedRewrite,
    fontFamily: input.classifiedIntent?.fontFamily,
    language,
  };
  // --- Post-phase routing guardrails ---
  const postGuardFallback = applyPostGuardrails({
    plan: fallbackPlan,
    language,
    isFormattingIntent: formattingOnly,
    operatorClass: expectedOperatorClass,
  });
  if (postGuardFallback) {
    if (postGuardFallback.action === "block") {
      return buildBlockedPlan({
        domain: input.domain,
        canonicalOperator: canonicalFallback,
        scope: input.scope,
        language,
        formattingOnly,
        blockedRewrite,
        fontFamily: input.classifiedIntent?.fontFamily,
        operatorClass: expectedOperatorClass,
        reasonCode: postGuardFallback.code || "ROUTING_POST_GUARD",
        reasonMessage:
          postGuardFallback.message || "Post-guard blocked this operation.",
      });
    }
    if (postGuardFallback.action === "require_confirmation") {
      fallbackPlan.requiresConfirmation = true;
    }
  }
  const fallbackConnectorPolicy = applyConnectorPermissionPolicy({
    plan: fallbackPlan,
    language,
  });
  if (fallbackConnectorPolicy?.action === "block") {
    return buildBlockedPlan({
      domain: input.domain,
      canonicalOperator: canonicalFallback,
      scope: input.scope,
      language,
      formattingOnly,
      blockedRewrite,
      fontFamily: input.classifiedIntent?.fontFamily,
      operatorClass: expectedOperatorClass,
      reasonCode: fallbackConnectorPolicy.code || "CONNECTOR_PERMISSION_BLOCKED",
      reasonMessage:
        fallbackConnectorPolicy.message ||
        "Connector permission policy blocked operation.",
    });
  }
  if (fallbackConnectorPolicy?.action === "require_confirmation") {
    fallbackPlan.requiresConfirmation = true;
  }
  return fallbackPlan;
}

export function planAllybiOperatorSteps(input: {
  domain: EditDomain;
  message: string;
  classifiedIntent: ClassifiedIntent | null;
  scope: AllybiScopeResolution;
}): AllybiOperatorStep[] {
  const base = planAllybiOperator(input);
  if (!base) return [];
  const targetHints =
    Array.isArray(input.scope.targetHints) && input.scope.targetHints.length > 0
      ? input.scope.targetHints
      : input.scope.targetHint
        ? [input.scope.targetHint]
        : [];
  if (!input.scope.multiRangeFanout || targetHints.length <= 1) {
    return [{ ...base, stepId: "step_1" }];
  }
  return targetHints.map((targetHint, idx) => ({
    ...base,
    targetHint,
    stepId: `step_${idx + 1}`,
  }));
}
