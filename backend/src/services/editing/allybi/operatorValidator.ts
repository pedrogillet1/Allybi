import { loadAllybiBanks } from "./loadBanks";
import { operatorClassFromCanonical } from "./operatorPlanner";
import type { AllybiOperatorClass, AllybiOperatorPlan } from "./operatorPlanner";

export interface AllybiValidationResult {
  ok: boolean;
  code?: string;
  message?: string;
}

function languageFromInput(input: unknown): "en" | "pt" {
  return input === "pt" ? "pt" : "en";
}

function isRewriteOperator(canonicalOperator: string): boolean {
  const op = String(canonicalOperator || "").toUpperCase();
  if (!op) return false;
  if (op === "DOCX_FIND_REPLACE") return false;
  return op.includes("REWRITE") || op === "DOCX_REPLACE_SPAN";
}

function classesCompatible(expected: AllybiOperatorClass | undefined, actual: AllybiOperatorClass): boolean {
  if (!expected || expected === "unknown") return true;
  if (expected === actual) return true;
  if (expected === "rewrite" && actual === "find_replace") return true;
  if (expected === "xlsx_value" && actual === "xlsx_formula") return false;
  return false;
}

function supportsScope(canonicalOperator: string, scopeKind: string | undefined): boolean {
  if (!scopeKind) return true;
  const op = String(canonicalOperator || "");
  if (scopeKind === "word" || scopeKind === "sentence") {
    return op === "DOCX_REPLACE_SPAN" || op === "DOCX_SET_RUN_STYLE" || op === "DOCX_CLEAR_RUN_STYLE";
  }
  if (scopeKind === "paragraph") {
    return !op.includes("SECTION") && !op.includes("DOCUMENT");
  }
  if (scopeKind === "section") {
    return !op.includes("DOCUMENT");
  }
  if (scopeKind === "document") {
    return op === "DOCX_TRANSLATE_SCOPE" || op === "DOCX_FIND_REPLACE";
  }
  return true;
}

function getOperatorSchema(domain: "docx" | "sheets", canonicalOperator: string): any | null {
  const banks = loadAllybiBanks();
  const catalog = domain === "docx" ? banks.docxOperators : banks.xlsxOperators;
  const op = catalog?.operators?.[canonicalOperator];
  return op?.schema || null;
}

export function validateAllybiOperatorPayload(
  domain: "docx" | "sheets",
  plan: AllybiOperatorPlan,
  payload: Record<string, unknown>,
  options?: { language?: "en" | "pt" },
): AllybiValidationResult {
  if (plan.clarificationRequired) {
    return {
      ok: false,
      code: "ALLYBI_FONT_AMBIGUOUS",
      message: plan.clarificationMessage || "I found an ambiguous font name. Please clarify the font family.",
    };
  }

  if (plan.isFormattingOnly && isRewriteOperator(plan.canonicalOperator)) {
    return {
      ok: false,
      code: "ALLYBI_FORMATTING_REWRITE_BLOCKED",
      message: "Formatting request cannot be routed to a text rewrite operator.",
    };
  }

  if (plan.blockedRewrite && isRewriteOperator(plan.canonicalOperator)) {
    return {
      ok: false,
      code: "ALLYBI_REWRITE_CLASS_BLOCKED",
      message: `Operator ${plan.canonicalOperator} is blocked for this non-rewrite request class.`,
    };
  }

  const actualClass = operatorClassFromCanonical(plan.domain, plan.canonicalOperator);
  if (!classesCompatible(plan.operatorClass, actualClass)) {
    return {
      ok: false,
      code: "ALLYBI_OPERATOR_CLASS_MISMATCH",
      message: `Operator ${plan.canonicalOperator} does not match expected class ${String(plan.operatorClass)}.`,
    };
  }

  if (!supportsScope(plan.canonicalOperator, plan.scopeKind)) {
    return {
      ok: false,
      code: "ALLYBI_SCOPE_OPERATOR_MISMATCH",
      message: `Operator ${plan.canonicalOperator} is incompatible with scope ${String(plan.scopeKind)}.`,
    };
  }

  const schema = getOperatorSchema(domain, plan.canonicalOperator);
  if (!schema || typeof schema !== "object") return { ok: true };

  const required = Array.isArray((schema as any).required) ? (schema as any).required : [];
  for (const reqField of required) {
    if (!(reqField in payload)) {
      return {
        ok: false,
        code: "ALLYBI_SCHEMA_MISSING_FIELD",
        message: `Missing required field '${String(reqField)}' for ${plan.canonicalOperator}.`,
      };
    }
  }

  const style = payload.style && typeof payload.style === "object"
    ? (payload.style as Record<string, unknown>)
    : {};
  const format = payload.format && typeof payload.format === "object"
    ? (payload.format as Record<string, unknown>)
    : {};
  const fontFamily = String(
    style.fontFamily ||
    format.fontFamily ||
    (plan.fontFamily || ""),
  ).trim();
  if (fontFamily) {
    const banks = loadAllybiBanks();
    const familyMap = banks.fontAliases?.families && typeof banks.fontAliases.families === "object"
      ? (banks.fontAliases.families as Record<string, any>)
      : {};
    const supported = Object.keys(familyMap);
    const exact = supported.some((family) => family.toLowerCase() === fontFamily.toLowerCase());
    if (!exact) {
      const lang = languageFromInput(options?.language || plan.language);
      const template = String(banks.fontAliases?.errors?.FONT_UNSUPPORTED?.[lang] || "").trim() ||
        (lang === "pt"
          ? "Fonte não disponível neste mecanismo. Escolha uma destas: {supported}."
          : "Font not available in this document engine. Choose one of: {supported}.");
      return {
        ok: false,
        code: "ALLYBI_FONT_UNSUPPORTED",
        message: template.replace("{supported}", supported.join(", ")),
      };
    }
  }

  return { ok: true };
}
