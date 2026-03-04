export type Confidence = number;

export interface CharacterSpan {
  start: number;
  end: number;
}

export interface TextEvidence {
  page: number;
  span: CharacterSpan;
}

export interface BoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DocTypePrediction {
  label: string;
  confidence: Confidence;
  evidence: TextEvidence[];
}

export interface SectionPrediction {
  id: string;
  label: string;
  parent_id: string | null;
  page_start: number;
  page_end: number;
  spans: TextEvidence[];
  confidence: Confidence;
}

export interface TablePrediction {
  id: string;
  label: string;
  page: number;
  bbox: BoundingBox;
  confidence: Confidence;
  evidence: TextEvidence[];
}

export interface DocumentUnderstandingMeta {
  languages: string[];
  ocr_used: boolean;
  processing_time_ms: number;
  eval_track?: string;
  source?: string;
}

export interface DocumentUnderstandingOutput {
  schema_version: string;
  document_id: string;
  doc_type: DocTypePrediction;
  sections: SectionPrediction[];
  tables: TablePrediction[];
  meta: DocumentUnderstandingMeta;
}

export interface OntologyLabel {
  id: string;
  display_name: string;
  major?: boolean;
  parent_id?: string | null;
  domains?: string[];
  aliases?: string[];
}

export interface OntologyCatalog {
  version: string;
  kind: string;
  labels: OntologyLabel[];
}

export interface AliasCatalog {
  version: string;
  doc_type: Record<string, string>;
  section_type: Record<string, string>;
  table_type: Record<string, string>;
}

export interface CanonicalOntology {
  version: string;
  docTypes: OntologyCatalog;
  sectionTypes: OntologyCatalog;
  tableTypes: OntologyCatalog;
  aliases: AliasCatalog;
  docTypeAliasMap: Map<string, string>;
  sectionAliasMap: Map<string, string>;
  tableAliasMap: Map<string, string>;
  majorDocTypeLabels: string[];
}

export type ValidationSeverity = "error" | "warning";

export interface ValidationIssue {
  code: string;
  path: string;
  message: string;
  severity: ValidationSeverity;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

export interface PostProcessOptions {
  confidence_abstain_threshold?: number;
  unknown_label?: string;
}

export interface PostProcessResult {
  output: DocumentUnderstandingOutput;
  issues: ValidationIssue[];
}

export interface EvaluationCase {
  gold: DocumentUnderstandingOutput;
  predicted: DocumentUnderstandingOutput;
  track?: string;
}

export interface LabelScore {
  label: string;
  support: number;
  tp: number;
  fp: number;
  fn: number;
  precision: number;
  recall: number;
  f1: number;
}

export interface DocTypeMetrics {
  accuracy: number;
  macroF1: number;
  perLabel: LabelScore[];
  perMajorLabel: LabelScore[];
}

export interface SectionMetrics {
  precision: number;
  recall: number;
  spanF1: number;
  iou: number;
  tpPages: number;
  fpPages: number;
  fnPages: number;
}

export interface TableMetrics {
  detectionRecall: number;
  detectionPrecision: number;
  typeAccuracy: number;
  matched: number;
  matchedType: number;
  totalGold: number;
  totalPredicted: number;
}

export interface CalibrationMetrics {
  ece: number;
  bins: Array<{
    start: number;
    end: number;
    count: number;
    avgConfidence: number;
    avgAccuracy: number;
  }>;
}

export interface AbstentionMetrics {
  unknownPredictions: number;
  abstentionPrecision: number;
  abstentionCoverage: number;
}

export interface EvaluationMetrics {
  docType: DocTypeMetrics;
  sections: SectionMetrics;
  tables: TableMetrics;
  calibration: CalibrationMetrics;
  abstention: AbstentionMetrics;
}

export interface ThresholdProfile {
  docTypeMacroF1Min: number;
  docTypePerMajorMin: number;
  sectionSpanF1Min: number;
  sectionIoUMin: number;
  tableTypeAccuracyMin: number;
  tableRecallMin: number;
  abstentionPrecisionMin: number;
  robustnessRatioMin: number;
}

export interface EvaluationFailure {
  code: string;
  message: string;
}

export interface EvaluationReport {
  totalCases: number;
  scoredCases: number;
  droppedCases: number;
  invalidCases: Array<{
    document_id: string;
    side: "gold" | "predicted";
    issues: ValidationIssue[];
  }>;
  metrics: EvaluationMetrics;
  byTrack: Record<string, EvaluationMetrics>;
  passed: boolean;
  failures: EvaluationFailure[];
  thresholdProfile: ThresholdProfile;
}

export interface EvaluationOptions {
  thresholdProfile?: ThresholdProfile;
  tableIoUThreshold?: number;
  calibrationBins?: number;
  confidenceAbstainThreshold?: number;
  strict?: boolean;
}

export interface LegacyDocIntSection {
  id?: string;
  section?: string;
  label?: string;
  parentId?: string | null;
  startPage?: number;
  endPage?: number;
  spans?: TextEvidence[];
  confidence?: number;
}

export interface LegacyDocIntTable {
  id?: string;
  tableType?: string;
  label?: string;
  page?: number;
  bbox?: BoundingBox;
  confidence?: number;
  evidence?: TextEvidence[];
}

export interface LegacyDocIntOutput {
  documentId?: string;
  schemaVersion?: string;
  docType?: string;
  docTypeConfidence?: number;
  docTypeEvidence?: TextEvidence[];
  sections?: LegacyDocIntSection[];
  tables?: LegacyDocIntTable[];
  language?: string;
  ocrUsed?: boolean;
  processingTimeMs?: number;
  evalTrack?: string;
}
