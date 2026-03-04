import type {
  DocumentUnderstandingOutput,
  LegacyDocIntOutput,
  LegacyDocIntSection,
  LegacyDocIntTable,
  TextEvidence,
} from "./types";

function asTextEvidenceArray(value: TextEvidence[] | undefined): TextEvidence[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => ({
    page: Number(entry.page || 1),
    span: {
      start: Number(entry.span?.start || 0),
      end: Number(entry.span?.end || 0),
    },
  }));
}

function adaptSection(section: LegacyDocIntSection, index: number) {
  const sectionId = String(section.id || `section_${index + 1}`);
  const pageStart = Number(section.startPage || 1);
  const pageEnd = Number(section.endPage || pageStart);
  return {
    id: sectionId,
    label: String(section.section || section.label || "unknown"),
    parent_id:
      section.parentId === null || section.parentId === undefined
        ? null
        : String(section.parentId),
    page_start: pageStart,
    page_end: pageEnd,
    spans: asTextEvidenceArray(section.spans),
    confidence: Number(section.confidence ?? 0),
  };
}

function adaptTable(table: LegacyDocIntTable, index: number) {
  return {
    id: String(table.id || `table_${index + 1}`),
    label: String(table.tableType || table.label || "unknown"),
    page: Number(table.page || 1),
    bbox: {
      x: Number(table.bbox?.x || 0),
      y: Number(table.bbox?.y || 0),
      w: Number(table.bbox?.w || 1),
      h: Number(table.bbox?.h || 1),
    },
    confidence: Number(table.confidence ?? 0),
    evidence: asTextEvidenceArray(table.evidence),
  };
}

export function adaptLegacyDocIntOutput(
  legacy: LegacyDocIntOutput,
): DocumentUnderstandingOutput {
  const evidence = asTextEvidenceArray(legacy.docTypeEvidence);
  const safeEvidence = evidence.length > 0 ? evidence : [{ page: 1, span: { start: 0, end: 0 } }];

  return {
    schema_version: String(legacy.schemaVersion || "1.0.0"),
    document_id: String(legacy.documentId || ""),
    doc_type: {
      label: String(legacy.docType || "unknown"),
      confidence: Number(legacy.docTypeConfidence ?? 0),
      evidence: safeEvidence,
    },
    sections: (legacy.sections || []).map(adaptSection),
    tables: (legacy.tables || []).map(adaptTable),
    meta: {
      languages: legacy.language ? [String(legacy.language)] : [],
      ocr_used: Boolean(legacy.ocrUsed),
      processing_time_ms: Number(legacy.processingTimeMs || 0),
      eval_track: legacy.evalTrack ? String(legacy.evalTrack) : undefined,
    },
  };
}
