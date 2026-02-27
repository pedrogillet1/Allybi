export type SpreadsheetLocale = "en-US" | "pt-BR";

export type CellType = "s" | "n" | "b" | "d" | "e";

export type CellValue = string | number | boolean | null;

export type A1Range = string;

export type MergeRange = {
  r1: number;
  c1: number;
  r2: number;
  c2: number;
};

export type FreezeSpec = {
  rowSplit?: number;
  colSplit?: number;
};

export type StyleModel = {
  font?: {
    name?: string;
    size?: number;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    color?: string;
  };
  fill?: {
    color?: string;
  };
  align?: {
    h?: "left" | "center" | "right";
    v?: "top" | "middle" | "bottom";
    wrap?: boolean;
  };
  border?: Record<string, unknown>;
};

export type ValidationRule = {
  type: string;
  values?: string[];
  min?: number;
  max?: number;
  strict?: boolean;
  showCustomUi?: boolean;
  inputMessage?: string;
};

export type ConditionalFormatRule = {
  type: string;
  value?: string | number;
  backgroundHex?: string;
  textHex?: string;
  color?: string;
  minColor?: string;
  midColor?: string;
  maxColor?: string;
  n?: number;
  percent?: boolean;
  style?: Partial<StyleModel>;
};

export type SortKey = {
  column: number | string;
  order?: "ASC" | "DESC" | "ASCENDING" | "DESCENDING";
};

export type FilterSpec = {
  column?: number | string;
  values?: Array<string | number | boolean | null>;
};

export type TableStyleSpec = {
  style?: string;
  colors?: {
    header?: string;
    stripe?: string;
    totals?: string;
    border?: string;
  };
};

export type ChartSpec = {
  type: string;
  range?: string;
  title?: string;
  settings?: Record<string, unknown>;
};

export type ChartSeriesModel = {
  name: string;
  values: Array<string | number | null>;
};

export type ChartModel = {
  id: string;
  sheetName: string;
  sourceRange: string;
  locateRange: string;
  spec: ChartSpec;
  categories: Array<string | number | null>;
  series: ChartSeriesModel[];
};

export type TableModel = {
  id: string;
  sheetName: string;
  range: string;
  hasHeader?: boolean;
  style?: TableStyleSpec;
};

export type NamedRangeModel = {
  name: string;
  range: string;
};

export type CellModel = {
  v?: CellValue;
  t?: CellType;
  f?: string;
  nf?: string;
  s?: string;
  note?: string;
  validation?: ValidationRule;
};

export type SheetModel = {
  id: string;
  name: string;
  grid: {
    maxRow: number;
    maxCol: number;
    rowHeights?: Record<number, number>;
    colWidths?: Record<number, number>;
    merges?: MergeRange[];
    freeze?: FreezeSpec;
    autoFilterRange?: string;
    hiddenRows?: number[];
    hiddenColumns?: number[];
  };
  cells: Record<string, CellModel>;
  validations?: Array<{ range: string; rule: ValidationRule }>;
  conditionalFormats?: Array<{ range: string; rule: ConditionalFormatRule }>;
};

export type SpreadsheetModel = {
  version: 1;
  workbook: {
    name?: string;
    locale?: SpreadsheetLocale;
    createdAt?: string;
  };
  sheets: SheetModel[];
  styles: Record<string, StyleModel>;
  charts?: ChartModel[];
  tables?: TableModel[];
  namedRanges?: NamedRangeModel[];
  meta: {
    source: "xlsx_import" | "google_sheet_import";
    buildHash: string;
  };
};

export type SemanticIndex = {
  sheetName: string;
  headerRow?: number;
  columns: Record<
    number,
    { header?: string; kind?: "currency" | "percent" | "text" | "date" }
  >;
  rowGroups: Array<{ label: string; startRow: number; endRow: number }>;
  keyCells: Record<string, { role: string; row: number; col: number }>;
};

export type ColumnTypeInference = {
  kind:
    | "currency"
    | "percent"
    | "date"
    | "id"
    | "categorical"
    | "email"
    | "url"
    | "text"
    | "number";
  confidence: number;
  sampleSize: number;
};

export type TableBounds = {
  headerRow: number;
  firstDataRow: number;
  lastDataRow: number;
  firstCol: number;
  lastCol: number;
};

export type MultiHeaderRow = {
  row: number;
  mergedRanges: Array<{ label: string; startCol: number; endCol: number }>;
};

export type EnhancedSemanticIndex = SemanticIndex & {
  tableBounds?: TableBounds;
  multiHeaders?: MultiHeaderRow[];
  columnSynonyms: Record<number, string[]>;
  formulaSummaries: Record<number, string>;
  columnTypeInference: Record<number, ColumnTypeInference>;
};

export type SpreadsheetModelDiff = {
  changed: boolean;
  changedCellsCount: number;
  changedStructuresCount: number;
  affectedRanges: string[];
  locateRange: string | null;
  changedSamples: Array<{
    sheetName: string;
    cell: string;
    before: string;
    after: string;
  }>;
};
