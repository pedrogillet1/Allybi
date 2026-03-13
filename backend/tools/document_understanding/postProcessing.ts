import { DOCUMENT_UNDERSTANDING_ONTOLOGY } from "./ontology";
import { applyAbstention, normalizeDocumentUnderstandingOutput } from "./normalization";
import { validateDocumentUnderstandingOutput } from "./validation";
import type {
  CanonicalOntology,
  DocumentUnderstandingOutput,
  PostProcessOptions,
  PostProcessResult,
} from "./types";

const DEFAULT_ABSTAIN_THRESHOLD = 0.65;

function resolveThreshold(options: PostProcessOptions): number {
  const candidate = Number(options.confidence_abstain_threshold);
  if (!Number.isFinite(candidate)) return DEFAULT_ABSTAIN_THRESHOLD;
  if (candidate < 0) return 0;
  if (candidate > 1) return 1;
  return candidate;
}

export function postProcessDocumentUnderstandingOutput(
  output: DocumentUnderstandingOutput,
  options: PostProcessOptions = {},
  ontology: CanonicalOntology = DOCUMENT_UNDERSTANDING_ONTOLOGY,
): PostProcessResult {
  const unknownLabel = options.unknown_label || "unknown";
  const threshold = resolveThreshold(options);

  const normalized = normalizeDocumentUnderstandingOutput(output, options, ontology);

  const withAbstention: DocumentUnderstandingOutput = {
    ...normalized,
    doc_type: {
      ...normalized.doc_type,
      label: applyAbstention(normalized.doc_type.label, normalized.doc_type.confidence, threshold, unknownLabel),
    },
    sections: normalized.sections.map((section) => ({
      ...section,
      label: applyAbstention(section.label, section.confidence, threshold, unknownLabel),
    })),
    tables: normalized.tables.map((table) => ({
      ...table,
      label: applyAbstention(table.label, table.confidence, threshold, unknownLabel),
    })),
  };

  const validation = validateDocumentUnderstandingOutput(withAbstention);

  return {
    output: withAbstention,
    issues: validation.issues,
  };
}
