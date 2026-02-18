/**
 * Plan assembler.
 *
 * Takes matched patterns + filled slots → validated plan.
 * Substitutes $slot references, validates against operator catalog,
 * deduplicates, and orders dependencies.
 */

import type {
  IntentPattern,
  FilledSlots,
  ResolvedPlanStep,
  IntentPlan,
  ClarificationNeeded,
  WorklogStep,
  MatchResult,
  SlotFillResult,
  PlanStepUiMeta,
} from "./types";
import { loadOperatorCatalog } from "./loaders";
import { buildWorklog } from "./worklog";

// ---------------------------------------------------------------------------
// Slot substitution
// ---------------------------------------------------------------------------

function substituteSlotValue(value: unknown, filled: FilledSlots): unknown {
  if (typeof value === "string") {
    // Exact match: entire value is a single slot reference (e.g. "$target")
    const exactMatch = /^\$([a-zA-Z_]\w*)$/.exec(value);
    if (exactMatch) {
      return filled[exactMatch[1]] ?? null;
    }
    // Embedded interpolation: "Heading $level" → "Heading 2"
    if (value.includes("$")) {
      return value.replace(/\$([a-zA-Z_]\w*)/g, (_match, name) => {
        const resolved = filled[name];
        return resolved != null ? String(resolved) : "";
      });
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => substituteSlotValue(item, filled));
  }
  if (typeof value === "object" && value !== null) {
    return substituteSlots(value as Record<string, unknown>, filled);
  }
  return value;
}

export function substituteSlots(
  template: Record<string, unknown>,
  filled: FilledSlots,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(template)) {
    result[key] = substituteSlotValue(value, filled);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Dependency ordering
// ---------------------------------------------------------------------------

const OP_ORDER: Record<string, number> = {
  // Type conversions first
  XLSX_SET_RANGE_VALUES: 10,
  XLSX_SET_CELL_VALUE: 10,
  // Formulas
  XLSX_SET_CELL_FORMULA: 20,
  XLSX_SET_RANGE_FORMULAS: 20,
  XLSX_FILL_DOWN: 25,
  XLSX_FILL_RIGHT: 25,
  XLSX_AGGREGATION: 25,
  // Formatting
  XLSX_FORMAT_RANGE: 30,
  XLSX_SET_NUMBER_FORMAT: 30,
  XLSX_WRAP_TEXT: 30,
  XLSX_AUTO_FIT: 35,
  XLSX_MERGE_CELLS: 35,
  // Conditional formatting
  XLSX_COND_FORMAT_COLOR_SCALE: 40,
  XLSX_COND_FORMAT_DATA_BARS: 40,
  XLSX_COND_FORMAT_TOP_N: 40,
  // Structural
  XLSX_SORT_RANGE: 50,
  XLSX_FILTER_APPLY: 50,
  XLSX_TABLE_CREATE: 55,
  XLSX_DATA_VALIDATION_SET: 55,
  XLSX_FREEZE_PANES: 60,
  XLSX_INSERT_ROWS: 65,
  XLSX_DELETE_ROWS: 65,
  XLSX_INSERT_COLUMNS: 65,
  XLSX_DELETE_COLUMNS: 65,
  XLSX_HIDE_ROWS_COLS: 70,
  XLSX_SHOW_ROWS_COLS: 70,
  // Charts
  XLSX_CHART_CREATE: 80,
  XLSX_CHART_SET_SERIES: 85,
  XLSX_CHART_SET_TITLES: 85,
  XLSX_CHART_SET_AXES: 85,
  XLSX_CHART_DELETE: 90,
  // Sheet operations
  XLSX_ADD_SHEET: 95,
  XLSX_RENAME_SHEET: 95,
  XLSX_DELETE_SHEET: 99,
  // DOCX — structural first, then content, then formatting
  DOCX_INSERT_BEFORE: 10,
  DOCX_INSERT_AFTER: 10,
  DOCX_DELETE_PARAGRAPH: 15,
  DOCX_MERGE_PARAGRAPHS: 15,
  DOCX_SPLIT_PARAGRAPH: 15,
  DOCX_LIST_APPLY_BULLETS: 20,
  DOCX_LIST_APPLY_NUMBERING: 20,
  DOCX_LIST_REMOVE: 20,
  DOCX_LIST_PROMOTE_DEMOTE: 20,
  DOCX_REWRITE_PARAGRAPH: 30,
  DOCX_REPLACE_SPAN: 30,
  DOCX_REWRITE_SECTION: 30,
  DOCX_FIND_REPLACE: 35,
  DOCX_TRANSLATE_SCOPE: 40,
  DOCX_ENRICH_FROM_SOURCES: 40,
  DOCX_SET_TEXT_CASE: 52,
  DOCX_SET_RUN_STYLE: 50,
  DOCX_CLEAR_RUN_STYLE: 50,
  DOCX_SET_ALIGNMENT: 55,
  DOCX_SET_INDENTATION: 55,
  DOCX_SET_LINE_SPACING: 55,
  DOCX_SET_PARAGRAPH_SPACING: 55,
  DOCX_SET_PARAGRAPH_STYLE: 60,
  DOCX_SET_HEADING_LEVEL: 60,
  DOCX_LIST_RESTART_NUMBERING: 22,
  DOCX_NUMBERING_REPAIR: 23,
};

function getOpOrder(op: string): number {
  return OP_ORDER[op] ?? 50;
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

function deduplicateSteps(steps: ResolvedPlanStep[]): ResolvedPlanStep[] {
  const seen = new Set<string>();
  const result: ResolvedPlanStep[] = [];

  for (const step of steps) {
    const key = `${step.op}:${JSON.stringify(step.params)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(step);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Conflict detection
// ---------------------------------------------------------------------------

function detectConflicts(steps: ResolvedPlanStep[]): string[] {
  const catalog = loadOperatorCatalog();
  const warnings: string[] = [];
  const ops = steps.map((s) => s.op);

  for (const step of steps) {
    const entry = catalog[step.op];
    if (!entry?.conflictsWith) continue;
    for (const conflict of entry.conflictsWith) {
      if (ops.includes(conflict)) {
        warnings.push(
          `Operator ${step.op} conflicts with ${conflict} in the same plan.`,
        );
      }
    }
  }

  return warnings;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateRequiredSlots(
  op: string,
  params: Record<string, unknown>,
): string[] {
  const catalog = loadOperatorCatalog();
  const entry = catalog[op];
  if (!entry) return [];

  const missing: string[] = [];
  for (const slot of entry.requiredSlots) {
    if (params[slot] === null || params[slot] === undefined) {
      missing.push(slot);
    }
  }
  return missing;
}

// ---------------------------------------------------------------------------
// UI Metadata
// ---------------------------------------------------------------------------

const STRUCTURE_OPS = new Set([
  "DOCX_INSERT_BEFORE", "DOCX_INSERT_AFTER", "DOCX_DELETE_PARAGRAPH",
  "DOCX_MERGE_PARAGRAPHS", "DOCX_SPLIT_PARAGRAPH",
  "DOCX_LIST_APPLY_BULLETS", "DOCX_LIST_APPLY_NUMBERING", "DOCX_LIST_REMOVE",
  "DOCX_LIST_PROMOTE_DEMOTE", "DOCX_LIST_RESTART_NUMBERING", "DOCX_NUMBERING_REPAIR",
  "XLSX_INSERT_ROWS", "XLSX_DELETE_ROWS", "XLSX_INSERT_COLUMNS", "XLSX_DELETE_COLUMNS",
  "XLSX_ADD_SHEET", "XLSX_RENAME_SHEET", "XLSX_DELETE_SHEET",
  "XLSX_MERGE_CELLS", "XLSX_TABLE_CREATE", "XLSX_SORT_RANGE", "XLSX_FILTER_APPLY",
  "XLSX_FILTER_CLEAR", "XLSX_FREEZE_PANES", "XLSX_HIDE_ROWS_COLS", "XLSX_SHOW_ROWS_COLS",
]);

const FORMAT_OPS = new Set([
  "DOCX_SET_RUN_STYLE", "DOCX_CLEAR_RUN_STYLE", "DOCX_SET_PARAGRAPH_STYLE",
  "DOCX_SET_HEADING_LEVEL", "DOCX_SET_ALIGNMENT", "DOCX_SET_INDENTATION",
  "DOCX_SET_LINE_SPACING", "DOCX_SET_PARAGRAPH_SPACING", "DOCX_SET_TEXT_CASE",
  "XLSX_FORMAT_RANGE", "XLSX_SET_NUMBER_FORMAT", "XLSX_WRAP_TEXT", "XLSX_AUTO_FIT",
  "XLSX_COND_FORMAT_DATA_BARS", "XLSX_COND_FORMAT_COLOR_SCALE", "XLSX_COND_FORMAT_TOP_N",
  "XLSX_DATA_VALIDATION_SET",
]);

function getIconCategory(op: string): PlanStepUiMeta["icon"] {
  if (STRUCTURE_OPS.has(op)) return "structure";
  if (FORMAT_OPS.has(op)) return "format";
  return "content";
}

function buildTargetDescription(
  op: string,
  params: Record<string, unknown>,
): string {
  const target = params.targetId || params.targets || params.rangeA1 || params.range || "";
  const targetStr = Array.isArray(target)
    ? target.slice(0, 3).join(", ") + (target.length > 3 ? "..." : "")
    : String(target || "").slice(0, 60);
  if (targetStr) return targetStr;
  return "";
}

function buildUiMeta(
  op: string,
  params: Record<string, unknown>,
  language: "en" | "pt",
): PlanStepUiMeta {
  const catalog = loadOperatorCatalog();
  const entry = catalog[op];
  let label: string;
  if (entry?.uiStepTemplate) {
    const template = language === "pt" ? entry.uiStepTemplate.pt : entry.uiStepTemplate.en;
    label = template.replace(/\{\{(\w+)\}\}/g, (_m, slot) => {
      const v = params[slot];
      return v != null ? String(v) : "...";
    }).replace(/\.{3}$/, "").trim();
  } else {
    label = op.replace(/^(?:XLSX_|DOCX_)/, "").replace(/_/g, " ").toLowerCase();
  }
  return {
    label,
    icon: getIconCategory(op),
    targetDescription: buildTargetDescription(op, params),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface AssemblyInput {
  matchResults: MatchResult[];
  slotResults: SlotFillResult[];
  domain: "excel" | "docx";
  language: "en" | "pt";
}

export function assemblePlan(
  input: AssemblyInput,
): IntentPlan | ClarificationNeeded {
  const steps: ResolvedPlanStep[] = [];
  const allMissing: Array<{ slot: string; message: string }> = [];
  const sourcePatternIds: string[] = [];

  for (let i = 0; i < input.matchResults.length; i++) {
    const match = input.matchResults[i];
    const slots = input.slotResults[i];
    if (!match.bestMatch) continue;

    const pattern = match.bestMatch.pattern;
    sourcePatternIds.push(pattern.id);

    // Build steps from plan template
    for (const template of pattern.planTemplate) {
      const { op, ...rest } = template;
      const opStr = String(op);

      // Substitute slots
      const params = substituteSlots(rest, slots.filled);

      // Validate required slots
      const missingSlots = validateRequiredSlots(opStr, params);

      // Check if clarification is needed for truly missing required slots
      if (missingSlots.length > 0 && pattern.clarifyIfMissing) {
        for (const missingSlot of missingSlots) {
          const rule = pattern.clarifyIfMissing.find(
            (r) => r.slot === missingSlot,
          );
          if (rule) {
            const message =
              input.language === "pt" ? rule.ask_pt : rule.ask_en;
            allMissing.push({ slot: missingSlot, message });
          }
        }
      }

      steps.push({
        op: opStr,
        params,
        stepId: `step_${steps.length + 1}`,
        ...(slots.localeConversions?.length ? { localeConversions: slots.localeConversions } : {}),
      });
    }
  }

  // Deduplicate identical steps
  const deduped = deduplicateSteps(steps);

  // Sort by dependency order
  const ordered = deduped.sort(
    (a, b) => getOpOrder(a.op) - getOpOrder(b.op),
  );

  // Re-assign step IDs after ordering and attach uiMeta
  const finalSteps = ordered.map((step, idx) => ({
    ...step,
    stepId: `step_${idx + 1}`,
    uiMeta: buildUiMeta(step.op, step.params, input.language),
  }));

  // Check for conflicts (warnings only, don't block)
  detectConflicts(finalSteps);

  // If there are critical missing slots, return clarification
  if (allMissing.length > 0) {
    return {
      kind: "clarification",
      missingSlots: allMissing,
      partialOps: finalSteps,
      sourcePatternIds,
    };
  }

  // Build worklog
  const worklog = buildWorklog(finalSteps, input.language);

  return {
    kind: "plan",
    ops: finalSteps,
    worklog,
    sourcePatternIds,
    language: input.language,
    domain: input.domain,
  };
}
