import type { EditDomain, EditOperator } from "./editing.types";

const CANONICAL_EDIT_OPERATORS = new Set<EditOperator>([
  "EDIT_PARAGRAPH",
  "EDIT_SPAN",
  "EDIT_DOCX_BUNDLE",
  "ADD_PARAGRAPH",
  "EDIT_CELL",
  "EDIT_RANGE",
  "ADD_SHEET",
  "RENAME_SHEET",
  "CREATE_CHART",
  "COMPUTE",
  "COMPUTE_BUNDLE",
  "ADD_SLIDE",
  "REWRITE_SLIDE_TEXT",
  "REPLACE_SLIDE_IMAGE",
]);

const PLAN_ALIASES = new Set([
  "edit.plan",
  "edit_plan",
  "editing.plan",
  "editing_plan",
  "plan_edit",
]);

const APPLY_ALIASES = new Set([
  "edit.apply",
  "edit_apply",
  "editing.apply",
  "editing_apply",
  "apply_edit",
]);

const UNDO_ALIASES = new Set([
  "edit.undo",
  "edit_undo",
  "editing.undo",
  "editing_undo",
  "undo_edit",
]);

export type StrictEditActionAlias = "plan" | "apply" | "undo" | null;

export interface NormalizedEditOperatorResult {
  operator: EditOperator | null;
  canonicalOperator?: string | null;
  strictActionAlias: StrictEditActionAlias;
}

function normalizeToken(value: unknown): string {
  return String(value || "").trim();
}

function looksLikeChartRequest(message: string): boolean {
  const low = message.toLowerCase();
  const explicitChartNoun =
    /\b(chart|graph|plot|gr[aá]fico|gr[aá]fica)\b/.test(low);
  const explicitChartTypePhrase =
    /\b(pie|bar|line|area|scatter|combo|bubble|radar|histogram|stacked)\s+(chart|graph|plot)\b/.test(low) ||
    /\b(column|coluna|barra|pizza|linha|dispers[aã]o|combinad[oa]|bolha|histograma|empilhad[oa])\s+(chart|graph|gr[aá]fico)\b/.test(low);
  const chartVerbWithType =
    /\b(create|build|generate|make|criar|gerar|fazer)\b.{0,24}\b(pie|bar|column|line|area|scatter|combo|bubble|radar|histogram|stacked)\b/.test(low);
  return (
    explicitChartNoun ||
    explicitChartTypePhrase ||
    chartVerbWithType
  );
}

function looksLikeTableOrComputeRequest(message: string): boolean {
  const low = message.toLowerCase();
  return (
    /\b(table|column|calculate|compute|sum|total|average|avg|min|max|count|sort|filter|freeze|format|validation|dropdown|conditional|print)\b/.test(low) ||
    /\b(tabela|coluna|calcular|somar|m[eé]dia|media|total|m[ií]nimo|m[aá]ximo|contar|ordenar|filtrar|congelar|formatar|valida[cç][aã]o|lista suspensa|condicional|impress[aã]o)\b/.test(low)
  );
}

function defaultOperatorForDomain(domain: EditDomain, instruction: string): EditOperator {
  if (domain === "sheets") {
    if (looksLikeChartRequest(instruction)) return "CREATE_CHART";
    return looksLikeTableOrComputeRequest(instruction) ? "COMPUTE_BUNDLE" : "EDIT_RANGE";
  }
  if (domain === "slides") {
    return /\b(add|insert|new)\b.{0,20}\bslide\b/i.test(instruction) ? "ADD_SLIDE" : "REWRITE_SLIDE_TEXT";
  }
  if (/\b(add|insert|append)\b.{0,30}\bparagraph\b/i.test(instruction)) return "ADD_PARAGRAPH";
  if (/\b(word|sentence|span|selection)\b/i.test(instruction)) return "EDIT_SPAN";
  return "EDIT_PARAGRAPH";
}

function isAllybiCanonicalOperator(value: string): boolean {
  return /^DOCX_[A-Z0-9_]+$/.test(value) || /^XLSX_[A-Z0-9_]+$/.test(value);
}

function runtimeFromAllybiCanonical(operator: string): EditOperator | null {
  const op = String(operator || "").trim().toUpperCase();
  if (!op) return null;

  if (op === "DOCX_REPLACE_SPAN") return "EDIT_SPAN";
  if (op === "DOCX_REWRITE_PARAGRAPH") return "EDIT_PARAGRAPH";
  if (op === "DOCX_INSERT_AFTER" || op === "DOCX_INSERT_BEFORE") return "ADD_PARAGRAPH";
  if (op.startsWith("DOCX_")) return "EDIT_DOCX_BUNDLE";

  if (op === "XLSX_SET_CELL_VALUE") return "EDIT_CELL";
  if (op === "XLSX_SET_RANGE_VALUES") return "EDIT_RANGE";
  if (op === "XLSX_ADD_SHEET") return "ADD_SHEET";
  if (op === "XLSX_RENAME_SHEET") return "RENAME_SHEET";
  if (op.startsWith("XLSX_CHART_")) return "CREATE_CHART";
  if (op.startsWith("XLSX_")) return "COMPUTE_BUNDLE";

  return null;
}

export function normalizeEditOperator(
  rawOperator: unknown,
  options: { domain: EditDomain; instruction: string },
): NormalizedEditOperatorResult {
  const raw = normalizeToken(rawOperator);
  if (!raw) return { operator: null, canonicalOperator: null, strictActionAlias: null };

  if (CANONICAL_EDIT_OPERATORS.has(raw as EditOperator)) {
    return { operator: raw as EditOperator, canonicalOperator: null, strictActionAlias: null };
  }

  const upper = raw.toUpperCase();
  if (isAllybiCanonicalOperator(upper)) {
    const runtime = runtimeFromAllybiCanonical(upper);
    return {
      operator: runtime,
      canonicalOperator: upper,
      strictActionAlias: null,
    };
  }

  const low = raw.toLowerCase();
  if (PLAN_ALIASES.has(low)) {
    return {
      operator: defaultOperatorForDomain(options.domain, options.instruction),
      canonicalOperator: null,
      strictActionAlias: "plan",
    };
  }
  if (APPLY_ALIASES.has(low)) {
    return {
      operator: defaultOperatorForDomain(options.domain, options.instruction),
      canonicalOperator: null,
      strictActionAlias: "apply",
    };
  }
  if (UNDO_ALIASES.has(low)) {
    return {
      operator: defaultOperatorForDomain(options.domain, options.instruction),
      canonicalOperator: null,
      strictActionAlias: "undo",
    };
  }

  // Map non-canonical databank/operator IDs to canonical edit operators.
  const token = low.replace(/[.\s-]+/g, "_");
  if (token.includes("create_chart") || token.includes("update_chart") || token.includes("change_chart_type") || token.includes("chart_from_")) {
    return { operator: "CREATE_CHART", canonicalOperator: "XLSX_CHART_CREATE", strictActionAlias: null };
  }
  if (token.includes("set_run_style") || token.includes("format_inline")) {
    return { operator: "EDIT_DOCX_BUNDLE", canonicalOperator: "DOCX_SET_RUN_STYLE", strictActionAlias: null };
  }
  if (token.includes("clear_run_style")) {
    return { operator: "EDIT_DOCX_BUNDLE", canonicalOperator: "DOCX_CLEAR_RUN_STYLE", strictActionAlias: null };
  }
  if (token.includes("rewrite_paragraph") || token.includes("docx_rewrite")) {
    return { operator: "EDIT_PARAGRAPH", canonicalOperator: "DOCX_REWRITE_PARAGRAPH", strictActionAlias: null };
  }
  if (token.includes("replace_span")) {
    return { operator: "EDIT_SPAN", canonicalOperator: "DOCX_REPLACE_SPAN", strictActionAlias: null };
  }
  if (token.includes("insert_after") || token.includes("insert_before")) {
    return { operator: "ADD_PARAGRAPH", canonicalOperator: "DOCX_INSERT_AFTER", strictActionAlias: null };
  }
  if (token.includes("edit_cell")) return { operator: "EDIT_CELL", canonicalOperator: "XLSX_SET_CELL_VALUE", strictActionAlias: null };
  if (token.includes("edit_range")) return { operator: "EDIT_RANGE", canonicalOperator: "XLSX_SET_RANGE_VALUES", strictActionAlias: null };
  if (token.includes("rename_sheet")) return { operator: "RENAME_SHEET", canonicalOperator: "XLSX_RENAME_SHEET", strictActionAlias: null };
  if (token.includes("add_sheet")) return { operator: "ADD_SHEET", canonicalOperator: "XLSX_ADD_SHEET", strictActionAlias: null };
  if (token.includes("compute") || token.includes("sort") || token.includes("filter") || token.includes("format") || token.includes("validation") || token.includes("freeze")) {
    return { operator: "COMPUTE_BUNDLE", canonicalOperator: "XLSX_FORMAT_RANGE", strictActionAlias: null };
  }
  if (token.startsWith("sheets_")) {
    // Most sheets.* operator IDs in databanks map to compute bundles.
    return {
      operator: looksLikeChartRequest(options.instruction) ? "CREATE_CHART" : "COMPUTE_BUNDLE",
      canonicalOperator: looksLikeChartRequest(options.instruction) ? "XLSX_CHART_CREATE" : "XLSX_FORMAT_RANGE",
      strictActionAlias: null,
    };
  }

  return { operator: null, canonicalOperator: null, strictActionAlias: null };
}
