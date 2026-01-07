/**
 * KODA Master Schema v6.0 - HIGH-CEILING INTENT GENERATION
 *
 * GRAND TOTALS (across 3 languages: en/pt/es):
 * ============================================
 * TIER-0 (Critical):
 *   - DOCUMENTS:    47,000 keywords | 25,000 patterns
 *   - EXTRACTION:   52,000 keywords | 28,000 patterns
 *   - REASONING:    47,000 keywords | 25,000 patterns
 *
 * TIER-1 (Structural):
 *   - EDIT:         21,000 keywords | 10,000 patterns
 *   - HELP:         17,000 keywords |  8,000 patterns
 *   - CONVERSATION: 12,000 keywords |  5,000 patterns
 *
 * TIER-2 (Stateful/Safety):
 *   - MEMORY:       16,000 keywords |  7,000 patterns
 *   - PREFERENCES:  14,000 keywords |  6,000 patterns
 *   - FILE_ACTIONS: 10,000 keywords |  5,000 patterns
 *   - ERROR:        10,000 keywords |  5,000 patterns
 *
 * TOTAL: ~246,000 keywords | ~124,000 patterns | 3 languages
 */

export const SUPPORTED_LANGUAGES = ['en', 'pt', 'es'];

// ============================================================================
// DEPTH SCALE (D0-D8)
// ============================================================================

export const DEPTH_SCALE = {
  D0: { name: 'Detection', description: 'Detect intent only' },
  D1: { name: 'Minimal', description: 'Direct, surface-level' },
  D2: { name: 'Contextual', description: 'Adds surrounding context' },
  D3: { name: 'Structured', description: 'Organized explanation' },
  D4: { name: 'Analytical', description: 'Reasoning, relationships' },
  D5: { name: 'Cross-Referential', description: 'Multiple sources' },
  D6: { name: 'Evaluative', description: 'Risk, impact, judgment' },
  D7: { name: 'Expert', description: 'Domain-level reasoning' },
  D8: { name: 'Meta', description: 'Reasoning about reasoning' }
};

// ============================================================================
// INTENT TARGETS (per language)
// ============================================================================

export const INTENT_TARGETS = {
  DOCUMENTS:    { keywords: 15700, patterns: 8300 },
  EXTRACTION:   { keywords: 17300, patterns: 9300 },
  REASONING:    { keywords: 15700, patterns: 8300 },
  EDIT:         { keywords: 7000,  patterns: 3300 },
  HELP:         { keywords: 5700,  patterns: 2700 },
  CONVERSATION: { keywords: 4000,  patterns: 1700 },
  MEMORY:       { keywords: 5300,  patterns: 2300 },
  PREFERENCES:  { keywords: 4700,  patterns: 2000 },
  FILE_ACTIONS: { keywords: 3300,  patterns: 1700 },
  ERROR:        { keywords: 3300,  patterns: 1700 }
};

// ============================================================================
// 1. DOCUMENTS INTENT - TIER 0
// ============================================================================

export const DOCUMENTS = {
  states: {
    SINGLE_DOC: { description: 'Single document referenced' },
    MULTIPLE_DOCS: { description: 'Multiple documents referenced' },
    FOLDER_CONTEXT: { description: 'Folder / collection context' },
    WORKSPACE_CONTEXT: { description: 'Entire workspace context' },
    EXPLICIT_NAME: { description: 'Explicit document name mentioned' },
    IMPLICIT_REF: { description: 'Implicit document reference' },
    UNKNOWN_REF: { description: 'Unknown document reference' },
    MISSING_DOC: { description: 'Missing document' },
    AMBIGUOUS_DOC: { description: 'Ambiguous document' },
    CONFLICTING_DOCS: { description: 'Conflicting documents' },
    OUTDATED_DOC: { description: 'Outdated document' },
    RECENT_DOC: { description: 'Recent document' },
    VERSIONED_DOCS: { description: 'Versioned documents' },
    DRAFT_DOC: { description: 'Draft document' },
    FINALIZED_DOC: { description: 'Finalized document' },
    PARTIAL_RELEVANCE: { description: 'Partial document relevance' },
    HIGH_RELEVANCE: { description: 'High relevance document' },
    LOW_CONFIDENCE: { description: 'Low confidence relevance' },
    LONG_DOC: { description: 'Long document' },
    SHORT_DOC: { description: 'Short document' },
    STRUCTURED_DOC: { description: 'Structured document (tables, forms)' },
    SEMI_STRUCTURED: { description: 'Semi-structured document' },
    UNSTRUCTURED: { description: 'Unstructured narrative' },
    OCR_DERIVED: { description: 'Scanned / OCR-derived document' },
    NATIVE_DIGITAL: { description: 'Native digital document' },
    MULTILINGUAL_DOC: { description: 'Multilingual document' },
    MIXED_LANG_SET: { description: 'Mixed-language document set' },
    NUMERIC_HEAVY: { description: 'Numeric-heavy document' },
    TEXT_HEAVY: { description: 'Text-heavy document' },
    LEGAL_STYLE: { description: 'Legal-style document' },
    FINANCIAL_STYLE: { description: 'Financial-style document' },
    MEDICAL_STYLE: { description: 'Medical-style document' },
    TECHNICAL_STYLE: { description: 'Technical-style document' },
    INFORMAL_DOC: { description: 'Informal document' }
  },

  actions: {
    // Information Retrieval
    LOCATE_FACT: { description: 'Locate fact', family: 'retrieval' },
    LOCATE_SECTION: { description: 'Locate section', family: 'retrieval' },
    LOCATE_PARAGRAPH: { description: 'Locate paragraph', family: 'retrieval' },
    LOCATE_CLAUSE: { description: 'Locate clause', family: 'retrieval' },
    LOCATE_NUMBER: { description: 'Locate number', family: 'retrieval' },
    LOCATE_DEFINITION: { description: 'Locate definition', family: 'retrieval' },
    LOCATE_REFERENCE: { description: 'Locate reference', family: 'retrieval' },
    // Extraction
    EXTRACT_VALUES: { description: 'Extract values', family: 'extraction' },
    EXTRACT_DATES: { description: 'Extract dates', family: 'extraction' },
    EXTRACT_NAMES: { description: 'Extract names', family: 'extraction' },
    EXTRACT_ENTITIES: { description: 'Extract entities', family: 'extraction' },
    EXTRACT_OBLIGATIONS: { description: 'Extract obligations', family: 'extraction' },
    EXTRACT_RESPONSIBILITIES: { description: 'Extract responsibilities', family: 'extraction' },
    EXTRACT_RISKS: { description: 'Extract risks', family: 'extraction' },
    EXTRACT_PENALTIES: { description: 'Extract penalties', family: 'extraction' },
    EXTRACT_FORMULAS: { description: 'Extract formulas', family: 'extraction' },
    EXTRACT_METRICS: { description: 'Extract metrics', family: 'extraction' },
    // Analysis
    INTERPRET_MEANING: { description: 'Interpret meaning', family: 'analysis' },
    IDENTIFY_IMPLICATIONS: { description: 'Identify implications', family: 'analysis' },
    DETECT_INCONSISTENCIES: { description: 'Detect inconsistencies', family: 'analysis' },
    DETECT_CONTRADICTIONS: { description: 'Detect contradictions', family: 'analysis' },
    DETECT_MISSING_INFO: { description: 'Detect missing information', family: 'analysis' },
    DETECT_AMBIGUITY: { description: 'Detect ambiguity', family: 'analysis' },
    ASSESS_RISK: { description: 'Assess risk', family: 'analysis' },
    ASSESS_COMPLIANCE: { description: 'Assess compliance', family: 'analysis' },
    ASSESS_ACCURACY: { description: 'Assess accuracy', family: 'analysis' },
    ASSESS_COMPLETENESS: { description: 'Assess completeness', family: 'analysis' },
    ASSESS_ALIGNMENT: { description: 'Assess alignment', family: 'analysis' },
    // Transformation
    SUMMARIZE: { description: 'Summarize', family: 'transformation' },
    SIMPLIFY: { description: 'Simplify', family: 'transformation' },
    REWRITE: { description: 'Rewrite', family: 'transformation' },
    NORMALIZE_LANG: { description: 'Normalize language', family: 'transformation' },
    CONVERT_FORMAT: { description: 'Convert format (text ↔ table)', family: 'transformation' },
    STANDARDIZE_STRUCTURE: { description: 'Standardize structure', family: 'transformation' },
    TRANSLATE_CONTENT: { description: 'Translate content', family: 'transformation' },
    // Comparison
    COMPARE_DOCUMENTS: { description: 'Compare documents', family: 'comparison' },
    COMPARE_VERSIONS: { description: 'Compare versions', family: 'comparison' },
    COMPARE_CLAUSES: { description: 'Compare clauses', family: 'comparison' },
    COMPARE_SECTIONS: { description: 'Compare sections', family: 'comparison' },
    COMPARE_METRICS: { description: 'Compare metrics', family: 'comparison' },
    COMPARE_ASSUMPTIONS: { description: 'Compare assumptions', family: 'comparison' },
    // Organization
    CATEGORIZE_DOCS: { description: 'Categorize documents', family: 'organization' },
    TAG_CONTENT: { description: 'Tag content', family: 'organization' },
    GROUP_RELATED: { description: 'Group related items', family: 'organization' },
    SORT_BY_CRITERIA: { description: 'Sort by criteria', family: 'organization' },
    PRIORITIZE_INFO: { description: 'Prioritize information', family: 'organization' },
    // Decision Support
    RECOMMEND_ACTION: { description: 'Recommend action', family: 'decision' },
    HIGHLIGHT_ISSUES: { description: 'Highlight issues', family: 'decision' },
    FLAG_ATTENTION: { description: 'Flag attention areas', family: 'decision' },
    IDENTIFY_NEXT_STEPS: { description: 'Identify next steps', family: 'decision' },
    SUGGEST_FOLLOWUP: { description: 'Suggest follow-up questions', family: 'decision' }
  },

  scope: {
    SINGLE_SENTENCE: { description: 'Single sentence' },
    SINGLE_PARAGRAPH: { description: 'Single paragraph' },
    SINGLE_SECTION: { description: 'Single section' },
    MULTIPLE_SECTIONS: { description: 'Multiple sections' },
    ENTIRE_DOCUMENT: { description: 'Entire document' },
    MULTIPLE_DOCUMENTS: { description: 'Multiple documents' },
    FOLDER_LEVEL: { description: 'Folder-level' },
    WORKSPACE_LEVEL: { description: 'Workspace-level' },
    TIME_BOUNDED: { description: 'Time-bounded (date range)' },
    VERSION_BOUNDED: { description: 'Version-bounded' },
    AUTHOR_BOUNDED: { description: 'Author-bounded' },
    FILETYPE_BOUNDED: { description: 'File-type bounded' },
    LANGUAGE_BOUNDED: { description: 'Language-bounded' },
    TOPIC_BOUNDED: { description: 'Topic-bounded' },
    NUMERIC_ONLY: { description: 'Numeric-only' },
    TEXT_ONLY: { description: 'Text-only' },
    METADATA_ONLY: { description: 'Metadata-only' },
    STRUCTURAL_ONLY: { description: 'Structural-only (headings, tables)' },
    APPENDIX_ONLY: { description: 'Appendix-only' }
  },

  analyticalDepth: {
    SURFACE_LOOKUP: { description: 'Surface lookup', depth: 1 },
    CONTEXTUAL_EXPLANATION: { description: 'Contextual explanation', depth: 2 },
    CROSS_REFERENCE: { description: 'Cross-reference reasoning', depth: 3 },
    MULTI_HOP: { description: 'Multi-hop reasoning', depth: 4 },
    LOGICAL_INFERENCE: { description: 'Logical inference', depth: 4 },
    ASSUMPTION_ANALYSIS: { description: 'Assumption analysis', depth: 5 },
    RISK_ANALYSIS: { description: 'Risk analysis', depth: 5 },
    FINANCIAL_IMPACT: { description: 'Financial impact analysis', depth: 6 },
    LEGAL_IMPLICATION: { description: 'Legal implication analysis', depth: 6 },
    COMPLIANCE_ANALYSIS: { description: 'Compliance analysis', depth: 6 },
    TREND_ANALYSIS: { description: 'Trend analysis', depth: 5 },
    SENSITIVITY_ANALYSIS: { description: 'Sensitivity analysis', depth: 6 },
    SCENARIO_COMPARISON: { description: 'Scenario comparison', depth: 7 },
    EXPERT_INTERPRETATION: { description: 'Expert-level interpretation', depth: 7 }
  },

  evidenceAndTrust: {
    DIRECT_CITATION: { description: 'Direct citation required' },
    MULTIPLE_CITATIONS: { description: 'Multiple citations required' },
    CITATION_OPTIONAL: { description: 'Citation optional' },
    APPROXIMATE_ALLOWED: { description: 'Approximate answer allowed' },
    INFERENCE_ALLOWED: { description: 'Inference allowed' },
    INFERENCE_RESTRICTED: { description: 'Inference restricted' },
    SPECULATION_FORBIDDEN: { description: 'Speculation forbidden' },
    NUMERICAL_PRECISION: { description: 'Numerical precision required' },
    LEGAL_PRECISION: { description: 'Legal-grade precision' },
    FINANCIAL_PRECISION: { description: 'Financial-grade precision' },
    MEDICAL_CAUTION: { description: 'Medical caution mode' },
    LOW_CONFIDENCE_DISCLAIMER: { description: 'Low-confidence disclaimer required' }
  },

  temporalContext: {
    MOST_RECENT: { description: 'Most recent version only' },
    HISTORICAL_COMPARE: { description: 'Historical comparison' },
    VERSION_EVOLUTION: { description: 'Version evolution' },
    SUPERSEDED_CONTENT: { description: 'Superseded content' },
    DRAFT_VS_FINAL: { description: 'Draft vs final' },
    AMENDMENT_AWARE: { description: 'Amendment-aware' },
    TIME_SENSITIVE: { description: 'Time-sensitive obligations' },
    EXPIRED_CLAUSES: { description: 'Expired clauses' },
    FUTURE_EFFECTIVE: { description: 'Future-effective content' }
  },

  consistency: {
    INTERNALLY_CONSISTENT: { description: 'Internally consistent' },
    MINOR_INCONSISTENCIES: { description: 'Minor inconsistencies' },
    MAJOR_INCONSISTENCIES: { description: 'Major inconsistencies' },
    CONTRADICTORY_SECTIONS: { description: 'Contradictory sections' },
    CONFLICTING_DOCUMENTS: { description: 'Conflicting documents' },
    MISSING_DEPENDENCIES: { description: 'Missing dependencies' },
    UNDEFINED_TERMS: { description: 'Undefined terms' },
    CIRCULAR_REFERENCES: { description: 'Circular references' },
    AMBIGUOUS_STATEMENTS: { description: 'Ambiguous statements' }
  },

  outputControl: {
    SINGLE_PARAGRAPH: { description: 'Single paragraph' },
    BULLET_POINTS: { description: 'Bullet points' },
    NUMBERED_STEPS: { description: 'Numbered steps' },
    TABLE: { description: 'Table' },
    MATRIX_COMPARISON: { description: 'Matrix comparison' },
    TIMELINE: { description: 'Timeline' },
    MIXED_SECTIONS: { description: 'Mixed sections' },
    ASK_FOLLOWUP: { description: 'Ask follow-up question' },
    SUGGEST_ACTION: { description: 'Suggest next action' },
    OFFER_REFINEMENT: { description: 'Offer refinement' },
    SHOW_MORE: { description: 'Show more option' },
    CLARIFICATION_REQUEST: { description: 'Clarification request' },
    HIGHLIGHT_RISKS: { description: 'Highlight risks' },
    HIGHLIGHT_OBLIGATIONS: { description: 'Highlight obligations' },
    HIGHLIGHT_DEADLINES: { description: 'Highlight deadlines' },
    HIGHLIGHT_DISCREPANCIES: { description: 'Highlight discrepancies' },
    HIGHLIGHT_KEY_NUMBERS: { description: 'Highlight key numbers' },
    HIGHLIGHT_ASSUMPTIONS: { description: 'Highlight assumptions' }
  },

  memory: {
    ACTIVE_DOC_REFS: { description: 'Active document references' },
    SELECTED_VERSIONS: { description: 'Selected versions' },
    ACCEPTED_ASSUMPTIONS: { description: 'Accepted assumptions' },
    OPEN_QUESTIONS: { description: 'Open questions' },
    RESOLVED_QUESTIONS: { description: 'Resolved questions' },
    FLAGGED_RISKS: { description: 'Flagged risks' },
    FLAGGED_INCONSISTENCIES: { description: 'Flagged inconsistencies' },
    USER_FOCUS_AREA: { description: 'User focus area' },
    PREFERRED_SCOPE: { description: 'Preferred scope' },
    PRIOR_CONCLUSIONS: { description: 'Prior conclusions' }
  }
};

// ============================================================================
// 2. EXTRACTION INTENT - TIER 0
// ============================================================================

export const EXTRACTION = {
  states: {
    SINGLE_TARGET: { description: 'Single target extraction' },
    MULTIPLE_TARGETS: { description: 'Multiple targets extraction' },
    REPEATING_PATTERN: { description: 'Repeating pattern extraction' },
    STRUCTURED_DATA: { description: 'Structured data extraction' },
    SEMI_STRUCTURED: { description: 'Semi-structured data extraction' },
    UNSTRUCTURED_TEXT: { description: 'Unstructured text extraction' },
    EXPLICIT_REQUEST: { description: 'Explicit extraction request' },
    IMPLICIT_REQUEST: { description: 'Implicit extraction request' },
    AMBIGUOUS_TARGET: { description: 'Ambiguous extraction target' },
    MULTIPLE_CANDIDATES: { description: 'Multiple candidate targets' },
    PARTIAL_EXTRACTION: { description: 'Partial extraction possible' },
    COMPLETE_EXTRACTION: { description: 'Complete extraction possible' },
    MISSING_TARGET: { description: 'Missing extraction target' },
    CONFLICTING_TARGETS: { description: 'Conflicting extraction targets' },
    HIGH_CONFIDENCE: { description: 'High-confidence extractable' },
    MEDIUM_CONFIDENCE: { description: 'Medium-confidence extractable' },
    LOW_CONFIDENCE: { description: 'Low-confidence extractable' },
    NOISY_SOURCE: { description: 'Noisy source content' },
    OCR_DERIVED: { description: 'OCR-derived content' },
    NUMERIC_HEAVY: { description: 'Numeric-heavy extraction' },
    TEXT_HEAVY: { description: 'Text-heavy extraction' },
    TABLE_BASED: { description: 'Table-based extraction' },
    LIST_BASED: { description: 'List-based extraction' },
    CLAUSE_BASED: { description: 'Clause-based extraction' },
    ENTITY_BASED: { description: 'Entity-based extraction' },
    METADATA_ONLY: { description: 'Metadata-only extraction' },
    CROSS_DOCUMENT: { description: 'Cross-document extraction' },
    VERSION_SPECIFIC: { description: 'Version-specific extraction' },
    TEMPORAL_EXTRACTION: { description: 'Temporal extraction' },
    CONDITIONAL_EXTRACTION: { description: 'Conditional extraction' },
    NESTED_EXTRACTION: { description: 'Nested extraction required' }
  },

  actions: {
    // Core Primitive Extraction
    EXTRACT_NUMBERS: { description: 'Extract numbers', family: 'primitive' },
    EXTRACT_DATES: { description: 'Extract dates', family: 'primitive' },
    EXTRACT_NAMES: { description: 'Extract names', family: 'primitive' },
    EXTRACT_ENTITIES: { description: 'Extract entities', family: 'primitive' },
    EXTRACT_TABLES: { description: 'Extract tables', family: 'primitive' },
    EXTRACT_LISTS: { description: 'Extract lists', family: 'primitive' },
    EXTRACT_CLAUSES: { description: 'Extract clauses', family: 'primitive' },
    EXTRACT_DEFINITIONS: { description: 'Extract definitions', family: 'primitive' },
    EXTRACT_METRICS: { description: 'Extract metrics', family: 'primitive' },
    EXTRACT_FORMULAS: { description: 'Extract formulas', family: 'primitive' },
    EXTRACT_IDENTIFIERS: { description: 'Extract identifiers', family: 'primitive' },
    EXTRACT_REFERENCES: { description: 'Extract references', family: 'primitive' },
    // Semantic & Legal/Business
    EXTRACT_OBLIGATIONS: { description: 'Extract obligations', family: 'semantic' },
    EXTRACT_RESPONSIBILITIES: { description: 'Extract responsibilities', family: 'semantic' },
    EXTRACT_RIGHTS: { description: 'Extract rights', family: 'semantic' },
    EXTRACT_RISKS: { description: 'Extract risks', family: 'semantic' },
    EXTRACT_PENALTIES: { description: 'Extract penalties', family: 'semantic' },
    EXTRACT_CONDITIONS: { description: 'Extract conditions', family: 'semantic' },
    EXTRACT_THRESHOLDS: { description: 'Extract thresholds', family: 'semantic' },
    EXTRACT_ASSUMPTIONS: { description: 'Extract assumptions', family: 'semantic' },
    EXTRACT_EXCLUSIONS: { description: 'Extract exclusions', family: 'semantic' },
    EXTRACT_DEPENDENCIES: { description: 'Extract dependencies', family: 'semantic' },
    // Control & Validation
    NORMALIZE_VALUES: { description: 'Normalize extracted values', family: 'control' },
    DEDUPLICATE_ITEMS: { description: 'Deduplicate extracted items', family: 'control' },
    VALIDATE_VALUES: { description: 'Validate extracted values', family: 'control' },
    RANK_ITEMS: { description: 'Rank extracted items', family: 'control' },
    GROUP_ITEMS: { description: 'Group extracted items', family: 'control' },
    RESOLVE_AMBIGUITIES: { description: 'Resolve ambiguities', family: 'control' },
    FLAG_MISSING: { description: 'Flag missing items', family: 'control' },
    SCORE_CONFIDENCE: { description: 'Score extraction confidence', family: 'control' },
    ATTACH_SOURCE: { description: 'Attach source reference', family: 'control' },
    ALIGN_TO_SCHEMA: { description: 'Align to domain schema', family: 'control' }
  },

  scope: {
    SINGLE_TOKEN: { description: 'Single token' },
    SINGLE_SENTENCE: { description: 'Single sentence' },
    SINGLE_PARAGRAPH: { description: 'Single paragraph' },
    SINGLE_SECTION: { description: 'Single section' },
    MULTIPLE_SECTIONS: { description: 'Multiple sections' },
    ENTIRE_DOCUMENT: { description: 'Entire document' },
    MULTIPLE_DOCUMENTS: { description: 'Multiple documents' },
    FOLDER_LEVEL: { description: 'Folder-level' },
    WORKSPACE_LEVEL: { description: 'Workspace-level' },
    VERSION_BOUNDED: { description: 'Version-bounded' },
    TIME_BOUNDED: { description: 'Time-bounded' },
    AUTHOR_BOUNDED: { description: 'Author-bounded' },
    FILETYPE_BOUNDED: { description: 'File-type bounded' },
    LANGUAGE_BOUNDED: { description: 'Language-bounded' },
    TOPIC_BOUNDED: { description: 'Topic-bounded' },
    METADATA_ONLY: { description: 'Metadata-only' },
    APPENDIX_ONLY: { description: 'Appendix-only' },
    CROSS_REF_BOUNDED: { description: 'Cross-reference bounded' }
  },

  depth: {
    SURFACE_EXTRACTION: { description: 'Surface extraction', depth: 1 },
    PATTERN_BASED: { description: 'Pattern-based extraction', depth: 2 },
    CONTEXT_AWARE: { description: 'Context-aware extraction', depth: 3 },
    CROSS_REFERENCE: { description: 'Cross-reference extraction', depth: 4 },
    MULTI_HOP: { description: 'Multi-hop extraction', depth: 5 },
    INFERENCE_ASSISTED: { description: 'Inference-assisted extraction', depth: 5 },
    DISAMBIGUATION: { description: 'Disambiguation-required extraction', depth: 5 },
    DOMAIN_AWARE: { description: 'Domain-aware extraction', depth: 6 },
    SCHEMA_ALIGNED: { description: 'Schema-aligned extraction', depth: 6 },
    PRECISION_CRITICAL: { description: 'Precision-critical extraction', depth: 7 },
    RECALL_PRIORITY: { description: 'Recall-priority extraction', depth: 4 },
    CONFIDENCE_SCORED: { description: 'Confidence-scored extraction', depth: 5 },
    CONDITIONAL: { description: 'Conditional extraction', depth: 5 },
    NESTED: { description: 'Nested extraction', depth: 6 },
    EXCEPTION_AWARE: { description: 'Exception-aware extraction', depth: 6 }
  },

  evidenceAndTrust: {
    EXACT_MATCH: { description: 'Exact match required' },
    APPROXIMATE_MATCH: { description: 'Approximate match allowed' },
    FUZZY_MATCH: { description: 'Fuzzy match allowed' },
    INFERENCE_ALLOWED: { description: 'Inference allowed' },
    INFERENCE_RESTRICTED: { description: 'Inference restricted' },
    CITATION_REQUIRED: { description: 'Citation required' },
    CITATION_OPTIONAL: { description: 'Citation optional' },
    NUMERICAL_PRECISION: { description: 'Numerical precision required' },
    DOMAIN_PRECISION: { description: 'Domain-grade precision required' },
    LEGAL_PRECISION: { description: 'Legal-grade precision required' },
    FINANCIAL_PRECISION: { description: 'Financial-grade precision required' },
    MEDICAL_CAUTION: { description: 'Medical caution mode' },
    AMBIGUITY_DISCLOSURE: { description: 'Ambiguity disclosure required' },
    MISSING_DISCLOSURE: { description: 'Missing data disclosure required' },
    CONFIDENCE_SCORE: { description: 'Confidence score required' }
  },

  termination: {
    ALL_EXTRACTED: { description: 'All targets extracted' },
    NO_MORE_ITEMS: { description: 'No more extractable items' },
    CONFIDENCE_THRESHOLD: { description: 'Confidence threshold reached' },
    RECALL_THRESHOLD: { description: 'Recall threshold reached' },
    PRECISION_VIOLATED: { description: 'Precision threshold violated' },
    AMBIGUITY_UNRESOLVED: { description: 'Ambiguity unresolved' },
    MISSING_DATA: { description: 'Missing data blocking' },
    SCOPE_EXHAUSTED: { description: 'Scope exhausted' },
    POLICY_BOUNDARY: { description: 'Policy boundary reached' },
    USER_INTERRUPTION: { description: 'User interruption' },
    EXTRACTION_ERROR: { description: 'Extraction error' },
    SAFETY_ABORT: { description: 'Safety abort triggered' }
  },

  outputControl: {
    FLAT_LIST: { description: 'Flat list' },
    GROUPED_LIST: { description: 'Grouped list' },
    TABLE: { description: 'Table' },
    KEY_VALUE_PAIRS: { description: 'Key-value pairs' },
    MATRIX: { description: 'Matrix' },
    INLINE_ANNOTATIONS: { description: 'Inline annotations' },
    JSON_STRUCTURED: { description: 'JSON-style structured output' },
    SOURCE_LINKED: { description: 'Source-linked list' },
    ASK_CLARIFICATION: { description: 'Ask clarification' },
    ASK_CONFIRMATION: { description: 'Ask target confirmation' },
    OFFER_REFINEMENT: { description: 'Offer refinement' },
    OFFER_ADDITIONAL: { description: 'Offer additional extraction' },
    CONFIRM_TARGETS: { description: 'Confirm extraction targets' },
    SUGGEST_FOLLOWUP: { description: 'Suggest follow-up extraction' },
    HIGHLIGHT_VALUES: { description: 'Highlight extracted values' },
    HIGHLIGHT_SOURCE: { description: 'Highlight source location' },
    HIGHLIGHT_UNCERTAINTY: { description: 'Highlight uncertainty' },
    HIGHLIGHT_DUPLICATES: { description: 'Highlight duplicates' },
    HIGHLIGHT_MISSING: { description: 'Highlight missing items' },
    HIGHLIGHT_CONFIDENCE: { description: 'Highlight confidence score' },
    HIGHLIGHT_ASSUMPTIONS: { description: 'Highlight assumptions' },
    HIGHLIGHT_INFERRED: { description: 'Highlight inferred values' },
    HIGHLIGHT_CONFLICTS: { description: 'Highlight conflicting values' }
  },

  sessionContext: {
    ACTIVE_TARGETS: { description: 'Active extraction targets' },
    COMPLETED: { description: 'Completed extractions' },
    PENDING: { description: 'Pending extractions' },
    REJECTED: { description: 'Rejected targets' },
    CONFIDENCE_SCORES: { description: 'Confidence scores' },
    NORMALIZATION_RULES: { description: 'Normalization rules' },
    DOMAIN_CONSTRAINTS: { description: 'Domain constraints' },
    USER_CORRECTIONS: { description: 'User corrections' },
    SOURCE_REFERENCES: { description: 'Source references' },
    PRIOR_RESULTS: { description: 'Prior extraction results' },
    AMBIGUITY_FLAGS: { description: 'Ambiguity flags' },
    EXTRACTION_HISTORY: { description: 'Extraction history' }
  },

  failureModes: {
    INCORRECT_EXTRACTION: { description: 'Incorrect extraction' },
    PARTIAL_EXTRACTION: { description: 'Partial extraction' },
    MISSED_ITEMS: { description: 'Missed items' },
    FALSE_POSITIVES: { description: 'False positives' },
    OVER_EXTRACTION: { description: 'Over-extraction' },
    AMBIGUOUS_MATCHES: { description: 'Ambiguous matches' },
    OCR_NOISE: { description: 'OCR noise interference' },
    DOMAIN_MISMATCH: { description: 'Domain mismatch' },
    PRECISION_LOSS: { description: 'Precision loss' },
    SCHEMA_MISMATCH: { description: 'Schema mismatch' },
    CONFLICTING_VALUES: { description: 'Conflicting values' },
    SOURCE_MISALIGNMENT: { description: 'Source misalignment' }
  }
};

// ============================================================================
// 3. REASONING INTENT - TIER 0
// ============================================================================

export const REASONING = {
  states: {
    DIRECT_LOGICAL: { description: 'Direct logical question' },
    MULTI_STEP: { description: 'Multi-step dependency' },
    CONDITIONAL: { description: 'Conditional reasoning (if/then)' },
    HYPOTHETICAL: { description: 'Hypothetical scenario' },
    COUNTERFACTUAL: { description: 'Counterfactual scenario' },
    CAUSE_EFFECT: { description: 'Cause → effect analysis' },
    EFFECT_CAUSE: { description: 'Effect → cause diagnosis' },
    AMBIGUOUS_PREMISE: { description: 'Ambiguous premise' },
    INCOMPLETE_PREMISES: { description: 'Incomplete premises' },
    CONFLICTING_PREMISES: { description: 'Conflicting premises' },
    HIDDEN_ASSUMPTIONS: { description: 'Hidden assumptions' },
    EXPLICIT_ASSUMPTIONS: { description: 'Explicit assumptions' },
    PROBABILISTIC: { description: 'Probabilistic reasoning' },
    DETERMINISTIC: { description: 'Deterministic reasoning' },
    HEURISTIC: { description: 'Heuristic reasoning' },
    ANALOGICAL: { description: 'Analogical reasoning' },
    TRADEOFF: { description: 'Trade-off situation' },
    CONSTRAINT_BOUND: { description: 'Constraint-bound reasoning' },
    OPTIMIZATION: { description: 'Optimization problem' },
    RISK_BASED: { description: 'Risk-based reasoning' },
    ETHICAL: { description: 'Ethical reasoning' },
    POLICY_BASED: { description: 'Policy-based reasoning' },
    STRATEGIC: { description: 'Strategic reasoning' },
    TACTICAL: { description: 'Tactical reasoning' },
    PROCEDURAL: { description: 'Procedural reasoning' },
    META_REASONING: { description: 'Meta-reasoning (reasoning about reasoning)' },
    OVERDETERMINED: { description: 'Overdetermined problem' },
    UNDERDETERMINED: { description: 'Underdetermined problem' }
  },

  actions: {
    // Core Logical
    DEDUCE: { description: 'Deduce conclusion', family: 'logical' },
    INFER_STEP: { description: 'Infer missing step', family: 'logical' },
    INFER_PREMISE: { description: 'Infer missing premise', family: 'logical' },
    VALIDATE_ASSUMPTION: { description: 'Validate assumption', family: 'logical' },
    CHALLENGE_ASSUMPTION: { description: 'Challenge assumption', family: 'logical' },
    RESOLVE_CONTRADICTION: { description: 'Resolve contradiction', family: 'logical' },
    IDENTIFY_DEPENDENCY: { description: 'Identify dependency', family: 'logical' },
    IDENTIFY_CONSTRAINT: { description: 'Identify constraint', family: 'logical' },
    IDENTIFY_CAUSAL_CHAIN: { description: 'Identify causal chain', family: 'logical' },
    IDENTIFY_LOGICAL_GAP: { description: 'Identify logical gap', family: 'logical' },
    // Evaluation & Judgment
    EVALUATE_IMPLICATION: { description: 'Evaluate implication', family: 'evaluation' },
    EVALUATE_CONSEQUENCE: { description: 'Evaluate consequence', family: 'evaluation' },
    EVALUATE_RISK: { description: 'Evaluate risk', family: 'evaluation' },
    EVALUATE_BENEFIT: { description: 'Evaluate benefit', family: 'evaluation' },
    EVALUATE_FEASIBILITY: { description: 'Evaluate feasibility', family: 'evaluation' },
    EVALUATE_CONSISTENCY: { description: 'Evaluate consistency', family: 'evaluation' },
    EVALUATE_COMPLETENESS: { description: 'Evaluate completeness', family: 'evaluation' },
    // Comparative & Optimization
    COMPARE_ALTERNATIVES: { description: 'Compare alternatives', family: 'comparison' },
    RANK_OPTIONS: { description: 'Rank options', family: 'comparison' },
    OPTIMIZE_OUTCOME: { description: 'Optimize outcome', family: 'comparison' },
    IDENTIFY_BOTTLENECK: { description: 'Identify bottleneck', family: 'comparison' },
    IDENTIFY_FAILURE_MODE: { description: 'Identify failure mode', family: 'comparison' },
    IDENTIFY_TRADEOFFS: { description: 'Identify trade-offs', family: 'comparison' },
    // Structural
    DECOMPOSE_PROBLEM: { description: 'Decompose problem', family: 'structural' },
    RECOMPOSE_SOLUTION: { description: 'Recompose solution', family: 'structural' },
    ABSTRACT_REASONING: { description: 'Abstract reasoning', family: 'structural' },
    CONCRETIZE: { description: 'Concretize reasoning', family: 'structural' },
    GENERALIZE_RULE: { description: 'Generalize rule', family: 'structural' },
    SPECIALIZE_CASE: { description: 'Specialize case', family: 'structural' },
    APPLY_RULE: { description: 'Apply rule', family: 'structural' },
    // Simulation & Projection
    SIMULATE_SCENARIO: { description: 'Simulate scenario', family: 'simulation' },
    PROJECT_OUTCOME: { description: 'Project outcome', family: 'simulation' },
    FORECAST_IMPACT: { description: 'Forecast impact', family: 'simulation' },
    // Control
    EXPLAIN_REASONING: { description: 'Explain reasoning', family: 'control' },
    JUSTIFY_REASONING: { description: 'Justify reasoning', family: 'control' },
    DEFEND_REASONING: { description: 'Defend reasoning', family: 'control' },
    REFINE_REASONING: { description: 'Refine reasoning', family: 'control' },
    SIMPLIFY_REASONING: { description: 'Simplify reasoning', family: 'control' },
    EXPAND_REASONING: { description: 'Expand reasoning', family: 'control' },
    TERMINATE_REASONING: { description: 'Terminate reasoning', family: 'control' }
  },

  scope: {
    SINGLE_STATEMENT: { description: 'Single statement' },
    SINGLE_ASSUMPTION: { description: 'Single assumption' },
    SINGLE_RULE: { description: 'Single rule' },
    SINGLE_SCENARIO: { description: 'Single scenario' },
    MULTIPLE_SCENARIOS: { description: 'Multiple scenarios' },
    ENTIRE_ARGUMENT: { description: 'Entire argument' },
    MULTIPLE_ARGUMENTS: { description: 'Multiple arguments' },
    CROSS_DOCUMENT: { description: 'Cross-document logic' },
    CROSS_DOMAIN: { description: 'Cross-domain logic' },
    TIME_BOUNDED: { description: 'Time-bounded reasoning' },
    VERSION_BOUNDED: { description: 'Version-bounded reasoning' },
    POLICY_BOUNDED: { description: 'Policy-bounded reasoning' },
    CONSTRAINT_BOUNDED: { description: 'Constraint-bounded reasoning' },
    OUTCOME_BOUNDED: { description: 'Outcome-bounded reasoning' },
    RISK_BOUNDED: { description: 'Risk-bounded reasoning' },
    GOAL_BOUNDED: { description: 'Goal-bounded reasoning' },
    USER_GOAL_BOUNDED: { description: 'User-goal bounded reasoning' },
    SYSTEM_GOAL_BOUNDED: { description: 'System-goal bounded reasoning' }
  },

  depth: {
    SURFACE_LOGIC: { description: 'Surface logic', depth: 1 },
    EXPLICIT_REASONING: { description: 'Explicit reasoning', depth: 2 },
    CONTEXTUAL_REASONING: { description: 'Contextual reasoning', depth: 3 },
    MULTI_HOP: { description: 'Multi-hop reasoning', depth: 4 },
    CROSS_REFERENCE: { description: 'Cross-reference reasoning', depth: 4 },
    LOGICAL_INFERENCE: { description: 'Logical inference', depth: 5 },
    RISK_ANALYSIS: { description: 'Risk analysis', depth: 5 },
    TRADEOFF_ANALYSIS: { description: 'Trade-off analysis', depth: 6 },
    IMPACT_ANALYSIS: { description: 'Impact analysis', depth: 6 },
    SCENARIO_ANALYSIS: { description: 'Scenario analysis', depth: 6 },
    SENSITIVITY_ANALYSIS: { description: 'Sensitivity analysis', depth: 7 },
    COUNTERFACTUAL_ANALYSIS: { description: 'Counterfactual analysis', depth: 7 },
    STRATEGIC_REASONING: { description: 'Strategic-level reasoning', depth: 7 },
    EXPERT_REASONING: { description: 'Expert-level reasoning', depth: 8 },
    META_REASONING: { description: 'Meta-reasoning depth', depth: 8 }
  },

  evidenceAndTrust: {
    NO_EVIDENCE: { description: 'No evidence required' },
    EVIDENCE_RECOMMENDED: { description: 'Evidence recommended' },
    EVIDENCE_REQUIRED: { description: 'Evidence required' },
    SINGLE_SOURCE: { description: 'Single-source acceptable' },
    MULTI_SOURCE: { description: 'Multi-source required' },
    INFERENCE_ALLOWED: { description: 'Inference allowed' },
    INFERENCE_RESTRICTED: { description: 'Inference restricted' },
    SPECULATION_FORBIDDEN: { description: 'Speculation forbidden' },
    NUMERICAL_PRECISION: { description: 'Numerical precision required' },
    LOGICAL_PRECISION: { description: 'Logical precision required' },
    POLICY_PRECISION: { description: 'Policy-grade precision' },
    LEGAL_PRECISION: { description: 'Legal-grade precision' },
    FINANCIAL_PRECISION: { description: 'Financial-grade precision' },
    MEDICAL_CAUTION: { description: 'Medical caution mode' },
    UNCERTAINTY_DISCLOSURE: { description: 'Uncertainty disclosure required' }
  },

  termination: {
    CONCLUSION_REACHED: { description: 'Conclusion reached' },
    CONFIDENCE_THRESHOLD: { description: 'Confidence threshold reached' },
    EVIDENCE_EXHAUSTED: { description: 'Evidence exhausted' },
    MARGINAL_BENEFIT_LOW: { description: 'Marginal benefit low' },
    USER_SATISFIED: { description: 'User intent satisfied' },
    AMBIGUITY_UNRESOLVED: { description: 'Ambiguity unresolved' },
    MISSING_DATA: { description: 'Missing data blocking' },
    CONTRADICTION_UNRESOLVED: { description: 'Contradiction unresolved' },
    RISK_TOO_HIGH: { description: 'Risk too high' },
    POLICY_BOUNDARY: { description: 'Policy boundary reached' },
    SCOPE_EXCEEDED: { description: 'Scope exceeded' },
    USER_INTERRUPTION: { description: 'User interruption' },
    COMPLEXITY_OVERLOAD: { description: 'Complexity overload' },
    RECURSIVE_LOOP: { description: 'Recursive loop detected' },
    META_TERMINATION: { description: 'Meta-termination trigger' }
  },

  outputControl: {
    SINGLE_CONCLUSION: { description: 'Single conclusion' },
    STEP_BY_STEP: { description: 'Step-by-step logic' },
    LOGICAL_CHAIN: { description: 'Logical chain' },
    DECISION_TREE: { description: 'Decision tree' },
    COMPARISON_TABLE: { description: 'Comparison table' },
    PROS_CONS: { description: 'Pros / cons list' },
    RISK_MATRIX: { description: 'Risk matrix' },
    SCENARIO_TABLE: { description: 'Scenario table' },
    FLOW_EXPLANATION: { description: 'Flow explanation' },
    BULLET_REASONING: { description: 'Bullet reasoning' },
    MIXED_SECTIONS: { description: 'Mixed sections' },
    ASK_CLARIFICATION: { description: 'Ask clarification' },
    ASK_CONFIRMATION: { description: 'Ask assumption confirmation' },
    ASK_CONSTRAINTS: { description: 'Ask for constraints' },
    ASK_GOAL_REFINEMENT: { description: 'Ask for goal refinement' },
    SUGGEST_NEXT_STEP: { description: 'Suggest next reasoning step' },
    OFFER_ALTERNATIVES: { description: 'Offer alternative paths' },
    HIGHLIGHT_ASSUMPTIONS: { description: 'Highlight assumptions' },
    HIGHLIGHT_RISKS: { description: 'Highlight risks' },
    HIGHLIGHT_UNCERTAINTIES: { description: 'Highlight uncertainties' },
    HIGHLIGHT_DEPENDENCIES: { description: 'Highlight dependencies' },
    HIGHLIGHT_TRADEOFFS: { description: 'Highlight trade-offs' },
    HIGHLIGHT_CONSTRAINTS: { description: 'Highlight constraints' },
    HIGHLIGHT_DECISION_POINTS: { description: 'Highlight decision points' },
    HIGHLIGHT_CONCLUSION_STRENGTH: { description: 'Highlight conclusion strength' }
  },

  memory: {
    ACTIVE_ASSUMPTIONS: { description: 'Active assumptions' },
    ACCEPTED_PREMISES: { description: 'Accepted premises' },
    REJECTED_PREMISES: { description: 'Rejected premises' },
    OPEN_QUESTIONS: { description: 'Open questions' },
    RESOLVED_QUESTIONS: { description: 'Resolved questions' },
    ACTIVE_CONSTRAINTS: { description: 'Active constraints' },
    ACTIVE_GOALS: { description: 'Active goals' },
    PRIOR_CONCLUSIONS: { description: 'Prior conclusions' },
    CONFIDENCE_LEVEL: { description: 'Confidence level' },
    TERMINATION_REASON: { description: 'Termination reason' },
    USER_PREFERENCE: { description: 'User preference signal' },
    REASONING_PATH: { description: 'Reasoning path taken' }
  },

  failureModes: {
    MISSING_PREMISE: { description: 'Missing premise' },
    HIDDEN_ASSUMPTION: { description: 'Hidden assumption' },
    LOGICAL_LEAP: { description: 'Logical leap' },
    CIRCULAR_REASONING: { description: 'Circular reasoning' },
    OVERGENERALIZATION: { description: 'Overgeneralization' },
    OVERSIMPLIFICATION: { description: 'Oversimplification' },
    CONFLICTING_EVIDENCE: { description: 'Conflicting evidence' },
    AMBIGUOUS_TERMS: { description: 'Ambiguous terms' },
    INVALID_INFERENCE: { description: 'Invalid inference' },
    SCOPE_CREEP: { description: 'Scope creep' },
    USER_MISUNDERSTANDING: { description: 'User misunderstanding' },
    DOMAIN_MISMATCH: { description: 'Domain mismatch' }
  }
};

// ============================================================================
// 4. EDIT INTENT - TIER 1
// ============================================================================

export const EDIT = {
  states: {
    RAW_TEXT: { description: 'Raw text input' },
    AI_GENERATED: { description: 'Previously generated AI output' },
    USER_AUTHORED: { description: 'User-authored content' },
    MIXED_CONTENT: { description: 'Mixed AI + user content' },
    SHORT_TEXT: { description: 'Short text' },
    LONG_TEXT: { description: 'Long text' },
    STRUCTURED_TEXT: { description: 'Structured text (lists, tables)' },
    UNSTRUCTURED_PROSE: { description: 'Unstructured prose' },
    FORMAL_CONTENT: { description: 'Formal content' },
    INFORMAL_CONTENT: { description: 'Informal content' },
    TECHNICAL_CONTENT: { description: 'Technical content' },
    LEGAL_STYLE: { description: 'Legal-style content' },
    FINANCIAL_STYLE: { description: 'Financial-style content' },
    MEDICAL_STYLE: { description: 'Medical-style content' },
    MARKETING_STYLE: { description: 'Marketing-style content' },
    INSTRUCTIONAL: { description: 'Instructional content' },
    NARRATIVE: { description: 'Narrative content' },
    ARGUMENTATIVE: { description: 'Argumentative content' },
    INCOMPLETE_TEXT: { description: 'Incomplete text' },
    AMBIGUOUS_PHRASING: { description: 'Ambiguous phrasing' },
    REDUNDANT_CONTENT: { description: 'Redundant content' },
    INCONSISTENT_TONE: { description: 'Inconsistent tone' },
    INCONSISTENT_TERMINOLOGY: { description: 'Inconsistent terminology' },
    POOR_CLARITY: { description: 'Poor clarity' },
    OVERLY_VERBOSE: { description: 'Overly verbose content' }
  },

  actions: {
    REWRITE: { description: 'Rewrite content', family: 'core' },
    SIMPLIFY: { description: 'Simplify content', family: 'core' },
    EXPAND: { description: 'Expand content', family: 'core' },
    SHORTEN: { description: 'Shorten content', family: 'core' },
    CLARIFY: { description: 'Clarify meaning', family: 'core' },
    IMPROVE_READABILITY: { description: 'Improve readability', family: 'core' },
    IMPROVE_CLARITY: { description: 'Improve clarity', family: 'core' },
    IMPROVE_STRUCTURE: { description: 'Improve structure', family: 'core' },
    IMPROVE_COHERENCE: { description: 'Improve coherence', family: 'core' },
    IMPROVE_FLOW: { description: 'Improve flow', family: 'core' },
    CHANGE_TONE: { description: 'Change tone', family: 'style' },
    CHANGE_VOICE: { description: 'Change voice (active/passive)', family: 'style' },
    CHANGE_FORMALITY: { description: 'Change formality level', family: 'style' },
    NORMALIZE_TERMINOLOGY: { description: 'Normalize terminology', family: 'style' },
    STANDARDIZE_LANGUAGE: { description: 'Standardize language', family: 'style' },
    REMOVE_REDUNDANCY: { description: 'Remove redundancy', family: 'style' },
    REMOVE_FILLER: { description: 'Remove filler', family: 'style' },
    ADJUST_VERBOSITY: { description: 'Adjust verbosity', family: 'style' },
    FIX_GRAMMAR: { description: 'Fix grammar', family: 'quality' },
    FIX_SPELLING: { description: 'Fix spelling', family: 'quality' },
    FIX_PUNCTUATION: { description: 'Fix punctuation', family: 'quality' },
    FIX_SYNTAX: { description: 'Fix syntax', family: 'quality' },
    FIX_FORMATTING: { description: 'Fix formatting', family: 'quality' },
    FIX_INCONSISTENCIES: { description: 'Fix inconsistencies', family: 'quality' },
    REFORMAT_BULLETS: { description: 'Reformat as bullets', family: 'structural' },
    REFORMAT_NUMBERED: { description: 'Reformat as numbered steps', family: 'structural' },
    REFORMAT_TABLE: { description: 'Reformat as table', family: 'structural' },
    REFORMAT_SECTIONS: { description: 'Reformat as sections', family: 'structural' },
    REORDER_CONTENT: { description: 'Reorder content', family: 'structural' }
  },

  scope: {
    SINGLE_SENTENCE: { description: 'Single sentence' },
    SINGLE_PARAGRAPH: { description: 'Single paragraph' },
    MULTIPLE_PARAGRAPHS: { description: 'Multiple paragraphs' },
    SPECIFIC_SECTION: { description: 'Specific section' },
    ENTIRE_TEXT: { description: 'Entire text' },
    SELECTED_EXCERPT: { description: 'Selected excerpt' },
    HEADINGS_ONLY: { description: 'Headings only' },
    BODY_TEXT_ONLY: { description: 'Body text only' },
    METADATA_ONLY: { description: 'Metadata only' },
    INLINE_ONLY: { description: 'Inline content only' },
    STRUCTURAL_ONLY: { description: 'Structural elements only' },
    FORMATTING_ONLY: { description: 'Formatting only' },
    LANGUAGE_ONLY: { description: 'Language-only edits' },
    STYLE_ONLY: { description: 'Style-only edits' },
    CONTENT_ONLY: { description: 'Content-only edits' }
  },

  depth: {
    MINIMAL_CORRECTION: { description: 'Minimal correction', depth: 1 },
    LIGHT_POLISH: { description: 'Light polish', depth: 2 },
    MODERATE_REWRITE: { description: 'Moderate rewrite', depth: 3 },
    FULL_REWRITE: { description: 'Full rewrite', depth: 4 },
    STRUCTURAL_REORG: { description: 'Structural reorganization', depth: 5 },
    SEMANTIC_REFINEMENT: { description: 'Semantic refinement', depth: 5 },
    CONTEXT_AWARE: { description: 'Context-aware rewriting', depth: 6 },
    CROSS_PARAGRAPH: { description: 'Cross-paragraph coherence', depth: 6 },
    CONSISTENCY_ENFORCEMENT: { description: 'Consistency enforcement', depth: 6 },
    DOMAIN_AWARE: { description: 'Domain-aware editing', depth: 7 },
    EXPERT_EDITING: { description: 'Expert-level editing', depth: 7 },
    EDITORIAL_GRADE: { description: 'Editorial-grade refinement', depth: 8 }
  },

  constraints: {
    PRESERVE_MEANING: { description: 'Preserve meaning' },
    PRESERVE_FACTS: { description: 'Preserve facts' },
    PRESERVE_TERMINOLOGY: { description: 'Preserve terminology' },
    PRESERVE_NUMBERS: { description: 'Preserve numbers' },
    PRESERVE_LEGAL_INTENT: { description: 'Preserve legal intent' },
    PRESERVE_TONE: { description: 'Preserve tone' },
    PRESERVE_STRUCTURE: { description: 'Preserve structure' },
    PRESERVE_FORMATTING: { description: 'Preserve formatting' },
    PRESERVE_CITATIONS: { description: 'Preserve citations' },
    PRESERVE_DOMAIN_ACCURACY: { description: 'Preserve domain accuracy' },
    PRESERVE_USER_VOICE: { description: 'Preserve user voice' },
    PRESERVE_LENGTH: { description: 'Preserve length bounds' }
  },

  evidenceAndTrust: {
    FACTUAL_ACCURACY: { description: 'Factual accuracy required' },
    NO_HALLUCINATION: { description: 'No hallucination allowed' },
    DOMAIN_ACCURACY: { description: 'Domain accuracy enforced' },
    TERMINOLOGY_PRECISION: { description: 'Terminology precision required' },
    NUMERICAL_PRECISION: { description: 'Numerical precision required' },
    LEGAL_PRECISION: { description: 'Legal-grade precision' },
    FINANCIAL_PRECISION: { description: 'Financial-grade precision' },
    MEDICAL_CAUTION: { description: 'Medical caution mode' },
    APPROXIMATION_FORBIDDEN: { description: 'Approximation forbidden' },
    INFERENCE_RESTRICTED: { description: 'Inference restricted' }
  },

  outputControl: {
    SINGLE_PARAGRAPH: { description: 'Single paragraph' },
    BULLET_POINTS: { description: 'Bullet points' },
    NUMBERED_STEPS: { description: 'Numbered steps' },
    TABLE: { description: 'Table' },
    SIDE_BY_SIDE: { description: 'Side-by-side comparison (before/after)' },
    HIGHLIGHTED_CHANGES: { description: 'Highlighted changes' },
    CLEAN_VERSION: { description: 'Clean rewritten version' },
    ANNOTATED_CHANGES: { description: 'Annotated changes' },
    ASK_BEFORE_MAJOR: { description: 'Ask before applying major changes' },
    OFFER_ALTERNATIVES: { description: 'Offer alternative versions' },
    SUGGEST_LIGHTER: { description: 'Suggest lighter edit' },
    SUGGEST_STRONGER: { description: 'Suggest stronger edit' },
    ASK_TONE: { description: 'Ask tone preference' },
    ASK_VERBOSITY: { description: 'Ask verbosity preference' },
    ASK_FORMATTING: { description: 'Ask formatting preference' },
    HIGHLIGHT_MODIFIED: { description: 'Highlight modified sections' },
    HIGHLIGHT_REMOVED: { description: 'Highlight removed content' },
    HIGHLIGHT_ADDED: { description: 'Highlight added content' },
    HIGHLIGHT_KEY_CHANGES: { description: 'Highlight key changes' },
    HIGHLIGHT_TONE_SHIFT: { description: 'Highlight tone shift' },
    HIGHLIGHT_CLARITY: { description: 'Highlight clarity improvements' }
  },

  memory: {
    ORIGINAL_VERSION: { description: 'Original text version' },
    EDITED_VERSION: { description: 'Edited version' },
    USER_PREFERENCE: { description: 'User edit preference' },
    PREFERRED_TONE: { description: 'Preferred tone' },
    PREFERRED_VERBOSITY: { description: 'Preferred verbosity' },
    PREFERRED_STRUCTURE: { description: 'Preferred structure' },
    DOMAIN_CONTEXT: { description: 'Domain context' },
    PREVIOUS_DECISIONS: { description: 'Previous edit decisions' },
    ACCEPTED_CONSTRAINTS: { description: 'Accepted constraints' }
  },

  failureModes: {
    MEANING_DRIFT: { description: 'Meaning drift' },
    OVER_EDITING: { description: 'Over-editing' },
    UNDER_EDITING: { description: 'Under-editing' },
    NUANCE_LOSS: { description: 'Loss of nuance' },
    TONE_MISMATCH: { description: 'Tone mismatch' },
    DOMAIN_CORRUPTION: { description: 'Domain corruption' },
    STRUCTURAL_BREAKAGE: { description: 'Structural breakage' },
    FORMATTING_LOSS: { description: 'Formatting loss' },
    REDUNDANT_REWRITE: { description: 'Redundant rewrite' },
    USER_DISSATISFACTION: { description: 'User dissatisfaction' }
  }
};

// ============================================================================
// 5. HELP INTENT - TIER 1
// ============================================================================

export const HELP = {
  states: {
    FIRST_TIME_USER: { description: 'First-time user' },
    RETURNING_USER: { description: 'Returning user' },
    EXPERIENCED_USER: { description: 'Experienced user' },
    FEATURE_KNOWN_USAGE_UNKNOWN: { description: 'Feature known, usage unknown' },
    FEATURE_UNKNOWN: { description: 'Feature unknown' },
    ERROR_ENCOUNTERED: { description: 'Error encountered' },
    UNEXPECTED_BEHAVIOR: { description: 'Unexpected behavior' },
    EXPECTED_BEHAVIOR_CLARIFICATION: { description: 'Expected behavior clarification' },
    SYSTEM_LIMITATION: { description: 'System limitation encountered' },
    PERMISSION_RESTRICTION: { description: 'Permission restriction' },
    CONFIG_MISSING: { description: 'Configuration missing' },
    MISCONFIGURATION: { description: 'Misconfiguration detected' },
    PARTIAL_UNDERSTANDING: { description: 'Partial understanding' },
    INCORRECT_MENTAL_MODEL: { description: 'Incorrect mental model' },
    CONFLICTING_INSTRUCTIONS: { description: 'Conflicting instructions' },
    BLOCKED_WORKFLOW: { description: 'Blocked workflow' },
    INTERRUPTED_WORKFLOW: { description: 'Interrupted workflow' },
    UNSUPPORTED_REQUEST: { description: 'Unsupported request' },
    DEPRECATED_BEHAVIOR: { description: 'Deprecated behavior' },
    EXPERIMENTAL_INQUIRY: { description: 'Experimental behavior inquiry' },
    PERFORMANCE_CONCERN: { description: 'Performance concern' },
    RELIABILITY_CONCERN: { description: 'Reliability concern' },
    SECURITY_CONCERN: { description: 'Security concern' },
    PRIVACY_CONCERN: { description: 'Privacy concern' },
    DATA_HANDLING_CONCERN: { description: 'Data handling concern' },
    CAPABILITY_BOUNDARY: { description: 'Capability boundary inquiry' },
    FEATURE_DEPENDENCY_MISSING: { description: 'Feature dependency missing' },
    STATE_DEPENDENT: { description: 'State-dependent behavior' },
    CONTEXT_DEPENDENT: { description: 'Context-dependent behavior' },
    FEATURE_INTERACTION_CONFUSION: { description: 'Feature interaction confusion' },
    SYSTEM_STATUS_UNCERTAINTY: { description: 'System status uncertainty' }
  },

  actions: {
    // Feature Understanding
    EXPLAIN_PURPOSE: { description: 'Explain feature purpose', family: 'understanding' },
    EXPLAIN_BEHAVIOR: { description: 'Explain feature behavior', family: 'understanding' },
    EXPLAIN_LIMITS: { description: 'Explain feature limits', family: 'understanding' },
    EXPLAIN_AVAILABILITY: { description: 'Explain feature availability', family: 'understanding' },
    EXPLAIN_REQUIREMENTS: { description: 'Explain feature requirements', family: 'understanding' },
    EXPLAIN_DEPENDENCIES: { description: 'Explain feature dependencies', family: 'understanding' },
    EXPLAIN_SIDE_EFFECTS: { description: 'Explain feature side effects', family: 'understanding' },
    // Feature Usage
    HOW_TO_USE: { description: 'How to use feature', family: 'usage' },
    STEP_BY_STEP: { description: 'Step-by-step usage', family: 'usage' },
    CORRECT_USAGE: { description: 'Correct usage pattern', family: 'usage' },
    INCORRECT_USAGE_CORRECTION: { description: 'Incorrect usage correction', family: 'usage' },
    USAGE_PREREQUISITES: { description: 'Usage prerequisites', family: 'usage' },
    USAGE_SEQUENCING: { description: 'Usage sequencing', family: 'usage' },
    USAGE_CONSTRAINTS: { description: 'Usage constraints', family: 'usage' },
    // Workflow Guidance
    RECOMMENDED_WORKFLOW: { description: 'Recommended workflow', family: 'workflow' },
    ALTERNATIVE_WORKFLOW: { description: 'Alternative workflow', family: 'workflow' },
    SEQUENTIAL_WORKFLOW: { description: 'Sequential workflow', family: 'workflow' },
    PARALLEL_WORKFLOW: { description: 'Parallel workflow', family: 'workflow' },
    OPTIMAL_WORKFLOW: { description: 'Optimal workflow', family: 'workflow' },
    MINIMAL_WORKFLOW: { description: 'Minimal workflow', family: 'workflow' },
    RECOVERY_WORKFLOW: { description: 'Recovery workflow', family: 'workflow' },
    // Troubleshooting
    IDENTIFY_ROOT_CAUSE: { description: 'Identify root cause', family: 'troubleshooting' },
    EXPLAIN_ERROR: { description: 'Explain error message', family: 'troubleshooting' },
    DIAGNOSE_FAILURE: { description: 'Diagnose failure', family: 'troubleshooting' },
    RESOLVE_FAILURE: { description: 'Resolve failure', family: 'troubleshooting' },
    RECOVER_INTERRUPTION: { description: 'Recover from interruption', family: 'troubleshooting' },
    PREVENT_RECURRENCE: { description: 'Prevent recurrence', family: 'troubleshooting' },
    ESCALATION_GUIDANCE: { description: 'Escalation guidance', family: 'troubleshooting' },
    // Limitation Handling
    EXPLAIN_LIMITATION: { description: 'Explain limitation', family: 'limitation' },
    EXPLAIN_WHY_LIMITATION: { description: 'Explain why limitation exists', family: 'limitation' },
    HARD_LIMITATION: { description: 'Hard limitation explanation', family: 'limitation' },
    SOFT_LIMITATION: { description: 'Soft limitation explanation', family: 'limitation' },
    SUGGEST_WORKAROUND: { description: 'Suggest workaround', family: 'limitation' },
    SUGGEST_ALTERNATIVE: { description: 'Suggest alternative approach', family: 'limitation' },
    SET_EXPECTATIONS: { description: 'Set expectation boundaries', family: 'limitation' },
    // Capability Discovery
    WHAT_CAN_DO: { description: 'What Koda can do', family: 'capability' },
    WHAT_CANNOT_DO: { description: 'What Koda cannot do', family: 'capability' },
    SUPPORTED_ACTIONS: { description: 'Supported actions', family: 'capability' },
    UNSUPPORTED_ACTIONS: { description: 'Unsupported actions', family: 'capability' },
    CONDITIONAL_CAPABILITIES: { description: 'Conditional capabilities', family: 'capability' },
    CONTEXT_CAPABILITIES: { description: 'Context-dependent capabilities', family: 'capability' },
    CAPABILITY_ROADMAP: { description: 'Capability roadmap boundaries', family: 'capability' },
    // Best Practices
    RECOMMENDED_PATTERNS: { description: 'Recommended usage patterns', family: 'best_practices' },
    COMMON_MISTAKES: { description: 'Common mistakes to avoid', family: 'best_practices' },
    EFFICIENCY_PRACTICES: { description: 'Efficiency practices', family: 'best_practices' },
    ACCURACY_PRACTICES: { description: 'Accuracy practices', family: 'best_practices' },
    SAFETY_PRACTICES: { description: 'Safety practices', family: 'best_practices' },
    SCALABILITY_PRACTICES: { description: 'Scalability practices', family: 'best_practices' },
    RELIABILITY_PRACTICES: { description: 'Reliability practices', family: 'best_practices' },
    // Onboarding
    GETTING_STARTED: { description: 'Getting started', family: 'onboarding' },
    CORE_CONCEPTS: { description: 'Core concepts explanation', family: 'onboarding' },
    FEATURE_OVERVIEW: { description: 'Feature overview', family: 'onboarding' },
    INITIAL_SETUP: { description: 'Initial setup guidance', family: 'onboarding' },
    FIRST_WORKFLOW: { description: 'First successful workflow', family: 'onboarding' },
    LEARNING_PATH: { description: 'Progressive learning path', family: 'onboarding' },
    HABIT_FORMATION: { description: 'Habit formation guidance', family: 'onboarding' }
  },

  scope: {
    SINGLE_FEATURE: { description: 'Single feature' },
    MULTIPLE_FEATURES: { description: 'Multiple features' },
    ENTIRE_PRODUCT: { description: 'Entire product' },
    CURRENT_SESSION: { description: 'Current session' },
    PERSISTENT_USAGE: { description: 'Persistent usage' },
    USER_CONFIG: { description: 'User-specific configuration' },
    WORKSPACE_WIDE: { description: 'Workspace-wide behavior' },
    PERMISSION_BOUND: { description: 'Permission-bound scope' },
    ERROR_SPECIFIC: { description: 'Error-specific scope' },
    WORKFLOW_SPECIFIC: { description: 'Workflow-specific scope' },
    ACTION_SPECIFIC: { description: 'Action-specific scope' },
    UI_LEVEL: { description: 'UI-level behavior' },
    SYSTEM_LEVEL: { description: 'System-level behavior' },
    DATA_HANDLING: { description: 'Data-handling behavior' },
    SECURITY_RELATED: { description: 'Security-related behavior' },
    PRIVACY_RELATED: { description: 'Privacy-related behavior' },
    PERFORMANCE_RELATED: { description: 'Performance-related behavior' },
    RELIABILITY_RELATED: { description: 'Reliability-related behavior' }
  },

  depth: {
    ONE_LINE: { description: 'One-line clarification', depth: 1 },
    SHORT_EXPLANATION: { description: 'Short explanation', depth: 2 },
    STEP_BY_STEP: { description: 'Step-by-step explanation', depth: 3 },
    CONCEPTUAL: { description: 'Conceptual explanation', depth: 4 },
    COMPARATIVE: { description: 'Comparative explanation', depth: 4 },
    CAUSE_EFFECT: { description: 'Cause-and-effect explanation', depth: 5 },
    CONSTRAINT_BASED: { description: 'Constraint-based explanation', depth: 5 },
    TRADEOFF: { description: 'Trade-off explanation', depth: 6 },
    RISK_AWARE: { description: 'Risk-aware explanation', depth: 6 },
    EDGE_CASE: { description: 'Edge-case explanation', depth: 6 },
    FAILURE_MODE: { description: 'Failure-mode explanation', depth: 7 },
    EXPERT_LEVEL: { description: 'Expert-level explanation', depth: 7 },
    META_SYSTEM: { description: 'Meta-system explanation', depth: 8 },
    BEHAVIORAL_MODEL: { description: 'Behavioral model explanation', depth: 8 }
  },

  evidenceAndTrust: {
    NO_EVIDENCE: { description: 'No evidence required' },
    EXPLANATION_ONLY: { description: 'Explanation only' },
    BEHAVIORAL_DESC: { description: 'Behavioral description required' },
    SYSTEM_RULE: { description: 'System rule explanation required' },
    LIMITATION_STATED: { description: 'Limitation explicitly stated' },
    INFERENCE_ALLOWED: { description: 'Inference allowed' },
    INFERENCE_RESTRICTED: { description: 'Inference restricted' },
    SPECULATION_FORBIDDEN: { description: 'Speculation forbidden' },
    PRECISION_REQUIRED: { description: 'Precision required' },
    CONSISTENCY_REQUIRED: { description: 'Consistency required' },
    SAFETY_FIRST: { description: 'Safety-first framing' },
    SECURITY_FIRST: { description: 'Security-first framing' },
    UNCERTAINTY_DISCLOSURE: { description: 'Uncertainty disclosure required' }
  },

  temporalContext: {
    IMMEDIATE_BEHAVIOR: { description: 'Immediate behavior' },
    SESSION_LEVEL: { description: 'Session-level behavior' },
    PERSISTENT_BEHAVIOR: { description: 'Persistent behavior' },
    VERSION_DEPENDENT: { description: 'Version-dependent behavior' },
    FEATURE_ROLLOUT: { description: 'Feature rollout behavior' },
    DEPRECATED_BEHAVIOR: { description: 'Deprecated behavior' },
    FUTURE_PLANNED: { description: 'Future behavior (planned)' },
    CONDITIONAL_FUTURE: { description: 'Conditional future behavior' },
    STATE_TRANSITION: { description: 'State-transition behavior' }
  },

  consistency: {
    INTERNALLY_CONSISTENT: { description: 'Internally consistent behavior' },
    CONTEXT_DEPENDENT: { description: 'Context-dependent behavior' },
    FEATURE_INTERACTION: { description: 'Feature interaction conflict' },
    CONFIG_CONFLICT: { description: 'Configuration conflict' },
    PERMISSION_CONFLICT: { description: 'Permission conflict' },
    STATE_CONFLICT: { description: 'State conflict' },
    LEGACY_CONFLICT: { description: 'Legacy behavior conflict' },
    DOCUMENTATION_MISMATCH: { description: 'Documentation mismatch' },
    USER_EXPECTATION_MISMATCH: { description: 'User expectation mismatch' }
  },

  outputControl: {
    SINGLE_PARAGRAPH: { description: 'Single paragraph' },
    BULLET_POINTS: { description: 'Bullet points' },
    NUMBERED_STEPS: { description: 'Numbered steps' },
    TABLE: { description: 'Table' },
    COMPARISON_TABLE: { description: 'Comparison table' },
    DECISION_FLOW: { description: 'Decision flow' },
    MIXED_SECTIONS: { description: 'Mixed sections' },
    ASK_CLARIFICATION: { description: 'Ask clarification question' },
    SUGGEST_ACTION: { description: 'Suggest next action' },
    OFFER_REFINEMENT: { description: 'Offer refinement' },
    SHOW_MORE: { description: 'Show more option' },
    ALTERNATIVE_PATH: { description: 'Provide alternative path' },
    ESCALATION_SUGGESTION: { description: 'Escalation suggestion' },
    HIGHLIGHT_LIMITATIONS: { description: 'Highlight limitations' },
    HIGHLIGHT_PERMISSIONS: { description: 'Highlight permissions' },
    HIGHLIGHT_RISKS: { description: 'Highlight risks' },
    HIGHLIGHT_PREREQUISITES: { description: 'Highlight prerequisites' },
    HIGHLIGHT_CONSTRAINTS: { description: 'Highlight constraints' },
    HIGHLIGHT_BEST_PRACTICE: { description: 'Highlight best practice' }
  },

  memory: {
    ACTIVE_FEATURE_CONTEXT: { description: 'Active feature context' },
    ACTIVE_WORKFLOW_CONTEXT: { description: 'Active workflow context' },
    KNOWN_PROFICIENCY: { description: 'Known user proficiency' },
    PRIOR_ERRORS: { description: 'Prior errors encountered' },
    PRIOR_SOLUTIONS: { description: 'Prior solutions attempted' },
    ACCEPTED_EXPLANATIONS: { description: 'Accepted explanations' },
    REJECTED_EXPLANATIONS: { description: 'Rejected explanations' },
    OPEN_CLARIFICATIONS: { description: 'Open clarification requests' },
    USER_PREFERENCES: { description: 'User preference signals' },
    RESOLUTION_STATUS: { description: 'Resolution status' }
  }
};

// ============================================================================
// 6. CONVERSATION INTENT - TIER 1
// ============================================================================

export const CONVERSATION = {
  states: {
    DIRECT_FOLLOWUP: { description: 'Direct follow-up' },
    CLARIFICATION_PRIOR: { description: 'Clarification of prior message' },
    EXPANDED_EXPLANATION: { description: 'Expanded explanation needed' },
    DIRECTION_CHANGE: { description: 'Change of direction' },
    REPHRASING_REQUEST: { description: 'Rephrasing request' },
    SHORTENED_EXPLANATION: { description: 'Shortened explanation' },
    TONE_CHANGE: { description: 'Change in tone required' },
    ADDING_CONTEXT: { description: 'Adding more context' },
    SYSTEM_BEHAVIOR_INQUIRY: { description: 'User asking about system behavior' },
    ACKNOWLEDGMENT: { description: 'Acknowledgment of user statement' },
    SEEKING_AFFIRMATION: { description: 'User seeking affirmation' },
    REQUESTING_EXAMPLE: { description: 'Requesting an example' },
    REQUESTING_DETAILS: { description: 'Requesting further details' },
    REPEATING_INFO: { description: 'Repeating previous information' },
    ADDING_NEW_CONTEXT: { description: 'Adding new context' },
    SEEKING_CONFIRMATION: { description: 'Seeking additional confirmation' },
    ASKING_REPETITION: { description: 'User asking for repetition' },
    EXPRESSING_FRUSTRATION: { description: 'Expressing frustration (needing more detail)' },
    FILLER_CONVERSATION: { description: 'Filler conversation' },
    TOPIC_TRANSITION: { description: 'Transition into a new subject' }
  },

  actions: {
    ACKNOWLEDGE: { description: 'Acknowledge user statement', family: 'core' },
    REPHRASE: { description: 'Rephrase response', family: 'core' },
    EXPAND: { description: 'Expand response', family: 'core' },
    SIMPLIFY: { description: 'Simplify explanation', family: 'core' },
    CLARIFY: { description: 'Provide clarification', family: 'core' },
    PROVIDE_EXAMPLES: { description: 'Provide examples', family: 'core' },
    ASK_CLARIFICATION: { description: 'Ask for clarification', family: 'core' },
    CORRECT_EXPLANATION: { description: 'Correct previous explanation', family: 'core' },
    PROVIDE_CONFIDENCE: { description: 'Provide confidence score', family: 'core' },
    ASK_FOLLOWUP: { description: 'Ask user for follow-up question', family: 'core' },
    OFFER_NEXT_STEPS: { description: 'Offer next steps in conversation', family: 'core' },
    CLARIFY_AMBIGUITY: { description: 'Clarify ambiguity in question', family: 'core' },
    ACKNOWLEDGE_MISUNDERSTANDING: { description: 'Acknowledge misunderstanding', family: 'core' },
    PROMPT_CONTEXT: { description: 'Prompt user for additional context', family: 'core' },
    PROVIDE_FILLER: { description: 'Provide conversational filler', family: 'core' },
    ASK_META: { description: 'Ask meta-question (about reasoning)', family: 'core' },
    ASK_DETAIL: { description: 'Ask for further detail on a topic', family: 'core' },
    STOP_CONVERSATION: { description: 'Stop conversation', family: 'control' },
    RESTART_CONVERSATION: { description: 'Restart conversation', family: 'control' },
    GUIDE_ACTION: { description: 'Guide user to specific next action', family: 'control' },
    SUGGEST_REFINEMENT: { description: 'Suggest refinement of query', family: 'control' },
    PROVIDE_SHORT: { description: 'Provide short response', family: 'control' },
    REDIRECT_DOCUMENT: { description: 'Redirect to relevant document if necessary', family: 'control' }
  },

  scope: {
    SINGLE_STATEMENT: { description: 'Single statement (response to short user query)' },
    SINGLE_SECTION: { description: 'Single section of conversation (detailed inquiry)' },
    FULL_CONTEXT: { description: 'Full context of the conversation so far' },
    CROSS_TOPIC: { description: 'Cross-referencing multiple topics within the conversation' },
    ENTIRE_HISTORY: { description: 'Entire conversation history' },
    TEMPORAL_BOUNDED: { description: 'Temporal-based (conversation over last X time)' },
    USER_DEFINED: { description: 'User-defined scope (user specifies what they want to know)' },
    CONFIDENCE_BOUNDED: { description: 'Confidence-bounded conversation (accuracy flag)' },
    NARROW_FOCUS: { description: 'Narrow or focus-bound conversation (specific subject focus)' },
    ANSWER_TYPE_FOCUS: { description: 'Focused on specific answer types (like yes/no questions)' }
  },

  depth: {
    DIRECT_RESPONSE: { description: 'Direct response to query', depth: 1 },
    SURFACE_EXPLANATION: { description: 'Surface-level explanation', depth: 2 },
    CONTEXTUAL_ELABORATION: { description: 'Contextual elaboration', depth: 3 },
    CROSS_REFERENCE: { description: 'Cross-reference reasoning (integrating multiple answers)', depth: 4 },
    LOGICAL_REASONING: { description: 'Logical reasoning behind a response', depth: 4 },
    ASSESSING_CONTRADICTIONS: { description: 'Assessing contradictions in the conversation', depth: 5 },
    STEP_BY_STEP: { description: 'Providing a step-by-step breakdown', depth: 5 },
    HIGH_DETAIL: { description: 'Going into high-detail analysis', depth: 6 },
    INTERPRETING_ASSUMPTIONS: { description: 'Interpreting assumptions in the conversation', depth: 6 },
    MULTI_TURN: { description: 'Offering multi-turn reasoning (if necessary)', depth: 7 },
    EXPERT_ANALYSIS: { description: 'Expert-level analysis (for specialized questions)', depth: 7 },
    USER_SPECIFIC: { description: 'Providing personal or user-specific context', depth: 8 }
  },

  evidenceAndTrust: {
    DIRECT_CITATION: { description: 'Direct citation from reliable source required' },
    EVIDENCE_RECOMMENDED: { description: 'Evidence recommended (not required)' },
    MULTIPLE_CITATIONS: { description: 'Multiple citation requirements for certainty' },
    INFERENCE_ALLOWED: { description: 'Inference allowed (when supporting evidence is unavailable)' },
    APPROXIMATE_ALLOWED: { description: 'Approximate answers allowed' },
    SPECULATION_FORBIDDEN: { description: 'Speculative answers forbidden' },
    SPECULATION_ACCEPTED: { description: 'Speculative reasoning accepted (with clear disclaimer)' },
    USER_PREFERENCE: { description: 'User preference signal (show what they want)' },
    CONFIDENCE_PROVIDED: { description: 'Confidence level to be explicitly provided in response' }
  },

  terminationConditions: {
    USER_SATISFIED: { description: 'User is satisfied with the answer (explicit request)' },
    CONFIDENCE_LOW: { description: 'Confidence level is below threshold for reliable answer' },
    CONTEXT_GAP: { description: 'Context gap (missing or incomplete information)' },
    AMBIGUOUS_INPUT: { description: 'Ambiguous or unclear input by user' },
    USER_ENDS: { description: 'User explicitly asks to end conversation' },
    INFO_COMPLETE: { description: 'User provides all required information' },
    LOGIC_COMPLETE: { description: 'Conversation logic completes (answers are clear and understood)' }
  },

  outputControl: {
    SINGLE_PARAGRAPH: { description: 'Single paragraph' },
    BULLET_POINTS: { description: 'Bullet points (for list-based answers)' },
    NUMBERED_STEPS: { description: 'Numbered steps (when action is needed)' },
    TABLE: { description: 'Table (for comparisons or structured data)' },
    MATRIX: { description: 'Matrix comparisons (multi-variable)' },
    TIMELINE: { description: 'Timeline-based answers' },
    MIXED_SECTIONS: { description: 'Mixed sections (for multi-faceted answers)' },
    EMPHASIS_MARKERS: { description: 'Sentences with pause or emphasis markers' },
    ASK_FOLLOWUP: { description: 'Ask follow-up questions' },
    SUGGEST_ACTIONS: { description: 'Suggest next actions based on conversation' },
    OFFER_REFINEMENT: { description: 'Offer refinement in queries' },
    SHOW_MORE: { description: 'Provide show more if more details are needed' },
    CLARIFY_AMBIGUOUS: { description: 'Clarify an ambiguous statement' },
    PROVIDE_MORE_CONTEXT: { description: 'Provide more context when user requests' },
    RECOMMEND_ACTION: { description: 'Recommend user take action' },
    CONTEXT_SUGGESTIONS: { description: 'Provide context-based suggestions' },
    HIGHLIGHT_RISKS: { description: 'Highlight risks or potential issues' },
    EMPHASIZE_STEPS: { description: 'Emphasize critical steps in a process' },
    KEY_TAKEAWAYS: { description: 'Provide key takeaways from the conversation' },
    ALTERNATIVE_PATHS: { description: 'Suggest alternative paths if necessary' },
    CONFIRM_MAJOR: { description: 'Provide confirmation of major points' },
    HIGHLIGHT_VALUES: { description: 'Highlight important values' }
  },

  memory: {
    ACTIVE_CONTEXT: { description: 'Active conversation context' },
    RECENT_QUERY: { description: 'User most recent query' },
    USER_PREFERENCES: { description: 'User preferences or context signals' },
    PRIOR_ASSUMPTIONS: { description: 'Prior assumptions based on conversation' },
    CURRENT_STATUS: { description: 'Current status or progress in the conversation' },
    PAST_BEHAVIORS: { description: 'User past behaviors (if applicable)' },
    RESPONSE_HISTORY: { description: 'User history of previous responses' },
    TASK_DATA: { description: 'Specific user-based or task-based data' },
    FLAGGED_ANSWERS: { description: 'Answers previously flagged or confirmed' },
    CLARIFICATION_FLAGS: { description: 'Clarification flags' },
    PERSISTENT_QUESTIONS: { description: 'Persistent question context (open-ended discussion)' },
    COVERED_TOPICS: { description: 'Topics previously covered (to avoid redundancy)' }
  },

  failureModes: {
    MISSING_PREMISE: { description: 'Missing premise or user input' },
    HIDDEN_ASSUMPTION: { description: 'Hidden assumption causing misunderstanding' },
    CONFLICTING_INFO: { description: 'Conflicting information' },
    OVER_EXPLANATION: { description: 'Over-explanation (leading to user confusion)' },
    UNDER_EXPLANATION: { description: 'Under-explanation (leading to user dissatisfaction)' },
    USER_MISUNDERSTANDING: { description: 'User misunderstanding the answer' },
    LOGICAL_ERROR: { description: 'Logical error or gap in conversation flow' },
    FACTUAL_INACCURACY: { description: 'Factual inaccuracy in response' },
    UNCLEAR_RESPONSE: { description: 'Unclear or incomplete response' },
    AMBIGUOUS_QUERY: { description: 'Ambiguity in user query' },
    NO_CONTEXT: { description: 'No answer due to lack of context' },
    GOAL_MISALIGNMENT: { description: 'Misalignment of conversation goals' }
  }
};

// ============================================================================
// 7. MEMORY INTENT - TIER 2
// ============================================================================

export const MEMORY = {
  states: {
    NO_MEMORY: { description: 'No existing memory' },
    SINGLE_MEMORY: { description: 'Single memory item' },
    MULTIPLE_MEMORIES: { description: 'Multiple memory items' },
    CONFLICTING_MEMORIES: { description: 'Conflicting memories' },
    OUTDATED_MEMORY: { description: 'Outdated memory' },
    RECENT_MEMORY: { description: 'Recent memory' },
    LONG_TERM: { description: 'Long-term memory' },
    SHORT_TERM: { description: 'Short-term (session) memory' },
    EXPLICIT_REF: { description: 'Explicit memory reference' },
    IMPLICIT_REF: { description: 'Implicit memory reference' },
    USER_OWNED: { description: 'User-owned memory' },
    SYSTEM_OWNED: { description: 'System-owned memory' },
    PREFERENCE_MEMORY: { description: 'Preference memory' },
    FACT_MEMORY: { description: 'Fact memory' },
    INSTRUCTION_MEMORY: { description: 'Instruction memory' },
    CONTEXTUAL_MEMORY: { description: 'Contextual memory' },
    TEMPORARY_MEMORY: { description: 'Temporary memory' },
    PERSISTENT_MEMORY: { description: 'Persistent memory' },
    EDITABLE_MEMORY: { description: 'Editable memory' },
    LOCKED_MEMORY: { description: 'Locked memory' },
    PRIVACY_SENSITIVE: { description: 'Privacy-sensitive memory' },
    AMBIGUOUS_REF: { description: 'Ambiguous memory reference' },
    PARTIAL_MATCH: { description: 'Partial memory match' },
    HIGH_CONFIDENCE: { description: 'High-confidence memory' },
    LOW_CONFIDENCE: { description: 'Low-confidence memory' }
  },

  actions: {
    STORE: { description: 'Store memory', family: 'storage' },
    UPDATE: { description: 'Update memory', family: 'storage' },
    OVERWRITE: { description: 'Overwrite memory', family: 'storage' },
    APPEND: { description: 'Append to memory', family: 'storage' },
    MERGE: { description: 'Merge memories', family: 'storage' },
    RECALL: { description: 'Recall memory', family: 'retrieval' },
    SEARCH: { description: 'Search memory', family: 'retrieval' },
    FILTER: { description: 'Filter memory', family: 'retrieval' },
    RANK: { description: 'Rank memory relevance', family: 'retrieval' },
    DELETE: { description: 'Delete memory', family: 'maintenance' },
    ARCHIVE: { description: 'Archive memory', family: 'maintenance' },
    EXPIRE: { description: 'Expire memory', family: 'maintenance' },
    REFRESH: { description: 'Refresh memory', family: 'maintenance' },
    VALIDATE: { description: 'Validate memory', family: 'maintenance' },
    CONFIRM_INTENT: { description: 'Confirm memory intent', family: 'clarification' },
    CLARIFY_REF: { description: 'Clarify memory reference', family: 'clarification' },
    ASK_PERMISSION_STORE: { description: 'Ask permission to store', family: 'clarification' },
    ASK_PERMISSION_UPDATE: { description: 'Ask permission to update', family: 'clarification' },
    RESOLVE_CONFLICT: { description: 'Resolve memory conflict', family: 'reasoning' },
    DETECT_INCONSISTENCY: { description: 'Detect inconsistency', family: 'reasoning' },
    INFER_MISSING: { description: 'Infer missing memory', family: 'reasoning' },
    LINK_CONTEXT: { description: 'Link memory to context', family: 'reasoning' }
  },

  scope: {
    SINGLE_ITEM: { description: 'Single memory item' },
    MULTIPLE_ITEMS: { description: 'Multiple memory items' },
    SESSION_ONLY: { description: 'Session-only scope' },
    CROSS_SESSION: { description: 'Cross-session scope' },
    USER_LEVEL: { description: 'User-level scope' },
    WORKSPACE_LEVEL: { description: 'Workspace-level scope' },
    PREFERENCE_ONLY: { description: 'Preference-only scope' },
    FACT_ONLY: { description: 'Fact-only scope' },
    INSTRUCTION_ONLY: { description: 'Instruction-only scope' },
    TIME_BOUNDED: { description: 'Time-bounded scope' },
    TOPIC_BOUNDED: { description: 'Topic-bounded scope' },
    INTENT_BOUNDED: { description: 'Intent-bounded scope' },
    PRIVACY_BOUNDED: { description: 'Privacy-bounded scope' },
    EXPLICIT_SCOPE: { description: 'Explicit-memory scope' },
    IMPLICIT_SCOPE: { description: 'Implicit-memory scope' }
  },

  depth: {
    DIRECT_LOOKUP: { description: 'Direct lookup', depth: 1 },
    CONTEXTUAL_RECALL: { description: 'Contextual recall', depth: 2 },
    CROSS_MEMORY: { description: 'Cross-memory linking', depth: 3 },
    CONFLICT_RESOLUTION: { description: 'Conflict resolution', depth: 4 },
    TEMPORAL_REASONING: { description: 'Temporal reasoning', depth: 4 },
    PRIORITY_RESOLUTION: { description: 'Priority resolution', depth: 5 },
    CONFIDENCE_EVALUATION: { description: 'Confidence evaluation', depth: 5 },
    PRIVACY_EVALUATION: { description: 'Privacy evaluation', depth: 6 },
    SYSTEM_CONSISTENCY: { description: 'System consistency check', depth: 6 }
  },

  evidenceAndTrust: {
    USER_CONFIRMATION: { description: 'User confirmation required' },
    USER_CONFIRMATION_OPTIONAL: { description: 'User confirmation optional' },
    SILENT_STORAGE_ALLOWED: { description: 'Silent storage allowed' },
    SILENT_STORAGE_FORBIDDEN: { description: 'Silent storage forbidden' },
    EXPLICIT_CONSENT: { description: 'Explicit consent required' },
    IMPLICIT_CONSENT: { description: 'Implicit consent allowed' },
    PRIVACY_SENSITIVE: { description: 'Privacy-sensitive mode' },
    ACCURACY_REQUIRED: { description: 'Accuracy required' },
    APPROXIMATE_ALLOWED: { description: 'Approximate memory allowed' },
    CONFLICT_DISCLOSURE: { description: 'Conflict disclosure required' },
    UNCERTAINTY_DISCLOSURE: { description: 'Uncertainty disclosure required' },
    SYSTEM_OVERRIDE_FORBIDDEN: { description: 'System override forbidden' }
  },

  termination: {
    STORED_SUCCESS: { description: 'Memory stored successfully' },
    UPDATED_SUCCESS: { description: 'Memory updated successfully' },
    RECALLED_SUCCESS: { description: 'Memory recalled successfully' },
    PERMISSION_DENIED: { description: 'Permission denied' },
    CONFLICT_UNRESOLVED: { description: 'Conflict unresolved' },
    AMBIGUITY_UNRESOLVED: { description: 'Ambiguity unresolved' },
    PRIVACY_BOUNDARY: { description: 'Privacy boundary reached' },
    USER_CANCELLATION: { description: 'User cancellation' },
    SYSTEM_RESTRICTION: { description: 'System restriction reached' }
  },

  outputControl: {
    SINGLE_CONFIRMATION: { description: 'Single confirmation sentence' },
    SHORT_ACKNOWLEDGMENT: { description: 'Short acknowledgment' },
    MEMORY_SUMMARY: { description: 'Memory summary list' },
    CHANGE_LOG: { description: 'Change log format' },
    ASK_CONFIRMATION: { description: 'Ask confirmation' },
    ASK_CLARIFICATION: { description: 'Ask clarification' },
    OFFER_REMOVAL: { description: 'Offer memory removal' },
    OFFER_UPDATE: { description: 'Offer memory update' },
    OFFER_REVIEW: { description: 'Offer memory review' },
    HIGHLIGHT_STORED: { description: 'Highlight stored item' },
    HIGHLIGHT_UPDATED: { description: 'Highlight updated fields' },
    HIGHLIGHT_CONFLICTS: { description: 'Highlight conflicts' },
    HIGHLIGHT_PRIVACY: { description: 'Highlight privacy impact' }
  },

  sessionContext: {
    PENDING_ACTIONS: { description: 'Pending memory actions' },
    CONFIRMED_MEMORIES: { description: 'Confirmed memories' },
    REJECTED_MEMORIES: { description: 'Rejected memories' },
    PERMISSIONS: { description: 'Memory permissions' },
    PRIVACY_FLAGS: { description: 'Privacy flags' },
    USER_INTENT_HISTORY: { description: 'User intent history' },
    RELATED_PREFERENCES: { description: 'Related preferences' },
    CONFIDENCE_LEVEL: { description: 'Memory confidence level' },
    LAST_ACTION: { description: 'Last memory action' }
  },

  failureModes: {
    UNINTENDED_STORAGE: { description: 'Unintended storage' },
    INCORRECT_UPDATE: { description: 'Incorrect memory update' },
    OVERWRITE_ERROR: { description: 'Memory overwrite error' },
    PRIVACY_VIOLATION: { description: 'Privacy violation' },
    PERMISSION_AMBIGUITY: { description: 'Permission ambiguity' },
    CONFLICTING_MEMORIES: { description: 'Conflicting memories' },
    MEMORY_DRIFT: { description: 'Memory drift' },
    RECALL_MISMATCH: { description: 'Recall mismatch' },
    SCOPE_LEAKAGE: { description: 'Scope leakage' }
  }
};

// ============================================================================
// 8. PREFERENCES INTENT - TIER 2
// ============================================================================

export const PREFERENCES = {
  states: {
    NO_PREFERENCES: { description: 'No preferences set' },
    SINGLE_PREFERENCE: { description: 'Single preference set' },
    MULTIPLE_PREFERENCES: { description: 'Multiple preferences set' },
    CONFLICTING_PREFERENCES: { description: 'Conflicting preferences' },
    EXPLICIT_STATEMENT: { description: 'Explicit preference statement' },
    IMPLICIT_SIGNAL: { description: 'Implicit preference signal' },
    TEMPORARY_PREFERENCE: { description: 'Temporary preference' },
    PERSISTENT_PREFERENCE: { description: 'Persistent preference' },
    SESSION_ONLY: { description: 'Session-only preference' },
    CROSS_SESSION: { description: 'Cross-session preference' },
    DEFAULT_SYSTEM: { description: 'Default system preference' },
    USER_OVERRIDDEN: { description: 'User-overridden preference' },
    RECENTLY_UPDATED: { description: 'Recently updated preference' },
    OUTDATED_PREFERENCE: { description: 'Outdated preference' },
    HIGH_CONFIDENCE: { description: 'High-confidence preference' },
    LOW_CONFIDENCE: { description: 'Low-confidence preference' },
    INFERRED_BEHAVIOR: { description: 'Preference inferred from behavior' },
    INFERRED_CORRECTION: { description: 'Preference inferred from correction' },
    INFERRED_FEEDBACK: { description: 'Preference inferred from feedback' },
    LOCKED_PREFERENCE: { description: 'Preference locked' },
    EDITABLE_PREFERENCE: { description: 'Preference editable' },
    RESTRICTED_BY_POLICY: { description: 'Preference restricted by policy' },
    AMBIGUOUS_REF: { description: 'Ambiguous preference reference' },
    PARTIAL_MATCH: { description: 'Partial preference match' },
    PENDING_CONFIRMATION: { description: 'Preference pending confirmation' }
  },

  actions: {
    SET: { description: 'Set preference', family: 'creation' },
    UPDATE: { description: 'Update preference', family: 'creation' },
    OVERWRITE: { description: 'Overwrite preference', family: 'creation' },
    MERGE: { description: 'Merge preferences', family: 'creation' },
    RESET: { description: 'Reset preference to default', family: 'creation' },
    RECALL: { description: 'Recall preference', family: 'retrieval' },
    LIST: { description: 'List preferences', family: 'retrieval' },
    FILTER: { description: 'Filter preferences', family: 'retrieval' },
    RANK: { description: 'Rank preference priority', family: 'retrieval' },
    INFER: { description: 'Infer preference', family: 'inference' },
    VALIDATE_INFERRED: { description: 'Validate inferred preference', family: 'inference' },
    CONFIRM: { description: 'Confirm preference', family: 'inference' },
    REJECT_INFERRED: { description: 'Reject inferred preference', family: 'inference' },
    DELETE: { description: 'Delete preference', family: 'maintenance' },
    LOCK: { description: 'Lock preference', family: 'maintenance' },
    UNLOCK: { description: 'Unlock preference', family: 'maintenance' },
    EXPIRE: { description: 'Expire preference', family: 'maintenance' },
    RESOLVE_CONFLICT: { description: 'Resolve preference conflict', family: 'reasoning' },
    APPLY_TO_RESPONSE: { description: 'Apply preference to response', family: 'reasoning' },
    APPLY_TO_ROUTING: { description: 'Apply preference to routing', family: 'reasoning' },
    APPLY_TO_FORMATTING: { description: 'Apply preference to formatting', family: 'reasoning' }
  },

  scope: {
    SINGLE_RESPONSE: { description: 'Single response' },
    SINGLE_INTENT: { description: 'Single intent' },
    MULTIPLE_INTENTS: { description: 'Multiple intents' },
    ENTIRE_SESSION: { description: 'Entire session' },
    ENTIRE_WORKSPACE: { description: 'Entire workspace' },
    USER_LEVEL: { description: 'User-level scope' },
    DOCUMENT_ONLY: { description: 'Document-only scope' },
    CONVERSATION_ONLY: { description: 'Conversation-only scope' },
    EDIT_ONLY: { description: 'Edit-only scope' },
    REASONING_ONLY: { description: 'Reasoning-only scope' },
    OUTPUT_ONLY: { description: 'Output-only scope' },
    DOMAIN_SPECIFIC: { description: 'Domain-specific scope' },
    LANGUAGE_SPECIFIC: { description: 'Language-specific scope' },
    PRIVACY_SPECIFIC: { description: 'Privacy-specific scope' },
    SYSTEM_WIDE: { description: 'System-wide scope' }
  },

  depth: {
    DIRECT_APPLICATION: { description: 'Direct application', depth: 1 },
    CONTEXTUAL_APPLICATION: { description: 'Contextual application', depth: 2 },
    CROSS_INTENT: { description: 'Cross-intent application', depth: 3 },
    PRIORITY_RESOLUTION: { description: 'Priority resolution', depth: 4 },
    CONFLICT_RESOLUTION: { description: 'Conflict resolution', depth: 4 },
    TEMPORAL_EVALUATION: { description: 'Temporal evaluation', depth: 5 },
    BEHAVIORAL_INFERENCE: { description: 'Behavioral inference', depth: 5 },
    CONFIDENCE_SCORING: { description: 'Confidence scoring', depth: 6 },
    POLICY_CONSISTENCY: { description: 'Policy consistency check', depth: 6 }
  },

  evidenceAndTrust: {
    EXPLICIT_CONFIRMATION: { description: 'Explicit user confirmation required' },
    EXPLICIT_CONFIRMATION_OPTIONAL: { description: 'Explicit user confirmation optional' },
    IMPLICIT_INFERENCE_ALLOWED: { description: 'Implicit inference allowed' },
    IMPLICIT_INFERENCE_RESTRICTED: { description: 'Implicit inference restricted' },
    SILENT_APPLICATION_ALLOWED: { description: 'Silent application allowed' },
    SILENT_APPLICATION_FORBIDDEN: { description: 'Silent application forbidden' },
    DISCLOSURE_REQUIRED: { description: 'Preference disclosure required' },
    DISCLOSURE_OPTIONAL: { description: 'Preference disclosure optional' },
    PRIVACY_SENSITIVE: { description: 'Privacy-sensitive mode' },
    CONFLICT_DISCLOSURE: { description: 'Conflict disclosure required' },
    UNCERTAINTY_DISCLOSURE: { description: 'Uncertainty disclosure required' },
    SYSTEM_OVERRIDE_FORBIDDEN: { description: 'System override forbidden' }
  },

  termination: {
    APPLIED_SUCCESS: { description: 'Preference applied successfully' },
    STORED_SUCCESS: { description: 'Preference stored successfully' },
    UPDATED_SUCCESS: { description: 'Preference updated successfully' },
    DELETED_SUCCESS: { description: 'Preference deleted successfully' },
    USER_REJECTION: { description: 'User rejection' },
    AMBIGUITY_UNRESOLVED: { description: 'Ambiguity unresolved' },
    CONFLICT_UNRESOLVED: { description: 'Conflict unresolved' },
    POLICY_BOUNDARY: { description: 'Policy boundary reached' },
    USER_CANCELLATION: { description: 'User cancellation' }
  },

  outputControl: {
    SINGLE_CONFIRMATION: { description: 'Single confirmation sentence' },
    PREFERENCE_SUMMARY: { description: 'Preference summary list' },
    CHANGE_LOG: { description: 'Change log format' },
    BEFORE_AFTER: { description: 'Before/after comparison' },
    ASK_CONFIRMATION: { description: 'Ask confirmation' },
    ASK_CLARIFICATION: { description: 'Ask clarification' },
    OFFER_REVIEW: { description: 'Offer preference review' },
    OFFER_RESET: { description: 'Offer preference reset' },
    OFFER_LOCK: { description: 'Offer preference lock' },
    HIGHLIGHT_ACTIVE: { description: 'Highlight active preference' },
    HIGHLIGHT_UPDATED: { description: 'Highlight updated preference' },
    HIGHLIGHT_CONFLICTS: { description: 'Highlight conflicts' },
    HIGHLIGHT_SCOPE: { description: 'Highlight scope of effect' }
  },

  sessionContext: {
    ACTIVE_PREFERENCES: { description: 'Active preferences' },
    PENDING_CHANGES: { description: 'Pending preference changes' },
    REJECTED_PREFERENCES: { description: 'Rejected preferences' },
    CONFIDENCE_LEVELS: { description: 'Preference confidence levels' },
    PRIORITY_ORDER: { description: 'Preference priority order' },
    RELATED_INTENTS: { description: 'Related intents' },
    RELATED_OUTPUTS: { description: 'Related outputs' },
    LAST_ACTION: { description: 'Last preference action' },
    CORRECTION_HISTORY: { description: 'User correction history' }
  },

  failureModes: {
    INCORRECT_INFERENCE: { description: 'Incorrect inference' },
    UNINTENDED_OVERRIDE: { description: 'Unintended override' },
    PREFERENCE_CONFLICT: { description: 'Preference conflict' },
    SCOPE_LEAKAGE: { description: 'Scope leakage' },
    SILENT_MISAPPLICATION: { description: 'Silent misapplication' },
    PRIVACY_VIOLATION: { description: 'Privacy violation' },
    PREFERENCE_DRIFT: { description: 'Preference drift' },
    PREFERENCE_INCONSISTENCY: { description: 'Preference inconsistency' },
    SYSTEM_OVERRIDE_ERROR: { description: 'System override error' }
  }
};

// ============================================================================
// 9. FILE_ACTIONS INTENT - TIER 2
// ============================================================================

export const FILE_ACTIONS = {
  states: {
    NO_SELECTION: { description: 'No item selected' },
    FILE_SELECTED: { description: 'File selected' },
    FOLDER_SELECTED: { description: 'Folder selected' },
    UPLOAD_PENDING: { description: 'Upload pending' },
    UPLOAD_IN_PROGRESS: { description: 'Upload in progress' },
    UPLOAD_COMPLETED: { description: 'Upload completed' },
    CREATE_FOLDER_PENDING: { description: 'Create folder pending' },
    MOVE_PENDING: { description: 'Move pending' },
    RENAME_PENDING: { description: 'Rename pending' },
    DELETE_PENDING: { description: 'Delete pending' },
    OPERATION_SUCCESS: { description: 'Operation successful' },
    OPERATION_FAILED: { description: 'Operation failed' },
    OPERATION_PARTIAL: { description: 'Operation partially completed' },
    ITEM_LOCKED: { description: 'Item locked or in use' },
    ITEM_UNAVAILABLE: { description: 'Item unavailable' }
  },

  actions: {
    UPLOAD_FILE: { description: 'Upload file', family: 'file' },
    CREATE_FOLDER: { description: 'Create folder', family: 'folder' },
    MOVE_FILE: { description: 'Move file', family: 'file' },
    MOVE_FOLDER: { description: 'Move folder', family: 'folder' },
    RENAME_FILE: { description: 'Rename file', family: 'file' },
    RENAME_FOLDER: { description: 'Rename folder', family: 'folder' },
    DELETE_FILE: { description: 'Delete file', family: 'file' },
    DELETE_FOLDER: { description: 'Delete folder', family: 'folder' }
  },

  target: {
    SINGLE_FILE: { description: 'Single file' },
    MULTIPLE_FILES: { description: 'Multiple files' },
    SINGLE_FOLDER: { description: 'Single folder' },
    MULTIPLE_FOLDERS: { description: 'Multiple folders' },
    FILE_IN_FOLDER: { description: 'File inside folder' },
    FOLDER_IN_FOLDER: { description: 'Folder inside folder' },
    ROOT_DIRECTORY: { description: 'Root directory' },
    USER_WORKSPACE: { description: 'User workspace' },
    EXPLICIT_PATH: { description: 'Explicit path' },
    IMPLICIT_PATH: { description: 'Implicit path' },
    LAST_REFERENCED: { description: 'Last referenced item' }
  },

  scope: {
    ONE_ITEM: { description: 'One item only' },
    MULTIPLE_SELECTED: { description: 'Multiple selected items' },
    ENTIRE_FOLDER: { description: 'Entire folder contents' },
    RECURSIVE: { description: 'Recursive folder operation' },
    WORKSPACE_LEVEL: { description: 'Workspace-level operation' },
    USER_OWNED: { description: 'User-owned items only' },
    PATH_BOUNDED: { description: 'Path-bounded operation' },
    NAME_BOUNDED: { description: 'Name-bounded operation' },
    CONFIRMATION_REQUIRED: { description: 'Confirmation-required operation' },
    DESTRUCTIVE: { description: 'Destructive operation' }
  },

  validation: {
    ITEM_EXISTS: { description: 'Item exists' },
    TARGET_PATH_EXISTS: { description: 'Target path exists' },
    NAME_COLLISION: { description: 'Name collision check' },
    PERMISSION_CHECK: { description: 'Permission check' },
    FOLDER_NOT_EMPTY: { description: 'Folder not empty (delete)' },
    FILE_TYPE_ALLOWED: { description: 'File type allowed (upload)' },
    FILE_SIZE_ALLOWED: { description: 'File size allowed (upload)' },
    PATH_SAFETY: { description: 'Path safety check' },
    RECURSIVE_IMPACT: { description: 'Recursive impact check' },
    USER_CONFIRMATION: { description: 'Explicit user confirmation' }
  },

  depth: {
    SIMPLE_SINGLE: { description: 'Simple single action', depth: 1 },
    SEQUENTIAL: { description: 'Sequential actions', depth: 2 },
    BULK: { description: 'Bulk operation', depth: 3 },
    RECURSIVE: { description: 'Recursive operation', depth: 4 },
    MULTI_STEP_CONFIRM: { description: 'Multi-step confirmation', depth: 4 },
    PARTIAL_ROLLBACK: { description: 'Partial rollback required', depth: 5 },
    FULL_ROLLBACK: { description: 'Full rollback required', depth: 5 }
  },

  termination: {
    COMPLETED_SUCCESS: { description: 'Operation completed successfully' },
    VALIDATION_FAILED: { description: 'Validation failed' },
    PERMISSION_DENIED: { description: 'Permission denied' },
    PATH_RESOLUTION_FAILED: { description: 'Path resolution failed' },
    NAME_CONFLICT: { description: 'Name conflict unresolved' },
    USER_CANCELLED: { description: 'User cancelled operation' },
    TIMEOUT: { description: 'Timeout reached' },
    SYSTEM_ERROR: { description: 'System error occurred' },
    SAFETY_ABORT: { description: 'Safety abort triggered' }
  },

  outputControl: {
    CONFIRMATION_MESSAGE: { description: 'Confirmation message' },
    SUCCESS_MESSAGE: { description: 'Success message (item + path)' },
    FAILURE_MESSAGE: { description: 'Failure message (reason)' },
    OPERATION_SUMMARY: { description: 'Operation summary' },
    FOLDER_CREATION_CONFIRM: { description: 'Folder creation confirmation' },
    RENAME_CONFIRM: { description: 'Rename confirmation' },
    ASK_CONFIRMATION: { description: 'Ask for confirmation' },
    ASK_DESTINATION: { description: 'Ask for destination path' },
    ASK_NEW_NAME: { description: 'Ask for new name' },
    OFFER_RETRY: { description: 'Offer retry' },
    OFFER_CANCEL: { description: 'Offer cancel' },
    HIGHLIGHT_DESTRUCTIVE: { description: 'Highlight destructive action' },
    HIGHLIGHT_IRREVERSIBLE: { description: 'Highlight irreversible operation' },
    HIGHLIGHT_PERMISSION: { description: 'Highlight permission issue' },
    HIGHLIGHT_CONFLICT: { description: 'Highlight name conflict' },
    HIGHLIGHT_SUCCESS: { description: 'Highlight successful completion' }
  },

  sessionContext: {
    LAST_SELECTED_ITEM: { description: 'Last selected item' },
    LAST_SELECTED_FOLDER: { description: 'Last selected folder' },
    PENDING_OPERATION: { description: 'Pending operation' },
    OPERATION_HISTORY: { description: 'Operation history (session)' },
    FAILED_REASON: { description: 'Failed operation reason' },
    CONFIRMATION_STATE: { description: 'User confirmation state' },
    TARGET_PATH_MEMORY: { description: 'Target path memory' },
    RETRY_COUNT: { description: 'Retry count' },
    CANCELLATION_FLAG: { description: 'Cancellation flag' },
    DESTRUCTIVE_FLAG: { description: 'Destructive-action flag' }
  },

  failureModes: {
    FILE_NOT_FOUND: { description: 'File not found' },
    FOLDER_NOT_FOUND: { description: 'Folder not found' },
    PERMISSION_DENIED: { description: 'Permission denied' },
    ITEM_EXISTS: { description: 'Item already exists' },
    INVALID_NAME: { description: 'Invalid name' },
    PATH_TRAVERSAL_BLOCKED: { description: 'Path traversal blocked' },
    ITEM_LOCKED: { description: 'Item locked by system' },
    PARTIAL_MOVE_FAILURE: { description: 'Partial move failure' },
    RECURSIVE_DELETE_BLOCKED: { description: 'Recursive delete blocked' },
    UNKNOWN_ERROR: { description: 'Unknown system error' }
  }
};

// ============================================================================
// 10. ERROR INTENT - TIER 2
// ============================================================================

export const ERROR = {
  states: {
    MISSING_DOCUMENT: { description: 'Missing document' },
    NOT_UPLOADED: { description: 'Document not uploaded yet' },
    STILL_PROCESSING: { description: 'Document still processing' },
    PROCESSING_FAILED: { description: 'Document failed processing' },
    UNSUPPORTED_TYPE: { description: 'Unsupported file type' },
    SIZE_EXCEEDED: { description: 'File size exceeded' },
    CORRUPTED_FILE: { description: 'Corrupted file' },
    OCR_FAILED: { description: 'OCR failed' },
    PARTIAL_EXTRACTION: { description: 'Partial extraction failure' },
    NO_RELEVANT_CONTENT: { description: 'No relevant content found' },
    AMBIGUOUS_REQUEST: { description: 'Ambiguous request' },
    CONFLICTING_REQUEST: { description: 'Conflicting request' },
    INSUFFICIENT_CONTEXT: { description: 'Insufficient context' },
    PERMISSION_DENIED: { description: 'Permission denied' },
    ACCESS_RESTRICTED: { description: 'Access restricted' },
    FEATURE_UNAVAILABLE: { description: 'Feature unavailable' },
    RATE_LIMIT: { description: 'Rate limit exceeded' },
    TIMEOUT: { description: 'Timeout occurred' },
    INTERNAL_ERROR: { description: 'Internal system error' },
    EXTERNAL_FAILURE: { description: 'External service failure' },
    DEPENDENCY_UNAVAILABLE: { description: 'Dependency unavailable' },
    VALIDATION_FAILED: { description: 'Validation failed' },
    POLICY_VIOLATION: { description: 'Policy violation' },
    SAFETY_TRIGGER: { description: 'Safety trigger' }
  },

  actions: {
    EXPLAIN_CAUSE: { description: 'Explain error cause', family: 'explanation' },
    IDENTIFY_MISSING: { description: 'Identify missing requirement', family: 'explanation' },
    SUGGEST_CORRECTION: { description: 'Suggest corrective action', family: 'guidance' },
    REQUEST_INPUT: { description: 'Request additional input', family: 'guidance' },
    REQUEST_CLARIFICATION: { description: 'Request clarification', family: 'guidance' },
    RETRY_OPERATION: { description: 'Retry operation', family: 'recovery' },
    DEGRADE_GRACEFULLY: { description: 'Degrade gracefully', family: 'recovery' },
    OFFER_ALTERNATIVE: { description: 'Offer alternative action', family: 'recovery' },
    ESCALATE: { description: 'Escalate error', family: 'escalation' },
    LOG_INTERNAL: { description: 'Log error internally', family: 'internal' },
    SURFACE_MINIMAL: { description: 'Surface minimal error', family: 'output' },
    SURFACE_DETAILED: { description: 'Surface detailed error', family: 'output' },
    SUPPRESS_TECHNICAL: { description: 'Suppress technical detail', family: 'output' },
    PROVIDE_GUIDANCE: { description: 'Provide user guidance', family: 'guidance' },
    PROVIDE_RECOVERY: { description: 'Provide recovery steps', family: 'guidance' },
    ABORT_OPERATION: { description: 'Abort operation', family: 'control' },
    CONTINUE_PARTIAL: { description: 'Continue partial operation', family: 'control' }
  },

  scope: {
    SINGLE_REQUEST: { description: 'Single request' },
    SINGLE_DOCUMENT: { description: 'Single document' },
    MULTIPLE_DOCUMENTS: { description: 'Multiple documents' },
    FOLDER_LEVEL: { description: 'Folder-level' },
    WORKSPACE_LEVEL: { description: 'Workspace-level' },
    SESSION_LEVEL: { description: 'Session-level' },
    USER_LEVEL: { description: 'User-level' },
    SYSTEM_LEVEL: { description: 'System-level' },
    TIME_BOUNDED: { description: 'Time-bounded error' }
  },

  depth: {
    MINIMAL: { description: 'Minimal explanation', depth: 1 },
    USER_FRIENDLY: { description: 'User-friendly explanation', depth: 2 },
    CONTEXTUAL: { description: 'Contextual explanation', depth: 3 },
    STEP_BY_STEP: { description: 'Step-by-step breakdown', depth: 4 },
    TECHNICAL: { description: 'Technical explanation', depth: 5 },
    ROOT_CAUSE: { description: 'Root cause analysis', depth: 6 },
    PREVENTIVE: { description: 'Preventive guidance', depth: 6 }
  },

  evidenceAndTrust: {
    EXACT_CAUSE_KNOWN: { description: 'Exact cause known' },
    PROBABLE_CAUSE: { description: 'Probable cause inferred' },
    CAUSE_UNKNOWN: { description: 'Cause unknown' },
    SPECULATION_FORBIDDEN: { description: 'Speculation forbidden' },
    INTERNAL_LOGS: { description: 'Internal logs referenced' },
    EXTERNAL_DEPENDENCY: { description: 'External dependency noted' },
    USER_ACTION_REQUIRED: { description: 'User action required' },
    SYSTEM_RESPONSIBILITY: { description: 'System responsibility acknowledged' },
    RETRY_ALLOWED: { description: 'Retry allowed' }
  },

  termination: {
    ERROR_RESOLVED: { description: 'Error resolved' },
    USER_CORRECTED: { description: 'User corrected input' },
    RETRY_EXHAUSTED: { description: 'Retry exhausted' },
    TIMEOUT_REACHED: { description: 'Timeout reached' },
    USER_ABANDONS: { description: 'User abandons request' },
    ESCALATION_TRIGGERED: { description: 'Escalation triggered' },
    SESSION_ENDED: { description: 'Session ended' }
  },

  outputControl: {
    SINGLE_LINE: { description: 'Single-line error message' },
    SHORT_EXPLANATION: { description: 'Short explanation' },
    BULLET_GUIDANCE: { description: 'Bullet-point guidance' },
    STEP_BY_STEP_FIX: { description: 'Step-by-step fix' },
    STATUS_ACTION: { description: 'Status + action suggestion' },
    ASK_RETRY: { description: 'Ask user to retry' },
    ASK_INPUT: { description: 'Ask for missing input' },
    SUGGEST_ALTERNATIVE: { description: 'Suggest alternative workflow' },
    OFFER_HELP: { description: 'Offer help article' },
    OFFER_ESCALATION: { description: 'Offer support escalation' },
    HIGHLIGHT_BLOCKING: { description: 'Highlight blocking issue' },
    HIGHLIGHT_MISSING: { description: 'Highlight missing requirement' },
    HIGHLIGHT_ACTION: { description: 'Highlight user action needed' },
    HIGHLIGHT_TEMPORARY: { description: 'Highlight temporary issue' },
    HIGHLIGHT_PERMANENT: { description: 'Highlight permanent limitation' }
  },

  sessionContext: {
    LAST_ERROR_STATE: { description: 'Last error state' },
    FAILED_OPERATION: { description: 'Failed operation type' },
    AFFECTED_DOCUMENT: { description: 'Affected document' },
    RETRY_COUNT: { description: 'Retry count' },
    CORRECTION_ATTEMPTS: { description: 'User correction attempts' },
    ERROR_TIMESTAMP: { description: 'Error timestamp' },
    DEPENDENCY_INVOLVED: { description: 'Dependency involved' },
    RESOLUTION_STATUS: { description: 'Resolution status' }
  },

  failureModes: {
    MISCLASSIFIED_ERROR: { description: 'Misclassified error' },
    OVERLY_TECHNICAL: { description: 'Overly technical explanation' },
    UNDER_EXPLAINED: { description: 'Under-explained failure' },
    INCORRECT_RECOVERY: { description: 'Incorrect recovery advice' },
    INFINITE_RETRY: { description: 'Infinite retry loop' },
    SILENT_FAILURE: { description: 'Silent failure' },
    WRONG_ROUTING: { description: 'Wrong intent routing' },
    USER_CONFUSION: { description: 'User confusion' }
  }
};

// ============================================================================
// JOB GENERATOR
// ============================================================================

/**
 * Generate all jobs for a specific intent and language
 */
export function generateJobsForIntent(intentName, language) {
  const intents = { DOCUMENTS, EXTRACTION, REASONING, EDIT, HELP, CONVERSATION, MEMORY, PREFERENCES, FILE_ACTIONS, ERROR };
  const intent = intents[intentName];
  if (!intent) throw new Error(`Unknown intent: ${intentName}`);

  const target = INTENT_TARGETS[intentName];
  const jobs = [];

  // Count total leaf nodes in the intent
  let totalLeafNodes = 0;
  for (const layerName of Object.keys(intent)) {
    const layer = intent[layerName];
    totalLeafNodes += Object.keys(layer).length;
  }

  // Calculate items per leaf node - split into multiple jobs if needed
  // Keywords are smaller (~100 bytes each), patterns larger (~300 bytes with negativeTests)
  const MAX_KEYWORDS_PER_JOB = 18;  // Safe for 2048 tokens (with variants array)
  const MAX_PATTERNS_PER_JOB = 12;  // Patterns have more data per item
  const keywordsPerLeaf = Math.ceil(target.keywords / totalLeafNodes);
  const patternsPerLeaf = Math.ceil(target.patterns / totalLeafNodes);

  // Generate jobs for each layer and target
  for (const layerName of Object.keys(intent)) {
    const layer = intent[layerName];
    for (const targetName of Object.keys(layer)) {
      const targetDef = layer[targetName];

      // Keywords jobs (split if exceeds MAX_KEYWORDS_PER_JOB)
      const numKeywordJobs = Math.ceil(keywordsPerLeaf / MAX_KEYWORDS_PER_JOB);
      for (let batch = 0; batch < numKeywordJobs; batch++) {
        const remaining = keywordsPerLeaf - (batch * MAX_KEYWORDS_PER_JOB);
        const count = Math.min(MAX_KEYWORDS_PER_JOB, remaining);
        jobs.push({
          jobId: `${intentName}-${layerName}-${targetName}-keywords-${language}-b${batch}`,
          intent: intentName,
          layer: layerName,
          target: targetName,
          language,
          artifactType: 'keywords',
          count,
          batch,
          totalBatches: numKeywordJobs,
          description: targetDef.description,
          depth: targetDef.depth,
          depthRange: targetDef.depthRange,
          family: targetDef.family
        });
      }

      // Patterns jobs (split if exceeds MAX_PATTERNS_PER_JOB)
      const numPatternJobs = Math.ceil(patternsPerLeaf / MAX_PATTERNS_PER_JOB);
      for (let batch = 0; batch < numPatternJobs; batch++) {
        const remaining = patternsPerLeaf - (batch * MAX_PATTERNS_PER_JOB);
        const count = Math.min(MAX_PATTERNS_PER_JOB, remaining);
        jobs.push({
          jobId: `${intentName}-${layerName}-${targetName}-patterns-${language}-b${batch}`,
          intent: intentName,
          layer: layerName,
          target: targetName,
          language,
          artifactType: 'patterns',
          count,
          batch,
          totalBatches: numPatternJobs,
          description: targetDef.description,
          depth: targetDef.depth,
          depthRange: targetDef.depthRange,
          family: targetDef.family
        });
      }
    }
  }

  return jobs;
}

/**
 * Generate all jobs for all intents in tier order
 */
export function generateAllJobs() {
  const tiers = {
    TIER_0: ['DOCUMENTS', 'EXTRACTION', 'REASONING'],
    TIER_1: ['EDIT', 'HELP', 'CONVERSATION'],
    TIER_2: ['MEMORY', 'PREFERENCES', 'FILE_ACTIONS', 'ERROR']
  };

  const allJobs = [];
  const summary = { totalJobs: 0, byIntent: {}, byLanguage: {} };

  for (const [tierName, intents] of Object.entries(tiers)) {
    for (const intentName of intents) {
      for (const language of SUPPORTED_LANGUAGES) {
        const jobs = generateJobsForIntent(intentName, language);
        allJobs.push(...jobs);

        // Update summary
        summary.byIntent[intentName] = (summary.byIntent[intentName] || 0) + jobs.length;
        summary.byLanguage[language] = (summary.byLanguage[language] || 0) + jobs.length;
      }
    }
  }

  summary.totalJobs = allJobs.length;
  return { jobs: allJobs, summary };
}

/**
 * Get jobs for a specific tier
 */
export function getJobsForTier(tier) {
  const tierMap = {
    0: ['DOCUMENTS', 'EXTRACTION', 'REASONING'],
    1: ['EDIT', 'HELP', 'CONVERSATION'],
    2: ['MEMORY', 'PREFERENCES', 'FILE_ACTIONS', 'ERROR']
  };

  const intents = tierMap[tier];
  if (!intents) throw new Error(`Unknown tier: ${tier}`);

  const jobs = [];
  for (const intentName of intents) {
    for (const language of SUPPORTED_LANGUAGES) {
      jobs.push(...generateJobsForIntent(intentName, language));
    }
  }
  return jobs;
}

/**
 * Calculate totals for reporting
 */
export function calculateTotals() {
  const totals = {
    keywords: 0,
    patterns: 0,
    byIntent: {},
    byLanguage: { en: { keywords: 0, patterns: 0 }, pt: { keywords: 0, patterns: 0 }, es: { keywords: 0, patterns: 0 } }
  };

  for (const [intentName, target] of Object.entries(INTENT_TARGETS)) {
    totals.byIntent[intentName] = {
      keywords: target.keywords * 3,
      patterns: target.patterns * 3
    };
    totals.keywords += target.keywords * 3;
    totals.patterns += target.patterns * 3;

    for (const lang of SUPPORTED_LANGUAGES) {
      totals.byLanguage[lang].keywords += target.keywords;
      totals.byLanguage[lang].patterns += target.patterns;
    }
  }

  return totals;
}
