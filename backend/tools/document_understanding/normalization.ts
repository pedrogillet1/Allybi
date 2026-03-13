import { DOCUMENT_UNDERSTANDING_ONTOLOGY, normalizeAliasKey } from "./ontology";
import type {
  CanonicalOntology,
  DocumentUnderstandingOutput,
  PostProcessOptions,
  TablePrediction,
  SectionPrediction,
} from "./types";

export function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function canonicalizeLabel(
  rawLabel: string,
  aliasMap: Map<string, string>,
  unknownLabel = "unknown",
): string {
  const key = normalizeAliasKey(rawLabel);
  if (!key) return unknownLabel;
  return aliasMap.get(key) || unknownLabel;
}

function normalizeLanguages(languages: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const language of languages || []) {
    const normalized = String(language || "").trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function normalizeSection(
  section: SectionPrediction,
  ontology: CanonicalOntology,
  unknownLabel: string,
): SectionPrediction {
  return {
    ...section,
    label: canonicalizeLabel(section.label, ontology.sectionAliasMap, unknownLabel),
    confidence: clampConfidence(section.confidence),
    spans: (section.spans || []).map((span) => ({
      page: Number(span.page),
      span: {
        start: Number(span.span?.start),
        end: Number(span.span?.end),
      },
    })),
  };
}

function normalizeTable(
  table: TablePrediction,
  ontology: CanonicalOntology,
  unknownLabel: string,
): TablePrediction {
  return {
    ...table,
    label: canonicalizeLabel(table.label, ontology.tableAliasMap, unknownLabel),
    confidence: clampConfidence(table.confidence),
    page: Number(table.page),
    bbox: {
      x: Number(table.bbox?.x),
      y: Number(table.bbox?.y),
      w: Number(table.bbox?.w),
      h: Number(table.bbox?.h),
    },
    evidence: (table.evidence || []).map((span) => ({
      page: Number(span.page),
      span: {
        start: Number(span.span?.start),
        end: Number(span.span?.end),
      },
    })),
  };
}

export function normalizeDocumentUnderstandingOutput(
  output: DocumentUnderstandingOutput,
  options: PostProcessOptions = {},
  ontology: CanonicalOntology = DOCUMENT_UNDERSTANDING_ONTOLOGY,
): DocumentUnderstandingOutput {
  const unknownLabel = options.unknown_label || "unknown";

  return {
    ...output,
    schema_version: String(output.schema_version || "1.0.0").trim() || "1.0.0",
    document_id: String(output.document_id || "").trim(),
    doc_type: {
      ...output.doc_type,
      label: canonicalizeLabel(output.doc_type?.label, ontology.docTypeAliasMap, unknownLabel),
      confidence: clampConfidence(Number(output.doc_type?.confidence)),
      evidence: (output.doc_type?.evidence || []).map((span) => ({
        page: Number(span.page),
        span: {
          start: Number(span.span?.start),
          end: Number(span.span?.end),
        },
      })),
    },
    sections: (output.sections || []).map((section) =>
      normalizeSection(section, ontology, unknownLabel),
    ),
    tables: (output.tables || []).map((table) =>
      normalizeTable(table, ontology, unknownLabel),
    ),
    meta: {
      ...output.meta,
      languages: normalizeLanguages(output.meta?.languages || []),
      ocr_used: Boolean(output.meta?.ocr_used),
      processing_time_ms: Math.max(0, Number(output.meta?.processing_time_ms || 0)),
      eval_track: output.meta?.eval_track
        ? String(output.meta.eval_track).trim().toLowerCase()
        : undefined,
      source: output.meta?.source ? String(output.meta.source).trim() : undefined,
    },
  };
}

export function applyAbstention(
  label: string,
  confidence: number,
  threshold: number,
  unknownLabel = "unknown",
): string {
  const normalizedThreshold = Number.isFinite(threshold) ? threshold : 0.65;
  if (confidence < normalizedThreshold) return unknownLabel;
  return label;
}
