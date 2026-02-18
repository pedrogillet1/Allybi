import type {
  A1Range,
  ChartSpec,
  ConditionalFormatRule,
  FilterSpec,
  SortKey,
  StyleModel,
  TableStyleSpec,
  ValidationRule,
} from "./spreadsheetModel.types";

export type TypedValue = string | number | boolean | null | Date;

export type PatchOp =
  | {
      op: "SET_VALUE";
      sheet?: string;
      range: A1Range;
      value?: TypedValue;
      values?: TypedValue[][];
      mode?: "broadcast" | "matrix";
      ranges?: A1Range[];
    }
  | {
      op: "SET_FORMULA";
      sheet?: string;
      range: A1Range;
      formula: string;
      mode?: "broadcast" | "fillDown";
      ranges?: A1Range[];
    }
  | { op: "CLEAR_CONTENT"; sheet?: string; range: A1Range }
  | { op: "SET_NUMBER_FORMAT"; sheet?: string; range: A1Range; format: string; ranges?: A1Range[] }
  | {
      op: "SET_STYLE";
      sheet?: string;
      range: A1Range;
      stylePatch: Partial<StyleModel>;
      merge?: "preserve" | "override";
      ranges?: A1Range[];
    }
  | { op: "CLEAR_FORMATTING"; sheet?: string; range: A1Range }
  | { op: "INSERT_ROWS"; sheet: string; atRow: number; count: number }
  | { op: "DELETE_ROWS"; sheet: string; atRow: number; count: number }
  | { op: "INSERT_COLUMNS"; sheet: string; atCol: number; count: number }
  | { op: "DELETE_COLUMNS"; sheet: string; atCol: number; count: number }
  | { op: "ADD_SHEET"; name: string }
  | { op: "RENAME_SHEET"; from: string; to: string }
  | { op: "DELETE_SHEET"; name: string }
  | { op: "SORT_RANGE"; sheet?: string; range: A1Range; keys: SortKey[]; hasHeader?: boolean }
  | { op: "FILTER_RANGE"; sheet?: string; range: A1Range; filters?: FilterSpec[] }
  | { op: "CLEAR_FILTER"; sheet: string }
  | { op: "FREEZE_PANES"; sheet: string; rowSplit?: number; colSplit?: number }
  | { op: "CREATE_TABLE"; sheet?: string; range: A1Range; name?: string; style?: TableStyleSpec; hasHeader?: boolean }
  | { op: "SET_VALIDATION"; sheet?: string; range: A1Range; rule: ValidationRule }
  | { op: "CLEAR_VALIDATION"; sheet?: string; range: A1Range }
  | { op: "SET_CONDITIONAL_FORMAT"; sheet?: string; range: A1Range; rule: ConditionalFormatRule }
  | { op: "CREATE_CHART_CARD"; sheet?: string; range: A1Range; chart: ChartSpec };

export type PatchPlanTranslationResult = {
  patchOps: PatchOp[];
  rejectedOps: string[];
  canonicalOps: string[];
};

export type PatchApplyStatus = {
  index: number;
  op: PatchOp["op"];
  status: "applied" | "noop" | "rejected";
  message?: string;
  range?: string;
};

export type PatchApplyResult = {
  model: import("./spreadsheetModel.types").SpreadsheetModel;
  statuses: PatchApplyStatus[];
  touchedRanges: string[];
  changedStructuresCount: number;
};
