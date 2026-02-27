import {
  EditHandlerService,
  type EditHandlerRequest,
  type EditHandlerResponse,
} from "../../core/handlers/editHandler.service";
import type { EditingAgentDependencies, EditingDomainAgent } from "./types";
import {
  buildEnhancedSemanticIndex,
  numberToCol,
  type EnhancedSemanticIndex,
  type SpreadsheetModel,
} from "../spreadsheetModel";
import { logger } from "../../../utils/logger";

// ---------------------------------------------------------------------------
// Local types
// ---------------------------------------------------------------------------

interface WorkbookContext {
  semanticIndices: Record<string, EnhancedSemanticIndex>;
  sheetNames: string[];
}

/** Score threshold below which a NL resolution is ignored. */
const NL_RESOLVE_MIN_SCORE = 0.4;

// ---------------------------------------------------------------------------
// Formula template helpers
// ---------------------------------------------------------------------------

interface FormulaTemplate {
  pattern: RegExp;
  /** Generate a formula given resolved column letters and row placeholders. */
  build: (cols: ResolvedFormulaCols) => string;
}

interface ResolvedFormulaCols {
  /** Primary value column letter (e.g. "B") */
  value: string;
  /** Secondary column letter when the template needs two columns */
  secondary?: string;
  /** Last data row number */
  lastRow: number;
}

const FORMULA_TEMPLATES: FormulaTemplate[] = [
  {
    pattern:
      /\b(profit\s*margin|margem\s*de\s*lucro)\b/i,
    build: ({ value, secondary, lastRow: _lr }) => {
      const rev = value;
      const cost = secondary || String.fromCharCode(value.charCodeAt(0) + 1);
      return `=(${rev}{r}-${cost}{r})/${rev}{r}`;
    },
  },
  {
    pattern: /\b(running\s*total|total\s*acumulado|cumulative\s*sum)\b/i,
    build: ({ value }) => `=SUM($${value}$2:${value}{r})`,
  },
  {
    pattern:
      /\b(percent(age)?\s*of\s*total|percentual\s*do\s*total)\b/i,
    build: ({ value, lastRow }) =>
      `=${value}{r}/SUM(${value}$2:${value}$${lastRow})`,
  },
  {
    pattern: /\b(year\s*over\s*year|yoy|ano\s*a\s*ano)\b/i,
    build: ({ value }) => {
      const prev = String.fromCharCode(value.charCodeAt(0) - 1);
      return `=(${value}{r}-${prev}{r})/${prev}{r}`;
    },
  },
  {
    pattern: /\b(growth\s*rate|taxa\s*de\s*crescimento)\b/i,
    build: ({ value }) =>
      `=(${value}{r}-${value}{r-1})/${value}{r-1}`,
  },
  {
    pattern: /\b(average|m[eé]dia)\b/i,
    build: ({ value, lastRow }) =>
      `=AVERAGE(${value}$2:${value}$${lastRow})`,
  },
];

// ---------------------------------------------------------------------------
// Multi-op expansion templates
// ---------------------------------------------------------------------------

interface MultiOpExpansion {
  pattern: RegExp;
  expand: (
    op: Record<string, unknown>,
    context: WorkbookContext,
  ) => Array<Record<string, unknown>>;
}

const MULTI_OP_EXPANSIONS: MultiOpExpansion[] = [
  {
    pattern:
      /\b(create\s*summary\s*dashboard|criar\s*painel\s*resumo|summary\s*sheet)\b/i,
    expand: (_op, context) => {
      const result: Array<Record<string, unknown>> = [];
      const sheetName =
        (typeof _op.sheetName === "string" ? _op.sheetName : null) ||
        context.sheetNames[0] ||
        "Sheet1";
      const idx = context.semanticIndices[sheetName];

      // Step 1: add new summary sheet
      result.push({
        kind: "add_sheet",
        sheetName: "Summary Dashboard",
        description: "Create summary dashboard sheet",
      });

      // Step 2: aggregation formulas for each numeric column
      if (idx?.tableBounds) {
        const { firstCol, lastCol, lastDataRow } = idx.tableBounds;
        for (let c = firstCol; c <= lastCol; c += 1) {
          const colInfo = idx.columns[c];
          const typeInfo = idx.columnTypeInference[c];
          if (
            typeInfo &&
            (typeInfo.kind === "currency" ||
              typeInfo.kind === "number" ||
              typeInfo.kind === "percent")
          ) {
            const colLetter = numberToCol(c);
            result.push({
              kind: "set_cell_value",
              sheetName: "Summary Dashboard",
              target: `A${result.length}`,
              value: colInfo?.header || colLetter,
              description: `Label for ${colInfo?.header || colLetter}`,
            });
            result.push({
              kind: "set_cell_formula",
              sheetName: "Summary Dashboard",
              target: `B${result.length}`,
              formula: `=SUM('${sheetName}'!${colLetter}2:${colLetter}${lastDataRow})`,
              description: `Sum of ${colInfo?.header || colLetter}`,
            });
          }
        }
      }

      // Step 3: conditional format
      result.push({
        kind: "cond_format",
        sheetName: "Summary Dashboard",
        range: "B1:B100",
        rule: { type: "color_scale" },
        description: "Apply color scale to summary values",
      });

      // Step 4: chart
      result.push({
        kind: "create_chart",
        sheetName: "Summary Dashboard",
        chartType: "bar",
        description: "Create summary bar chart",
      });

      return result;
    },
  },
  {
    pattern:
      /\b(format\s*as\s*table|formatar\s*como\s*tabela)\b/i,
    expand: (op, context) => {
      const result: Array<Record<string, unknown>> = [];
      const sheetName =
        (typeof op.sheetName === "string" ? op.sheetName : null) ||
        context.sheetNames[0] ||
        "Sheet1";
      const idx = context.semanticIndices[sheetName];

      // Step 1: header formatting
      result.push({
        kind: "set_style",
        sheetName,
        range: idx?.tableBounds
          ? `${numberToCol(idx.tableBounds.firstCol)}${idx.tableBounds.headerRow}:${numberToCol(idx.tableBounds.lastCol)}${idx.tableBounds.headerRow}`
          : "A1:Z1",
        style: { font: { bold: true }, fill: { color: "#4472C4" } },
        description: "Bold & color header row",
      });

      // Step 2: alternating row colors
      result.push({
        kind: "cond_format",
        sheetName,
        range: idx?.tableBounds
          ? `${numberToCol(idx.tableBounds.firstCol)}${idx.tableBounds.firstDataRow}:${numberToCol(idx.tableBounds.lastCol)}${idx.tableBounds.lastDataRow}`
          : "A2:Z100",
        rule: { type: "alternating_rows", color: "#D9E2F3" },
        description: "Apply alternating row colors",
      });

      // Step 3: auto-filter
      result.push({
        kind: "set_auto_filter",
        sheetName,
        range: idx?.tableBounds
          ? `${numberToCol(idx.tableBounds.firstCol)}${idx.tableBounds.headerRow}:${numberToCol(idx.tableBounds.lastCol)}${idx.tableBounds.lastDataRow}`
          : "A1:Z100",
        description: "Enable auto-filter on table",
      });

      return result;
    },
  },
];

// ---------------------------------------------------------------------------
// SheetsEditAgentService
// ---------------------------------------------------------------------------

export class SheetsEditAgentService implements EditingDomainAgent {
  readonly domain = "sheets" as const;
  readonly id = "edit_agent_sheets" as const;
  private readonly handler: EditHandlerService;

  constructor(deps?: EditingAgentDependencies) {
    this.handler = new EditHandlerService({
      revisionStore: deps?.revisionStore,
      telemetry: deps?.telemetry,
    });
  }

  async execute(input: EditHandlerRequest): Promise<EditHandlerResponse> {
    // Build workbook context from the input if a spreadsheet model is present.
    const context = this.buildWorkbookContext(input);

    // If we have context AND ops-like data in the plan request, enrich them.
    if (context && input.planRequest) {
      const instruction = input.planRequest.instruction || "";
      const ops = this.extractOps(input);

      if (ops.length > 0) {
        let enriched = ops;

        // 1. Resolve natural-language column targets
        enriched = this.resolveNaturalLanguageTargets(enriched, context);

        // 2. Generate formulas for formula-intent ops
        enriched = this.generateFormulas(enriched, context, instruction);

        // 3. Expand multi-op intents
        enriched = this.expandMultiOps(enriched, context, instruction);

        // 4. Validate before apply
        const validation = this.validateBeforeApply(enriched);
        if (validation.warnings.length > 0) {
          logger.warn("[SheetsEditAgent] pre-apply warnings", {
            warnings: validation.warnings,
            correlationId: input.context?.correlationId,
          });
        }

        // Write enriched ops back into the input
        this.writeOpsBack(input, enriched);
      } else {
        // Even without explicit ops, try to enrich the instruction via
        // formula generation (the plan request instruction may describe a
        // formula intent that the planner will handle).
        this.tryEnrichInstruction(input, context);
      }
    }

    return this.handler.execute(input);
  }

  // -------------------------------------------------------------------------
  // 1. Build workbook context
  // -------------------------------------------------------------------------

  private buildWorkbookContext(
    input: EditHandlerRequest,
  ): WorkbookContext | null {
    try {
      // The spreadsheet model can appear as part of the sheetsCandidates
      // metadata, or be attached directly on the input context.
      const model = this.extractSpreadsheetModel(input);
      if (!model) return null;

      const semanticIndices = buildEnhancedSemanticIndex(model);
      const sheetNames = model.sheets.map((s) => s.name);

      return { semanticIndices, sheetNames };
    } catch (err) {
      logger.warn("[SheetsEditAgent] failed to build workbook context", {
        error: String(err),
      });
      return null;
    }
  }

  /**
   * Best-effort extraction of the SpreadsheetModel from available input data.
   */
  private extractSpreadsheetModel(
    input: EditHandlerRequest,
  ): SpreadsheetModel | null {
    // Check sheetsCandidates — some callers attach the full model on the first
    // candidate's metadata.
    const candidates = input.sheetsCandidates;
    if (candidates && candidates.length > 0) {
      for (const candidate of candidates) {
        const candidateAny = candidate as unknown as Record<string, unknown>;
        const meta = candidateAny?.metadata;
        if (meta && typeof meta === "object" && "sheets" in (meta as object)) {
          const maybeModel = meta as unknown as SpreadsheetModel;
          if (
            maybeModel.version === 1 &&
            Array.isArray(maybeModel.sheets)
          ) {
            return maybeModel;
          }
        }
        // Also check if the candidate itself is a model wrapper.
        if (candidateAny.model && typeof candidateAny.model === "object") {
          const inner = candidateAny.model as unknown as SpreadsheetModel;
          if (inner.version === 1 && Array.isArray(inner.sheets)) {
            return inner;
          }
        }
      }
    }

    // Check the context for an attached model (runtime-injected).
    const ctx = input.context as unknown as Record<string, unknown>;
    if (ctx?.spreadsheetModel) {
      const model = ctx.spreadsheetModel as unknown as SpreadsheetModel;
      if (model.version === 1 && Array.isArray(model.sheets)) {
        return model;
      }
    }

    return null;
  }

  // -------------------------------------------------------------------------
  // 2. Resolve natural-language targets
  // -------------------------------------------------------------------------

  private resolveNaturalLanguageTargets(
    ops: Array<Record<string, unknown>>,
    context: WorkbookContext,
  ): Array<Record<string, unknown>> {
    return ops.map((op) => {
      const colRef =
        (op.columnName as string | undefined) ||
        (op.column as string | undefined);
      if (!colRef || typeof colRef !== "string") return op;

      // Skip if it already looks like an A1 column reference (e.g. "A", "AB").
      if (/^[A-Z]{1,3}$/i.test(colRef.trim())) return op;

      // Try to resolve across all sheets (prefer sheet specified in op).
      const targetSheet =
        typeof op.sheetName === "string"
          ? op.sheetName
          : context.sheetNames[0];
      const idx = targetSheet
        ? context.semanticIndices[targetSheet]
        : Object.values(context.semanticIndices)[0];
      if (!idx) return op;

      const resolved = this.scoreCandidateColumns(colRef, idx);
      if (resolved) {
        const resolvedOp = { ...op };
        const colLetter = numberToCol(resolved.colNumber);
        if (op.columnName != null) resolvedOp.columnName = colLetter;
        if (op.column != null) resolvedOp.column = colLetter;
        // Also set a resolved flag so downstream consumers know this was
        // resolved from NL.
        resolvedOp._resolvedFromNL = true;
        resolvedOp._resolvedHeader = resolved.header;
        resolvedOp._resolvedScore = resolved.score;
        return resolvedOp;
      }

      return op;
    });
  }

  /**
   * Score candidate columns against a natural-language reference.
   *
   * Scoring tiers:
   *   1.0 — exact header match (case-insensitive)
   *   0.8 — synonym match from the column synonym groups
   *   0.6 — column kind match (e.g. "the money column" → currency)
   *   0.4 — fuzzy substring match
   */
  private scoreCandidateColumns(
    query: string,
    idx: EnhancedSemanticIndex,
  ): { colNumber: number; header: string; score: number } | null {
    const q = query.toLowerCase().trim();
    let best: { colNumber: number; header: string; score: number } | null =
      null;

    for (const [colStr, colInfo] of Object.entries(idx.columns)) {
      const colNumber = Number(colStr);
      const header = (colInfo.header ?? "").toLowerCase();
      if (!header) continue;

      let score = 0;

      // Tier 1: exact match
      if (header === q) {
        score = 1.0;
      }
      // Tier 2: synonym match
      else if (
        idx.columnSynonyms[colNumber]?.some(
          (syn) => syn.toLowerCase() === q,
        )
      ) {
        score = 0.8;
      }
      // Tier 3: kind match (e.g. "the money column" → currency)
      else if (this.queryMatchesKind(q, colInfo.kind)) {
        score = 0.6;
      }
      // Tier 4: fuzzy substring
      else if (header.includes(q) || q.includes(header)) {
        score = 0.4;
      }

      if (score >= NL_RESOLVE_MIN_SCORE && (!best || score > best.score)) {
        best = { colNumber, header: colInfo.header ?? header, score };
      }
    }

    return best;
  }

  private queryMatchesKind(
    query: string,
    kind: string | undefined,
  ): boolean {
    if (!kind) return false;
    const kindAliases: Record<string, string[]> = {
      currency: ["money", "dollar", "cost", "revenue", "price", "valor", "dinheiro"],
      percent: ["percentage", "ratio", "rate", "margem", "taxa"],
      date: ["time", "when", "period", "data", "periodo"],
      text: ["name", "label", "description", "nome", "descricao"],
    };
    const aliases = kindAliases[kind];
    if (!aliases) return false;
    return aliases.some((alias) => query.includes(alias));
  }

  // -------------------------------------------------------------------------
  // 3. Generate formulas
  // -------------------------------------------------------------------------

  private generateFormulas(
    ops: Array<Record<string, unknown>>,
    context: WorkbookContext,
    instruction: string,
  ): Array<Record<string, unknown>> {
    return ops.map((op) => {
      // Only process ops that look like a formula intent (they have a
      // formulaIntent field or the instruction matches a known template).
      const intentText =
        (typeof op.formulaIntent === "string" ? op.formulaIntent : null) ||
        instruction;
      if (!intentText) return op;

      // Already has a formula — leave it alone.
      if (typeof op.formula === "string" && op.formula.startsWith("=")) {
        return op;
      }

      const sheetName =
        (typeof op.sheetName === "string" ? op.sheetName : null) ||
        context.sheetNames[0];
      const idx = sheetName ? context.semanticIndices[sheetName] : null;

      for (const template of FORMULA_TEMPLATES) {
        if (!template.pattern.test(intentText)) continue;

        // Resolve the primary value column.
        const valueCol = this.findPrimaryValueColumn(idx);
        if (!valueCol) continue;

        const lastRow = idx?.tableBounds?.lastDataRow ?? 100;

        const formula = template.build({
          value: numberToCol(valueCol.primary),
          secondary: valueCol.secondary
            ? numberToCol(valueCol.secondary)
            : undefined,
          lastRow,
        });

        return {
          ...op,
          formula,
          _formulaGenerated: true,
          _formulaTemplate: template.pattern.source,
        };
      }

      return op;
    });
  }

  /**
   * Find the best candidate for a "primary value" column — typically the first
   * currency or numeric column — and optionally a secondary one for formulas
   * that need two columns (like profit margin).
   */
  private findPrimaryValueColumn(
    idx: EnhancedSemanticIndex | null,
  ): { primary: number; secondary?: number } | null {
    if (!idx) return null;

    const numericCols: number[] = [];
    for (const [colStr, typeInfo] of Object.entries(idx.columnTypeInference)) {
      if (
        typeInfo.kind === "currency" ||
        typeInfo.kind === "number"
      ) {
        numericCols.push(Number(colStr));
      }
    }

    if (numericCols.length === 0) return null;

    numericCols.sort((a, b) => a - b);
    return {
      primary: numericCols[0],
      secondary: numericCols.length > 1 ? numericCols[1] : undefined,
    };
  }

  // -------------------------------------------------------------------------
  // 4. Expand multi-op intents
  // -------------------------------------------------------------------------

  private expandMultiOps(
    ops: Array<Record<string, unknown>>,
    context: WorkbookContext,
    instruction: string,
  ): Array<Record<string, unknown>> {
    const result: Array<Record<string, unknown>> = [];

    for (const op of ops) {
      const intentText =
        (typeof op.intent === "string" ? op.intent : null) || instruction;

      let expanded = false;
      for (const expansion of MULTI_OP_EXPANSIONS) {
        if (expansion.pattern.test(intentText)) {
          const expandedOps = expansion.expand(op, context);
          result.push(...expandedOps);
          expanded = true;
          break;
        }
      }

      if (!expanded) {
        result.push(op);
      }
    }

    return result;
  }

  // -------------------------------------------------------------------------
  // 5. Validate before apply
  // -------------------------------------------------------------------------

  private validateBeforeApply(
    ops: Array<Record<string, unknown>>,
  ): { valid: boolean; warnings: string[] } {
    const warnings: string[] = [];

    for (const op of ops) {
      // Check formula syntax: balanced parentheses
      if (typeof op.formula === "string") {
        const formula = op.formula;
        let depth = 0;
        for (const ch of formula) {
          if (ch === "(") depth += 1;
          if (ch === ")") depth -= 1;
          if (depth < 0) break;
        }
        if (depth !== 0) {
          warnings.push(
            `Unbalanced parentheses in formula: ${formula.substring(0, 60)}`,
          );
        }
      }

      // Check range bounds — warn on excessively large ranges
      if (typeof op.range === "string") {
        const rangeMatch = op.range.match(
          /([A-Z]{1,3})(\d+):([A-Z]{1,3})(\d+)/i,
        );
        if (rangeMatch) {
          const startRow = parseInt(rangeMatch[2], 10);
          const endRow = parseInt(rangeMatch[4], 10);
          if (endRow - startRow > 10000) {
            warnings.push(
              `Very large range detected (${endRow - startRow + 1} rows): ${op.range}`,
            );
          }
        }
      }

      // Warn on destructive operations affecting many cells
      const kind = typeof op.kind === "string" ? op.kind : "";
      if (
        kind === "delete_rows" ||
        kind === "delete_cols" ||
        kind === "delete_range"
      ) {
        const count =
          typeof op.count === "number"
            ? op.count
            : typeof op.rowCount === "number"
              ? op.rowCount
              : typeof op.colCount === "number"
                ? op.colCount
                : 1;
        if (count > 50) {
          warnings.push(
            `Destructive operation "${kind}" affects ${count} rows/cols — consider confirming with the user`,
          );
        }
      }

      // Warn on sheet deletion
      if (kind === "delete_sheet") {
        warnings.push(
          `Sheet deletion detected for "${op.sheetName || "unknown"}" — this is irreversible`,
        );
      }
    }

    return { valid: warnings.length === 0, warnings };
  }

  // -------------------------------------------------------------------------
  // Helpers — extracting and writing ops from/to the input
  // -------------------------------------------------------------------------

  /**
   * Extract an ops array from the input. The ops can be attached in various
   * places depending on how the upstream caller assembled the request.
   */
  private extractOps(
    input: EditHandlerRequest,
  ): Array<Record<string, unknown>> {
    // Check sheetsCandidates — each candidate could carry an ops payload.
    if (input.sheetsCandidates && input.sheetsCandidates.length > 0) {
      const first = input.sheetsCandidates[0] as unknown as Record<
        string,
        unknown
      >;
      if (Array.isArray(first?.ops)) {
        return first.ops as Array<Record<string, unknown>>;
      }
    }

    // Check the planRequest for embedded ops (some callers use requiredEntities
    // to pass them through).
    const ctx = input.context as unknown as Record<string, unknown>;
    if (ctx?.ops && Array.isArray(ctx.ops)) {
      return ctx.ops as Array<Record<string, unknown>>;
    }

    return [];
  }

  /**
   * Write enriched ops back into the input structure so the downstream
   * handler receives them.
   */
  private writeOpsBack(
    input: EditHandlerRequest,
    ops: Array<Record<string, unknown>>,
  ): void {
    if (input.sheetsCandidates && input.sheetsCandidates.length > 0) {
      const first = input.sheetsCandidates[0] as unknown as Record<
        string,
        unknown
      >;
      if (Array.isArray(first?.ops)) {
        first.ops = ops;
        return;
      }
    }

    const ctx = input.context as unknown as Record<string, unknown>;
    if (ctx?.ops && Array.isArray(ctx.ops)) {
      ctx.ops = ops;
    }
  }

  /**
   * Try to enrich the plan request instruction with formula hints when the
   * instruction matches a known formula template.
   */
  private tryEnrichInstruction(
    input: EditHandlerRequest,
    context: WorkbookContext,
  ): void {
    if (!input.planRequest) return;
    const instruction = input.planRequest.instruction;
    if (!instruction) return;

    for (const template of FORMULA_TEMPLATES) {
      if (template.pattern.test(instruction)) {
        const sheetName = context.sheetNames[0];
        const idx = sheetName
          ? context.semanticIndices[sheetName]
          : null;
        const valueCol = this.findPrimaryValueColumn(idx);
        if (!valueCol) break;

        const lastRow = idx?.tableBounds?.lastDataRow ?? 100;
        const formula = template.build({
          value: numberToCol(valueCol.primary),
          secondary: valueCol.secondary
            ? numberToCol(valueCol.secondary)
            : undefined,
          lastRow,
        });

        // Append formula hint to the target hint so the planner can use it.
        input.planRequest.targetHint =
          (input.planRequest.targetHint || "") +
          ` [generated_formula: ${formula}]`;
        break;
      }
    }
  }
}
