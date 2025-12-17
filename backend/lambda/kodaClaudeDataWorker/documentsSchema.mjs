/**
 * Koda Cognitive Intelligence Schema v5.0
 * ChatGPT-grade document-first intelligence
 *
 * GRAND TOTALS:
 * - Per language: 35,144 items
 * - 3 languages (en/pt/es): 105,432 items
 *
 * DOCUMENTS: 9,314/lang | HELP: 2,670/lang | CONVERSATION: 4,760/lang
 * EDIT: 3,300/lang | MEMORY: 3,500/lang | PREFERENCES: 3,200/lang
 * EXTRACTION: 2,400/lang | ERROR: 2,500/lang | REASONING: 3,500/lang
 */

export const SUPPORTED_LANGUAGES = ['en', 'pt', 'es'];

// ============================================================================
// GLOBAL DEPTH SCALE (D0-D8)
// ============================================================================

export const DEPTH_SCALE = {
  D0: { name: 'Null/Detection', description: 'Detect only, no output' },
  D1: { name: 'Minimal', description: 'Direct, surface-level' },
  D2: { name: 'Contextual', description: 'Adds surrounding context' },
  D3: { name: 'Structured', description: 'Organized explanation' },
  D4: { name: 'Analytical', description: 'Reasoning, relationships' },
  D5: { name: 'Cross-Referential', description: 'Multiple sources/comparisons' },
  D6: { name: 'Evaluative', description: 'Risk, impact, judgment' },
  D7: { name: 'Expert', description: 'Domain-level reasoning' },
  D8: { name: 'Meta/Control', description: 'Explains why and how reasoning is happening' }
};

// ============================================================================
// 1. DOCUMENTS INTENT - MASTER INTELLIGENCE (~9,676 items/lang)
// This is the definitive document intelligence layer - what ChatGPT reasons
// about implicitly, made explicit and controllable.
// ============================================================================

export const DOCUMENTS = {
  // 1.1 DOCUMENT STATES (~35 states × 40 kw + 25 pat = 1,400 kw + 875 pat)
  // What is the document situation right now? Controls caution, tone, depth.
  states: {
    // Core Identity (4)
    SINGLE_DOC: { description: 'Single document referenced', keywords: 40, patterns: 25, depthRange: [0, 8] },
    MULTIPLE_DOCS: { description: 'Multiple documents referenced', keywords: 40, patterns: 25, depthRange: [0, 8] },
    FOLDER_CONTEXT: { description: 'Folder / collection context', keywords: 40, patterns: 25, depthRange: [0, 6] },
    WORKSPACE_CONTEXT: { description: 'Entire workspace context', keywords: 40, patterns: 25, depthRange: [0, 6] },
    // Reference Clarity (5)
    EXPLICIT_NAME: { description: 'Explicit document name mentioned', keywords: 40, patterns: 25, depthRange: [0, 4] },
    IMPLICIT_REF: { description: 'Implicit document reference', keywords: 40, patterns: 25, depthRange: [0, 6] },
    AMBIGUOUS_REF: { description: 'Ambiguous document reference', keywords: 40, patterns: 25, depthRange: [4, 8] },
    UNKNOWN_REF: { description: 'Unknown document reference', keywords: 40, patterns: 25, depthRange: [3, 8] },
    MISSING_DOC: { description: 'Missing document', keywords: 40, patterns: 25, depthRange: [3, 6] },
    // Versioning & Time (6)
    VERSIONED: { description: 'Versioned document', keywords: 40, patterns: 25, depthRange: [2, 6] },
    MULTIPLE_VERSIONS: { description: 'Multiple versions detected', keywords: 40, patterns: 25, depthRange: [3, 7] },
    OUTDATED: { description: 'Outdated document', keywords: 40, patterns: 25, depthRange: [3, 7] },
    RECENT: { description: 'Recent / most current document', keywords: 40, patterns: 25, depthRange: [1, 4] },
    TIME_SENSITIVE: { description: 'Time-sensitive document', keywords: 40, patterns: 25, depthRange: [3, 7] },
    HISTORICAL_COMPARE: { description: 'Historical comparison required', keywords: 40, patterns: 25, depthRange: [4, 8] },
    // Relevance Confidence (5)
    HIGH_RELEVANCE: { description: 'Highly relevant document', keywords: 40, patterns: 25, depthRange: [1, 4] },
    PARTIAL_RELEVANCE: { description: 'Partially relevant document', keywords: 40, patterns: 25, depthRange: [2, 6] },
    LOW_CONFIDENCE: { description: 'Low-confidence relevance', keywords: 40, patterns: 25, depthRange: [3, 7] },
    CONFLICTING_DOCS: { description: 'Conflicting documents', keywords: 40, patterns: 25, depthRange: [5, 8] },
    REDUNDANT_DOCS: { description: 'Redundant documents detected', keywords: 40, patterns: 25, depthRange: [2, 5] },
    // Structure & Format (6)
    LONG_DOC: { description: 'Long document', keywords: 40, patterns: 25, depthRange: [2, 5] },
    SHORT_DOC: { description: 'Short document', keywords: 40, patterns: 25, depthRange: [1, 3] },
    STRUCTURED: { description: 'Structured (tables, forms, spreadsheets)', keywords: 40, patterns: 25, depthRange: [2, 5] },
    SEMI_STRUCTURED: { description: 'Semi-structured (headings + text)', keywords: 40, patterns: 25, depthRange: [2, 5] },
    UNSTRUCTURED: { description: 'Unstructured narrative', keywords: 40, patterns: 25, depthRange: [2, 6] },
    OCR_DERIVED: { description: 'Scanned / OCR-derived', keywords: 40, patterns: 25, depthRange: [3, 7] },
    // Language & Style (3)
    SINGLE_LANG: { description: 'Single-language document', keywords: 40, patterns: 25, depthRange: [0, 4] },
    MULTILINGUAL: { description: 'Multilingual document', keywords: 40, patterns: 25, depthRange: [3, 7] },
    MIXED_LANG_SET: { description: 'Mixed-language document set', keywords: 40, patterns: 25, depthRange: [3, 7] },
    // Content Characteristics (5)
    NUMERIC_HEAVY: { description: 'Numeric-heavy document', keywords: 40, patterns: 25, depthRange: [2, 6] },
    LEGAL_STYLE: { description: 'Legal-style document', keywords: 40, patterns: 25, depthRange: [4, 7] },
    FINANCIAL_STYLE: { description: 'Financial-style document', keywords: 40, patterns: 25, depthRange: [4, 7] },
    MEDICAL_STYLE: { description: 'Medical-style document', keywords: 40, patterns: 25, depthRange: [4, 7] },
    TECHNICAL_STYLE: { description: 'Technical / engineering document', keywords: 40, patterns: 25, depthRange: [3, 6] }
  },

  // 1.2 DOCUMENT ACTIONS (~50 actions × 35 kw + 22 pat = 1,750 kw + 1,100 pat)
  // What does the user want to DO with the document(s)?
  actions: {
    // Information Retrieval (7) - D1-D3
    LOCATE_FACT: { description: 'Locate fact', keywords: 35, patterns: 22, depthRange: [1, 3], family: 'retrieval' },
    LOCATE_SECTION: { description: 'Locate section', keywords: 35, patterns: 22, depthRange: [1, 3], family: 'retrieval' },
    LOCATE_CLAUSE: { description: 'Locate clause', keywords: 35, patterns: 22, depthRange: [1, 3], family: 'retrieval' },
    LOCATE_NUMBER: { description: 'Locate number/value', keywords: 35, patterns: 22, depthRange: [1, 3], family: 'retrieval' },
    LOCATE_DEFINITION: { description: 'Locate definition', keywords: 35, patterns: 22, depthRange: [1, 3], family: 'retrieval' },
    LOCATE_ASSUMPTION: { description: 'Locate assumption', keywords: 35, patterns: 22, depthRange: [2, 4], family: 'retrieval' },
    LOCATE_DEPENDENCY: { description: 'Locate dependency', keywords: 35, patterns: 22, depthRange: [2, 4], family: 'retrieval' },
    // Extraction (8) - D1-D4
    EXTRACT_VALUES: { description: 'Extract values', keywords: 35, patterns: 22, depthRange: [1, 4], family: 'extraction' },
    EXTRACT_DATES: { description: 'Extract dates', keywords: 35, patterns: 22, depthRange: [1, 4], family: 'extraction' },
    EXTRACT_NAMES: { description: 'Extract names/entities', keywords: 35, patterns: 22, depthRange: [1, 4], family: 'extraction' },
    EXTRACT_OBLIGATIONS: { description: 'Extract obligations', keywords: 35, patterns: 22, depthRange: [2, 5], family: 'extraction' },
    EXTRACT_RISKS: { description: 'Extract risks', keywords: 35, patterns: 22, depthRange: [2, 5], family: 'extraction' },
    EXTRACT_PENALTIES: { description: 'Extract penalties', keywords: 35, patterns: 22, depthRange: [2, 5], family: 'extraction' },
    EXTRACT_FORMULAS: { description: 'Extract formulas', keywords: 35, patterns: 22, depthRange: [2, 5], family: 'extraction' },
    EXTRACT_CONDITIONS: { description: 'Extract conditions', keywords: 35, patterns: 22, depthRange: [2, 5], family: 'extraction' },
    // Analysis (8) - D3-D7
    INTERPRET_MEANING: { description: 'Interpret meaning', keywords: 35, patterns: 22, depthRange: [3, 7], family: 'analysis' },
    IDENTIFY_IMPLICATIONS: { description: 'Identify implications', keywords: 35, patterns: 22, depthRange: [3, 7], family: 'analysis' },
    DETECT_INCONSISTENCIES: { description: 'Detect inconsistencies', keywords: 35, patterns: 22, depthRange: [3, 7], family: 'analysis' },
    DETECT_CONTRADICTIONS: { description: 'Detect contradictions', keywords: 35, patterns: 22, depthRange: [3, 7], family: 'analysis' },
    DETECT_MISSING_INFO: { description: 'Detect missing information', keywords: 35, patterns: 22, depthRange: [3, 7], family: 'analysis' },
    ASSESS_RISK: { description: 'Assess risk', keywords: 35, patterns: 22, depthRange: [4, 7], family: 'analysis' },
    ASSESS_COMPLIANCE: { description: 'Assess compliance', keywords: 35, patterns: 22, depthRange: [4, 7], family: 'analysis' },
    ASSESS_EXPOSURE: { description: 'Assess exposure', keywords: 35, patterns: 22, depthRange: [4, 7], family: 'analysis' },
    // Transformation (6) - D2-D5
    SUMMARIZE: { description: 'Summarize', keywords: 35, patterns: 22, depthRange: [2, 5], family: 'transformation' },
    SIMPLIFY: { description: 'Simplify', keywords: 35, patterns: 22, depthRange: [2, 5], family: 'transformation' },
    REWRITE: { description: 'Rewrite', keywords: 35, patterns: 22, depthRange: [2, 5], family: 'transformation' },
    NORMALIZE_TERMINOLOGY: { description: 'Normalize terminology', keywords: 35, patterns: 22, depthRange: [2, 5], family: 'transformation' },
    CONVERT_TO_TABLE: { description: 'Convert to table', keywords: 35, patterns: 22, depthRange: [2, 4], family: 'transformation' },
    CONVERT_TO_BULLETS: { description: 'Convert to bullet points', keywords: 35, patterns: 22, depthRange: [2, 4], family: 'transformation' },
    // Comparison (5) - D3-D6
    COMPARE_DOCUMENTS: { description: 'Compare documents', keywords: 35, patterns: 22, depthRange: [3, 6], family: 'comparison' },
    COMPARE_VERSIONS: { description: 'Compare versions', keywords: 35, patterns: 22, depthRange: [3, 6], family: 'comparison' },
    COMPARE_CLAUSES: { description: 'Compare clauses', keywords: 35, patterns: 22, depthRange: [3, 6], family: 'comparison' },
    COMPARE_METRICS: { description: 'Compare metrics', keywords: 35, patterns: 22, depthRange: [3, 6], family: 'comparison' },
    COMPARE_ASSUMPTIONS: { description: 'Compare assumptions', keywords: 35, patterns: 22, depthRange: [4, 7], family: 'comparison' },
    // Organization (4) - D2-D4
    CATEGORIZE_DOCS: { description: 'Categorize documents', keywords: 35, patterns: 22, depthRange: [2, 4], family: 'organization' },
    TAG_CONTENT: { description: 'Tag content', keywords: 35, patterns: 22, depthRange: [2, 4], family: 'organization' },
    GROUP_SECTIONS: { description: 'Group related sections', keywords: 35, patterns: 22, depthRange: [2, 4], family: 'organization' },
    PRIORITIZE_ISSUES: { description: 'Prioritize issues', keywords: 35, patterns: 22, depthRange: [3, 5], family: 'organization' },
    // Decision Support (4) - D4-D8
    RECOMMEND_ACTION: { description: 'Recommend action', keywords: 35, patterns: 22, depthRange: [4, 8], family: 'decision' },
    HIGHLIGHT_CRITICAL: { description: 'Highlight critical issues', keywords: 35, patterns: 22, depthRange: [4, 8], family: 'decision' },
    FLAG_ATTENTION: { description: 'Flag attention areas', keywords: 35, patterns: 22, depthRange: [4, 8], family: 'decision' },
    SUGGEST_FOLLOWUP: { description: 'Suggest follow-up questions', keywords: 35, patterns: 22, depthRange: [4, 8], family: 'decision' },
    // Additional retrieval actions (8) - new
    FIND_ANSWER: { description: 'Find answer to question', keywords: 35, patterns: 22, depthRange: [1, 5], family: 'retrieval' },
    LIST_ITEMS: { description: 'List items/elements', keywords: 35, patterns: 22, depthRange: [1, 3], family: 'retrieval' },
    COUNT_OCCURRENCES: { description: 'Count occurrences', keywords: 35, patterns: 22, depthRange: [1, 3], family: 'retrieval' },
    VERIFY_CLAIM: { description: 'Verify claim against document', keywords: 35, patterns: 22, depthRange: [3, 6], family: 'analysis' },
    EXPLAIN_TERM: { description: 'Explain term or concept', keywords: 35, patterns: 22, depthRange: [2, 5], family: 'analysis' },
    TRACE_REFERENCE: { description: 'Trace reference or citation', keywords: 35, patterns: 22, depthRange: [2, 5], family: 'retrieval' },
    IDENTIFY_AUTHOR: { description: 'Identify author or source', keywords: 35, patterns: 22, depthRange: [1, 3], family: 'extraction' },
    CHECK_CONSISTENCY: { description: 'Check consistency across docs', keywords: 35, patterns: 22, depthRange: [4, 7], family: 'analysis' }
  },

  // 1.3 DOCUMENT SCOPE (~22 scopes × 30 kw + 20 pat = 660 kw + 440 pat)
  // How wide is the question? Prevents over-answering and under-answering.
  scope: {
    // Granularity (8)
    SINGLE_SENTENCE: { description: 'Single sentence', keywords: 30, patterns: 20, depthRange: [0, 2] },
    SINGLE_PARAGRAPH: { description: 'Single paragraph', keywords: 30, patterns: 20, depthRange: [0, 3] },
    SINGLE_SECTION: { description: 'Single section', keywords: 30, patterns: 20, depthRange: [0, 4] },
    MULTIPLE_SECTIONS: { description: 'Multiple sections', keywords: 30, patterns: 20, depthRange: [1, 5] },
    ENTIRE_DOCUMENT: { description: 'Entire document', keywords: 30, patterns: 20, depthRange: [0, 5] },
    MULTIPLE_DOCUMENTS: { description: 'Multiple documents', keywords: 30, patterns: 20, depthRange: [1, 6] },
    ENTIRE_FOLDER: { description: 'Entire folder', keywords: 30, patterns: 20, depthRange: [1, 5] },
    ENTIRE_WORKSPACE: { description: 'Entire workspace', keywords: 30, patterns: 20, depthRange: [2, 6] },
    // Constraints (6)
    TIME_BOUNDED: { description: 'Time-bounded (e.g. last year)', keywords: 30, patterns: 20, depthRange: [1, 5] },
    VERSION_BOUNDED: { description: 'Version-bounded', keywords: 30, patterns: 20, depthRange: [2, 5] },
    AUTHOR_BOUNDED: { description: 'Author-bounded', keywords: 30, patterns: 20, depthRange: [1, 4] },
    FILETYPE_BOUNDED: { description: 'File-type bounded', keywords: 30, patterns: 20, depthRange: [1, 4] },
    LANGUAGE_BOUNDED: { description: 'Language-bounded', keywords: 30, patterns: 20, depthRange: [1, 5] },
    TOPIC_BOUNDED: { description: 'Topic-bounded', keywords: 30, patterns: 20, depthRange: [2, 6] },
    // Content Filters (6)
    NUMERIC_ONLY: { description: 'Numeric content only', keywords: 30, patterns: 20, depthRange: [1, 4] },
    TEXT_ONLY: { description: 'Text content only', keywords: 30, patterns: 20, depthRange: [1, 4] },
    METADATA_ONLY: { description: 'Metadata only', keywords: 30, patterns: 20, depthRange: [1, 3] },
    STRUCTURAL_ONLY: { description: 'Structural (headings/tables) only', keywords: 30, patterns: 20, depthRange: [1, 4] },
    APPENDIX_ONLY: { description: 'Appendix only', keywords: 30, patterns: 20, depthRange: [1, 4] },
    FOOTNOTES_ONLY: { description: 'Footnotes only', keywords: 30, patterns: 20, depthRange: [1, 4] },
    // Mixed (2)
    CROSS_DOC_SCOPE: { description: 'Cross-document scope', keywords: 30, patterns: 20, depthRange: [3, 7] },
    ADAPTIVE_SCOPE: { description: 'Adaptive scope (Koda decides)', keywords: 30, patterns: 20, depthRange: [2, 7] }
  },

  // 1.4 ANALYTICAL DEPTH (~15 levels × 25 kw + 18 pat = 375 kw + 270 pat)
  // How deep should reasoning go? This is where intelligence shows.
  analyticalDepth: {
    SURFACE_LOOKUP: { description: 'Surface lookup - direct retrieval', keywords: 25, patterns: 18, depth: 1 },
    CONTEXTUAL_EXPLANATION: { description: 'Contextual explanation', keywords: 25, patterns: 18, depth: 2 },
    CROSS_REFERENCE: { description: 'Cross-reference reasoning', keywords: 25, patterns: 18, depth: 3 },
    LOGICAL_INFERENCE: { description: 'Logical inference', keywords: 25, patterns: 18, depth: 4 },
    RISK_ANALYSIS: { description: 'Risk analysis', keywords: 25, patterns: 18, depth: 5 },
    FINANCIAL_IMPACT: { description: 'Financial impact analysis', keywords: 25, patterns: 18, depth: 5 },
    LEGAL_IMPLICATION: { description: 'Legal implication analysis', keywords: 25, patterns: 18, depth: 6 },
    MEDICAL_CAUTION: { description: 'Medical caution analysis', keywords: 25, patterns: 18, depth: 6 },
    TREND_ANALYSIS: { description: 'Trend analysis', keywords: 25, patterns: 18, depth: 5 },
    ASSUMPTION_ANALYSIS: { description: 'Assumption analysis', keywords: 25, patterns: 18, depth: 6 },
    SENSITIVITY_ANALYSIS: { description: 'Sensitivity analysis', keywords: 25, patterns: 18, depth: 6 },
    SCENARIO_COMPARISON: { description: 'Scenario comparison', keywords: 25, patterns: 18, depth: 6 },
    EXPERT_INTERPRETATION: { description: 'Expert-level interpretation', keywords: 25, patterns: 18, depth: 7 },
    // New depth levels
    WHAT_IF_ANALYSIS: { description: 'What-if analysis', keywords: 25, patterns: 18, depth: 7 },
    STRATEGIC_IMPLICATIONS: { description: 'Strategic implications', keywords: 25, patterns: 18, depth: 8 }
  },

  // 1.5 EVIDENCE & TRUST CONTROL (~12 levels × 25 kw + 18 pat = 300 kw + 216 pat)
  // How strict must Koda be? Prevents hallucination by design, not filtering.
  evidenceTrust: {
    DIRECT_CITATION: { description: 'Direct citation required', keywords: 25, patterns: 18, depth: 1 },
    MULTIPLE_CITATIONS: { description: 'Multiple citations required', keywords: 25, patterns: 18, depth: 2 },
    APPROXIMATE_ALLOWED: { description: 'Approximate answer allowed', keywords: 25, patterns: 18, depth: 3 },
    INFERENCE_ALLOWED: { description: 'Inference allowed', keywords: 25, patterns: 18, depth: 4 },
    SPECULATION_FORBIDDEN: { description: 'Speculation forbidden', keywords: 25, patterns: 18, depth: 5 },
    NUMERICAL_PRECISION: { description: 'Numerical precision required', keywords: 25, patterns: 18, depth: 3 },
    LEGAL_PRECISION: { description: 'Legal-grade precision', keywords: 25, patterns: 18, depth: 4 },
    FINANCIAL_PRECISION: { description: 'Financial-grade precision', keywords: 25, patterns: 18, depth: 4 },
    MEDICAL_CAUTION: { description: 'Medical caution mode', keywords: 25, patterns: 18, depth: 4 },
    LOW_CONFIDENCE_DISCLAIMER: { description: 'Low-confidence disclaimer required', keywords: 25, patterns: 18, depth: 6 },
    CONFLICTING_EVIDENCE_DISCLOSURE: { description: 'Conflicting evidence disclosure', keywords: 25, patterns: 18, depth: 5 },
    SOURCE_VERIFICATION: { description: 'Source verification required', keywords: 25, patterns: 18, depth: 5 }
  },

  // 1.6 OUTPUT CONTROL (~30 modes × 25 kw + 18 pat = 750 kw + 540 pat)
  // How the answer must look and behave. Output is not formatting — it's decision control.
  outputControl: {
    // Structural Formats (7)
    SINGLE_PARAGRAPH: { description: 'Single paragraph', keywords: 25, patterns: 18, depthRange: [1, 3], family: 'structural' },
    BULLET_POINTS: { description: 'Bullet points', keywords: 25, patterns: 18, depthRange: [1, 3], family: 'structural' },
    NUMBERED_STEPS: { description: 'Numbered steps', keywords: 25, patterns: 18, depthRange: [1, 4], family: 'structural' },
    TABLE: { description: 'Table format', keywords: 25, patterns: 18, depthRange: [1, 4], family: 'structural' },
    MATRIX_COMPARISON: { description: 'Matrix comparison', keywords: 25, patterns: 18, depthRange: [2, 5], family: 'structural' },
    TIMELINE: { description: 'Timeline format', keywords: 25, patterns: 18, depthRange: [2, 5], family: 'structural' },
    MIXED_SECTIONS: { description: 'Mixed sections', keywords: 25, patterns: 18, depthRange: [2, 5], family: 'structural' },
    // Interaction Controls (5)
    ASK_FOLLOWUP: { description: 'Ask follow-up question', keywords: 25, patterns: 18, depthRange: [2, 5], family: 'interaction' },
    OFFER_NEXT_ACTION: { description: 'Offer next action', keywords: 25, patterns: 18, depthRange: [2, 5], family: 'interaction' },
    SHOW_MORE_EXPANSION: { description: '"Show more" expansion', keywords: 25, patterns: 18, depthRange: [2, 4], family: 'interaction' },
    DRILLDOWN_SUGGESTION: { description: 'Drill-down suggestion', keywords: 25, patterns: 18, depthRange: [2, 5], family: 'interaction' },
    CLARIFICATION_REQUEST: { description: 'Clarification request', keywords: 25, patterns: 18, depthRange: [3, 5], family: 'interaction' },
    // Emphasis Rules (6)
    HIGHLIGHT_RISKS: { description: 'Highlight risks', keywords: 25, patterns: 18, depthRange: [2, 6], family: 'emphasis' },
    HIGHLIGHT_OBLIGATIONS: { description: 'Highlight obligations', keywords: 25, patterns: 18, depthRange: [2, 6], family: 'emphasis' },
    HIGHLIGHT_DEADLINES: { description: 'Highlight deadlines', keywords: 25, patterns: 18, depthRange: [2, 6], family: 'emphasis' },
    HIGHLIGHT_DISCREPANCIES: { description: 'Highlight discrepancies', keywords: 25, patterns: 18, depthRange: [3, 6], family: 'emphasis' },
    HIGHLIGHT_KEY_NUMBERS: { description: 'Highlight key numbers', keywords: 25, patterns: 18, depthRange: [2, 5], family: 'emphasis' },
    HIGHLIGHT_ASSUMPTIONS: { description: 'Highlight assumptions', keywords: 25, patterns: 18, depthRange: [3, 6], family: 'emphasis' },
    // Safety & Clarity (6)
    EXPLICIT_UNCERTAINTY: { description: 'Explicit uncertainty note', keywords: 25, patterns: 18, depthRange: [4, 8], family: 'safety' },
    EXPLICIT_LIMITATION: { description: 'Explicit limitation note', keywords: 25, patterns: 18, depthRange: [4, 7], family: 'safety' },
    SECTION_BREAKDOWN: { description: 'Section-by-section breakdown', keywords: 25, patterns: 18, depthRange: [3, 6], family: 'safety' },
    PLAIN_LANGUAGE: { description: 'Plain-language explanation', keywords: 25, patterns: 18, depthRange: [2, 5], family: 'safety' },
    EXECUTIVE_SUMMARY_FIRST: { description: 'Executive summary first', keywords: 25, patterns: 18, depthRange: [3, 6], family: 'safety' },
    DEEP_DETAIL_LAST: { description: 'Deep detail last', keywords: 25, patterns: 18, depthRange: [4, 7], family: 'safety' },
    // Additional output modes (6)
    CITATION_STYLE: { description: 'Citation-style references', keywords: 25, patterns: 18, depthRange: [2, 5], family: 'structural' },
    COMPARISON_TABLE: { description: 'Side-by-side comparison', keywords: 25, patterns: 18, depthRange: [3, 6], family: 'structural' },
    PROGRESSIVE_DISCLOSURE: { description: 'Progressive disclosure', keywords: 25, patterns: 18, depthRange: [2, 5], family: 'interaction' },
    CONFIDENCE_INDICATOR: { description: 'Confidence indicator', keywords: 25, patterns: 18, depthRange: [3, 6], family: 'safety' },
    SOURCE_ATTRIBUTION: { description: 'Source attribution', keywords: 25, patterns: 18, depthRange: [2, 5], family: 'emphasis' },
    DECISION_RECOMMENDATION: { description: 'Decision recommendation', keywords: 25, patterns: 18, depthRange: [4, 7], family: 'interaction' }
  },

  // 1.7 DOMAIN OVERLAYS (~20 overlays × 30 kw + 20 pat = 600 kw + 400 pat)
  // Domains modify depth, trust, and output - not the action. They change how careful Koda is.
  domainOverlays: {
    // Finance Domain (6)
    FINANCE_ACCOUNTING: { description: 'Accounting context', keywords: 30, patterns: 20 },
    FINANCE_CASH_FLOW: { description: 'Cash flow analysis', keywords: 30, patterns: 20 },
    FINANCE_ROI: { description: 'ROI / return analysis', keywords: 30, patterns: 20 },
    FINANCE_VALUATION: { description: 'Valuation context', keywords: 30, patterns: 20 },
    FINANCE_FORECASTING: { description: 'Financial forecasting', keywords: 30, patterns: 20 },
    FINANCE_TAX: { description: 'Tax context', keywords: 30, patterns: 20 },
    // Legal Domain (6)
    LEGAL_CONTRACTS: { description: 'Contract law context', keywords: 30, patterns: 20 },
    LEGAL_COMPLIANCE: { description: 'Compliance context', keywords: 30, patterns: 20 },
    LEGAL_OBLIGATIONS: { description: 'Obligations analysis', keywords: 30, patterns: 20 },
    LEGAL_PENALTIES: { description: 'Penalties / liability', keywords: 30, patterns: 20 },
    LEGAL_JURISDICTION: { description: 'Jurisdiction context', keywords: 30, patterns: 20 },
    LEGAL_RISK_EXPOSURE: { description: 'Legal risk exposure', keywords: 30, patterns: 20 },
    // Medical Domain (4)
    MEDICAL_DIAGNOSTIC: { description: 'Diagnostic caution', keywords: 30, patterns: 20 },
    MEDICAL_TREATMENT: { description: 'Treatment context', keywords: 30, patterns: 20 },
    MEDICAL_EVIDENCE: { description: 'Evidence strictness', keywords: 30, patterns: 20 },
    MEDICAL_TERMINOLOGY: { description: 'Medical terminology', keywords: 30, patterns: 20 },
    // Engineering/Technical Domain (4)
    ENGINEERING_SPECS: { description: 'Specifications context', keywords: 30, patterns: 20 },
    ENGINEERING_CONSTRAINTS: { description: 'Constraints analysis', keywords: 30, patterns: 20 },
    ENGINEERING_DEPENDENCIES: { description: 'Dependencies tracking', keywords: 30, patterns: 20 },
    ENGINEERING_VALIDATION: { description: 'Validation logic', keywords: 30, patterns: 20 }
  }
};

// ============================================================================
// 2. HELP INTENT - PRODUCT INTELLIGENCE (2,670 items/lang)
// ============================================================================

export const HELP = {
  // 2.1 HELP STATES (18 states × 25 kw + 14 pat = 450 kw + 252 pat)
  states: {
    FIRST_TIME_USER: { description: 'First-time user', keywords: 25, patterns: 14, depthRange: [0, 3] },
    RETURNING_USER: { description: 'Returning user', keywords: 25, patterns: 14, depthRange: [0, 2] },
    FEATURE_DISCOVERY: { description: 'Feature discovery', keywords: 25, patterns: 14, depthRange: [1, 4] },
    FEATURE_CONFUSION: { description: 'Feature confusion', keywords: 25, patterns: 14, depthRange: [2, 5] },
    ERROR_ENCOUNTERED: { description: 'Error encountered', keywords: 25, patterns: 14, depthRange: [3, 6] },
    MISUNDERSTANDING: { description: 'Misunderstanding', keywords: 25, patterns: 14, depthRange: [2, 5] },
    PERMISSION_ISSUE: { description: 'Permission issue', keywords: 25, patterns: 14, depthRange: [2, 5] },
    UPLOAD_ISSUE: { description: 'Upload issue', keywords: 25, patterns: 14, depthRange: [2, 6] },
    PROCESSING_DELAY: { description: 'Processing delay', keywords: 25, patterns: 14, depthRange: [1, 4] },
    MISSING_FEATURE: { description: 'Missing feature', keywords: 25, patterns: 14, depthRange: [2, 5] },
    UNEXPECTED_BEHAVIOR: { description: 'Unexpected behavior', keywords: 25, patterns: 14, depthRange: [3, 6] },
    USER_MISTAKE: { description: 'User mistake', keywords: 25, patterns: 14, depthRange: [2, 5] },
    SYSTEM_LIMITATION: { description: 'System limitation', keywords: 25, patterns: 14, depthRange: [2, 5] },
    CLARIFICATION_NEEDED: { description: 'Clarification needed', keywords: 25, patterns: 14, depthRange: [2, 4] },
    SUCCESS_CONFIRMATION: { description: 'Success confirmation', keywords: 25, patterns: 14, depthRange: [1, 2] },
    PARTIAL_SUCCESS: { description: 'Partial success', keywords: 25, patterns: 14, depthRange: [2, 4] },
    BLOCKED_ACTION: { description: 'Blocked action', keywords: 25, patterns: 14, depthRange: [3, 6] },
    RECOVERY_MODE: { description: 'Recovery mode', keywords: 25, patterns: 14, depthRange: [4, 7] }
  },

  // 2.2 HELP ACTIONS (22 actions × 35 kw + 18 pat = 770 kw + 396 pat)
  actions: {
    EXPLAIN_FEATURE: { description: 'Explain feature', keywords: 35, patterns: 18, depthRange: [1, 3] },
    EXPLAIN_BEHAVIOR: { description: 'Explain behavior', keywords: 35, patterns: 18, depthRange: [1, 4] },
    EXPLAIN_ERROR: { description: 'Explain error', keywords: 35, patterns: 18, depthRange: [2, 5] },
    GUIDE_STEP_BY_STEP: { description: 'Guide step-by-step', keywords: 35, patterns: 18, depthRange: [2, 4] },
    TROUBLESHOOT: { description: 'Troubleshoot', keywords: 35, patterns: 18, depthRange: [3, 6] },
    VALIDATE_SETUP: { description: 'Validate setup', keywords: 35, patterns: 18, depthRange: [2, 4] },
    CONFIRM_CAPABILITY: { description: 'Confirm capability', keywords: 35, patterns: 18, depthRange: [1, 3] },
    CLARIFY_LIMITATION: { description: 'Clarify limitation', keywords: 35, patterns: 18, depthRange: [2, 5] },
    SUGGEST_WORKAROUND: { description: 'Suggest workaround', keywords: 35, patterns: 18, depthRange: [3, 6] },
    RECOVER_FROM_ERROR: { description: 'Recover from error', keywords: 35, patterns: 18, depthRange: [4, 7] },
    RETRY_INSTRUCTION: { description: 'Retry instruction', keywords: 35, patterns: 18, depthRange: [2, 4] },
    RESET_GUIDANCE: { description: 'Reset guidance', keywords: 35, patterns: 18, depthRange: [3, 5] },
    USAGE_BEST_PRACTICE: { description: 'Usage best practice', keywords: 35, patterns: 18, depthRange: [3, 6] },
    WARNING_EXPLANATION: { description: 'Warning explanation', keywords: 35, patterns: 18, depthRange: [3, 5] },
    PERMISSION_GUIDANCE: { description: 'Permission guidance', keywords: 35, patterns: 18, depthRange: [2, 5] },
    FILE_REQUIREMENT: { description: 'File requirement explanation', keywords: 35, patterns: 18, depthRange: [2, 4] },
    FORMAT_REQUIREMENT: { description: 'Format requirement explanation', keywords: 35, patterns: 18, depthRange: [2, 4] },
    PROCESSING_EXPLANATION: { description: 'Processing explanation', keywords: 35, patterns: 18, depthRange: [2, 4] },
    STATUS_EXPLANATION: { description: 'Status explanation', keywords: 35, patterns: 18, depthRange: [1, 3] },
    NEXT_ACTION_SUGGESTION: { description: 'Next action suggestion', keywords: 35, patterns: 18, depthRange: [2, 5] },
    MISUSE_CORRECTION: { description: 'Misuse correction', keywords: 35, patterns: 18, depthRange: [2, 5] },
    ESCALATION_SUGGESTION: { description: 'Escalation suggestion', keywords: 35, patterns: 18, depthRange: [6, 8] }
  },

  // 2.3 HELP DEPTH (7 levels × 30 kw + 16 pat = 210 kw + 112 pat)
  depth: {
    QUICK_ANSWER: { description: 'Quick answer', keywords: 30, patterns: 16, depth: 1 },
    SHORT_EXPLANATION: { description: 'Short explanation', keywords: 30, patterns: 16, depth: 2 },
    STEP_BY_STEP: { description: 'Step-by-step', keywords: 30, patterns: 16, depth: 3 },
    EXPANDED_EXPLANATION: { description: 'Expanded explanation', keywords: 30, patterns: 16, depth: 4 },
    EDGE_CASES: { description: 'Edge cases', keywords: 30, patterns: 16, depth: 5 },
    ADVANCED_USAGE: { description: 'Advanced usage', keywords: 30, patterns: 16, depth: 6 },
    EXPERT_EXPLANATION: { description: 'Expert explanation', keywords: 30, patterns: 16, depth: 7 }
  },

  // 2.4 HELP OUTPUT (15 modes × 20 kw + 12 pat = 300 kw + 180 pat)
  outputControl: {
    SINGLE_SENTENCE: { description: 'Single sentence', keywords: 20, patterns: 12, depth: 1 },
    SHORT_PARAGRAPH: { description: 'Short paragraph', keywords: 20, patterns: 12, depth: 2 },
    NUMBERED_STEPS: { description: 'Numbered steps', keywords: 20, patterns: 12, depthRange: [2, 4] },
    CHECKLIST: { description: 'Checklist', keywords: 20, patterns: 12, depth: 3 },
    TABLE: { description: 'Table', keywords: 20, patterns: 12, depthRange: [2, 4] },
    CALLOUT_WARNING: { description: 'Callout warnings', keywords: 20, patterns: 12, depthRange: [4, 6] },
    INLINE_TIP: { description: 'Inline tips', keywords: 20, patterns: 12, depthRange: [2, 3] },
    NEXT_STEP_CTA: { description: 'Next-step CTA', keywords: 20, patterns: 12, depthRange: [2, 4] },
    RETRY_SUGGESTION: { description: 'Retry suggestion', keywords: 20, patterns: 12, depthRange: [3, 5] },
    ERROR_BANNER: { description: 'Error banner', keywords: 20, patterns: 12, depthRange: [3, 5] },
    SUCCESS_CONFIRMATION: { description: 'Success confirmation', keywords: 20, patterns: 12, depth: 1 },
    LIMITATION_NOTICE: { description: 'Limitation notice', keywords: 20, patterns: 12, depthRange: [3, 5] },
    SAFETY_NOTICE: { description: 'Safety notice', keywords: 20, patterns: 12, depthRange: [4, 6] },
    FRIENDLY_TONE: { description: 'Friendly tone', keywords: 20, patterns: 12, depthRange: [1, 3] },
    NEUTRAL_TONE: { description: 'Neutral tone', keywords: 20, patterns: 12, depthRange: [2, 5] }
  }
};

// ============================================================================
// 3. CONVERSATION INTENT - COGNITIVE CONTROL (4,760 items/lang)
// ============================================================================

export const CONVERSATION = {
  // 3.1 CONVERSATION STATES (20 states × 40 kw + 30 pat = 800 kw + 600 pat)
  states: {
    CONTINUATION: { description: 'Continuation', keywords: 40, patterns: 30, depthRange: [0, 4] },
    CLARIFICATION: { description: 'Clarification', keywords: 40, patterns: 30, depthRange: [1, 5] },
    EXPANSION: { description: 'Expansion', keywords: 40, patterns: 30, depthRange: [2, 5] },
    SIMPLIFICATION: { description: 'Simplification', keywords: 40, patterns: 30, depthRange: [2, 4] },
    REPHRASING: { description: 'Rephrasing', keywords: 40, patterns: 30, depthRange: [1, 3] },
    CORRECTION: { description: 'Correction', keywords: 40, patterns: 30, depthRange: [3, 6] },
    CONFIRMATION: { description: 'Confirmation', keywords: 40, patterns: 30, depthRange: [1, 3] },
    DISAGREEMENT: { description: 'Disagreement', keywords: 40, patterns: 30, depthRange: [3, 6] },
    AGREEMENT: { description: 'Agreement', keywords: 40, patterns: 30, depthRange: [1, 3] },
    FOLLOWUP: { description: 'Follow-up', keywords: 40, patterns: 30, depthRange: [2, 5] },
    CONTEXT_RECALL: { description: 'Context recall', keywords: 40, patterns: 30, depthRange: [2, 5] },
    TOPIC_SHIFT: { description: 'Topic shift', keywords: 40, patterns: 30, depthRange: [3, 6] },
    TOPIC_NARROWING: { description: 'Topic narrowing', keywords: 40, patterns: 30, depthRange: [2, 5] },
    TOPIC_BROADENING: { description: 'Topic broadening', keywords: 40, patterns: 30, depthRange: [2, 6] },
    STOP_REQUEST: { description: 'Stop request', keywords: 40, patterns: 30, depthRange: [1, 3] },
    RESTART_REQUEST: { description: 'Restart request', keywords: 40, patterns: 30, depthRange: [3, 6] },
    META_QUESTION: { description: 'Meta question', keywords: 40, patterns: 30, depthRange: [4, 8] },
    INTENT_CORRECTION: { description: 'Intent correction', keywords: 40, patterns: 30, depthRange: [3, 6] },
    MISUNDERSTANDING_DETECTED: { description: 'Misunderstanding detected', keywords: 40, patterns: 30, depthRange: [3, 7] },
    FLOW_CONTROL: { description: 'Flow control', keywords: 40, patterns: 30, depthRange: [2, 6] }
  },

  // 3.2 CONVERSATION ACTIONS (24 actions × 45 kw + 35 pat = 1,080 kw + 840 pat)
  actions: {
    EXPAND_ANSWER: { description: 'Expand answer', keywords: 45, patterns: 35, depthRange: [2, 5] },
    SHORTEN_ANSWER: { description: 'Shorten answer', keywords: 45, patterns: 35, depthRange: [1, 3] },
    REPHRASE_ANSWER: { description: 'Rephrase answer', keywords: 45, patterns: 35, depthRange: [1, 3] },
    CHANGE_TONE: { description: 'Change tone', keywords: 45, patterns: 35, depthRange: [2, 4] },
    CHANGE_STRUCTURE: { description: 'Change structure', keywords: 45, patterns: 35, depthRange: [2, 4] },
    EXPLAIN_DIFFERENTLY: { description: 'Explain differently', keywords: 45, patterns: 35, depthRange: [2, 5] },
    CLARIFY_AMBIGUITY: { description: 'Clarify ambiguity', keywords: 45, patterns: 35, depthRange: [3, 6] },
    CONFIRM_UNDERSTANDING: { description: 'Confirm understanding', keywords: 45, patterns: 35, depthRange: [1, 4] },
    CONTINUE_REASONING: { description: 'Continue reasoning', keywords: 45, patterns: 35, depthRange: [3, 6] },
    PAUSE_REASONING: { description: 'Pause reasoning', keywords: 45, patterns: 35, depthRange: [2, 4] },
    RESUME_REASONING: { description: 'Resume reasoning', keywords: 45, patterns: 35, depthRange: [3, 5] },
    CORRECT_INTERPRETATION: { description: 'Correct interpretation', keywords: 45, patterns: 35, depthRange: [3, 6] },
    ASK_CLARIFICATION: { description: 'Ask clarification', keywords: 45, patterns: 35, depthRange: [2, 5] },
    SUMMARIZE_CONVERSATION: { description: 'Summarize conversation', keywords: 45, patterns: 35, depthRange: [3, 5] },
    REFERENCE_PREVIOUS: { description: 'Reference previous message', keywords: 45, patterns: 35, depthRange: [2, 5] },
    IGNORE_PREVIOUS: { description: 'Ignore previous message', keywords: 45, patterns: 35, depthRange: [2, 4] },
    ADJUST_DETAIL: { description: 'Adjust detail level', keywords: 45, patterns: 35, depthRange: [2, 5] },
    ADJUST_COMPLEXITY: { description: 'Adjust complexity', keywords: 45, patterns: 35, depthRange: [2, 5] },
    EXPLAIN_REASONING: { description: 'Explain reasoning', keywords: 45, patterns: 35, depthRange: [4, 7] },
    ACKNOWLEDGE_FEEDBACK: { description: 'Acknowledge feedback', keywords: 45, patterns: 35, depthRange: [1, 4] },
    HANDLE_FRUSTRATION: { description: 'Handle frustration', keywords: 45, patterns: 35, depthRange: [3, 6] },
    HANDLE_CONFUSION: { description: 'Handle confusion', keywords: 45, patterns: 35, depthRange: [3, 6] },
    CONTROL_VERBOSITY: { description: 'Control verbosity', keywords: 45, patterns: 35, depthRange: [3, 6] },
    CONVERSATION_RESET: { description: 'Conversation reset', keywords: 45, patterns: 35, depthRange: [6, 8] }
  },

  // 3.3 CONVERSATION DEPTH (8 levels × 35 kw + 28 pat = 280 kw + 224 pat)
  depth: {
    MINIMAL: { description: 'Minimal', keywords: 35, patterns: 28, depth: 1 },
    NORMAL: { description: 'Normal', keywords: 35, patterns: 28, depth: 2 },
    DETAILED: { description: 'Detailed', keywords: 35, patterns: 28, depth: 3 },
    DEEP_REASONING: { description: 'Deep reasoning', keywords: 35, patterns: 28, depth: 4 },
    EXPERT: { description: 'Expert', keywords: 35, patterns: 28, depth: 5 },
    TEACHING_MODE: { description: 'Teaching mode', keywords: 35, patterns: 28, depth: 6 },
    DIAGNOSTIC_MODE: { description: 'Diagnostic mode', keywords: 35, patterns: 28, depth: 7 },
    META_CONTROL: { description: 'Meta-control', keywords: 35, patterns: 28, depth: 8 }
  },

  // 3.4 CONVERSATION OUTPUT (18 modes × 30 kw + 22 pat = 540 kw + 396 pat)
  outputControl: {
    SHORT_RESPONSE: { description: 'Short response', keywords: 30, patterns: 22, depth: 1 },
    MEDIUM_RESPONSE: { description: 'Medium response', keywords: 30, patterns: 22, depth: 2 },
    LONG_RESPONSE: { description: 'Long response', keywords: 30, patterns: 22, depth: 3 },
    BULLET_EXPLANATION: { description: 'Bullet explanation', keywords: 30, patterns: 22, depthRange: [2, 3] },
    STEP_EXPLANATION: { description: 'Step explanation', keywords: 30, patterns: 22, depthRange: [2, 4] },
    EXAMPLE_DRIVEN: { description: 'Example-driven', keywords: 30, patterns: 22, depthRange: [3, 5] },
    ANALOGY_DRIVEN: { description: 'Analogy-driven', keywords: 30, patterns: 22, depthRange: [3, 5] },
    QUESTION_LED: { description: 'Question-led', keywords: 30, patterns: 22, depthRange: [2, 4] },
    CONFIRMATION_LED: { description: 'Confirmation-led', keywords: 30, patterns: 22, depthRange: [1, 3] },
    GENTLE_CORRECTION: { description: 'Gentle correction', keywords: 30, patterns: 22, depthRange: [2, 4] },
    FIRM_CORRECTION: { description: 'Firm correction', keywords: 30, patterns: 22, depthRange: [3, 5] },
    FRIENDLY_TONE: { description: 'Friendly tone', keywords: 30, patterns: 22, depthRange: [1, 3] },
    PROFESSIONAL_TONE: { description: 'Professional tone', keywords: 30, patterns: 22, depthRange: [2, 5] },
    EMPATHETIC_TONE: { description: 'Empathetic tone', keywords: 30, patterns: 22, depthRange: [2, 5] },
    CONTEXT_REMINDER: { description: 'Context reminder', keywords: 30, patterns: 22, depthRange: [2, 5] },
    FLOW_MARKER: { description: 'Flow marker', keywords: 30, patterns: 22, depthRange: [2, 4] },
    END_OF_THOUGHT: { description: 'End-of-thought marker', keywords: 30, patterns: 22, depthRange: [2, 4] },
    REFLECTIVE: { description: 'Reflective', keywords: 30, patterns: 22, depthRange: [4, 6] }
  }
};

// ============================================================================
// 4. EDIT INTENT - TEXT TRANSFORMATION (3,300 items/lang)
// ============================================================================

export const EDIT = {
  // 4.1 EDIT STATES (22 states × 25 kw + 15 pat = 550 kw + 330 pat)
  states: {
    SELECTED_TEXT: { description: 'Text selection active', keywords: 25, patterns: 15, depthRange: [0, 3] },
    FULL_DOCUMENT_EDIT: { description: 'Full document editing mode', keywords: 25, patterns: 15, depthRange: [1, 4] },
    PARTIAL_EDIT: { description: 'Partial content editing', keywords: 25, patterns: 15, depthRange: [1, 4] },
    BATCH_EDIT: { description: 'Batch editing multiple items', keywords: 25, patterns: 15, depthRange: [2, 5] },
    STYLE_CHANGE: { description: 'Style/formatting change', keywords: 25, patterns: 15, depthRange: [1, 3] },
    TONE_CHANGE: { description: 'Tone modification', keywords: 25, patterns: 15, depthRange: [2, 5] },
    STRUCTURE_CHANGE: { description: 'Structure reorganization', keywords: 25, patterns: 15, depthRange: [2, 5] },
    FORMAT_CHANGE: { description: 'Format conversion', keywords: 25, patterns: 15, depthRange: [1, 4] },
    LANGUAGE_CHANGE: { description: 'Language translation', keywords: 25, patterns: 15, depthRange: [3, 6] },
    EXPAND_CONTENT: { description: 'Content expansion', keywords: 25, patterns: 15, depthRange: [2, 5] },
    CONDENSE_CONTENT: { description: 'Content condensation', keywords: 25, patterns: 15, depthRange: [2, 5] },
    SPLIT_CONTENT: { description: 'Content splitting', keywords: 25, patterns: 15, depthRange: [1, 4] },
    MERGE_CONTENT: { description: 'Content merging', keywords: 25, patterns: 15, depthRange: [2, 5] },
    VERSIONED_EDIT: { description: 'Version-aware editing', keywords: 25, patterns: 15, depthRange: [3, 6] },
    COLLABORATIVE_EDIT: { description: 'Collaborative editing', keywords: 25, patterns: 15, depthRange: [2, 5] },
    TEMPLATE_BASED: { description: 'Template-based editing', keywords: 25, patterns: 15, depthRange: [1, 4] },
    CONSTRAINT_AWARE: { description: 'Constraint-aware editing', keywords: 25, patterns: 15, depthRange: [3, 6] },
    LEGAL_SAFE: { description: 'Legal-safe editing', keywords: 25, patterns: 15, depthRange: [4, 7] },
    REVERSIBLE: { description: 'Reversible editing', keywords: 25, patterns: 15, depthRange: [2, 5] },
    DESTRUCTIVE: { description: 'Destructive editing warning', keywords: 25, patterns: 15, depthRange: [4, 7] },
    PREVIEW_MODE: { description: 'Preview before apply', keywords: 25, patterns: 15, depthRange: [1, 3] },
    EDIT_COMPLETE: { description: 'Edit completion state', keywords: 25, patterns: 15, depthRange: [0, 2] }
  },

  // 4.2 EDIT ACTIONS (28 actions × 40 kw + 22 pat = 1,120 kw + 616 pat)
  actions: {
    // Text Transformation (D1-D3)
    REWRITE: { description: 'Rewrite text', keywords: 40, patterns: 22, depthRange: [1, 3], family: 'transform' },
    PARAPHRASE: { description: 'Paraphrase content', keywords: 40, patterns: 22, depthRange: [1, 3], family: 'transform' },
    SIMPLIFY: { description: 'Simplify language', keywords: 40, patterns: 22, depthRange: [1, 3], family: 'transform' },
    FORMALIZE: { description: 'Formalize text', keywords: 40, patterns: 22, depthRange: [2, 4], family: 'transform' },
    CASUALIZE: { description: 'Make casual', keywords: 40, patterns: 22, depthRange: [1, 3], family: 'transform' },
    // Expansion/Reduction (D2-D5)
    EXPAND: { description: 'Expand content', keywords: 40, patterns: 22, depthRange: [2, 5], family: 'sizing' },
    CONDENSE: { description: 'Condense content', keywords: 40, patterns: 22, depthRange: [2, 5], family: 'sizing' },
    ELABORATE: { description: 'Add detail/elaboration', keywords: 40, patterns: 22, depthRange: [3, 5], family: 'sizing' },
    TRIM: { description: 'Trim excess', keywords: 40, patterns: 22, depthRange: [1, 3], family: 'sizing' },
    // Structure (D2-D4)
    RESTRUCTURE: { description: 'Restructure content', keywords: 40, patterns: 22, depthRange: [2, 4], family: 'structure' },
    REORDER: { description: 'Reorder sections', keywords: 40, patterns: 22, depthRange: [2, 4], family: 'structure' },
    SPLIT: { description: 'Split into parts', keywords: 40, patterns: 22, depthRange: [1, 3], family: 'structure' },
    MERGE: { description: 'Merge content', keywords: 40, patterns: 22, depthRange: [2, 4], family: 'structure' },
    FORMAT_LIST: { description: 'Format as list', keywords: 40, patterns: 22, depthRange: [1, 3], family: 'structure' },
    FORMAT_TABLE: { description: 'Format as table', keywords: 40, patterns: 22, depthRange: [2, 4], family: 'structure' },
    FORMAT_PROSE: { description: 'Convert to prose', keywords: 40, patterns: 22, depthRange: [2, 4], family: 'structure' },
    // Quality (D3-D6)
    PROOFREAD: { description: 'Proofread text', keywords: 40, patterns: 22, depthRange: [3, 6], family: 'quality' },
    CORRECT_GRAMMAR: { description: 'Correct grammar', keywords: 40, patterns: 22, depthRange: [2, 4], family: 'quality' },
    IMPROVE_CLARITY: { description: 'Improve clarity', keywords: 40, patterns: 22, depthRange: [3, 5], family: 'quality' },
    ENHANCE_FLOW: { description: 'Enhance flow', keywords: 40, patterns: 22, depthRange: [3, 5], family: 'quality' },
    // Domain-Specific (D4-D7)
    LEGAL_EDIT: { description: 'Legal-safe editing', keywords: 40, patterns: 22, depthRange: [4, 7], family: 'domain' },
    TECHNICAL_EDIT: { description: 'Technical editing', keywords: 40, patterns: 22, depthRange: [3, 6], family: 'domain' },
    MARKETING_EDIT: { description: 'Marketing-style editing', keywords: 40, patterns: 22, depthRange: [2, 5], family: 'domain' },
    ACADEMIC_EDIT: { description: 'Academic editing', keywords: 40, patterns: 22, depthRange: [4, 7], family: 'domain' },
    // Translation (D3-D6)
    TRANSLATE: { description: 'Translate language', keywords: 40, patterns: 22, depthRange: [3, 6], family: 'translation' },
    LOCALIZE: { description: 'Localize content', keywords: 40, patterns: 22, depthRange: [4, 7], family: 'translation' },
    // Meta (D2-D5)
    UNDO_EDIT: { description: 'Undo last edit', keywords: 40, patterns: 22, depthRange: [1, 2], family: 'meta' },
    COMPARE_VERSIONS: { description: 'Compare versions', keywords: 40, patterns: 22, depthRange: [3, 5], family: 'meta' }
  },

  // 4.3 EDIT SCOPE (12 scopes × 20 kw + 12 pat = 240 kw + 144 pat)
  scope: {
    WORD: { description: 'Single word', keywords: 20, patterns: 12, depthRange: [0, 2] },
    PHRASE: { description: 'Phrase', keywords: 20, patterns: 12, depthRange: [0, 2] },
    SENTENCE: { description: 'Sentence', keywords: 20, patterns: 12, depthRange: [0, 3] },
    PARAGRAPH: { description: 'Paragraph', keywords: 20, patterns: 12, depthRange: [1, 3] },
    SECTION: { description: 'Section', keywords: 20, patterns: 12, depthRange: [1, 4] },
    DOCUMENT: { description: 'Entire document', keywords: 20, patterns: 12, depthRange: [2, 5] },
    SELECTION: { description: 'User selection', keywords: 20, patterns: 12, depthRange: [0, 4] },
    HEADING: { description: 'Headings only', keywords: 20, patterns: 12, depthRange: [1, 3] },
    BODY_TEXT: { description: 'Body text only', keywords: 20, patterns: 12, depthRange: [1, 4] },
    LISTS: { description: 'Lists only', keywords: 20, patterns: 12, depthRange: [1, 3] },
    TABLES: { description: 'Tables only', keywords: 20, patterns: 12, depthRange: [2, 4] },
    QUOTED: { description: 'Quoted text', keywords: 20, patterns: 12, depthRange: [1, 4] }
  },

  // 4.4 EDIT DEPTH (10 levels × 25 kw + 15 pat = 250 kw + 150 pat)
  depth: {
    SURFACE_EDIT: { description: 'Surface-level edits', keywords: 25, patterns: 15, depth: 1 },
    LIGHT_REWRITE: { description: 'Light rewriting', keywords: 25, patterns: 15, depth: 2 },
    MODERATE_REWRITE: { description: 'Moderate rewriting', keywords: 25, patterns: 15, depth: 3 },
    HEAVY_REWRITE: { description: 'Heavy rewriting', keywords: 25, patterns: 15, depth: 4 },
    COMPLETE_REWRITE: { description: 'Complete rewriting', keywords: 25, patterns: 15, depth: 5 },
    STYLE_TRANSFORM: { description: 'Style transformation', keywords: 25, patterns: 15, depth: 4 },
    TONE_TRANSFORM: { description: 'Tone transformation', keywords: 25, patterns: 15, depth: 4 },
    STRUCTURE_TRANSFORM: { description: 'Structure transformation', keywords: 25, patterns: 15, depth: 5 },
    DOMAIN_ADAPTATION: { description: 'Domain adaptation', keywords: 25, patterns: 15, depth: 6 },
    EXPERT_EDIT: { description: 'Expert-level editing', keywords: 25, patterns: 15, depth: 7 }
  },

  // 4.5 EDIT OUTPUT (18 modes × 20 kw + 12 pat = 360 kw + 216 pat)
  outputControl: {
    INLINE_CHANGES: { description: 'Show inline changes', keywords: 20, patterns: 12, depthRange: [1, 3], family: 'display' },
    SIDE_BY_SIDE: { description: 'Side-by-side comparison', keywords: 20, patterns: 12, depthRange: [2, 4], family: 'display' },
    TRACK_CHANGES: { description: 'Track changes mode', keywords: 20, patterns: 12, depthRange: [2, 5], family: 'display' },
    CLEAN_OUTPUT: { description: 'Clean output only', keywords: 20, patterns: 12, depthRange: [1, 3], family: 'display' },
    DIFF_VIEW: { description: 'Diff view', keywords: 20, patterns: 12, depthRange: [2, 4], family: 'display' },
    HIGHLIGHT_CHANGES: { description: 'Highlight changes', keywords: 20, patterns: 12, depthRange: [1, 4], family: 'emphasis' },
    SHOW_REASONING: { description: 'Show edit reasoning', keywords: 20, patterns: 12, depthRange: [4, 6], family: 'emphasis' },
    SUGGEST_ALTERNATIVES: { description: 'Suggest alternatives', keywords: 20, patterns: 12, depthRange: [3, 5], family: 'emphasis' },
    PRESERVE_FORMATTING: { description: 'Preserve formatting', keywords: 20, patterns: 12, depthRange: [1, 3], family: 'formatting' },
    APPLY_STYLE_GUIDE: { description: 'Apply style guide', keywords: 20, patterns: 12, depthRange: [3, 5], family: 'formatting' },
    MAINTAIN_VOICE: { description: 'Maintain voice', keywords: 20, patterns: 12, depthRange: [3, 5], family: 'formatting' },
    UNDO_AVAILABLE: { description: 'Undo available notice', keywords: 20, patterns: 12, depthRange: [1, 2], family: 'safety' },
    CONFIRM_DESTRUCTIVE: { description: 'Confirm destructive edit', keywords: 20, patterns: 12, depthRange: [3, 5], family: 'safety' },
    PREVIEW_FIRST: { description: 'Preview before apply', keywords: 20, patterns: 12, depthRange: [2, 4], family: 'safety' },
    BATCH_CONFIRMATION: { description: 'Batch confirmation', keywords: 20, patterns: 12, depthRange: [2, 4], family: 'safety' },
    WORD_COUNT: { description: 'Show word count change', keywords: 20, patterns: 12, depthRange: [1, 2], family: 'metrics' },
    READABILITY_SCORE: { description: 'Show readability score', keywords: 20, patterns: 12, depthRange: [3, 5], family: 'metrics' },
    CHANGE_SUMMARY: { description: 'Show change summary', keywords: 20, patterns: 12, depthRange: [2, 4], family: 'metrics' }
  }
};

// ============================================================================
// 5. MEMORY INTENT - CONTEXT PERSISTENCE (3,500 items/lang)
// ============================================================================

export const MEMORY = {
  // 5.1 MEMORY STATES (24 states × 25 kw + 15 pat = 600 kw + 360 pat)
  states: {
    STORING_FACT: { description: 'Storing a fact', keywords: 25, patterns: 15, depthRange: [1, 3] },
    RECALLING_FACT: { description: 'Recalling a fact', keywords: 25, patterns: 15, depthRange: [1, 3] },
    UPDATING_FACT: { description: 'Updating existing fact', keywords: 25, patterns: 15, depthRange: [2, 4] },
    DELETING_FACT: { description: 'Deleting a fact', keywords: 25, patterns: 15, depthRange: [2, 4] },
    SEARCHING_MEMORY: { description: 'Searching memory', keywords: 25, patterns: 15, depthRange: [1, 4] },
    LISTING_MEMORIES: { description: 'Listing memories', keywords: 25, patterns: 15, depthRange: [1, 3] },
    SESSION_CONTEXT: { description: 'Session context', keywords: 25, patterns: 15, depthRange: [0, 3] },
    PERSISTENT_CONTEXT: { description: 'Persistent context', keywords: 25, patterns: 15, depthRange: [2, 5] },
    WORKSPACE_MEMORY: { description: 'Workspace memory', keywords: 25, patterns: 15, depthRange: [2, 5] },
    USER_PROFILE: { description: 'User profile info', keywords: 25, patterns: 15, depthRange: [1, 4] },
    PREFERENCE_RECALL: { description: 'Preference recall', keywords: 25, patterns: 15, depthRange: [1, 3] },
    HISTORY_REFERENCE: { description: 'History reference', keywords: 25, patterns: 15, depthRange: [2, 5] },
    PATTERN_RECOGNITION: { description: 'Pattern recognition', keywords: 25, patterns: 15, depthRange: [4, 7] },
    ASSOCIATION_MADE: { description: 'Association made', keywords: 25, patterns: 15, depthRange: [3, 6] },
    CONFLICT_DETECTED: { description: 'Memory conflict', keywords: 25, patterns: 15, depthRange: [4, 7] },
    STALE_MEMORY: { description: 'Stale memory detected', keywords: 25, patterns: 15, depthRange: [3, 6] },
    MEMORY_FULL: { description: 'Memory capacity warning', keywords: 25, patterns: 15, depthRange: [3, 5] },
    MEMORY_CLEARED: { description: 'Memory cleared', keywords: 25, patterns: 15, depthRange: [2, 4] },
    TEMPORARY_NOTE: { description: 'Temporary note', keywords: 25, patterns: 15, depthRange: [1, 3] },
    PERMANENT_FACT: { description: 'Permanent fact', keywords: 25, patterns: 15, depthRange: [2, 5] },
    CONTEXTUAL_MEMORY: { description: 'Context-specific memory', keywords: 25, patterns: 15, depthRange: [3, 6] },
    CROSS_SESSION: { description: 'Cross-session memory', keywords: 25, patterns: 15, depthRange: [3, 6] },
    SHARED_MEMORY: { description: 'Shared team memory', keywords: 25, patterns: 15, depthRange: [3, 6] },
    PRIVATE_MEMORY: { description: 'Private user memory', keywords: 25, patterns: 15, depthRange: [2, 4] }
  },

  // 5.2 MEMORY ACTIONS (30 actions × 40 kw + 22 pat = 1,200 kw + 660 pat)
  actions: {
    // Storage (D1-D4)
    REMEMBER: { description: 'Remember fact', keywords: 40, patterns: 22, depthRange: [1, 4], family: 'storage' },
    STORE: { description: 'Store information', keywords: 40, patterns: 22, depthRange: [1, 3], family: 'storage' },
    SAVE_CONTEXT: { description: 'Save context', keywords: 40, patterns: 22, depthRange: [2, 4], family: 'storage' },
    NOTE: { description: 'Take note', keywords: 40, patterns: 22, depthRange: [1, 3], family: 'storage' },
    BOOKMARK: { description: 'Bookmark item', keywords: 40, patterns: 22, depthRange: [1, 3], family: 'storage' },
    // Retrieval (D1-D4)
    RECALL: { description: 'Recall fact', keywords: 40, patterns: 22, depthRange: [1, 4], family: 'retrieval' },
    RETRIEVE: { description: 'Retrieve information', keywords: 40, patterns: 22, depthRange: [1, 3], family: 'retrieval' },
    SEARCH_MEMORY: { description: 'Search memories', keywords: 40, patterns: 22, depthRange: [2, 5], family: 'retrieval' },
    LIST_FACTS: { description: 'List stored facts', keywords: 40, patterns: 22, depthRange: [1, 3], family: 'retrieval' },
    FIND_RELATED: { description: 'Find related memories', keywords: 40, patterns: 22, depthRange: [3, 6], family: 'retrieval' },
    // Updates (D2-D5)
    UPDATE: { description: 'Update memory', keywords: 40, patterns: 22, depthRange: [2, 5], family: 'update' },
    CORRECT: { description: 'Correct memory', keywords: 40, patterns: 22, depthRange: [2, 5], family: 'update' },
    MERGE_FACTS: { description: 'Merge facts', keywords: 40, patterns: 22, depthRange: [3, 6], family: 'update' },
    REFRESH: { description: 'Refresh memory', keywords: 40, patterns: 22, depthRange: [2, 4], family: 'update' },
    VALIDATE: { description: 'Validate memory', keywords: 40, patterns: 22, depthRange: [3, 6], family: 'update' },
    // Deletion (D2-D5)
    FORGET: { description: 'Forget fact', keywords: 40, patterns: 22, depthRange: [2, 5], family: 'deletion' },
    DELETE_MEMORY: { description: 'Delete memory', keywords: 40, patterns: 22, depthRange: [2, 4], family: 'deletion' },
    CLEAR_SESSION: { description: 'Clear session memory', keywords: 40, patterns: 22, depthRange: [2, 4], family: 'deletion' },
    CLEAR_ALL: { description: 'Clear all memories', keywords: 40, patterns: 22, depthRange: [4, 6], family: 'deletion' },
    EXPIRE: { description: 'Expire old memories', keywords: 40, patterns: 22, depthRange: [3, 5], family: 'deletion' },
    // Association (D3-D6)
    LINK_FACTS: { description: 'Link facts together', keywords: 40, patterns: 22, depthRange: [3, 6], family: 'association' },
    TAG_MEMORY: { description: 'Tag memory', keywords: 40, patterns: 22, depthRange: [2, 4], family: 'association' },
    CATEGORIZE: { description: 'Categorize memory', keywords: 40, patterns: 22, depthRange: [2, 5], family: 'association' },
    RELATE: { description: 'Create relation', keywords: 40, patterns: 22, depthRange: [3, 6], family: 'association' },
    // Context (D2-D5)
    SET_CONTEXT: { description: 'Set active context', keywords: 40, patterns: 22, depthRange: [2, 5], family: 'context' },
    SWITCH_CONTEXT: { description: 'Switch context', keywords: 40, patterns: 22, depthRange: [2, 4], family: 'context' },
    INHERIT_CONTEXT: { description: 'Inherit context', keywords: 40, patterns: 22, depthRange: [3, 6], family: 'context' },
    SHARE_CONTEXT: { description: 'Share context', keywords: 40, patterns: 22, depthRange: [3, 5], family: 'context' },
    // Analysis (D4-D7)
    ANALYZE_PATTERNS: { description: 'Analyze memory patterns', keywords: 40, patterns: 22, depthRange: [4, 7], family: 'analysis' },
    SUMMARIZE_HISTORY: { description: 'Summarize history', keywords: 40, patterns: 22, depthRange: [3, 6], family: 'analysis' }
  },

  // 5.3 MEMORY SCOPE (14 scopes × 20 kw + 12 pat = 280 kw + 168 pat)
  scope: {
    SINGLE_FACT: { description: 'Single fact', keywords: 20, patterns: 12, depthRange: [0, 2] },
    FACT_SET: { description: 'Set of facts', keywords: 20, patterns: 12, depthRange: [1, 4] },
    SESSION: { description: 'Current session', keywords: 20, patterns: 12, depthRange: [0, 3] },
    CONVERSATION: { description: 'Conversation scope', keywords: 20, patterns: 12, depthRange: [1, 4] },
    PROJECT: { description: 'Project scope', keywords: 20, patterns: 12, depthRange: [2, 5] },
    WORKSPACE: { description: 'Workspace scope', keywords: 20, patterns: 12, depthRange: [2, 5] },
    USER: { description: 'User scope', keywords: 20, patterns: 12, depthRange: [1, 4] },
    TEAM: { description: 'Team scope', keywords: 20, patterns: 12, depthRange: [3, 6] },
    TIME_RANGE: { description: 'Time range', keywords: 20, patterns: 12, depthRange: [1, 4] },
    TOPIC: { description: 'Topic scope', keywords: 20, patterns: 12, depthRange: [2, 5] },
    DOCUMENT_RELATED: { description: 'Document-related', keywords: 20, patterns: 12, depthRange: [2, 5] },
    PREFERENCE: { description: 'Preferences', keywords: 20, patterns: 12, depthRange: [1, 3] },
    PATTERN: { description: 'Learned patterns', keywords: 20, patterns: 12, depthRange: [4, 7] },
    ALL: { description: 'All memories', keywords: 20, patterns: 12, depthRange: [2, 5] }
  },

  // 5.4 MEMORY DEPTH (12 levels × 25 kw + 15 pat = 300 kw + 180 pat)
  depth: {
    SHALLOW_RECALL: { description: 'Shallow recall', keywords: 25, patterns: 15, depth: 1 },
    DIRECT_RECALL: { description: 'Direct recall', keywords: 25, patterns: 15, depth: 2 },
    CONTEXTUAL_RECALL: { description: 'Contextual recall', keywords: 25, patterns: 15, depth: 3 },
    ASSOCIATED_RECALL: { description: 'Associated recall', keywords: 25, patterns: 15, depth: 4 },
    INFERENTIAL_RECALL: { description: 'Inferential recall', keywords: 25, patterns: 15, depth: 5 },
    PATTERN_BASED: { description: 'Pattern-based recall', keywords: 25, patterns: 15, depth: 6 },
    TEMPORAL_REASONING: { description: 'Temporal reasoning', keywords: 25, patterns: 15, depth: 5 },
    CAUSAL_CHAIN: { description: 'Causal chain reasoning', keywords: 25, patterns: 15, depth: 6 },
    CONFLICT_RESOLUTION: { description: 'Conflict resolution', keywords: 25, patterns: 15, depth: 6 },
    SYNTHESIS: { description: 'Memory synthesis', keywords: 25, patterns: 15, depth: 7 },
    META_MEMORY: { description: 'Meta-memory analysis', keywords: 25, patterns: 15, depth: 7 },
    PREDICTIVE: { description: 'Predictive recall', keywords: 25, patterns: 15, depth: 8 }
  },

  // 5.5 MEMORY OUTPUT (20 modes × 20 kw + 12 pat = 400 kw + 240 pat)
  outputControl: {
    SINGLE_FACT: { description: 'Single fact display', keywords: 20, patterns: 12, depth: 1, family: 'display' },
    FACT_LIST: { description: 'Fact list', keywords: 20, patterns: 12, depthRange: [1, 3], family: 'display' },
    STRUCTURED_RECALL: { description: 'Structured recall', keywords: 20, patterns: 12, depthRange: [2, 4], family: 'display' },
    TIMELINE_VIEW: { description: 'Timeline view', keywords: 20, patterns: 12, depthRange: [3, 5], family: 'display' },
    GRAPH_VIEW: { description: 'Graph/network view', keywords: 20, patterns: 12, depthRange: [4, 6], family: 'display' },
    CONFIRMATION: { description: 'Store confirmation', keywords: 20, patterns: 12, depth: 1, family: 'feedback' },
    UPDATE_NOTICE: { description: 'Update notice', keywords: 20, patterns: 12, depth: 2, family: 'feedback' },
    DELETE_NOTICE: { description: 'Delete notice', keywords: 20, patterns: 12, depth: 2, family: 'feedback' },
    NOT_FOUND: { description: 'Not found notice', keywords: 20, patterns: 12, depth: 2, family: 'feedback' },
    CONFLICT_ALERT: { description: 'Conflict alert', keywords: 20, patterns: 12, depthRange: [4, 6], family: 'feedback' },
    SHOW_SOURCE: { description: 'Show source', keywords: 20, patterns: 12, depthRange: [2, 4], family: 'metadata' },
    SHOW_TIMESTAMP: { description: 'Show timestamp', keywords: 20, patterns: 12, depthRange: [1, 3], family: 'metadata' },
    SHOW_CONFIDENCE: { description: 'Show confidence', keywords: 20, patterns: 12, depthRange: [3, 5], family: 'metadata' },
    SHOW_RELATED: { description: 'Show related', keywords: 20, patterns: 12, depthRange: [3, 5], family: 'metadata' },
    SHOW_HISTORY: { description: 'Show history', keywords: 20, patterns: 12, depthRange: [3, 5], family: 'metadata' },
    PRIVATE_INDICATOR: { description: 'Private indicator', keywords: 20, patterns: 12, depth: 2, family: 'privacy' },
    SHARED_INDICATOR: { description: 'Shared indicator', keywords: 20, patterns: 12, depth: 2, family: 'privacy' },
    EXPIRATION_WARNING: { description: 'Expiration warning', keywords: 20, patterns: 12, depthRange: [3, 5], family: 'privacy' },
    CAPACITY_WARNING: { description: 'Capacity warning', keywords: 20, patterns: 12, depthRange: [3, 5], family: 'privacy' },
    SUMMARY_VIEW: { description: 'Summary view', keywords: 20, patterns: 12, depthRange: [2, 4], family: 'display' }
  }
};

// ============================================================================
// 6. PREFERENCES INTENT - USER CUSTOMIZATION (3,200 items/lang)
// ============================================================================

export const PREFERENCES = {
  // 6.1 PREFERENCES STATES (20 states × 25 kw + 15 pat = 500 kw + 300 pat)
  states: {
    VIEWING_PREFERENCES: { description: 'Viewing preferences', keywords: 25, patterns: 15, depthRange: [0, 2] },
    CHANGING_PREFERENCE: { description: 'Changing preference', keywords: 25, patterns: 15, depthRange: [1, 4] },
    RESETTING_PREFERENCE: { description: 'Resetting preference', keywords: 25, patterns: 15, depthRange: [2, 4] },
    APPLYING_PRESET: { description: 'Applying preset', keywords: 25, patterns: 15, depthRange: [1, 3] },
    CREATING_PRESET: { description: 'Creating preset', keywords: 25, patterns: 15, depthRange: [2, 5] },
    IMPORTING_SETTINGS: { description: 'Importing settings', keywords: 25, patterns: 15, depthRange: [2, 4] },
    EXPORTING_SETTINGS: { description: 'Exporting settings', keywords: 25, patterns: 15, depthRange: [2, 4] },
    SYNCING_PREFERENCES: { description: 'Syncing preferences', keywords: 25, patterns: 15, depthRange: [2, 5] },
    LANGUAGE_CHANGE: { description: 'Language change', keywords: 25, patterns: 15, depthRange: [1, 3] },
    THEME_CHANGE: { description: 'Theme change', keywords: 25, patterns: 15, depthRange: [1, 3] },
    NOTIFICATION_SETTING: { description: 'Notification setting', keywords: 25, patterns: 15, depthRange: [1, 4] },
    PRIVACY_SETTING: { description: 'Privacy setting', keywords: 25, patterns: 15, depthRange: [2, 5] },
    ACCESSIBILITY_SETTING: { description: 'Accessibility setting', keywords: 25, patterns: 15, depthRange: [1, 4] },
    AI_BEHAVIOR_SETTING: { description: 'AI behavior setting', keywords: 25, patterns: 15, depthRange: [2, 6] },
    OUTPUT_FORMAT_SETTING: { description: 'Output format setting', keywords: 25, patterns: 15, depthRange: [1, 4] },
    WORKSPACE_SETTING: { description: 'Workspace setting', keywords: 25, patterns: 15, depthRange: [2, 5] },
    INTEGRATION_SETTING: { description: 'Integration setting', keywords: 25, patterns: 15, depthRange: [3, 6] },
    SECURITY_SETTING: { description: 'Security setting', keywords: 25, patterns: 15, depthRange: [3, 6] },
    CONFLICT_STATE: { description: 'Preference conflict', keywords: 25, patterns: 15, depthRange: [4, 6] },
    VALIDATION_STATE: { description: 'Preference validation', keywords: 25, patterns: 15, depthRange: [2, 5] }
  },

  // 6.2 PREFERENCES ACTIONS (26 actions × 40 kw + 22 pat = 1,040 kw + 572 pat)
  actions: {
    // View/Query (D1-D3)
    VIEW_ALL: { description: 'View all preferences', keywords: 40, patterns: 22, depthRange: [1, 3], family: 'view' },
    VIEW_CATEGORY: { description: 'View category', keywords: 40, patterns: 22, depthRange: [1, 3], family: 'view' },
    CHECK_SETTING: { description: 'Check setting', keywords: 40, patterns: 22, depthRange: [1, 2], family: 'view' },
    SEARCH_SETTINGS: { description: 'Search settings', keywords: 40, patterns: 22, depthRange: [2, 4], family: 'view' },
    // Set/Update (D1-D4)
    SET: { description: 'Set preference', keywords: 40, patterns: 22, depthRange: [1, 4], family: 'modify' },
    UPDATE: { description: 'Update preference', keywords: 40, patterns: 22, depthRange: [1, 4], family: 'modify' },
    TOGGLE: { description: 'Toggle setting', keywords: 40, patterns: 22, depthRange: [1, 2], family: 'modify' },
    ENABLE: { description: 'Enable feature', keywords: 40, patterns: 22, depthRange: [1, 3], family: 'modify' },
    DISABLE: { description: 'Disable feature', keywords: 40, patterns: 22, depthRange: [1, 3], family: 'modify' },
    INCREASE: { description: 'Increase value', keywords: 40, patterns: 22, depthRange: [1, 3], family: 'modify' },
    DECREASE: { description: 'Decrease value', keywords: 40, patterns: 22, depthRange: [1, 3], family: 'modify' },
    // Reset (D2-D4)
    RESET_ONE: { description: 'Reset single preference', keywords: 40, patterns: 22, depthRange: [2, 4], family: 'reset' },
    RESET_CATEGORY: { description: 'Reset category', keywords: 40, patterns: 22, depthRange: [2, 4], family: 'reset' },
    RESET_ALL: { description: 'Reset all to defaults', keywords: 40, patterns: 22, depthRange: [3, 5], family: 'reset' },
    // Presets (D2-D5)
    APPLY_PRESET: { description: 'Apply preset', keywords: 40, patterns: 22, depthRange: [2, 4], family: 'preset' },
    CREATE_PRESET: { description: 'Create preset', keywords: 40, patterns: 22, depthRange: [2, 5], family: 'preset' },
    UPDATE_PRESET: { description: 'Update preset', keywords: 40, patterns: 22, depthRange: [2, 5], family: 'preset' },
    DELETE_PRESET: { description: 'Delete preset', keywords: 40, patterns: 22, depthRange: [2, 4], family: 'preset' },
    SHARE_PRESET: { description: 'Share preset', keywords: 40, patterns: 22, depthRange: [3, 5], family: 'preset' },
    // Import/Export (D2-D5)
    IMPORT: { description: 'Import settings', keywords: 40, patterns: 22, depthRange: [2, 5], family: 'transfer' },
    EXPORT: { description: 'Export settings', keywords: 40, patterns: 22, depthRange: [2, 4], family: 'transfer' },
    SYNC: { description: 'Sync settings', keywords: 40, patterns: 22, depthRange: [2, 5], family: 'transfer' },
    // Advanced (D3-D6)
    CONFIGURE_AI: { description: 'Configure AI behavior', keywords: 40, patterns: 22, depthRange: [3, 6], family: 'advanced' },
    CONFIGURE_SECURITY: { description: 'Configure security', keywords: 40, patterns: 22, depthRange: [4, 7], family: 'advanced' },
    CONFIGURE_INTEGRATION: { description: 'Configure integration', keywords: 40, patterns: 22, depthRange: [3, 6], family: 'advanced' },
    TROUBLESHOOT_SETTING: { description: 'Troubleshoot setting', keywords: 40, patterns: 22, depthRange: [4, 7], family: 'advanced' }
  },

  // 6.3 PREFERENCES SCOPE (12 scopes × 20 kw + 12 pat = 240 kw + 144 pat)
  scope: {
    SINGLE_SETTING: { description: 'Single setting', keywords: 20, patterns: 12, depthRange: [0, 2] },
    CATEGORY: { description: 'Category', keywords: 20, patterns: 12, depthRange: [1, 3] },
    ALL_SETTINGS: { description: 'All settings', keywords: 20, patterns: 12, depthRange: [2, 4] },
    USER_LEVEL: { description: 'User level', keywords: 20, patterns: 12, depthRange: [1, 3] },
    WORKSPACE_LEVEL: { description: 'Workspace level', keywords: 20, patterns: 12, depthRange: [2, 4] },
    PROJECT_LEVEL: { description: 'Project level', keywords: 20, patterns: 12, depthRange: [2, 5] },
    DOCUMENT_LEVEL: { description: 'Document level', keywords: 20, patterns: 12, depthRange: [1, 4] },
    SESSION_LEVEL: { description: 'Session level', keywords: 20, patterns: 12, depthRange: [1, 3] },
    DEVICE_LEVEL: { description: 'Device level', keywords: 20, patterns: 12, depthRange: [2, 4] },
    AI_PREFERENCES: { description: 'AI preferences', keywords: 20, patterns: 12, depthRange: [2, 5] },
    OUTPUT_PREFERENCES: { description: 'Output preferences', keywords: 20, patterns: 12, depthRange: [1, 4] },
    PRIVACY_PREFERENCES: { description: 'Privacy preferences', keywords: 20, patterns: 12, depthRange: [3, 6] }
  },

  // 6.4 PREFERENCES DEPTH (10 levels × 25 kw + 15 pat = 250 kw + 150 pat)
  depth: {
    SIMPLE_TOGGLE: { description: 'Simple toggle', keywords: 25, patterns: 15, depth: 1 },
    BASIC_CHOICE: { description: 'Basic choice', keywords: 25, patterns: 15, depth: 2 },
    MULTI_SELECT: { description: 'Multi-select', keywords: 25, patterns: 15, depth: 3 },
    RANGE_SELECTION: { description: 'Range selection', keywords: 25, patterns: 15, depth: 3 },
    CONDITIONAL_SETTING: { description: 'Conditional setting', keywords: 25, patterns: 15, depth: 4 },
    COMPLEX_CONFIG: { description: 'Complex configuration', keywords: 25, patterns: 15, depth: 5 },
    INTEGRATION_CONFIG: { description: 'Integration config', keywords: 25, patterns: 15, depth: 6 },
    SECURITY_CONFIG: { description: 'Security config', keywords: 25, patterns: 15, depth: 6 },
    AI_TUNING: { description: 'AI tuning', keywords: 25, patterns: 15, depth: 7 },
    EXPERT_CONFIG: { description: 'Expert configuration', keywords: 25, patterns: 15, depth: 7 }
  },

  // 6.5 PREFERENCES OUTPUT (18 modes × 20 kw + 12 pat = 360 kw + 216 pat)
  outputControl: {
    CURRENT_VALUE: { description: 'Show current value', keywords: 20, patterns: 12, depth: 1, family: 'display' },
    OPTIONS_LIST: { description: 'Show options list', keywords: 20, patterns: 12, depthRange: [1, 3], family: 'display' },
    CATEGORY_VIEW: { description: 'Category view', keywords: 20, patterns: 12, depthRange: [2, 4], family: 'display' },
    FULL_CONFIG: { description: 'Full configuration', keywords: 20, patterns: 12, depthRange: [3, 5], family: 'display' },
    DIFF_VIEW: { description: 'Changes diff view', keywords: 20, patterns: 12, depthRange: [2, 4], family: 'display' },
    SUCCESS_NOTICE: { description: 'Success notice', keywords: 20, patterns: 12, depth: 1, family: 'feedback' },
    RESTART_REQUIRED: { description: 'Restart required', keywords: 20, patterns: 12, depthRange: [2, 4], family: 'feedback' },
    VALIDATION_ERROR: { description: 'Validation error', keywords: 20, patterns: 12, depthRange: [3, 5], family: 'feedback' },
    CONFLICT_WARNING: { description: 'Conflict warning', keywords: 20, patterns: 12, depthRange: [4, 6], family: 'feedback' },
    DEPENDENCY_NOTE: { description: 'Dependency note', keywords: 20, patterns: 12, depthRange: [3, 5], family: 'feedback' },
    HELP_HINT: { description: 'Help hint', keywords: 20, patterns: 12, depthRange: [1, 3], family: 'help' },
    RECOMMENDATION: { description: 'Recommendation', keywords: 20, patterns: 12, depthRange: [3, 5], family: 'help' },
    BEST_PRACTICE: { description: 'Best practice', keywords: 20, patterns: 12, depthRange: [4, 6], family: 'help' },
    UNDO_AVAILABLE: { description: 'Undo available', keywords: 20, patterns: 12, depth: 2, family: 'safety' },
    CONFIRM_CHANGE: { description: 'Confirm change', keywords: 20, patterns: 12, depthRange: [3, 5], family: 'safety' },
    SECURITY_WARNING: { description: 'Security warning', keywords: 20, patterns: 12, depthRange: [4, 7], family: 'safety' },
    PRESET_SUGGESTION: { description: 'Preset suggestion', keywords: 20, patterns: 12, depthRange: [2, 4], family: 'help' },
    EXPORT_PROMPT: { description: 'Export prompt', keywords: 20, patterns: 12, depthRange: [2, 4], family: 'help' }
  }
};

// ============================================================================
// 7. EXTRACTION INTENT - DATA EXTRACTION (2,400 items/lang)
// ============================================================================

export const EXTRACTION = {
  // 7.1 EXTRACTION STATES (16 states × 25 kw + 15 pat = 400 kw + 240 pat)
  states: {
    SINGLE_VALUE: { description: 'Single value extraction', keywords: 25, patterns: 15, depthRange: [0, 3] },
    MULTIPLE_VALUES: { description: 'Multiple values extraction', keywords: 25, patterns: 15, depthRange: [1, 4] },
    STRUCTURED_DATA: { description: 'Structured data extraction', keywords: 25, patterns: 15, depthRange: [2, 5] },
    UNSTRUCTURED_DATA: { description: 'Unstructured data extraction', keywords: 25, patterns: 15, depthRange: [3, 6] },
    PATTERN_BASED: { description: 'Pattern-based extraction', keywords: 25, patterns: 15, depthRange: [3, 6] },
    SEMANTIC_EXTRACTION: { description: 'Semantic extraction', keywords: 25, patterns: 15, depthRange: [4, 7] },
    TABLE_EXTRACTION: { description: 'Table extraction', keywords: 25, patterns: 15, depthRange: [2, 5] },
    LIST_EXTRACTION: { description: 'List extraction', keywords: 25, patterns: 15, depthRange: [1, 4] },
    ENTITY_EXTRACTION: { description: 'Entity extraction', keywords: 25, patterns: 15, depthRange: [3, 6] },
    RELATIONSHIP_EXTRACTION: { description: 'Relationship extraction', keywords: 25, patterns: 15, depthRange: [4, 7] },
    TEMPORAL_EXTRACTION: { description: 'Temporal extraction', keywords: 25, patterns: 15, depthRange: [2, 5] },
    NUMERIC_EXTRACTION: { description: 'Numeric extraction', keywords: 25, patterns: 15, depthRange: [1, 4] },
    TEXT_EXTRACTION: { description: 'Text extraction', keywords: 25, patterns: 15, depthRange: [1, 4] },
    METADATA_EXTRACTION: { description: 'Metadata extraction', keywords: 25, patterns: 15, depthRange: [2, 4] },
    CROSS_DOC_EXTRACTION: { description: 'Cross-document extraction', keywords: 25, patterns: 15, depthRange: [4, 7] },
    VALIDATION_REQUIRED: { description: 'Validation required', keywords: 25, patterns: 15, depthRange: [3, 6] }
  },

  // 7.2 EXTRACTION ACTIONS (22 actions × 40 kw + 22 pat = 880 kw + 484 pat)
  actions: {
    // Basic (D1-D3)
    EXTRACT: { description: 'Extract data', keywords: 40, patterns: 22, depthRange: [1, 3], family: 'basic' },
    PULL: { description: 'Pull information', keywords: 40, patterns: 22, depthRange: [1, 3], family: 'basic' },
    GET: { description: 'Get values', keywords: 40, patterns: 22, depthRange: [1, 2], family: 'basic' },
    LIST: { description: 'List items', keywords: 40, patterns: 22, depthRange: [1, 3], family: 'basic' },
    FIND_ALL: { description: 'Find all occurrences', keywords: 40, patterns: 22, depthRange: [1, 4], family: 'basic' },
    // Entity (D2-D5)
    EXTRACT_DATES: { description: 'Extract dates', keywords: 40, patterns: 22, depthRange: [2, 5], family: 'entity' },
    EXTRACT_NAMES: { description: 'Extract names', keywords: 40, patterns: 22, depthRange: [2, 5], family: 'entity' },
    EXTRACT_NUMBERS: { description: 'Extract numbers', keywords: 40, patterns: 22, depthRange: [2, 4], family: 'entity' },
    EXTRACT_AMOUNTS: { description: 'Extract amounts', keywords: 40, patterns: 22, depthRange: [2, 5], family: 'entity' },
    EXTRACT_EMAILS: { description: 'Extract emails', keywords: 40, patterns: 22, depthRange: [1, 3], family: 'entity' },
    EXTRACT_URLS: { description: 'Extract URLs', keywords: 40, patterns: 22, depthRange: [1, 3], family: 'entity' },
    EXTRACT_PHONES: { description: 'Extract phone numbers', keywords: 40, patterns: 22, depthRange: [1, 3], family: 'entity' },
    // Structure (D2-D5)
    EXTRACT_TABLE: { description: 'Extract table', keywords: 40, patterns: 22, depthRange: [2, 5], family: 'structure' },
    EXTRACT_LIST: { description: 'Extract list', keywords: 40, patterns: 22, depthRange: [1, 4], family: 'structure' },
    EXTRACT_SECTION: { description: 'Extract section', keywords: 40, patterns: 22, depthRange: [2, 4], family: 'structure' },
    EXTRACT_METADATA: { description: 'Extract metadata', keywords: 40, patterns: 22, depthRange: [2, 4], family: 'structure' },
    // Semantic (D3-D6)
    EXTRACT_TERMS: { description: 'Extract key terms', keywords: 40, patterns: 22, depthRange: [3, 6], family: 'semantic' },
    EXTRACT_DEFINITIONS: { description: 'Extract definitions', keywords: 40, patterns: 22, depthRange: [3, 6], family: 'semantic' },
    EXTRACT_OBLIGATIONS: { description: 'Extract obligations', keywords: 40, patterns: 22, depthRange: [4, 7], family: 'semantic' },
    EXTRACT_RELATIONSHIPS: { description: 'Extract relationships', keywords: 40, patterns: 22, depthRange: [4, 7], family: 'semantic' },
    // Output (D2-D4)
    EXPORT_AS: { description: 'Export as format', keywords: 40, patterns: 22, depthRange: [2, 4], family: 'output' },
    COPY_TO: { description: 'Copy to location', keywords: 40, patterns: 22, depthRange: [1, 3], family: 'output' }
  },

  // 7.3 EXTRACTION SCOPE (10 scopes × 20 kw + 12 pat = 200 kw + 120 pat)
  scope: {
    SELECTION: { description: 'Selection', keywords: 20, patterns: 12, depthRange: [0, 2] },
    PARAGRAPH: { description: 'Paragraph', keywords: 20, patterns: 12, depthRange: [0, 3] },
    PAGE: { description: 'Page', keywords: 20, patterns: 12, depthRange: [1, 3] },
    SECTION: { description: 'Section', keywords: 20, patterns: 12, depthRange: [1, 4] },
    DOCUMENT: { description: 'Document', keywords: 20, patterns: 12, depthRange: [2, 5] },
    MULTI_DOCUMENT: { description: 'Multiple documents', keywords: 20, patterns: 12, depthRange: [3, 6] },
    TABLES_ONLY: { description: 'Tables only', keywords: 20, patterns: 12, depthRange: [1, 4] },
    HEADERS_ONLY: { description: 'Headers only', keywords: 20, patterns: 12, depthRange: [1, 3] },
    BODY_ONLY: { description: 'Body only', keywords: 20, patterns: 12, depthRange: [1, 4] },
    SPECIFIC_TYPE: { description: 'Specific type', keywords: 20, patterns: 12, depthRange: [2, 5] }
  },

  // 7.4 EXTRACTION DEPTH (8 levels × 25 kw + 15 pat = 200 kw + 120 pat)
  depth: {
    LITERAL: { description: 'Literal extraction', keywords: 25, patterns: 15, depth: 1 },
    NORMALIZED: { description: 'Normalized extraction', keywords: 25, patterns: 15, depth: 2 },
    PARSED: { description: 'Parsed extraction', keywords: 25, patterns: 15, depth: 3 },
    VALIDATED: { description: 'Validated extraction', keywords: 25, patterns: 15, depth: 4 },
    ENRICHED: { description: 'Enriched extraction', keywords: 25, patterns: 15, depth: 5 },
    LINKED: { description: 'Linked extraction', keywords: 25, patterns: 15, depth: 6 },
    INFERRED: { description: 'Inferred extraction', keywords: 25, patterns: 15, depth: 6 },
    SYNTHESIZED: { description: 'Synthesized extraction', keywords: 25, patterns: 15, depth: 7 }
  },

  // 7.5 EXTRACTION OUTPUT (14 modes × 20 kw + 12 pat = 280 kw + 168 pat)
  outputControl: {
    RAW_VALUES: { description: 'Raw values', keywords: 20, patterns: 12, depth: 1, family: 'format' },
    FORMATTED_VALUES: { description: 'Formatted values', keywords: 20, patterns: 12, depth: 2, family: 'format' },
    TABLE_FORMAT: { description: 'Table format', keywords: 20, patterns: 12, depthRange: [2, 4], family: 'format' },
    LIST_FORMAT: { description: 'List format', keywords: 20, patterns: 12, depthRange: [1, 3], family: 'format' },
    JSON_FORMAT: { description: 'JSON format', keywords: 20, patterns: 12, depthRange: [2, 4], family: 'format' },
    CSV_FORMAT: { description: 'CSV format', keywords: 20, patterns: 12, depthRange: [2, 4], family: 'format' },
    SHOW_SOURCE: { description: 'Show source', keywords: 20, patterns: 12, depthRange: [2, 4], family: 'metadata' },
    SHOW_CONFIDENCE: { description: 'Show confidence', keywords: 20, patterns: 12, depthRange: [3, 5], family: 'metadata' },
    SHOW_COUNT: { description: 'Show count', keywords: 20, patterns: 12, depth: 1, family: 'metadata' },
    VALIDATION_ERRORS: { description: 'Validation errors', keywords: 20, patterns: 12, depthRange: [3, 5], family: 'feedback' },
    MISSING_DATA: { description: 'Missing data notice', keywords: 20, patterns: 12, depthRange: [2, 4], family: 'feedback' },
    PARTIAL_RESULT: { description: 'Partial result notice', keywords: 20, patterns: 12, depthRange: [2, 4], family: 'feedback' },
    COPY_BUTTON: { description: 'Copy button', keywords: 20, patterns: 12, depth: 1, family: 'action' },
    EXPORT_OPTION: { description: 'Export option', keywords: 20, patterns: 12, depthRange: [2, 4], family: 'action' }
  }
};

// ============================================================================
// 8. ERROR INTENT - ERROR HANDLING (2,500 items/lang)
// ============================================================================

export const ERROR = {
  // 8.1 ERROR STATES (18 states × 25 kw + 15 pat = 450 kw + 270 pat)
  states: {
    FILE_ERROR: { description: 'File-related error', keywords: 25, patterns: 15, depthRange: [2, 5] },
    UPLOAD_ERROR: { description: 'Upload error', keywords: 25, patterns: 15, depthRange: [2, 5] },
    PROCESSING_ERROR: { description: 'Processing error', keywords: 25, patterns: 15, depthRange: [3, 6] },
    PERMISSION_ERROR: { description: 'Permission error', keywords: 25, patterns: 15, depthRange: [2, 5] },
    FORMAT_ERROR: { description: 'Format error', keywords: 25, patterns: 15, depthRange: [2, 5] },
    SIZE_ERROR: { description: 'Size limit error', keywords: 25, patterns: 15, depthRange: [2, 4] },
    NETWORK_ERROR: { description: 'Network error', keywords: 25, patterns: 15, depthRange: [2, 5] },
    TIMEOUT_ERROR: { description: 'Timeout error', keywords: 25, patterns: 15, depthRange: [2, 5] },
    VALIDATION_ERROR: { description: 'Validation error', keywords: 25, patterns: 15, depthRange: [3, 6] },
    AI_ERROR: { description: 'AI processing error', keywords: 25, patterns: 15, depthRange: [3, 6] },
    RATE_LIMIT: { description: 'Rate limit error', keywords: 25, patterns: 15, depthRange: [2, 4] },
    QUOTA_ERROR: { description: 'Quota exceeded', keywords: 25, patterns: 15, depthRange: [2, 5] },
    AUTH_ERROR: { description: 'Authentication error', keywords: 25, patterns: 15, depthRange: [3, 6] },
    SYNC_ERROR: { description: 'Sync error', keywords: 25, patterns: 15, depthRange: [3, 6] },
    DATA_ERROR: { description: 'Data integrity error', keywords: 25, patterns: 15, depthRange: [4, 7] },
    UNKNOWN_ERROR: { description: 'Unknown error', keywords: 25, patterns: 15, depthRange: [3, 6] },
    RECOVERABLE: { description: 'Recoverable error', keywords: 25, patterns: 15, depthRange: [2, 5] },
    FATAL: { description: 'Fatal error', keywords: 25, patterns: 15, depthRange: [4, 7] }
  },

  // 8.2 ERROR ACTIONS (20 actions × 40 kw + 22 pat = 800 kw + 440 pat)
  actions: {
    // Reporting (D1-D4)
    REPORT_ERROR: { description: 'Report error', keywords: 40, patterns: 22, depthRange: [1, 4], family: 'report' },
    DESCRIBE_ERROR: { description: 'Describe error', keywords: 40, patterns: 22, depthRange: [2, 5], family: 'report' },
    SHOW_DETAILS: { description: 'Show error details', keywords: 40, patterns: 22, depthRange: [3, 6], family: 'report' },
    GET_ERROR_CODE: { description: 'Get error code', keywords: 40, patterns: 22, depthRange: [2, 4], family: 'report' },
    // Recovery (D2-D6)
    RETRY: { description: 'Retry operation', keywords: 40, patterns: 22, depthRange: [2, 4], family: 'recovery' },
    RECOVER: { description: 'Recover from error', keywords: 40, patterns: 22, depthRange: [3, 6], family: 'recovery' },
    RESTORE: { description: 'Restore state', keywords: 40, patterns: 22, depthRange: [3, 6], family: 'recovery' },
    ROLLBACK: { description: 'Rollback changes', keywords: 40, patterns: 22, depthRange: [4, 7], family: 'recovery' },
    SKIP: { description: 'Skip and continue', keywords: 40, patterns: 22, depthRange: [2, 4], family: 'recovery' },
    IGNORE: { description: 'Ignore error', keywords: 40, patterns: 22, depthRange: [2, 4], family: 'recovery' },
    // Troubleshooting (D3-D7)
    DIAGNOSE: { description: 'Diagnose error', keywords: 40, patterns: 22, depthRange: [3, 7], family: 'troubleshoot' },
    IDENTIFY_CAUSE: { description: 'Identify cause', keywords: 40, patterns: 22, depthRange: [4, 7], family: 'troubleshoot' },
    SUGGEST_FIX: { description: 'Suggest fix', keywords: 40, patterns: 22, depthRange: [3, 6], family: 'troubleshoot' },
    TROUBLESHOOT: { description: 'Troubleshoot', keywords: 40, patterns: 22, depthRange: [4, 7], family: 'troubleshoot' },
    CHECK_STATUS: { description: 'Check status', keywords: 40, patterns: 22, depthRange: [2, 4], family: 'troubleshoot' },
    // Prevention (D3-D6)
    PREVENT: { description: 'Prevent recurrence', keywords: 40, patterns: 22, depthRange: [4, 7], family: 'prevent' },
    VALIDATE_INPUT: { description: 'Validate input', keywords: 40, patterns: 22, depthRange: [3, 5], family: 'prevent' },
    CHECK_REQUIREMENTS: { description: 'Check requirements', keywords: 40, patterns: 22, depthRange: [2, 5], family: 'prevent' },
    // Escalation (D4-D8)
    ESCALATE: { description: 'Escalate issue', keywords: 40, patterns: 22, depthRange: [5, 8], family: 'escalate' },
    CONTACT_SUPPORT: { description: 'Contact support', keywords: 40, patterns: 22, depthRange: [4, 6], family: 'escalate' }
  },

  // 8.3 ERROR SCOPE (10 scopes × 20 kw + 12 pat = 200 kw + 120 pat)
  scope: {
    CURRENT_OPERATION: { description: 'Current operation', keywords: 20, patterns: 12, depthRange: [0, 3] },
    CURRENT_FILE: { description: 'Current file', keywords: 20, patterns: 12, depthRange: [1, 4] },
    CURRENT_SESSION: { description: 'Current session', keywords: 20, patterns: 12, depthRange: [1, 4] },
    ALL_OPERATIONS: { description: 'All operations', keywords: 20, patterns: 12, depthRange: [2, 5] },
    SYSTEM_WIDE: { description: 'System-wide', keywords: 20, patterns: 12, depthRange: [3, 6] },
    USER_ACCOUNT: { description: 'User account', keywords: 20, patterns: 12, depthRange: [2, 5] },
    WORKSPACE: { description: 'Workspace', keywords: 20, patterns: 12, depthRange: [2, 5] },
    INTEGRATION: { description: 'Integration', keywords: 20, patterns: 12, depthRange: [3, 6] },
    BATCH_OPERATION: { description: 'Batch operation', keywords: 20, patterns: 12, depthRange: [2, 5] },
    BACKGROUND_TASK: { description: 'Background task', keywords: 20, patterns: 12, depthRange: [2, 5] }
  },

  // 8.4 ERROR DEPTH (8 levels × 25 kw + 15 pat = 200 kw + 120 pat)
  depth: {
    SIMPLE_ERROR: { description: 'Simple error message', keywords: 25, patterns: 15, depth: 1 },
    DESCRIPTIVE: { description: 'Descriptive error', keywords: 25, patterns: 15, depth: 2 },
    CONTEXTUAL: { description: 'Contextual error', keywords: 25, patterns: 15, depth: 3 },
    DIAGNOSTIC: { description: 'Diagnostic info', keywords: 25, patterns: 15, depth: 4 },
    ROOT_CAUSE: { description: 'Root cause analysis', keywords: 25, patterns: 15, depth: 5 },
    TECHNICAL_DETAIL: { description: 'Technical detail', keywords: 25, patterns: 15, depth: 6 },
    STACK_TRACE: { description: 'Stack trace level', keywords: 25, patterns: 15, depth: 7 },
    DEBUG_MODE: { description: 'Debug mode', keywords: 25, patterns: 15, depth: 8 }
  },

  // 8.5 ERROR OUTPUT (16 modes × 20 kw + 12 pat = 320 kw + 192 pat)
  outputControl: {
    SIMPLE_MESSAGE: { description: 'Simple message', keywords: 20, patterns: 12, depth: 1, family: 'display' },
    DETAILED_MESSAGE: { description: 'Detailed message', keywords: 20, patterns: 12, depthRange: [2, 4], family: 'display' },
    ERROR_CODE: { description: 'Error code', keywords: 20, patterns: 12, depthRange: [2, 4], family: 'display' },
    FULL_TRACE: { description: 'Full trace', keywords: 20, patterns: 12, depthRange: [5, 8], family: 'display' },
    RETRY_BUTTON: { description: 'Retry button', keywords: 20, patterns: 12, depth: 2, family: 'action' },
    FIX_SUGGESTION: { description: 'Fix suggestion', keywords: 20, patterns: 12, depthRange: [3, 5], family: 'action' },
    WORKAROUND: { description: 'Workaround', keywords: 20, patterns: 12, depthRange: [4, 6], family: 'action' },
    SUPPORT_LINK: { description: 'Support link', keywords: 20, patterns: 12, depthRange: [3, 5], family: 'action' },
    FRIENDLY_TONE: { description: 'Friendly tone', keywords: 20, patterns: 12, depthRange: [1, 3], family: 'tone' },
    TECHNICAL_TONE: { description: 'Technical tone', keywords: 20, patterns: 12, depthRange: [4, 7], family: 'tone' },
    APOLOGETIC: { description: 'Apologetic', keywords: 20, patterns: 12, depthRange: [2, 4], family: 'tone' },
    STATUS_INDICATOR: { description: 'Status indicator', keywords: 20, patterns: 12, depthRange: [1, 3], family: 'metadata' },
    TIMESTAMP: { description: 'Timestamp', keywords: 20, patterns: 12, depth: 2, family: 'metadata' },
    REQUEST_ID: { description: 'Request ID', keywords: 20, patterns: 12, depthRange: [3, 5], family: 'metadata' },
    RECOVERY_PROGRESS: { description: 'Recovery progress', keywords: 20, patterns: 12, depthRange: [2, 4], family: 'metadata' },
    DISMISS_OPTION: { description: 'Dismiss option', keywords: 20, patterns: 12, depth: 1, family: 'action' }
  }
};

// ============================================================================
// 9. REASONING INTENT - MASTER COGNITIVE LAYER (~8,170 items/lang)
// This is the definitive reasoning intelligence - what makes Koda think.
// ============================================================================

export const REASONING = {
  // 9.1 REASONING STATES (~25 states × 35 kw + 22 pat = 875 kw + 550 pat)
  // What kind of reasoning situation is this?
  states: {
    DIRECT_LOGICAL: { description: 'Direct logical question', keywords: 35, patterns: 22, depthRange: [3, 6] },
    MULTI_STEP_LOGICAL: { description: 'Multi-step logical dependency', keywords: 35, patterns: 22, depthRange: [4, 7] },
    CONDITIONAL: { description: 'Conditional reasoning (if/then)', keywords: 35, patterns: 22, depthRange: [3, 6] },
    HYPOTHETICAL: { description: 'Hypothetical reasoning', keywords: 35, patterns: 22, depthRange: [4, 7] },
    COUNTERFACTUAL: { description: 'Counterfactual reasoning', keywords: 35, patterns: 22, depthRange: [5, 8] },
    CAUSE_EFFECT: { description: 'Cause → effect analysis', keywords: 35, patterns: 22, depthRange: [4, 7] },
    EFFECT_CAUSE: { description: 'Effect → cause diagnosis', keywords: 35, patterns: 22, depthRange: [5, 8] },
    AMBIGUOUS_PREMISE: { description: 'Ambiguous premise', keywords: 35, patterns: 22, depthRange: [4, 7] },
    INCOMPLETE_INFO: { description: 'Incomplete information', keywords: 35, patterns: 22, depthRange: [3, 6] },
    CONFLICTING_PREMISES: { description: 'Conflicting premises', keywords: 35, patterns: 22, depthRange: [5, 8] },
    ASSUMPTION_BASED: { description: 'Assumption-based reasoning', keywords: 35, patterns: 22, depthRange: [4, 7] },
    PROBABILISTIC: { description: 'Probabilistic reasoning', keywords: 35, patterns: 22, depthRange: [5, 8] },
    DETERMINISTIC: { description: 'Deterministic reasoning', keywords: 35, patterns: 22, depthRange: [3, 6] },
    HEURISTIC: { description: 'Heuristic reasoning', keywords: 35, patterns: 22, depthRange: [4, 7] },
    ANALOGICAL: { description: 'Analogical reasoning', keywords: 35, patterns: 22, depthRange: [4, 7] },
    TRADEOFF: { description: 'Trade-off reasoning', keywords: 35, patterns: 22, depthRange: [4, 7] },
    CONSTRAINT_BASED: { description: 'Constraint-based reasoning', keywords: 35, patterns: 22, depthRange: [4, 7] },
    OPTIMIZATION: { description: 'Optimization reasoning', keywords: 35, patterns: 22, depthRange: [5, 8] },
    RISK_BASED: { description: 'Risk-based reasoning', keywords: 35, patterns: 22, depthRange: [5, 8] },
    ETHICAL: { description: 'Ethical reasoning', keywords: 35, patterns: 22, depthRange: [6, 8] },
    POLICY_BASED: { description: 'Policy-based reasoning', keywords: 35, patterns: 22, depthRange: [4, 7] },
    PROCEDURAL: { description: 'Procedural reasoning', keywords: 35, patterns: 22, depthRange: [3, 6] },
    STRATEGIC: { description: 'Strategic reasoning', keywords: 35, patterns: 22, depthRange: [5, 8] },
    TACTICAL: { description: 'Tactical reasoning', keywords: 35, patterns: 22, depthRange: [4, 7] },
    META_REASONING: { description: 'Meta-reasoning (reasoning about reasoning)', keywords: 35, patterns: 22, depthRange: [6, 8] }
  },

  // 9.2 REASONING ACTIONS (~35 actions × 35 kw + 22 pat = 1,225 kw + 770 pat)
  // What must reasoning DO?
  actions: {
    // Core reasoning (10)
    DEDUCE: { description: 'Deduce conclusion', keywords: 35, patterns: 22, depthRange: [4, 7], family: 'core' },
    INFER_MISSING: { description: 'Infer missing step', keywords: 35, patterns: 22, depthRange: [4, 7], family: 'core' },
    VALIDATE_ASSUMPTION: { description: 'Validate assumption', keywords: 35, patterns: 22, depthRange: [4, 7], family: 'core' },
    CHALLENGE_ASSUMPTION: { description: 'Challenge assumption', keywords: 35, patterns: 22, depthRange: [5, 8], family: 'core' },
    RESOLVE_CONTRADICTION: { description: 'Resolve contradiction', keywords: 35, patterns: 22, depthRange: [5, 8], family: 'core' },
    IDENTIFY_DEPENDENCY: { description: 'Identify dependency', keywords: 35, patterns: 22, depthRange: [4, 7], family: 'core' },
    IDENTIFY_CONSTRAINT: { description: 'Identify constraint', keywords: 35, patterns: 22, depthRange: [4, 7], family: 'core' },
    EVALUATE_IMPLICATION: { description: 'Evaluate implication', keywords: 35, patterns: 22, depthRange: [4, 7], family: 'core' },
    EVALUATE_CONSEQUENCE: { description: 'Evaluate consequence', keywords: 35, patterns: 22, depthRange: [4, 7], family: 'core' },
    EVALUATE_RISK: { description: 'Evaluate risk', keywords: 35, patterns: 22, depthRange: [5, 8], family: 'core' },
    // Comparison (5)
    EVALUATE_BENEFIT: { description: 'Evaluate benefit', keywords: 35, patterns: 22, depthRange: [4, 7], family: 'comparison' },
    COMPARE_ALTERNATIVES: { description: 'Compare alternatives', keywords: 35, patterns: 22, depthRange: [4, 7], family: 'comparison' },
    RANK_OPTIONS: { description: 'Rank options', keywords: 35, patterns: 22, depthRange: [4, 6], family: 'comparison' },
    OPTIMIZE_OUTCOME: { description: 'Optimize outcome', keywords: 35, patterns: 22, depthRange: [5, 8], family: 'comparison' },
    IDENTIFY_BOTTLENECK: { description: 'Identify bottleneck', keywords: 35, patterns: 22, depthRange: [4, 7], family: 'comparison' },
    // Detection (5)
    IDENTIFY_FAILURE_MODE: { description: 'Identify failure mode', keywords: 35, patterns: 22, depthRange: [5, 8], family: 'detection' },
    DETECT_INCONSISTENCY: { description: 'Detect inconsistency', keywords: 35, patterns: 22, depthRange: [4, 7], family: 'detection' },
    DETECT_CIRCULAR_LOGIC: { description: 'Detect circular logic', keywords: 35, patterns: 22, depthRange: [5, 8], family: 'detection' },
    DETECT_LOGICAL_GAP: { description: 'Detect logical gap', keywords: 35, patterns: 22, depthRange: [4, 7], family: 'detection' },
    DECOMPOSE_PROBLEM: { description: 'Decompose problem', keywords: 35, patterns: 22, depthRange: [4, 7], family: 'detection' },
    // Synthesis (5)
    RECOMPOSE_SOLUTION: { description: 'Recompose solution', keywords: 35, patterns: 22, depthRange: [5, 8], family: 'synthesis' },
    ABSTRACT_REASONING: { description: 'Abstract reasoning', keywords: 35, patterns: 22, depthRange: [5, 8], family: 'synthesis' },
    CONCRETIZE_REASONING: { description: 'Concretize reasoning', keywords: 35, patterns: 22, depthRange: [4, 7], family: 'synthesis' },
    GENERALIZE_RULE: { description: 'Generalize rule', keywords: 35, patterns: 22, depthRange: [5, 8], family: 'synthesis' },
    SPECIALIZE_CASE: { description: 'Specialize case', keywords: 35, patterns: 22, depthRange: [4, 7], family: 'synthesis' },
    // Application (5)
    APPLY_RULE: { description: 'Apply rule', keywords: 35, patterns: 22, depthRange: [3, 6], family: 'application' },
    SIMULATE_SCENARIO: { description: 'Simulate scenario', keywords: 35, patterns: 22, depthRange: [5, 8], family: 'application' },
    PROJECT_OUTCOME: { description: 'Project outcome', keywords: 35, patterns: 22, depthRange: [5, 8], family: 'application' },
    EXPLAIN_REASONING: { description: 'Explain reasoning', keywords: 35, patterns: 22, depthRange: [4, 7], family: 'application' },
    JUSTIFY_REASONING: { description: 'Justify reasoning', keywords: 35, patterns: 22, depthRange: [5, 8], family: 'application' },
    // Meta (5)
    DEFEND_REASONING: { description: 'Defend reasoning', keywords: 35, patterns: 22, depthRange: [5, 8], family: 'meta' },
    REFINE_REASONING: { description: 'Refine reasoning', keywords: 35, patterns: 22, depthRange: [4, 7], family: 'meta' },
    SIMPLIFY_REASONING: { description: 'Simplify reasoning', keywords: 35, patterns: 22, depthRange: [3, 6], family: 'meta' },
    EXPAND_REASONING: { description: 'Expand reasoning', keywords: 35, patterns: 22, depthRange: [4, 7], family: 'meta' },
    TERMINATE_REASONING: { description: 'Terminate reasoning', keywords: 35, patterns: 22, depthRange: [3, 6], family: 'meta' }
  },

  // 9.3 REASONING SCOPE (~18 scopes × 30 kw + 20 pat = 540 kw + 360 pat)
  // How wide should reasoning apply?
  scope: {
    SINGLE_STATEMENT: { description: 'Single statement', keywords: 30, patterns: 20, depthRange: [2, 4] },
    SINGLE_ASSUMPTION: { description: 'Single assumption', keywords: 30, patterns: 20, depthRange: [3, 5] },
    SINGLE_RULE: { description: 'Single rule', keywords: 30, patterns: 20, depthRange: [2, 4] },
    SINGLE_SCENARIO: { description: 'Single scenario', keywords: 30, patterns: 20, depthRange: [3, 5] },
    MULTIPLE_SCENARIOS: { description: 'Multiple scenarios', keywords: 30, patterns: 20, depthRange: [4, 7] },
    ENTIRE_ARGUMENT: { description: 'Entire argument', keywords: 30, patterns: 20, depthRange: [4, 7] },
    MULTIPLE_ARGUMENTS: { description: 'Multiple arguments', keywords: 30, patterns: 20, depthRange: [5, 8] },
    CROSS_DOCUMENT_LOGIC: { description: 'Cross-document logic', keywords: 30, patterns: 20, depthRange: [5, 8] },
    CROSS_DOMAIN_LOGIC: { description: 'Cross-domain logic', keywords: 30, patterns: 20, depthRange: [6, 8] },
    TIME_BOUNDED: { description: 'Time-bounded reasoning', keywords: 30, patterns: 20, depthRange: [3, 6] },
    VERSION_BOUNDED: { description: 'Version-bounded reasoning', keywords: 30, patterns: 20, depthRange: [3, 6] },
    POLICY_BOUNDED: { description: 'Policy-bounded reasoning', keywords: 30, patterns: 20, depthRange: [4, 7] },
    CONSTRAINT_BOUNDED: { description: 'Constraint-bounded reasoning', keywords: 30, patterns: 20, depthRange: [4, 7] },
    OUTCOME_BOUNDED: { description: 'Outcome-bounded reasoning', keywords: 30, patterns: 20, depthRange: [4, 7] },
    RISK_BOUNDED: { description: 'Risk-bounded reasoning', keywords: 30, patterns: 20, depthRange: [5, 8] },
    GOAL_BOUNDED: { description: 'Goal-bounded reasoning', keywords: 30, patterns: 20, depthRange: [4, 7] },
    USER_GOAL_BOUNDED: { description: 'User-goal bounded reasoning', keywords: 30, patterns: 20, depthRange: [3, 6] },
    SYSTEM_GOAL_BOUNDED: { description: 'System-goal bounded reasoning', keywords: 30, patterns: 20, depthRange: [4, 7] }
  },

  // 9.4 REASONING DEPTH (~15 levels × 25 kw + 18 pat = 375 kw + 270 pat)
  // How deep must reasoning go?
  depth: {
    SURFACE_LOGIC: { description: 'Surface logic', keywords: 25, patterns: 18, depth: 2 },
    EXPLICIT_REASONING: { description: 'Explicit reasoning', keywords: 25, patterns: 18, depth: 3 },
    CONTEXTUAL_REASONING: { description: 'Contextual reasoning', keywords: 25, patterns: 18, depth: 4 },
    MULTI_HOP: { description: 'Multi-hop reasoning', keywords: 25, patterns: 18, depth: 5 },
    CROSS_REFERENCE: { description: 'Cross-reference reasoning', keywords: 25, patterns: 18, depth: 5 },
    LOGICAL_INFERENCE: { description: 'Logical inference', keywords: 25, patterns: 18, depth: 6 },
    RISK_ANALYSIS: { description: 'Risk analysis', keywords: 25, patterns: 18, depth: 6 },
    TRADEOFF_ANALYSIS: { description: 'Trade-off analysis', keywords: 25, patterns: 18, depth: 6 },
    IMPACT_ANALYSIS: { description: 'Impact analysis', keywords: 25, patterns: 18, depth: 6 },
    SCENARIO_ANALYSIS: { description: 'Scenario analysis', keywords: 25, patterns: 18, depth: 7 },
    SENSITIVITY_ANALYSIS: { description: 'Sensitivity analysis', keywords: 25, patterns: 18, depth: 7 },
    COUNTERFACTUAL_ANALYSIS: { description: 'Counterfactual analysis', keywords: 25, patterns: 18, depth: 7 },
    STRATEGIC_LEVEL: { description: 'Strategic-level reasoning', keywords: 25, patterns: 18, depth: 8 },
    EXPERT_LEVEL: { description: 'Expert-level reasoning', keywords: 25, patterns: 18, depth: 8 },
    META_REASONING_DEPTH: { description: 'Meta-reasoning depth', keywords: 25, patterns: 18, depth: 8 }
  },

  // 9.5 EVIDENCE & TRUST (~15 levels × 25 kw + 18 pat = 375 kw + 270 pat) - NEW
  // How strict must reasoning be?
  evidenceTrust: {
    NO_EVIDENCE_REQUIRED: { description: 'No evidence required', keywords: 25, patterns: 18, depth: 1 },
    EVIDENCE_RECOMMENDED: { description: 'Evidence recommended', keywords: 25, patterns: 18, depth: 2 },
    EVIDENCE_REQUIRED: { description: 'Evidence required', keywords: 25, patterns: 18, depth: 3 },
    SINGLE_SOURCE_OK: { description: 'Single source acceptable', keywords: 25, patterns: 18, depth: 3 },
    MULTI_SOURCE_REQUIRED: { description: 'Multi-source required', keywords: 25, patterns: 18, depth: 4 },
    INFERENCE_ALLOWED: { description: 'Inference allowed', keywords: 25, patterns: 18, depth: 4 },
    INFERENCE_RESTRICTED: { description: 'Inference restricted', keywords: 25, patterns: 18, depth: 5 },
    SPECULATION_FORBIDDEN: { description: 'Speculation forbidden', keywords: 25, patterns: 18, depth: 5 },
    NUMERICAL_PRECISION: { description: 'Numerical precision required', keywords: 25, patterns: 18, depth: 4 },
    LOGICAL_PRECISION: { description: 'Logical precision required', keywords: 25, patterns: 18, depth: 5 },
    POLICY_PRECISION: { description: 'Policy-grade precision', keywords: 25, patterns: 18, depth: 5 },
    LEGAL_PRECISION: { description: 'Legal-grade precision', keywords: 25, patterns: 18, depth: 6 },
    FINANCIAL_PRECISION: { description: 'Financial-grade precision', keywords: 25, patterns: 18, depth: 6 },
    MEDICAL_CAUTION: { description: 'Medical caution mode', keywords: 25, patterns: 18, depth: 6 },
    UNCERTAINTY_DISCLOSURE: { description: 'Uncertainty disclosure required', keywords: 25, patterns: 18, depth: 5 }
  },

  // 9.6 TERMINATION CONDITIONS (~15 conditions × 25 kw + 18 pat = 375 kw + 270 pat) - NEW
  // When must reasoning stop?
  terminationConditions: {
    CONCLUSION_REACHED: { description: 'Conclusion reached', keywords: 25, patterns: 18, depth: 3 },
    CONFIDENCE_THRESHOLD: { description: 'Confidence threshold reached', keywords: 25, patterns: 18, depth: 4 },
    EVIDENCE_EXHAUSTED: { description: 'Evidence exhausted', keywords: 25, patterns: 18, depth: 4 },
    MARGINAL_BENEFIT_LOW: { description: 'Marginal benefit low', keywords: 25, patterns: 18, depth: 5 },
    USER_INTENT_SATISFIED: { description: 'User intent satisfied', keywords: 25, patterns: 18, depth: 3 },
    AMBIGUITY_UNRESOLVED: { description: 'Ambiguity unresolved', keywords: 25, patterns: 18, depth: 5 },
    MISSING_DATA_BLOCKING: { description: 'Missing data blocking', keywords: 25, patterns: 18, depth: 4 },
    CONTRADICTION_UNRESOLVED: { description: 'Contradiction unresolved', keywords: 25, patterns: 18, depth: 6 },
    RISK_TOO_HIGH: { description: 'Risk too high', keywords: 25, patterns: 18, depth: 6 },
    POLICY_BOUNDARY: { description: 'Policy boundary reached', keywords: 25, patterns: 18, depth: 5 },
    SCOPE_EXCEEDED: { description: 'Scope exceeded', keywords: 25, patterns: 18, depth: 5 },
    USER_INTERRUPTION: { description: 'User interruption', keywords: 25, patterns: 18, depth: 2 },
    COMPLEXITY_OVERLOAD: { description: 'Complexity overload', keywords: 25, patterns: 18, depth: 6 },
    RECURSIVE_LOOP: { description: 'Recursive loop detected', keywords: 25, patterns: 18, depth: 7 },
    META_TERMINATION: { description: 'Meta-termination trigger', keywords: 25, patterns: 18, depth: 8 }
  },

  // 9.7 OUTPUT CONTROL (~25 modes × 25 kw + 18 pat = 625 kw + 450 pat)
  // How should reasoning be expressed?
  outputControl: {
    // Structural Formats (10)
    SINGLE_CONCLUSION: { description: 'Single conclusion', keywords: 25, patterns: 18, depth: 2, family: 'format' },
    STEP_BY_STEP_LOGIC: { description: 'Step-by-step logic', keywords: 25, patterns: 18, depthRange: [4, 6], family: 'format' },
    DECISION_TREE: { description: 'Decision tree', keywords: 25, patterns: 18, depthRange: [4, 7], family: 'format' },
    COMPARISON_TABLE: { description: 'Comparison table', keywords: 25, patterns: 18, depthRange: [3, 5], family: 'format' },
    PROS_CONS_LIST: { description: 'Pros / cons list', keywords: 25, patterns: 18, depthRange: [3, 5], family: 'format' },
    RISK_MATRIX: { description: 'Risk matrix', keywords: 25, patterns: 18, depthRange: [5, 7], family: 'format' },
    SCENARIO_TABLE: { description: 'Scenario table', keywords: 25, patterns: 18, depthRange: [5, 7], family: 'format' },
    FLOW_EXPLANATION: { description: 'Flow explanation', keywords: 25, patterns: 18, depthRange: [4, 6], family: 'format' },
    LOGICAL_CHAIN: { description: 'Logical chain', keywords: 25, patterns: 18, depthRange: [5, 8], family: 'format' },
    BULLET_REASONING: { description: 'Bullet reasoning', keywords: 25, patterns: 18, depthRange: [3, 5], family: 'format' },
    // Interaction Controls (6)
    ASK_CLARIFICATION: { description: 'Ask clarification', keywords: 25, patterns: 18, depthRange: [3, 5], family: 'interaction' },
    ASK_ASSUMPTION_CONFIRM: { description: 'Ask assumption confirmation', keywords: 25, patterns: 18, depthRange: [4, 6], family: 'interaction' },
    SUGGEST_NEXT_STEP: { description: 'Suggest next reasoning step', keywords: 25, patterns: 18, depthRange: [4, 6], family: 'interaction' },
    OFFER_ALTERNATIVE_PATHS: { description: 'Offer alternative paths', keywords: 25, patterns: 18, depthRange: [5, 7], family: 'interaction' },
    ASK_FOR_CONSTRAINTS: { description: 'Ask for constraints', keywords: 25, patterns: 18, depthRange: [4, 6], family: 'interaction' },
    ASK_GOAL_REFINEMENT: { description: 'Ask for goal refinement', keywords: 25, patterns: 18, depthRange: [4, 6], family: 'interaction' },
    // Emphasis Controls (9)
    HIGHLIGHT_ASSUMPTIONS: { description: 'Highlight assumptions', keywords: 25, patterns: 18, depthRange: [4, 6], family: 'emphasis' },
    HIGHLIGHT_RISKS: { description: 'Highlight risks', keywords: 25, patterns: 18, depthRange: [4, 7], family: 'emphasis' },
    HIGHLIGHT_UNCERTAINTIES: { description: 'Highlight uncertainties', keywords: 25, patterns: 18, depthRange: [4, 7], family: 'emphasis' },
    HIGHLIGHT_DEPENDENCIES: { description: 'Highlight dependencies', keywords: 25, patterns: 18, depthRange: [4, 6], family: 'emphasis' },
    HIGHLIGHT_TRADEOFFS: { description: 'Highlight trade-offs', keywords: 25, patterns: 18, depthRange: [5, 7], family: 'emphasis' },
    HIGHLIGHT_CONSTRAINTS: { description: 'Highlight constraints', keywords: 25, patterns: 18, depthRange: [4, 6], family: 'emphasis' },
    HIGHLIGHT_DECISION_POINT: { description: 'Highlight decision point', keywords: 25, patterns: 18, depthRange: [5, 7], family: 'emphasis' },
    HIGHLIGHT_CONCLUSION_STRENGTH: { description: 'Highlight conclusion strength', keywords: 25, patterns: 18, depthRange: [4, 6], family: 'emphasis' },
    MIXED_SECTIONS: { description: 'Mixed sections output', keywords: 25, patterns: 18, depthRange: [3, 6], family: 'format' }
  },

  // 9.8 REASONING MEMORY (~12 signals × 20 kw + 15 pat = 240 kw + 180 pat) - NEW
  // What must persist during reasoning? (Session-level)
  reasoningMemory: {
    ACTIVE_ASSUMPTIONS: { description: 'Active assumptions', keywords: 20, patterns: 15, depthRange: [3, 6] },
    ACCEPTED_PREMISES: { description: 'Accepted premises', keywords: 20, patterns: 15, depthRange: [3, 6] },
    REJECTED_PREMISES: { description: 'Rejected premises', keywords: 20, patterns: 15, depthRange: [4, 7] },
    OPEN_QUESTIONS: { description: 'Open questions', keywords: 20, patterns: 15, depthRange: [3, 6] },
    RESOLVED_QUESTIONS: { description: 'Resolved questions', keywords: 20, patterns: 15, depthRange: [3, 6] },
    ACTIVE_CONSTRAINTS: { description: 'Active constraints', keywords: 20, patterns: 15, depthRange: [3, 6] },
    ACTIVE_GOALS: { description: 'Active goals', keywords: 20, patterns: 15, depthRange: [3, 6] },
    PRIOR_CONCLUSIONS: { description: 'Prior conclusions', keywords: 20, patterns: 15, depthRange: [3, 6] },
    CONFIDENCE_LEVEL: { description: 'Confidence level', keywords: 20, patterns: 15, depthRange: [2, 5] },
    TERMINATION_REASON: { description: 'Termination reason', keywords: 20, patterns: 15, depthRange: [3, 6] },
    USER_PREFERENCE_SIGNAL: { description: 'User preference signal', keywords: 20, patterns: 15, depthRange: [2, 5] },
    REASONING_PATH_TAKEN: { description: 'Reasoning path taken', keywords: 20, patterns: 15, depthRange: [4, 7] }
  },

  // 9.9 FAILURE MODES (~12 modes × 20 kw + 15 pat = 240 kw + 180 pat) - NEW
  // What can go wrong?
  failureModes: {
    MISSING_PREMISE: { description: 'Missing premise', keywords: 20, patterns: 15, depthRange: [3, 6] },
    HIDDEN_ASSUMPTION: { description: 'Hidden assumption', keywords: 20, patterns: 15, depthRange: [4, 7] },
    LOGICAL_LEAP: { description: 'Logical leap', keywords: 20, patterns: 15, depthRange: [4, 7] },
    CIRCULAR_REASONING: { description: 'Circular reasoning', keywords: 20, patterns: 15, depthRange: [5, 8] },
    OVERGENERALIZATION: { description: 'Overgeneralization', keywords: 20, patterns: 15, depthRange: [4, 7] },
    OVERSIMPLIFICATION: { description: 'Oversimplification', keywords: 20, patterns: 15, depthRange: [4, 7] },
    CONFLICTING_EVIDENCE: { description: 'Conflicting evidence', keywords: 20, patterns: 15, depthRange: [4, 7] },
    AMBIGUOUS_TERMS: { description: 'Ambiguous terms', keywords: 20, patterns: 15, depthRange: [3, 6] },
    INVALID_INFERENCE: { description: 'Invalid inference', keywords: 20, patterns: 15, depthRange: [5, 8] },
    SCOPE_CREEP: { description: 'Scope creep', keywords: 20, patterns: 15, depthRange: [4, 7] },
    USER_MISUNDERSTANDING: { description: 'User misunderstanding', keywords: 20, patterns: 15, depthRange: [3, 6] },
    DOMAIN_MISMATCH: { description: 'Domain mismatch', keywords: 20, patterns: 15, depthRange: [4, 7] }
  }
};

// ============================================================================
// FILE_ACTION INTENT - File Operations (~2,800/lang)
// ============================================================================

export const FILE_ACTION = {
  // File states - What is the file situation right now?
  states: {
    SINGLE_FILE_REFERENCED: { description: 'Single file referenced', keywords: 25, patterns: 15 },
    MULTIPLE_FILES_REFERENCED: { description: 'Multiple files referenced', keywords: 25, patterns: 15 },
    NO_FILE_REFERENCED: { description: 'No file referenced', keywords: 20, patterns: 12 },
    EXPLICIT_FILENAME: { description: 'Explicit filename mentioned', keywords: 25, patterns: 15 },
    IMPLICIT_REFERENCE: { description: 'Implicit reference (this file, that document)', keywords: 25, patterns: 15 },
    LAST_ACTIVE_FILE: { description: 'Last-active file context', keywords: 20, patterns: 12 },
    AMBIGUOUS_FILE_REFERENCE: { description: 'Ambiguous file reference', keywords: 25, patterns: 15 },
    FILE_NOT_FOUND: { description: 'File not found', keywords: 20, patterns: 12 },
    FILE_EXISTS: { description: 'File exists', keywords: 20, patterns: 12 },
    FILE_ALREADY_MOVED: { description: 'File already moved', keywords: 20, patterns: 12 },
    FILE_ALREADY_DELETED: { description: 'File already deleted', keywords: 20, patterns: 12 },
    FILE_NAME_CONFLICT: { description: 'File name conflict', keywords: 20, patterns: 12 },
    FILE_LOCKED: { description: 'File locked / in use', keywords: 20, patterns: 12 },
    FILE_RECENTLY_UPLOADED: { description: 'File recently uploaded', keywords: 20, patterns: 12 },
    FILE_IN_ROOT: { description: 'File in root', keywords: 20, patterns: 12 },
    FILE_IN_FOLDER: { description: 'File inside folder', keywords: 20, patterns: 12 },
    FILE_IN_NESTED_FOLDER: { description: 'File inside nested folders', keywords: 20, patterns: 12 },
    UNSUPPORTED_FILE_TYPE: { description: 'Unsupported file type', keywords: 20, patterns: 12 },
    LARGE_FILE: { description: 'Large file', keywords: 20, patterns: 12 },
    MULTIPLE_VERSIONS: { description: 'Multiple versions', keywords: 20, patterns: 12 },
    UNKNOWN_FILE_STATE: { description: 'Unknown file state', keywords: 15, patterns: 10 }
  },

  // File actions - What does user want to do?
  actions: {
    UPLOAD_NEW: { description: 'Upload new file', keywords: 30, patterns: 18, family: 'upload' },
    UPLOAD_MULTIPLE: { description: 'Upload multiple files', keywords: 25, patterns: 15, family: 'upload' },
    UPLOAD_TO_ROOT: { description: 'Upload to root', keywords: 20, patterns: 12, family: 'upload' },
    UPLOAD_TO_FOLDER: { description: 'Upload to specific folder', keywords: 25, patterns: 15, family: 'upload' },
    MOVE_FILE: { description: 'Move file', keywords: 30, patterns: 18, family: 'move' },
    MOVE_MULTIPLE: { description: 'Move multiple files', keywords: 25, patterns: 15, family: 'move' },
    MOVE_TO_FOLDER: { description: 'Move to folder', keywords: 25, patterns: 15, family: 'move' },
    MOVE_BETWEEN_FOLDERS: { description: 'Move between folders', keywords: 25, patterns: 15, family: 'move' },
    RENAME_FILE: { description: 'Rename file', keywords: 30, patterns: 18, family: 'rename' },
    RENAME_WITH_PATTERN: { description: 'Rename with pattern (date, version)', keywords: 25, patterns: 15, family: 'rename' },
    DELETE_FILE: { description: 'Delete file', keywords: 30, patterns: 18, family: 'delete' },
    DELETE_MULTIPLE: { description: 'Delete multiple files', keywords: 25, patterns: 15, family: 'delete' },
    CONFIRM_DELETE: { description: 'Confirmed delete', keywords: 20, patterns: 12, family: 'delete' },
    CANCEL_DELETE: { description: 'Cancel delete', keywords: 20, patterns: 12, family: 'delete' }
  },

  // File action scope - How wide is the action?
  scope: {
    SINGLE_FILE: { description: 'Single file', keywords: 20, patterns: 12 },
    MULTIPLE_SELECTED: { description: 'Multiple selected files', keywords: 20, patterns: 12 },
    ALL_IN_FOLDER: { description: 'All files in folder', keywords: 20, patterns: 12 },
    BY_NAME_PATTERN: { description: 'Files matching name pattern', keywords: 25, patterns: 15 },
    BY_FILE_TYPE: { description: 'Files by type (PDFs, DOCX, etc.)', keywords: 25, patterns: 15 },
    BY_DATE: { description: 'Files by date', keywords: 20, patterns: 12 },
    BY_RECENT_ACTIVITY: { description: 'Files by recent activity', keywords: 20, patterns: 12 },
    ROOT_ONLY: { description: 'Files in root only', keywords: 20, patterns: 12 },
    NESTED_FOLDERS: { description: 'Files in nested folders', keywords: 20, patterns: 12 },
    CURRENT_VIEW: { description: 'Current view only', keywords: 20, patterns: 12 }
  },

  // Confirmation & safety depth - How cautious should Koda be?
  confirmationDepth: {
    NO_CONFIRMATION: { description: 'No confirmation required', keywords: 15, patterns: 10 },
    CONFIRMATION_REQUIRED: { description: 'Confirmation required', keywords: 20, patterns: 12 },
    EXPLICIT_YES_REQUIRED: { description: 'Explicit yes required', keywords: 20, patterns: 12 },
    DESTRUCTIVE_WARNING: { description: 'Destructive action warning', keywords: 20, patterns: 12 },
    IRREVERSIBLE_WARNING: { description: 'Irreversible action warning', keywords: 20, patterns: 12 },
    MULTI_FILE_CONFIRMATION: { description: 'Multi-file confirmation', keywords: 20, patterns: 12 },
    FOLDER_LEVEL_CONFIRMATION: { description: 'Folder-level confirmation', keywords: 20, patterns: 12 },
    UNDO_AVAILABLE: { description: 'Undo available notice', keywords: 15, patterns: 10 },
    SOFT_FAIL_MODE: { description: 'Soft-fail mode (ask instead of act)', keywords: 15, patterns: 10 },
    ABORT_EXECUTION: { description: 'Abort execution', keywords: 15, patterns: 10 }
  },

  // File resolution depth - How confident about target file?
  resolutionDepth: {
    EXACT_MATCH: { description: 'Exact filename match', keywords: 20, patterns: 12 },
    CASE_INSENSITIVE: { description: 'Case-insensitive match', keywords: 15, patterns: 10 },
    FUZZY_MATCH: { description: 'Fuzzy match', keywords: 20, patterns: 12 },
    PARTIAL_NAME: { description: 'Partial name match', keywords: 20, patterns: 12 },
    MULTIPLE_MATCHES: { description: 'Multiple matches', keywords: 20, patterns: 12 },
    FOLDER_QUALIFIED: { description: 'Folder-qualified match', keywords: 20, patterns: 12 },
    RECENTLY_USED: { description: 'Recently used match', keywords: 15, patterns: 10 },
    USER_SELECTED: { description: 'User-selected file', keywords: 15, patterns: 10 },
    SYSTEM_SUGGESTED: { description: 'System-suggested match', keywords: 15, patterns: 10 },
    UNRESOLVED: { description: 'Unresolved target', keywords: 15, patterns: 10 }
  },

  // Output control - How Koda responds
  outputControl: {
    ACTION_EXECUTED: { description: 'Action executed confirmation', keywords: 20, patterns: 12, family: 'execution' },
    ACTION_QUEUED: { description: 'Action queued', keywords: 15, patterns: 10, family: 'execution' },
    ACTION_CANCELLED: { description: 'Action cancelled', keywords: 15, patterns: 10, family: 'execution' },
    ACTION_FAILED: { description: 'Action failed', keywords: 20, patterns: 12, family: 'execution' },
    PARTIAL_SUCCESS: { description: 'Partial success', keywords: 15, patterns: 10, family: 'execution' },
    ASK_WHICH_FILE: { description: 'Ask which file', keywords: 20, patterns: 12, family: 'interaction' },
    ASK_WHICH_FOLDER: { description: 'Ask which folder', keywords: 20, patterns: 12, family: 'interaction' },
    ASK_CONFIRMATION: { description: 'Ask for confirmation', keywords: 20, patterns: 12, family: 'interaction' },
    ASK_NARROW_SCOPE: { description: 'Ask to narrow scope', keywords: 15, patterns: 10, family: 'interaction' },
    SUGGEST_SAFER: { description: 'Suggest safer alternative', keywords: 15, patterns: 10, family: 'interaction' },
    SHOW_AFFECTED: { description: 'Show affected files', keywords: 20, patterns: 12, family: 'feedback' },
    SHOW_NEW_LOCATION: { description: 'Show new location', keywords: 15, patterns: 10, family: 'feedback' },
    SHOW_NEW_NAME: { description: 'Show renamed filename', keywords: 15, patterns: 10, family: 'feedback' },
    EXPLAIN_FAILURE: { description: 'Explain why action failed', keywords: 20, patterns: 12, family: 'feedback' },
    EXPLAIN_CONFIRMATION: { description: 'Explain why confirmation required', keywords: 15, patterns: 10, family: 'feedback' },
    OFFER_UNDO: { description: 'Offer undo', keywords: 15, patterns: 10, family: 'feedback' },
    OFFER_NEXT_ACTION: { description: 'Offer next action', keywords: 15, patterns: 10, family: 'feedback' },
    OFFER_HELP: { description: 'Offer help reference', keywords: 15, patterns: 10, family: 'feedback' }
  }
};

// ============================================================================
// FINANCE DOMAIN - Financial Intelligence (~4,500/lang)
// ============================================================================

export const FINANCE = {
  // Core financial concepts
  concepts: {
    REVENUE: { description: 'Revenue', keywords: 25, patterns: 15, family: 'core' },
    COST: { description: 'Cost', keywords: 25, patterns: 15, family: 'core' },
    EXPENSE: { description: 'Expense', keywords: 25, patterns: 15, family: 'core' },
    PROFIT: { description: 'Profit', keywords: 25, patterns: 15, family: 'core' },
    LOSS: { description: 'Loss', keywords: 25, patterns: 15, family: 'core' },
    MARGIN: { description: 'Margin', keywords: 25, patterns: 15, family: 'core' },
    CASH_FLOW: { description: 'Cash flow', keywords: 25, patterns: 15, family: 'core' },
    OPERATING_CASH_FLOW: { description: 'Operating cash flow', keywords: 20, patterns: 12, family: 'core' },
    FREE_CASH_FLOW: { description: 'Free cash flow', keywords: 20, patterns: 12, family: 'core' },
    EBITDA: { description: 'EBITDA', keywords: 25, patterns: 15, family: 'core' },
    EBIT: { description: 'EBIT', keywords: 20, patterns: 12, family: 'core' },
    GROSS_MARGIN: { description: 'Gross margin', keywords: 20, patterns: 12, family: 'core' },
    NET_MARGIN: { description: 'Net margin', keywords: 20, patterns: 12, family: 'core' },
    WORKING_CAPITAL: { description: 'Working capital', keywords: 20, patterns: 12, family: 'core' },
    CAPEX: { description: 'Capital expenditure (CAPEX)', keywords: 20, patterns: 12, family: 'core' },
    OPEX: { description: 'Operating expenditure (OPEX)', keywords: 20, patterns: 12, family: 'core' },
    DEPRECIATION: { description: 'Depreciation', keywords: 20, patterns: 12, family: 'core' },
    AMORTIZATION: { description: 'Amortization', keywords: 20, patterns: 12, family: 'core' },
    LEVERAGE: { description: 'Leverage', keywords: 20, patterns: 12, family: 'core' },
    DEBT: { description: 'Debt', keywords: 25, patterns: 15, family: 'core' },
    EQUITY: { description: 'Equity', keywords: 25, patterns: 15, family: 'core' },
    INTEREST_RATE: { description: 'Interest rate', keywords: 20, patterns: 12, family: 'core' },
    DISCOUNT_RATE: { description: 'Discount rate', keywords: 20, patterns: 12, family: 'core' },
    PRESENT_VALUE: { description: 'Present value', keywords: 20, patterns: 12, family: 'valuation' },
    NPV: { description: 'Net present value (NPV)', keywords: 20, patterns: 12, family: 'valuation' },
    IRR: { description: 'Internal rate of return (IRR)', keywords: 20, patterns: 12, family: 'valuation' },
    PAYBACK_PERIOD: { description: 'Payback period', keywords: 20, patterns: 12, family: 'valuation' },
    BREAK_EVEN: { description: 'Break-even point', keywords: 20, patterns: 12, family: 'valuation' },
    FINANCIAL_RISK: { description: 'Financial risk', keywords: 20, patterns: 12, family: 'risk' },
    LIQUIDITY: { description: 'Liquidity', keywords: 20, patterns: 12, family: 'risk' }
  },

  // Financial metrics & ratios
  metrics: {
    CURRENT_RATIO: { description: 'Current ratio', keywords: 20, patterns: 12, family: 'liquidity' },
    QUICK_RATIO: { description: 'Quick ratio', keywords: 20, patterns: 12, family: 'liquidity' },
    DEBT_TO_EQUITY: { description: 'Debt-to-equity', keywords: 20, patterns: 12, family: 'leverage' },
    DEBT_TO_EBITDA: { description: 'Debt-to-EBITDA', keywords: 20, patterns: 12, family: 'leverage' },
    ROI: { description: 'Return on investment (ROI)', keywords: 25, patterns: 15, family: 'return' },
    ROE: { description: 'Return on equity (ROE)', keywords: 20, patterns: 12, family: 'return' },
    ROA: { description: 'Return on assets (ROA)', keywords: 20, patterns: 12, family: 'return' },
    COST_OF_CAPITAL: { description: 'Cost of capital', keywords: 20, patterns: 12, family: 'cost' },
    WACC: { description: 'Weighted average cost of capital (WACC)', keywords: 20, patterns: 12, family: 'cost' },
    GROSS_PROFIT_RATIO: { description: 'Gross profit ratio', keywords: 20, patterns: 12, family: 'profitability' },
    OPERATING_MARGIN: { description: 'Operating margin', keywords: 20, patterns: 12, family: 'profitability' },
    NET_INCOME_RATIO: { description: 'Net income ratio', keywords: 20, patterns: 12, family: 'profitability' },
    CASH_CONVERSION_CYCLE: { description: 'Cash conversion cycle', keywords: 20, patterns: 12, family: 'efficiency' },
    BURN_RATE: { description: 'Burn rate', keywords: 20, patterns: 12, family: 'startup' },
    RUNWAY: { description: 'Runway', keywords: 20, patterns: 12, family: 'startup' },
    GROWTH_RATE: { description: 'Growth rate', keywords: 20, patterns: 12, family: 'growth' },
    CAGR: { description: 'Compound annual growth rate (CAGR)', keywords: 20, patterns: 12, family: 'growth' },
    SENSITIVITY_METRIC: { description: 'Sensitivity analysis metric', keywords: 15, patterns: 10, family: 'analysis' },
    SCENARIO_VARIANCE: { description: 'Scenario variance', keywords: 15, patterns: 10, family: 'analysis' },
    FINANCIAL_EXPOSURE: { description: 'Financial exposure', keywords: 15, patterns: 10, family: 'risk' }
  },

  // Financial document types
  docTypes: {
    BALANCE_SHEET: { description: 'Balance sheet', keywords: 25, patterns: 15, family: 'statement' },
    INCOME_STATEMENT: { description: 'Income statement', keywords: 25, patterns: 15, family: 'statement' },
    CASH_FLOW_STATEMENT: { description: 'Cash flow statement', keywords: 25, patterns: 15, family: 'statement' },
    BUDGET: { description: 'Budget', keywords: 25, patterns: 15, family: 'planning' },
    FORECAST: { description: 'Forecast', keywords: 25, patterns: 15, family: 'planning' },
    FINANCIAL_MODEL: { description: 'Financial model', keywords: 20, patterns: 12, family: 'planning' },
    INVESTMENT_MEMO: { description: 'Investment memo', keywords: 20, patterns: 12, family: 'investment' },
    VALUATION_REPORT: { description: 'Valuation report', keywords: 20, patterns: 12, family: 'investment' },
    AUDIT_REPORT: { description: 'Audit report', keywords: 20, patterns: 12, family: 'audit' },
    MANAGEMENT_ACCOUNTS: { description: 'Management accounts', keywords: 20, patterns: 12, family: 'reporting' },
    CAP_TABLE: { description: 'Cap table', keywords: 20, patterns: 12, family: 'equity' },
    LOAN_AGREEMENT: { description: 'Loan agreement', keywords: 20, patterns: 12, family: 'debt' },
    FINANCIAL_COVENANT: { description: 'Financial covenant', keywords: 20, patterns: 12, family: 'debt' },
    EXPENSE_REPORT: { description: 'Expense report', keywords: 20, patterns: 12, family: 'operations' },
    COST_ALLOCATION: { description: 'Cost allocation sheet', keywords: 20, patterns: 12, family: 'operations' }
  },

  // Definition modes - How to explain financial terms
  definitionModes: {
    CONTEXTUAL: { description: 'Contextual financial definition', keywords: 20, patterns: 12 },
    OPERATIONAL: { description: 'Operational financial definition', keywords: 20, patterns: 12 },
    COMPARATIVE: { description: 'Comparative financial definition', keywords: 20, patterns: 12 },
    SIMPLIFIED: { description: 'Simplified financial definition', keywords: 20, patterns: 12 },
    FORMAL: { description: 'Formal financial definition', keywords: 20, patterns: 12 }
  },

  // Analytical depth levels
  depth: {
    METRIC_LOOKUP: { description: 'Metric lookup', keywords: 15, patterns: 10, depth: 1 },
    CONTEXTUAL_EXPLANATION: { description: 'Contextual explanation', keywords: 15, patterns: 10, depth: 2 },
    CROSS_PERIOD_COMPARISON: { description: 'Cross-period comparison', keywords: 20, patterns: 12, depth: 3 },
    TREND_ANALYSIS: { description: 'Trend analysis', keywords: 20, patterns: 12, depth: 4 },
    SENSITIVITY_ANALYSIS: { description: 'Sensitivity analysis', keywords: 20, patterns: 12, depth: 5 },
    SCENARIO_COMPARISON: { description: 'Scenario comparison', keywords: 20, patterns: 12, depth: 6 },
    RISK_IMPACT_ANALYSIS: { description: 'Risk impact analysis', keywords: 20, patterns: 12, depth: 7 },
    CAPITAL_EFFICIENCY: { description: 'Capital efficiency analysis', keywords: 15, patterns: 10, depth: 8 },
    LIQUIDITY_STRESS: { description: 'Liquidity stress analysis', keywords: 15, patterns: 10, depth: 8 }
  },

  // Output control - How to present financial info
  outputControl: {
    TABLE_OUTPUT: { description: 'Table-based output', keywords: 20, patterns: 12, family: 'format' },
    METRIC_COMPARISON: { description: 'Metric comparison table', keywords: 15, patterns: 10, family: 'format' },
    SCENARIO_MATRIX: { description: 'Scenario matrix', keywords: 15, patterns: 10, family: 'format' },
    BULLET_EXPLANATION: { description: 'Bullet-point explanation', keywords: 15, patterns: 10, family: 'format' },
    NUMERIC_EMPHASIS: { description: 'Inline numeric emphasis', keywords: 15, patterns: 10, family: 'format' },
    HIGHLIGHT_RISK: { description: 'Highlight financial risk', keywords: 15, patterns: 10, family: 'emphasis' },
    HIGHLIGHT_ASSUMPTIONS: { description: 'Highlight assumptions', keywords: 15, patterns: 10, family: 'emphasis' },
    HIGHLIGHT_DRIVERS: { description: 'Highlight key drivers', keywords: 15, patterns: 10, family: 'emphasis' }
  }
};

// ============================================================================
// ACCOUNTING DOMAIN - Accounting Intelligence (~2,400/lang)
// ============================================================================

export const ACCOUNTING = {
  // Core accounting concepts
  concepts: {
    ASSET: { description: 'Asset', keywords: 25, patterns: 15, family: 'core' },
    LIABILITY: { description: 'Liability', keywords: 25, patterns: 15, family: 'core' },
    EQUITY_ACC: { description: 'Equity (accounting)', keywords: 25, patterns: 15, family: 'core' },
    REVENUE_RECOGNITION: { description: 'Revenue recognition', keywords: 20, patterns: 12, family: 'principle' },
    ACCRUAL: { description: 'Accrual', keywords: 20, patterns: 12, family: 'method' },
    DEFERRAL: { description: 'Deferral', keywords: 20, patterns: 12, family: 'method' },
    JOURNAL_ENTRY: { description: 'Journal entry', keywords: 20, patterns: 12, family: 'record' },
    LEDGER: { description: 'Ledger', keywords: 20, patterns: 12, family: 'record' },
    TRIAL_BALANCE: { description: 'Trial balance', keywords: 20, patterns: 12, family: 'record' },
    ADJUSTING_ENTRY: { description: 'Adjusting entry', keywords: 20, patterns: 12, family: 'record' },
    CLOSING_ENTRY: { description: 'Closing entry', keywords: 20, patterns: 12, family: 'record' },
    CHART_OF_ACCOUNTS: { description: 'Chart of accounts', keywords: 20, patterns: 12, family: 'structure' },
    COST_ALLOCATION_ACC: { description: 'Cost allocation', keywords: 20, patterns: 12, family: 'cost' },
    INVENTORY_VALUATION: { description: 'Inventory valuation', keywords: 20, patterns: 12, family: 'valuation' },
    DEPRECIATION_METHOD: { description: 'Depreciation method', keywords: 20, patterns: 12, family: 'method' },
    AMORTIZATION_SCHEDULE: { description: 'Amortization schedule', keywords: 20, patterns: 12, family: 'method' },
    IMPAIRMENT: { description: 'Impairment', keywords: 20, patterns: 12, family: 'adjustment' },
    PROVISION: { description: 'Provision', keywords: 20, patterns: 12, family: 'adjustment' },
    RESERVE: { description: 'Reserve', keywords: 20, patterns: 12, family: 'adjustment' },
    WRITE_OFF: { description: 'Write-off', keywords: 20, patterns: 12, family: 'adjustment' },
    WRITE_DOWN: { description: 'Write-down', keywords: 20, patterns: 12, family: 'adjustment' },
    MATCHING_PRINCIPLE: { description: 'Matching principle', keywords: 20, patterns: 12, family: 'principle' },
    GOING_CONCERN: { description: 'Going concern', keywords: 20, patterns: 12, family: 'principle' },
    MATERIALITY: { description: 'Materiality', keywords: 20, patterns: 12, family: 'principle' },
    CONSISTENCY_PRINCIPLE: { description: 'Consistency principle', keywords: 20, patterns: 12, family: 'principle' },
    CONSERVATISM: { description: 'Conservatism principle', keywords: 20, patterns: 12, family: 'principle' }
  },

  // Accounting standards
  standards: {
    GAAP: { description: 'GAAP', keywords: 25, patterns: 15, family: 'standard' },
    IFRS: { description: 'IFRS', keywords: 25, patterns: 15, family: 'standard' },
    ACCRUAL_ACCOUNTING: { description: 'Accrual accounting', keywords: 20, patterns: 12, family: 'basis' },
    CASH_ACCOUNTING: { description: 'Cash accounting', keywords: 20, patterns: 12, family: 'basis' },
    AUDIT_ADJUSTMENT: { description: 'Audit adjustment', keywords: 20, patterns: 12, family: 'audit' },
    RESTATEMENT: { description: 'Restatement', keywords: 20, patterns: 12, family: 'audit' },
    ACCOUNTING_ESTIMATE: { description: 'Accounting estimate', keywords: 20, patterns: 12, family: 'estimate' },
    ACCOUNTING_POLICY: { description: 'Accounting policy', keywords: 20, patterns: 12, family: 'policy' }
  },

  // Definition modes
  definitionModes: {
    CONTEXTUAL_ACC: { description: 'Contextual accounting definition', keywords: 20, patterns: 12 },
    POLICY_BASED: { description: 'Policy-based definition', keywords: 20, patterns: 12 },
    TREATMENT_BASED: { description: 'Treatment-based definition', keywords: 20, patterns: 12 },
    SIMPLIFIED_ACC: { description: 'Simplified accounting definition', keywords: 20, patterns: 12 },
    FORMAL_ACC: { description: 'Formal accounting definition', keywords: 20, patterns: 12 }
  },

  // Output control
  outputControl: {
    JOURNAL_FORMAT: { description: 'Journal entry format', keywords: 15, patterns: 10, family: 'format' },
    T_ACCOUNT_FORMAT: { description: 'T-account format', keywords: 15, patterns: 10, family: 'format' },
    POLICY_REFERENCE: { description: 'Policy reference', keywords: 15, patterns: 10, family: 'reference' },
    STANDARD_CITATION: { description: 'Standard citation', keywords: 15, patterns: 10, family: 'reference' }
  }
};

// ============================================================================
// LEGAL DOMAIN - Legal Intelligence (~2,200/lang)
// ============================================================================

export const LEGAL = {
  // Core legal concepts
  concepts: {
    CONTRACT: { description: 'Contract', keywords: 25, patterns: 15, family: 'agreement' },
    AGREEMENT: { description: 'Agreement', keywords: 25, patterns: 15, family: 'agreement' },
    CLAUSE: { description: 'Clause', keywords: 25, patterns: 15, family: 'structure' },
    PROVISION: { description: 'Provision', keywords: 25, patterns: 15, family: 'structure' },
    OBLIGATION: { description: 'Obligation', keywords: 25, patterns: 15, family: 'duty' },
    RIGHT: { description: 'Right', keywords: 25, patterns: 15, family: 'duty' },
    LIABILITY_LEG: { description: 'Liability (legal)', keywords: 25, patterns: 15, family: 'risk' },
    INDEMNIFICATION: { description: 'Indemnification', keywords: 20, patterns: 12, family: 'protection' },
    WARRANTY: { description: 'Warranty', keywords: 20, patterns: 12, family: 'protection' },
    REPRESENTATION: { description: 'Representation', keywords: 20, patterns: 12, family: 'protection' },
    COVENANT: { description: 'Covenant', keywords: 20, patterns: 12, family: 'commitment' },
    TERMINATION: { description: 'Termination', keywords: 20, patterns: 12, family: 'end' },
    BREACH: { description: 'Breach', keywords: 20, patterns: 12, family: 'violation' },
    DEFAULT: { description: 'Default', keywords: 20, patterns: 12, family: 'violation' },
    REMEDY: { description: 'Remedy', keywords: 20, patterns: 12, family: 'resolution' },
    PENALTY: { description: 'Penalty', keywords: 20, patterns: 12, family: 'consequence' },
    DAMAGES: { description: 'Damages', keywords: 20, patterns: 12, family: 'consequence' },
    GOVERNING_LAW: { description: 'Governing law', keywords: 20, patterns: 12, family: 'jurisdiction' },
    JURISDICTION: { description: 'Jurisdiction', keywords: 20, patterns: 12, family: 'jurisdiction' },
    COMPLIANCE: { description: 'Compliance', keywords: 20, patterns: 12, family: 'requirement' },
    CONFIDENTIALITY: { description: 'Confidentiality', keywords: 20, patterns: 12, family: 'protection' },
    NON_DISCLOSURE: { description: 'Non-disclosure', keywords: 20, patterns: 12, family: 'protection' },
    FORCE_MAJEURE: { description: 'Force majeure', keywords: 20, patterns: 12, family: 'exception' },
    ASSIGNMENT: { description: 'Assignment', keywords: 20, patterns: 12, family: 'transfer' },
    AMENDMENT: { description: 'Amendment', keywords: 20, patterns: 12, family: 'change' },
    WAIVER: { description: 'Waiver', keywords: 20, patterns: 12, family: 'exception' },
    SEVERABILITY: { description: 'Severability', keywords: 20, patterns: 12, family: 'structure' },
    NOTICE: { description: 'Notice', keywords: 20, patterns: 12, family: 'communication' }
  },

  // Definition modes
  definitionModes: {
    DOCUMENT_ANCHORED: { description: 'Document-anchored definition', keywords: 20, patterns: 12 },
    CLAUSE_LEVEL: { description: 'Clause-level definition', keywords: 20, patterns: 12 },
    COMPARATIVE_LEG: { description: 'Comparative legal definition', keywords: 20, patterns: 12 },
    SIMPLIFIED_LEG: { description: 'Simplified legal definition', keywords: 20, patterns: 12 },
    FORMAL_LEG: { description: 'Formal legal definition', keywords: 20, patterns: 12 }
  },

  // Output control
  outputControl: {
    CLAUSE_REFERENCE: { description: 'Clause reference format', keywords: 15, patterns: 10, family: 'format' },
    SECTION_CITATION: { description: 'Section citation', keywords: 15, patterns: 10, family: 'format' },
    RISK_HIGHLIGHT: { description: 'Risk highlight', keywords: 15, patterns: 10, family: 'emphasis' },
    OBLIGATION_LIST: { description: 'Obligation list', keywords: 15, patterns: 10, family: 'format' },
    DISCLAIMER_NOTE: { description: 'Disclaimer note (no legal advice)', keywords: 20, patterns: 12, family: 'safety' }
  }
};

// ============================================================================
// MEDICAL DOMAIN - Medical Intelligence (~2,000/lang)
// ============================================================================

export const MEDICAL = {
  // Core medical concepts
  concepts: {
    DIAGNOSIS: { description: 'Diagnosis', keywords: 25, patterns: 15, family: 'assessment' },
    SYMPTOM: { description: 'Symptom', keywords: 25, patterns: 15, family: 'presentation' },
    CONDITION: { description: 'Condition', keywords: 25, patterns: 15, family: 'assessment' },
    TREATMENT: { description: 'Treatment', keywords: 25, patterns: 15, family: 'intervention' },
    THERAPY: { description: 'Therapy', keywords: 20, patterns: 12, family: 'intervention' },
    MEDICATION: { description: 'Medication', keywords: 25, patterns: 15, family: 'intervention' },
    DOSAGE: { description: 'Dosage', keywords: 20, patterns: 12, family: 'intervention' },
    SIDE_EFFECT: { description: 'Side effect', keywords: 20, patterns: 12, family: 'risk' },
    CONTRAINDICATION: { description: 'Contraindication', keywords: 20, patterns: 12, family: 'risk' },
    RISK_FACTOR: { description: 'Risk factor', keywords: 20, patterns: 12, family: 'risk' },
    PROGNOSIS: { description: 'Prognosis', keywords: 20, patterns: 12, family: 'outcome' },
    OUTCOME: { description: 'Outcome', keywords: 20, patterns: 12, family: 'outcome' },
    CLINICAL_FINDING: { description: 'Clinical finding', keywords: 20, patterns: 12, family: 'data' },
    MEDICAL_HISTORY: { description: 'Medical history', keywords: 20, patterns: 12, family: 'data' },
    LAB_RESULT: { description: 'Lab result', keywords: 20, patterns: 12, family: 'data' },
    VITAL_SIGN: { description: 'Vital sign', keywords: 20, patterns: 12, family: 'data' },
    REFERENCE_RANGE: { description: 'Reference range', keywords: 20, patterns: 12, family: 'data' },
    ABNORMAL_FINDING: { description: 'Abnormal finding', keywords: 20, patterns: 12, family: 'data' },
    MEDICAL_GUIDELINE: { description: 'Medical guideline', keywords: 20, patterns: 12, family: 'evidence' },
    EVIDENCE_LEVEL: { description: 'Evidence level', keywords: 20, patterns: 12, family: 'evidence' },
    CLINICAL_TRIAL: { description: 'Clinical trial', keywords: 20, patterns: 12, family: 'evidence' },
    ADVERSE_EVENT: { description: 'Adverse event', keywords: 20, patterns: 12, family: 'risk' },
    COMORBIDITY: { description: 'Comorbidity', keywords: 20, patterns: 12, family: 'context' },
    SCREENING: { description: 'Screening', keywords: 20, patterns: 12, family: 'prevention' }
  },

  // Definition modes
  definitionModes: {
    CONTEXTUAL_MED: { description: 'Contextual medical definition', keywords: 20, patterns: 12 },
    NON_DIAGNOSTIC: { description: 'Non-diagnostic explanation', keywords: 25, patterns: 15 },
    SIMPLIFIED_MED: { description: 'Simplified medical definition', keywords: 20, patterns: 12 },
    EVIDENCE_BASED: { description: 'Evidence-based definition', keywords: 20, patterns: 12 },
    SAFETY_FRAMED: { description: 'Safety-framed definition', keywords: 20, patterns: 12 }
  },

  // Output control
  outputControl: {
    DISCLAIMER_MEDICAL: { description: 'Medical disclaimer (no diagnosis)', keywords: 25, patterns: 15, family: 'safety' },
    CAUTION_LANGUAGE: { description: 'Caution language', keywords: 20, patterns: 12, family: 'safety' },
    UNCERTAINTY_EXPLICIT: { description: 'Uncertainty explicit', keywords: 15, patterns: 10, family: 'safety' },
    EVIDENCE_CITATION: { description: 'Evidence citation', keywords: 15, patterns: 10, family: 'reference' },
    CONSULT_PROFESSIONAL: { description: 'Consult professional note', keywords: 20, patterns: 12, family: 'safety' }
  }
};

// ============================================================================
// ENGINEERING DOMAIN - Technical/Engineering Intelligence (~2,200/lang)
// ============================================================================

export const ENGINEERING = {
  // Core technical concepts
  concepts: {
    SPECIFICATION: { description: 'Specification', keywords: 25, patterns: 15, family: 'definition' },
    REQUIREMENT: { description: 'Requirement', keywords: 25, patterns: 15, family: 'definition' },
    CONSTRAINT: { description: 'Constraint', keywords: 25, patterns: 15, family: 'definition' },
    DEPENDENCY: { description: 'Dependency', keywords: 20, patterns: 12, family: 'relationship' },
    ASSUMPTION: { description: 'Assumption', keywords: 20, patterns: 12, family: 'context' },
    PARAMETER: { description: 'Parameter', keywords: 20, patterns: 12, family: 'variable' },
    VARIABLE: { description: 'Variable', keywords: 20, patterns: 12, family: 'variable' },
    INPUT: { description: 'Input', keywords: 20, patterns: 12, family: 'io' },
    OUTPUT: { description: 'Output', keywords: 20, patterns: 12, family: 'io' },
    SYSTEM_BOUNDARY: { description: 'System boundary', keywords: 20, patterns: 12, family: 'architecture' },
    ARCHITECTURE: { description: 'Architecture', keywords: 25, patterns: 15, family: 'architecture' },
    COMPONENT: { description: 'Component', keywords: 25, patterns: 15, family: 'architecture' },
    INTERFACE: { description: 'Interface', keywords: 25, patterns: 15, family: 'architecture' },
    INTEGRATION: { description: 'Integration', keywords: 20, patterns: 12, family: 'architecture' },
    VALIDATION: { description: 'Validation', keywords: 20, patterns: 12, family: 'verification' },
    VERIFICATION: { description: 'Verification', keywords: 20, patterns: 12, family: 'verification' },
    TOLERANCE: { description: 'Tolerance', keywords: 20, patterns: 12, family: 'quality' },
    LOAD: { description: 'Load', keywords: 20, patterns: 12, family: 'performance' },
    CAPACITY: { description: 'Capacity', keywords: 20, patterns: 12, family: 'performance' },
    PERFORMANCE: { description: 'Performance', keywords: 25, patterns: 15, family: 'performance' },
    FAILURE_MODE: { description: 'Failure mode', keywords: 20, patterns: 12, family: 'risk' },
    RISK_ENG: { description: 'Risk (engineering)', keywords: 20, patterns: 12, family: 'risk' },
    MITIGATION: { description: 'Mitigation', keywords: 20, patterns: 12, family: 'risk' },
    TRADE_OFF: { description: 'Trade-off', keywords: 20, patterns: 12, family: 'decision' },
    OPTIMIZATION: { description: 'Optimization', keywords: 20, patterns: 12, family: 'decision' },
    SCALABILITY: { description: 'Scalability', keywords: 20, patterns: 12, family: 'quality' },
    RELIABILITY: { description: 'Reliability', keywords: 20, patterns: 12, family: 'quality' },
    MAINTAINABILITY: { description: 'Maintainability', keywords: 20, patterns: 12, family: 'quality' },
    TEST_CASE: { description: 'Test case', keywords: 20, patterns: 12, family: 'verification' }
  },

  // Definition modes
  definitionModes: {
    FUNCTIONAL: { description: 'Functional definition', keywords: 20, patterns: 12 },
    CONSTRAINT_BASED: { description: 'Constraint-based definition', keywords: 20, patterns: 12 },
    SIMPLIFIED_ENG: { description: 'Simplified technical definition', keywords: 20, patterns: 12 },
    COMPARATIVE_ENG: { description: 'Comparative technical definition', keywords: 20, patterns: 12 },
    FORMAL_ENG: { description: 'Formal technical definition', keywords: 20, patterns: 12 }
  },

  // Output control
  outputControl: {
    SPEC_FORMAT: { description: 'Specification format', keywords: 15, patterns: 10, family: 'format' },
    REQUIREMENTS_LIST: { description: 'Requirements list', keywords: 15, patterns: 10, family: 'format' },
    ASSUMPTIONS_EXPLICIT: { description: 'Assumptions explicit', keywords: 15, patterns: 10, family: 'emphasis' },
    CONSTRAINTS_EXPLICIT: { description: 'Constraints explicit', keywords: 15, patterns: 10, family: 'emphasis' },
    TRADEOFF_TABLE: { description: 'Trade-off table', keywords: 15, patterns: 10, family: 'format' }
  }
};

// ============================================================================
// BATCH CONFIGURATION
// ============================================================================

export const BATCH_SIZE = {
  keywords: 25,
  patterns: 15
};

// ============================================================================
// JOB GENERATION
// ============================================================================

export function generateAllJobs() {
  const jobs = [];

  for (const language of SUPPORTED_LANGUAGES) {
    // ========== DOCUMENTS INTENT ==========

    // Document States
    for (const [key, config] of Object.entries(DOCUMENTS.states)) {
      // Keywords
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `doc_states_kw.${language}.${key}.p${part}`,
          artifactType: 'documents_states_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'DOCUMENTS',
          layer: 'states',
          depthRange: config.depthRange
        });
      }
      // Patterns
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `doc_states_pat.${language}.${key}.p${part}`,
          artifactType: 'documents_states_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'DOCUMENTS',
          layer: 'states',
          depthRange: config.depthRange
        });
      }
    }

    // Document Actions
    for (const [key, config] of Object.entries(DOCUMENTS.actions)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `doc_actions_kw.${language}.${key}.p${part}`,
          artifactType: 'documents_actions_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'DOCUMENTS',
          layer: 'actions',
          family: config.family,
          depthRange: config.depthRange
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `doc_actions_pat.${language}.${key}.p${part}`,
          artifactType: 'documents_actions_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'DOCUMENTS',
          layer: 'actions',
          family: config.family,
          depthRange: config.depthRange
        });
      }
    }

    // Document Scope
    for (const [key, config] of Object.entries(DOCUMENTS.scope)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `doc_scope_kw.${language}.${key}.p${part}`,
          artifactType: 'documents_scope_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'DOCUMENTS',
          layer: 'scope',
          depthRange: config.depthRange
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `doc_scope_pat.${language}.${key}.p${part}`,
          artifactType: 'documents_scope_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'DOCUMENTS',
          layer: 'scope',
          depthRange: config.depthRange
        });
      }
    }

    // Analytical Depth
    for (const [key, config] of Object.entries(DOCUMENTS.analyticalDepth)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `doc_depth_kw.${language}.${key}.p${part}`,
          artifactType: 'documents_depth_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'DOCUMENTS',
          layer: 'analyticalDepth',
          depth: config.depth
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `doc_depth_pat.${language}.${key}.p${part}`,
          artifactType: 'documents_depth_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'DOCUMENTS',
          layer: 'analyticalDepth',
          depth: config.depth
        });
      }
    }

    // Evidence & Trust
    for (const [key, config] of Object.entries(DOCUMENTS.evidenceTrust)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `doc_evidence_kw.${language}.${key}.p${part}`,
          artifactType: 'documents_evidence_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'DOCUMENTS',
          layer: 'evidenceTrust',
          depth: config.depth
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `doc_evidence_pat.${language}.${key}.p${part}`,
          artifactType: 'documents_evidence_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'DOCUMENTS',
          layer: 'evidenceTrust',
          depth: config.depth
        });
      }
    }

    // Output Control
    for (const [key, config] of Object.entries(DOCUMENTS.outputControl)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `doc_output_kw.${language}.${key}.p${part}`,
          artifactType: 'documents_output_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'DOCUMENTS',
          layer: 'outputControl',
          family: config.family,
          depthRange: config.depthRange
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `doc_output_pat.${language}.${key}.p${part}`,
          artifactType: 'documents_output_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'DOCUMENTS',
          layer: 'outputControl',
          family: config.family,
          depthRange: config.depthRange
        });
      }
    }

    // Domain Overlays
    for (const [key, config] of Object.entries(DOCUMENTS.domainOverlays)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `doc_domain_kw.${language}.${key}.p${part}`,
          artifactType: 'documents_domain_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'DOCUMENTS',
          layer: 'domainOverlays'
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `doc_domain_pat.${language}.${key}.p${part}`,
          artifactType: 'documents_domain_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'DOCUMENTS',
          layer: 'domainOverlays'
        });
      }
    }

    // ========== HELP INTENT ==========

    // Help States
    for (const [key, config] of Object.entries(HELP.states)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `help_states_kw.${language}.${key}.p${part}`,
          artifactType: 'help_states_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'HELP',
          layer: 'states',
          depthRange: config.depthRange
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `help_states_pat.${language}.${key}.p${part}`,
          artifactType: 'help_states_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'HELP',
          layer: 'states',
          depthRange: config.depthRange
        });
      }
    }

    // Help Actions
    for (const [key, config] of Object.entries(HELP.actions)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `help_actions_kw.${language}.${key}.p${part}`,
          artifactType: 'help_actions_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'HELP',
          layer: 'actions',
          depthRange: config.depthRange
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `help_actions_pat.${language}.${key}.p${part}`,
          artifactType: 'help_actions_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'HELP',
          layer: 'actions',
          depthRange: config.depthRange
        });
      }
    }

    // Help Depth
    for (const [key, config] of Object.entries(HELP.depth)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `help_depth_kw.${language}.${key}.p${part}`,
          artifactType: 'help_depth_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'HELP',
          layer: 'depth',
          depth: config.depth
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `help_depth_pat.${language}.${key}.p${part}`,
          artifactType: 'help_depth_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'HELP',
          layer: 'depth',
          depth: config.depth
        });
      }
    }

    // Help Output
    for (const [key, config] of Object.entries(HELP.outputControl)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `help_output_kw.${language}.${key}.p${part}`,
          artifactType: 'help_output_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'HELP',
          layer: 'outputControl'
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `help_output_pat.${language}.${key}.p${part}`,
          artifactType: 'help_output_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'HELP',
          layer: 'outputControl'
        });
      }
    }

    // ========== CONVERSATION INTENT ==========

    // Conversation States
    for (const [key, config] of Object.entries(CONVERSATION.states)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `conv_states_kw.${language}.${key}.p${part}`,
          artifactType: 'conversation_states_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'CONVERSATION',
          layer: 'states',
          depthRange: config.depthRange
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `conv_states_pat.${language}.${key}.p${part}`,
          artifactType: 'conversation_states_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'CONVERSATION',
          layer: 'states',
          depthRange: config.depthRange
        });
      }
    }

    // Conversation Actions
    for (const [key, config] of Object.entries(CONVERSATION.actions)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `conv_actions_kw.${language}.${key}.p${part}`,
          artifactType: 'conversation_actions_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'CONVERSATION',
          layer: 'actions',
          depthRange: config.depthRange
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `conv_actions_pat.${language}.${key}.p${part}`,
          artifactType: 'conversation_actions_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'CONVERSATION',
          layer: 'actions',
          depthRange: config.depthRange
        });
      }
    }

    // Conversation Depth
    for (const [key, config] of Object.entries(CONVERSATION.depth)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `conv_depth_kw.${language}.${key}.p${part}`,
          artifactType: 'conversation_depth_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'CONVERSATION',
          layer: 'depth',
          depth: config.depth
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `conv_depth_pat.${language}.${key}.p${part}`,
          artifactType: 'conversation_depth_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'CONVERSATION',
          layer: 'depth',
          depth: config.depth
        });
      }
    }

    // Conversation Output
    for (const [key, config] of Object.entries(CONVERSATION.outputControl)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `conv_output_kw.${language}.${key}.p${part}`,
          artifactType: 'conversation_output_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'CONVERSATION',
          layer: 'outputControl'
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `conv_output_pat.${language}.${key}.p${part}`,
          artifactType: 'conversation_output_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'CONVERSATION',
          layer: 'outputControl'
        });
      }
    }

    // ========== EDIT INTENT ==========

    // Edit States
    for (const [key, config] of Object.entries(EDIT.states)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `edit_states_kw.${language}.${key}.p${part}`,
          artifactType: 'edit_states_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'EDIT',
          layer: 'states',
          depthRange: config.depthRange
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `edit_states_pat.${language}.${key}.p${part}`,
          artifactType: 'edit_states_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'EDIT',
          layer: 'states',
          depthRange: config.depthRange
        });
      }
    }

    // Edit Actions
    for (const [key, config] of Object.entries(EDIT.actions)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `edit_actions_kw.${language}.${key}.p${part}`,
          artifactType: 'edit_actions_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'EDIT',
          layer: 'actions',
          family: config.family,
          depthRange: config.depthRange
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `edit_actions_pat.${language}.${key}.p${part}`,
          artifactType: 'edit_actions_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'EDIT',
          layer: 'actions',
          family: config.family,
          depthRange: config.depthRange
        });
      }
    }

    // Edit Scope
    for (const [key, config] of Object.entries(EDIT.scope)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `edit_scope_kw.${language}.${key}.p${part}`,
          artifactType: 'edit_scope_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'EDIT',
          layer: 'scope',
          depthRange: config.depthRange
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `edit_scope_pat.${language}.${key}.p${part}`,
          artifactType: 'edit_scope_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'EDIT',
          layer: 'scope',
          depthRange: config.depthRange
        });
      }
    }

    // Edit Depth
    for (const [key, config] of Object.entries(EDIT.depth)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `edit_depth_kw.${language}.${key}.p${part}`,
          artifactType: 'edit_depth_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'EDIT',
          layer: 'depth',
          depth: config.depth
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `edit_depth_pat.${language}.${key}.p${part}`,
          artifactType: 'edit_depth_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'EDIT',
          layer: 'depth',
          depth: config.depth
        });
      }
    }

    // Edit Output
    for (const [key, config] of Object.entries(EDIT.outputControl)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `edit_output_kw.${language}.${key}.p${part}`,
          artifactType: 'edit_output_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'EDIT',
          layer: 'outputControl',
          family: config.family,
          depthRange: config.depthRange
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `edit_output_pat.${language}.${key}.p${part}`,
          artifactType: 'edit_output_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'EDIT',
          layer: 'outputControl',
          family: config.family,
          depthRange: config.depthRange
        });
      }
    }

    // ========== MEMORY INTENT ==========

    // Memory States
    for (const [key, config] of Object.entries(MEMORY.states)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `mem_states_kw.${language}.${key}.p${part}`,
          artifactType: 'memory_states_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'MEMORY',
          layer: 'states',
          depthRange: config.depthRange
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `mem_states_pat.${language}.${key}.p${part}`,
          artifactType: 'memory_states_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'MEMORY',
          layer: 'states',
          depthRange: config.depthRange
        });
      }
    }

    // Memory Actions
    for (const [key, config] of Object.entries(MEMORY.actions)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `mem_actions_kw.${language}.${key}.p${part}`,
          artifactType: 'memory_actions_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'MEMORY',
          layer: 'actions',
          family: config.family,
          depthRange: config.depthRange
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `mem_actions_pat.${language}.${key}.p${part}`,
          artifactType: 'memory_actions_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'MEMORY',
          layer: 'actions',
          family: config.family,
          depthRange: config.depthRange
        });
      }
    }

    // Memory Scope
    for (const [key, config] of Object.entries(MEMORY.scope)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `mem_scope_kw.${language}.${key}.p${part}`,
          artifactType: 'memory_scope_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'MEMORY',
          layer: 'scope',
          depthRange: config.depthRange
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `mem_scope_pat.${language}.${key}.p${part}`,
          artifactType: 'memory_scope_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'MEMORY',
          layer: 'scope',
          depthRange: config.depthRange
        });
      }
    }

    // Memory Depth
    for (const [key, config] of Object.entries(MEMORY.depth)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `mem_depth_kw.${language}.${key}.p${part}`,
          artifactType: 'memory_depth_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'MEMORY',
          layer: 'depth',
          depth: config.depth
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `mem_depth_pat.${language}.${key}.p${part}`,
          artifactType: 'memory_depth_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'MEMORY',
          layer: 'depth',
          depth: config.depth
        });
      }
    }

    // Memory Output
    for (const [key, config] of Object.entries(MEMORY.outputControl)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `mem_output_kw.${language}.${key}.p${part}`,
          artifactType: 'memory_output_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'MEMORY',
          layer: 'outputControl',
          family: config.family
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `mem_output_pat.${language}.${key}.p${part}`,
          artifactType: 'memory_output_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'MEMORY',
          layer: 'outputControl',
          family: config.family
        });
      }
    }

    // ========== PREFERENCES INTENT ==========

    // Preferences States
    for (const [key, config] of Object.entries(PREFERENCES.states)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `pref_states_kw.${language}.${key}.p${part}`,
          artifactType: 'preferences_states_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'PREFERENCES',
          layer: 'states',
          depthRange: config.depthRange
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `pref_states_pat.${language}.${key}.p${part}`,
          artifactType: 'preferences_states_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'PREFERENCES',
          layer: 'states',
          depthRange: config.depthRange
        });
      }
    }

    // Preferences Actions
    for (const [key, config] of Object.entries(PREFERENCES.actions)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `pref_actions_kw.${language}.${key}.p${part}`,
          artifactType: 'preferences_actions_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'PREFERENCES',
          layer: 'actions',
          family: config.family,
          depthRange: config.depthRange
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `pref_actions_pat.${language}.${key}.p${part}`,
          artifactType: 'preferences_actions_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'PREFERENCES',
          layer: 'actions',
          family: config.family,
          depthRange: config.depthRange
        });
      }
    }

    // Preferences Scope
    for (const [key, config] of Object.entries(PREFERENCES.scope)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `pref_scope_kw.${language}.${key}.p${part}`,
          artifactType: 'preferences_scope_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'PREFERENCES',
          layer: 'scope',
          depthRange: config.depthRange
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `pref_scope_pat.${language}.${key}.p${part}`,
          artifactType: 'preferences_scope_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'PREFERENCES',
          layer: 'scope',
          depthRange: config.depthRange
        });
      }
    }

    // Preferences Depth
    for (const [key, config] of Object.entries(PREFERENCES.depth)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `pref_depth_kw.${language}.${key}.p${part}`,
          artifactType: 'preferences_depth_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'PREFERENCES',
          layer: 'depth',
          depth: config.depth
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `pref_depth_pat.${language}.${key}.p${part}`,
          artifactType: 'preferences_depth_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'PREFERENCES',
          layer: 'depth',
          depth: config.depth
        });
      }
    }

    // Preferences Output
    for (const [key, config] of Object.entries(PREFERENCES.outputControl)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `pref_output_kw.${language}.${key}.p${part}`,
          artifactType: 'preferences_output_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'PREFERENCES',
          layer: 'outputControl',
          family: config.family
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `pref_output_pat.${language}.${key}.p${part}`,
          artifactType: 'preferences_output_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'PREFERENCES',
          layer: 'outputControl',
          family: config.family
        });
      }
    }

    // ========== EXTRACTION INTENT ==========

    // Extraction States
    for (const [key, config] of Object.entries(EXTRACTION.states)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `ext_states_kw.${language}.${key}.p${part}`,
          artifactType: 'extraction_states_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'EXTRACTION',
          layer: 'states',
          depthRange: config.depthRange
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `ext_states_pat.${language}.${key}.p${part}`,
          artifactType: 'extraction_states_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'EXTRACTION',
          layer: 'states',
          depthRange: config.depthRange
        });
      }
    }

    // Extraction Actions
    for (const [key, config] of Object.entries(EXTRACTION.actions)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `ext_actions_kw.${language}.${key}.p${part}`,
          artifactType: 'extraction_actions_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'EXTRACTION',
          layer: 'actions',
          family: config.family,
          depthRange: config.depthRange
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `ext_actions_pat.${language}.${key}.p${part}`,
          artifactType: 'extraction_actions_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'EXTRACTION',
          layer: 'actions',
          family: config.family,
          depthRange: config.depthRange
        });
      }
    }

    // Extraction Scope
    for (const [key, config] of Object.entries(EXTRACTION.scope)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `ext_scope_kw.${language}.${key}.p${part}`,
          artifactType: 'extraction_scope_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'EXTRACTION',
          layer: 'scope',
          depthRange: config.depthRange
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `ext_scope_pat.${language}.${key}.p${part}`,
          artifactType: 'extraction_scope_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'EXTRACTION',
          layer: 'scope',
          depthRange: config.depthRange
        });
      }
    }

    // Extraction Depth
    for (const [key, config] of Object.entries(EXTRACTION.depth)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `ext_depth_kw.${language}.${key}.p${part}`,
          artifactType: 'extraction_depth_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'EXTRACTION',
          layer: 'depth',
          depth: config.depth
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `ext_depth_pat.${language}.${key}.p${part}`,
          artifactType: 'extraction_depth_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'EXTRACTION',
          layer: 'depth',
          depth: config.depth
        });
      }
    }

    // Extraction Output
    for (const [key, config] of Object.entries(EXTRACTION.outputControl)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `ext_output_kw.${language}.${key}.p${part}`,
          artifactType: 'extraction_output_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'EXTRACTION',
          layer: 'outputControl',
          family: config.family
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `ext_output_pat.${language}.${key}.p${part}`,
          artifactType: 'extraction_output_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'EXTRACTION',
          layer: 'outputControl',
          family: config.family
        });
      }
    }

    // ========== ERROR INTENT ==========

    // Error States
    for (const [key, config] of Object.entries(ERROR.states)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `err_states_kw.${language}.${key}.p${part}`,
          artifactType: 'error_states_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'ERROR',
          layer: 'states',
          depthRange: config.depthRange
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `err_states_pat.${language}.${key}.p${part}`,
          artifactType: 'error_states_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'ERROR',
          layer: 'states',
          depthRange: config.depthRange
        });
      }
    }

    // Error Actions
    for (const [key, config] of Object.entries(ERROR.actions)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `err_actions_kw.${language}.${key}.p${part}`,
          artifactType: 'error_actions_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'ERROR',
          layer: 'actions',
          family: config.family,
          depthRange: config.depthRange
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `err_actions_pat.${language}.${key}.p${part}`,
          artifactType: 'error_actions_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'ERROR',
          layer: 'actions',
          family: config.family,
          depthRange: config.depthRange
        });
      }
    }

    // Error Scope
    for (const [key, config] of Object.entries(ERROR.scope)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `err_scope_kw.${language}.${key}.p${part}`,
          artifactType: 'error_scope_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'ERROR',
          layer: 'scope',
          depthRange: config.depthRange
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `err_scope_pat.${language}.${key}.p${part}`,
          artifactType: 'error_scope_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'ERROR',
          layer: 'scope',
          depthRange: config.depthRange
        });
      }
    }

    // Error Depth
    for (const [key, config] of Object.entries(ERROR.depth)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `err_depth_kw.${language}.${key}.p${part}`,
          artifactType: 'error_depth_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'ERROR',
          layer: 'depth',
          depth: config.depth
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `err_depth_pat.${language}.${key}.p${part}`,
          artifactType: 'error_depth_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'ERROR',
          layer: 'depth',
          depth: config.depth
        });
      }
    }

    // Error Output
    for (const [key, config] of Object.entries(ERROR.outputControl)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `err_output_kw.${language}.${key}.p${part}`,
          artifactType: 'error_output_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'ERROR',
          layer: 'outputControl',
          family: config.family
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `err_output_pat.${language}.${key}.p${part}`,
          artifactType: 'error_output_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'ERROR',
          layer: 'outputControl',
          family: config.family
        });
      }
    }

    // ========== REASONING INTENT ==========

    // Reasoning States
    for (const [key, config] of Object.entries(REASONING.states)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `rsn_states_kw.${language}.${key}.p${part}`,
          artifactType: 'reasoning_states_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'REASONING',
          layer: 'states',
          depthRange: config.depthRange
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `rsn_states_pat.${language}.${key}.p${part}`,
          artifactType: 'reasoning_states_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'REASONING',
          layer: 'states',
          depthRange: config.depthRange
        });
      }
    }

    // Reasoning Actions
    for (const [key, config] of Object.entries(REASONING.actions)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `rsn_actions_kw.${language}.${key}.p${part}`,
          artifactType: 'reasoning_actions_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'REASONING',
          layer: 'actions',
          family: config.family,
          depthRange: config.depthRange
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `rsn_actions_pat.${language}.${key}.p${part}`,
          artifactType: 'reasoning_actions_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'REASONING',
          layer: 'actions',
          family: config.family,
          depthRange: config.depthRange
        });
      }
    }

    // Reasoning Scope
    for (const [key, config] of Object.entries(REASONING.scope)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `rsn_scope_kw.${language}.${key}.p${part}`,
          artifactType: 'reasoning_scope_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'REASONING',
          layer: 'scope',
          depthRange: config.depthRange
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `rsn_scope_pat.${language}.${key}.p${part}`,
          artifactType: 'reasoning_scope_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'REASONING',
          layer: 'scope',
          depthRange: config.depthRange
        });
      }
    }

    // Reasoning Depth
    for (const [key, config] of Object.entries(REASONING.depth)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `rsn_depth_kw.${language}.${key}.p${part}`,
          artifactType: 'reasoning_depth_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'REASONING',
          layer: 'depth',
          depth: config.depth
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `rsn_depth_pat.${language}.${key}.p${part}`,
          artifactType: 'reasoning_depth_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'REASONING',
          layer: 'depth',
          depth: config.depth
        });
      }
    }

    // Reasoning Output
    for (const [key, config] of Object.entries(REASONING.outputControl)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `rsn_output_kw.${language}.${key}.p${part}`,
          artifactType: 'reasoning_output_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'REASONING',
          layer: 'outputControl',
          family: config.family
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `rsn_output_pat.${language}.${key}.p${part}`,
          artifactType: 'reasoning_output_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'REASONING',
          layer: 'outputControl',
          family: config.family
        });
      }
    }

    // Reasoning Evidence & Trust (NEW)
    for (const [key, config] of Object.entries(REASONING.evidenceTrust)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `rsn_evidence_kw.${language}.${key}.p${part}`,
          artifactType: 'reasoning_evidence_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'REASONING',
          layer: 'evidenceTrust',
          depth: config.depth
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `rsn_evidence_pat.${language}.${key}.p${part}`,
          artifactType: 'reasoning_evidence_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'REASONING',
          layer: 'evidenceTrust',
          depth: config.depth
        });
      }
    }

    // Reasoning Termination Conditions (NEW)
    for (const [key, config] of Object.entries(REASONING.terminationConditions)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `rsn_termination_kw.${language}.${key}.p${part}`,
          artifactType: 'reasoning_termination_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'REASONING',
          layer: 'terminationConditions',
          depth: config.depth
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `rsn_termination_pat.${language}.${key}.p${part}`,
          artifactType: 'reasoning_termination_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'REASONING',
          layer: 'terminationConditions',
          depth: config.depth
        });
      }
    }

    // Reasoning Memory (NEW)
    for (const [key, config] of Object.entries(REASONING.reasoningMemory)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `rsn_memory_kw.${language}.${key}.p${part}`,
          artifactType: 'reasoning_memory_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'REASONING',
          layer: 'reasoningMemory',
          depthRange: config.depthRange
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `rsn_memory_pat.${language}.${key}.p${part}`,
          artifactType: 'reasoning_memory_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'REASONING',
          layer: 'reasoningMemory',
          depthRange: config.depthRange
        });
      }
    }

    // Reasoning Failure Modes (NEW)
    for (const [key, config] of Object.entries(REASONING.failureModes)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `rsn_failure_kw.${language}.${key}.p${part}`,
          artifactType: 'reasoning_failure_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'REASONING',
          layer: 'failureModes',
          depthRange: config.depthRange
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `rsn_failure_pat.${language}.${key}.p${part}`,
          artifactType: 'reasoning_failure_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'REASONING',
          layer: 'failureModes',
          depthRange: config.depthRange
        });
      }
    }
  }

  // ========== FILE_ACTION INTENT ==========
  for (const language of SUPPORTED_LANGUAGES) {
    // File Action States
    for (const [key, config] of Object.entries(FILE_ACTION.states)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `file_state_kw.${language}.${key}.p${part}`,
          artifactType: 'file_state_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'FILE_ACTION',
          layer: 'states'
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `file_state_pat.${language}.${key}.p${part}`,
          artifactType: 'file_state_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'FILE_ACTION',
          layer: 'states'
        });
      }
    }

    // File Action Actions
    for (const [key, config] of Object.entries(FILE_ACTION.actions)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `file_action_kw.${language}.${key}.p${part}`,
          artifactType: 'file_action_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'FILE_ACTION',
          layer: 'actions',
          family: config.family
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `file_action_pat.${language}.${key}.p${part}`,
          artifactType: 'file_action_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'FILE_ACTION',
          layer: 'actions',
          family: config.family
        });
      }
    }

    // File Action Scope
    for (const [key, config] of Object.entries(FILE_ACTION.scope)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `file_scope_kw.${language}.${key}.p${part}`,
          artifactType: 'file_scope_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'FILE_ACTION',
          layer: 'scope'
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `file_scope_pat.${language}.${key}.p${part}`,
          artifactType: 'file_scope_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'FILE_ACTION',
          layer: 'scope'
        });
      }
    }

    // File Action Confirmation Depth
    for (const [key, config] of Object.entries(FILE_ACTION.confirmationDepth)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `file_confirm_kw.${language}.${key}.p${part}`,
          artifactType: 'file_confirm_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'FILE_ACTION',
          layer: 'confirmationDepth',
          depth: config.depth
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `file_confirm_pat.${language}.${key}.p${part}`,
          artifactType: 'file_confirm_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'FILE_ACTION',
          layer: 'confirmationDepth',
          depth: config.depth
        });
      }
    }

    // File Action Resolution Depth
    for (const [key, config] of Object.entries(FILE_ACTION.resolutionDepth)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `file_resolve_kw.${language}.${key}.p${part}`,
          artifactType: 'file_resolve_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'FILE_ACTION',
          layer: 'resolutionDepth',
          depth: config.depth
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `file_resolve_pat.${language}.${key}.p${part}`,
          artifactType: 'file_resolve_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'FILE_ACTION',
          layer: 'resolutionDepth',
          depth: config.depth
        });
      }
    }

    // File Action Output Control
    for (const [key, config] of Object.entries(FILE_ACTION.outputControl)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `file_output_kw.${language}.${key}.p${part}`,
          artifactType: 'file_output_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'FILE_ACTION',
          layer: 'outputControl',
          family: config.family
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `file_output_pat.${language}.${key}.p${part}`,
          artifactType: 'file_output_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'FILE_ACTION',
          layer: 'outputControl',
          family: config.family
        });
      }
    }
  }

  // ========== FINANCE DOMAIN ==========
  for (const language of SUPPORTED_LANGUAGES) {
    // Finance Concepts
    for (const [key, config] of Object.entries(FINANCE.concepts)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `fin_concept_kw.${language}.${key}.p${part}`,
          artifactType: 'finance_concept_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'FINANCE',
          layer: 'concepts',
          family: config.family
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `fin_concept_pat.${language}.${key}.p${part}`,
          artifactType: 'finance_concept_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'FINANCE',
          layer: 'concepts',
          family: config.family
        });
      }
    }

    // Finance Metrics
    for (const [key, config] of Object.entries(FINANCE.metrics)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `fin_metric_kw.${language}.${key}.p${part}`,
          artifactType: 'finance_metric_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'FINANCE',
          layer: 'metrics',
          family: config.family
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `fin_metric_pat.${language}.${key}.p${part}`,
          artifactType: 'finance_metric_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'FINANCE',
          layer: 'metrics',
          family: config.family
        });
      }
    }

    // Finance DocTypes
    for (const [key, config] of Object.entries(FINANCE.docTypes)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `fin_doctype_kw.${language}.${key}.p${part}`,
          artifactType: 'finance_doctype_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'FINANCE',
          layer: 'docTypes'
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `fin_doctype_pat.${language}.${key}.p${part}`,
          artifactType: 'finance_doctype_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'FINANCE',
          layer: 'docTypes'
        });
      }
    }

    // Finance Definition Modes
    for (const [key, config] of Object.entries(FINANCE.definitionModes)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `fin_defmode_kw.${language}.${key}.p${part}`,
          artifactType: 'finance_defmode_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'FINANCE',
          layer: 'definitionModes'
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `fin_defmode_pat.${language}.${key}.p${part}`,
          artifactType: 'finance_defmode_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'FINANCE',
          layer: 'definitionModes'
        });
      }
    }

    // Finance Depth
    for (const [key, config] of Object.entries(FINANCE.depth)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `fin_depth_kw.${language}.${key}.p${part}`,
          artifactType: 'finance_depth_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'FINANCE',
          layer: 'depth',
          depth: config.depth
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `fin_depth_pat.${language}.${key}.p${part}`,
          artifactType: 'finance_depth_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'FINANCE',
          layer: 'depth',
          depth: config.depth
        });
      }
    }

    // Finance Output Control
    for (const [key, config] of Object.entries(FINANCE.outputControl)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `fin_output_kw.${language}.${key}.p${part}`,
          artifactType: 'finance_output_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'FINANCE',
          layer: 'outputControl',
          family: config.family
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `fin_output_pat.${language}.${key}.p${part}`,
          artifactType: 'finance_output_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'FINANCE',
          layer: 'outputControl',
          family: config.family
        });
      }
    }
  }

  // ========== ACCOUNTING DOMAIN ==========
  for (const language of SUPPORTED_LANGUAGES) {
    // Accounting Concepts
    for (const [key, config] of Object.entries(ACCOUNTING.concepts)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `acct_concept_kw.${language}.${key}.p${part}`,
          artifactType: 'accounting_concept_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'ACCOUNTING',
          layer: 'concepts',
          family: config.family
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `acct_concept_pat.${language}.${key}.p${part}`,
          artifactType: 'accounting_concept_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'ACCOUNTING',
          layer: 'concepts',
          family: config.family
        });
      }
    }

    // Accounting Standards
    for (const [key, config] of Object.entries(ACCOUNTING.standards)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `acct_standard_kw.${language}.${key}.p${part}`,
          artifactType: 'accounting_standard_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'ACCOUNTING',
          layer: 'standards'
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `acct_standard_pat.${language}.${key}.p${part}`,
          artifactType: 'accounting_standard_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'ACCOUNTING',
          layer: 'standards'
        });
      }
    }

    // Accounting Definition Modes
    for (const [key, config] of Object.entries(ACCOUNTING.definitionModes)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `acct_defmode_kw.${language}.${key}.p${part}`,
          artifactType: 'accounting_defmode_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'ACCOUNTING',
          layer: 'definitionModes'
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `acct_defmode_pat.${language}.${key}.p${part}`,
          artifactType: 'accounting_defmode_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'ACCOUNTING',
          layer: 'definitionModes'
        });
      }
    }

    // Accounting Output Control
    for (const [key, config] of Object.entries(ACCOUNTING.outputControl)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `acct_output_kw.${language}.${key}.p${part}`,
          artifactType: 'accounting_output_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'ACCOUNTING',
          layer: 'outputControl',
          family: config.family
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `acct_output_pat.${language}.${key}.p${part}`,
          artifactType: 'accounting_output_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'ACCOUNTING',
          layer: 'outputControl',
          family: config.family
        });
      }
    }
  }

  // ========== LEGAL DOMAIN ==========
  for (const language of SUPPORTED_LANGUAGES) {
    // Legal Concepts
    for (const [key, config] of Object.entries(LEGAL.concepts)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `legal_concept_kw.${language}.${key}.p${part}`,
          artifactType: 'legal_concept_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'LEGAL',
          layer: 'concepts',
          family: config.family
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `legal_concept_pat.${language}.${key}.p${part}`,
          artifactType: 'legal_concept_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'LEGAL',
          layer: 'concepts',
          family: config.family
        });
      }
    }

    // Legal Definition Modes
    for (const [key, config] of Object.entries(LEGAL.definitionModes)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `legal_defmode_kw.${language}.${key}.p${part}`,
          artifactType: 'legal_defmode_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'LEGAL',
          layer: 'definitionModes'
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `legal_defmode_pat.${language}.${key}.p${part}`,
          artifactType: 'legal_defmode_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'LEGAL',
          layer: 'definitionModes'
        });
      }
    }

    // Legal Output Control
    for (const [key, config] of Object.entries(LEGAL.outputControl)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `legal_output_kw.${language}.${key}.p${part}`,
          artifactType: 'legal_output_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'LEGAL',
          layer: 'outputControl',
          family: config.family
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `legal_output_pat.${language}.${key}.p${part}`,
          artifactType: 'legal_output_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'LEGAL',
          layer: 'outputControl',
          family: config.family
        });
      }
    }
  }

  // ========== MEDICAL DOMAIN ==========
  for (const language of SUPPORTED_LANGUAGES) {
    // Medical Concepts
    for (const [key, config] of Object.entries(MEDICAL.concepts)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `med_concept_kw.${language}.${key}.p${part}`,
          artifactType: 'medical_concept_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'MEDICAL',
          layer: 'concepts',
          family: config.family
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `med_concept_pat.${language}.${key}.p${part}`,
          artifactType: 'medical_concept_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'MEDICAL',
          layer: 'concepts',
          family: config.family
        });
      }
    }

    // Medical Definition Modes
    for (const [key, config] of Object.entries(MEDICAL.definitionModes)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `med_defmode_kw.${language}.${key}.p${part}`,
          artifactType: 'medical_defmode_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'MEDICAL',
          layer: 'definitionModes'
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `med_defmode_pat.${language}.${key}.p${part}`,
          artifactType: 'medical_defmode_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'MEDICAL',
          layer: 'definitionModes'
        });
      }
    }

    // Medical Output Control
    for (const [key, config] of Object.entries(MEDICAL.outputControl)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `med_output_kw.${language}.${key}.p${part}`,
          artifactType: 'medical_output_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'MEDICAL',
          layer: 'outputControl',
          family: config.family
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `med_output_pat.${language}.${key}.p${part}`,
          artifactType: 'medical_output_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'MEDICAL',
          layer: 'outputControl',
          family: config.family
        });
      }
    }
  }

  // ========== ENGINEERING DOMAIN ==========
  for (const language of SUPPORTED_LANGUAGES) {
    // Engineering Concepts
    for (const [key, config] of Object.entries(ENGINEERING.concepts)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `eng_concept_kw.${language}.${key}.p${part}`,
          artifactType: 'engineering_concept_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'ENGINEERING',
          layer: 'concepts',
          family: config.family
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `eng_concept_pat.${language}.${key}.p${part}`,
          artifactType: 'engineering_concept_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'ENGINEERING',
          layer: 'concepts',
          family: config.family
        });
      }
    }

    // Engineering Definition Modes
    for (const [key, config] of Object.entries(ENGINEERING.definitionModes)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `eng_defmode_kw.${language}.${key}.p${part}`,
          artifactType: 'engineering_defmode_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'ENGINEERING',
          layer: 'definitionModes'
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `eng_defmode_pat.${language}.${key}.p${part}`,
          artifactType: 'engineering_defmode_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'ENGINEERING',
          layer: 'definitionModes'
        });
      }
    }

    // Engineering Output Control
    for (const [key, config] of Object.entries(ENGINEERING.outputControl)) {
      const kwBatches = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatches; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);
        jobs.push({
          jobId: `eng_output_kw.${language}.${key}.p${part}`,
          artifactType: 'engineering_output_keywords',
          language,
          target: key,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description,
          intent: 'ENGINEERING',
          layer: 'outputControl',
          family: config.family
        });
      }
      const patBatches = Math.ceil(config.patterns / BATCH_SIZE.patterns);
      for (let part = 0; part < patBatches; part++) {
        const remaining = config.patterns - (part * BATCH_SIZE.patterns);
        const count = Math.min(BATCH_SIZE.patterns, remaining);
        jobs.push({
          jobId: `eng_output_pat.${language}.${key}.p${part}`,
          artifactType: 'engineering_output_patterns',
          language,
          target: key,
          part,
          count,
          totalTarget: config.patterns,
          description: config.description,
          intent: 'ENGINEERING',
          layer: 'outputControl',
          family: config.family
        });
      }
    }
  }

  return jobs;
}

// ============================================================================
// TOTALS CALCULATION
// ============================================================================

export function calculateTotals() {
  const jobs = generateAllJobs();

  let docKeywords = 0, docPatterns = 0;
  let helpKeywords = 0, helpPatterns = 0;
  let convKeywords = 0, convPatterns = 0;
  let editKeywords = 0, editPatterns = 0;
  let memKeywords = 0, memPatterns = 0;
  let prefKeywords = 0, prefPatterns = 0;
  let extKeywords = 0, extPatterns = 0;
  let errKeywords = 0, errPatterns = 0;
  let rsnKeywords = 0, rsnPatterns = 0;
  let fileKeywords = 0, filePatterns = 0;
  let finKeywords = 0, finPatterns = 0;
  let acctKeywords = 0, acctPatterns = 0;
  let legalKeywords = 0, legalPatterns = 0;
  let medKeywords = 0, medPatterns = 0;
  let engKeywords = 0, engPatterns = 0;

  for (const job of jobs) {
    if (job.intent === 'DOCUMENTS') {
      if (job.artifactType.includes('keywords')) docKeywords += job.count;
      else if (job.artifactType.includes('patterns')) docPatterns += job.count;
    } else if (job.intent === 'HELP') {
      if (job.artifactType.includes('keywords')) helpKeywords += job.count;
      else if (job.artifactType.includes('patterns')) helpPatterns += job.count;
    } else if (job.intent === 'CONVERSATION') {
      if (job.artifactType.includes('keywords')) convKeywords += job.count;
      else if (job.artifactType.includes('patterns')) convPatterns += job.count;
    } else if (job.intent === 'EDIT') {
      if (job.artifactType.includes('keywords')) editKeywords += job.count;
      else if (job.artifactType.includes('patterns')) editPatterns += job.count;
    } else if (job.intent === 'MEMORY') {
      if (job.artifactType.includes('keywords')) memKeywords += job.count;
      else if (job.artifactType.includes('patterns')) memPatterns += job.count;
    } else if (job.intent === 'PREFERENCES') {
      if (job.artifactType.includes('keywords')) prefKeywords += job.count;
      else if (job.artifactType.includes('patterns')) prefPatterns += job.count;
    } else if (job.intent === 'EXTRACTION') {
      if (job.artifactType.includes('keywords')) extKeywords += job.count;
      else if (job.artifactType.includes('patterns')) extPatterns += job.count;
    } else if (job.intent === 'ERROR') {
      if (job.artifactType.includes('keywords')) errKeywords += job.count;
      else if (job.artifactType.includes('patterns')) errPatterns += job.count;
    } else if (job.intent === 'REASONING') {
      if (job.artifactType.includes('keywords')) rsnKeywords += job.count;
      else if (job.artifactType.includes('patterns')) rsnPatterns += job.count;
    } else if (job.intent === 'FILE_ACTION') {
      if (job.artifactType.includes('keywords')) fileKeywords += job.count;
      else if (job.artifactType.includes('patterns')) filePatterns += job.count;
    } else if (job.intent === 'FINANCE') {
      if (job.artifactType.includes('keywords')) finKeywords += job.count;
      else if (job.artifactType.includes('patterns')) finPatterns += job.count;
    } else if (job.intent === 'ACCOUNTING') {
      if (job.artifactType.includes('keywords')) acctKeywords += job.count;
      else if (job.artifactType.includes('patterns')) acctPatterns += job.count;
    } else if (job.intent === 'LEGAL') {
      if (job.artifactType.includes('keywords')) legalKeywords += job.count;
      else if (job.artifactType.includes('patterns')) legalPatterns += job.count;
    } else if (job.intent === 'MEDICAL') {
      if (job.artifactType.includes('keywords')) medKeywords += job.count;
      else if (job.artifactType.includes('patterns')) medPatterns += job.count;
    } else if (job.intent === 'ENGINEERING') {
      if (job.artifactType.includes('keywords')) engKeywords += job.count;
      else if (job.artifactType.includes('patterns')) engPatterns += job.count;
    }
  }

  const perLang = {
    documents: { keywords: docKeywords / 3, patterns: docPatterns / 3, total: (docKeywords + docPatterns) / 3 },
    help: { keywords: helpKeywords / 3, patterns: helpPatterns / 3, total: (helpKeywords + helpPatterns) / 3 },
    conversation: { keywords: convKeywords / 3, patterns: convPatterns / 3, total: (convKeywords + convPatterns) / 3 },
    edit: { keywords: editKeywords / 3, patterns: editPatterns / 3, total: (editKeywords + editPatterns) / 3 },
    memory: { keywords: memKeywords / 3, patterns: memPatterns / 3, total: (memKeywords + memPatterns) / 3 },
    preferences: { keywords: prefKeywords / 3, patterns: prefPatterns / 3, total: (prefKeywords + prefPatterns) / 3 },
    extraction: { keywords: extKeywords / 3, patterns: extPatterns / 3, total: (extKeywords + extPatterns) / 3 },
    error: { keywords: errKeywords / 3, patterns: errPatterns / 3, total: (errKeywords + errPatterns) / 3 },
    reasoning: { keywords: rsnKeywords / 3, patterns: rsnPatterns / 3, total: (rsnKeywords + rsnPatterns) / 3 },
    fileAction: { keywords: fileKeywords / 3, patterns: filePatterns / 3, total: (fileKeywords + filePatterns) / 3 },
    finance: { keywords: finKeywords / 3, patterns: finPatterns / 3, total: (finKeywords + finPatterns) / 3 },
    accounting: { keywords: acctKeywords / 3, patterns: acctPatterns / 3, total: (acctKeywords + acctPatterns) / 3 },
    legal: { keywords: legalKeywords / 3, patterns: legalPatterns / 3, total: (legalKeywords + legalPatterns) / 3 },
    medical: { keywords: medKeywords / 3, patterns: medPatterns / 3, total: (medKeywords + medPatterns) / 3 },
    engineering: { keywords: engKeywords / 3, patterns: engPatterns / 3, total: (engKeywords + engPatterns) / 3 }
  };

  const totalKeywords = docKeywords + helpKeywords + convKeywords + editKeywords + memKeywords + prefKeywords + extKeywords + errKeywords + rsnKeywords + fileKeywords + finKeywords + acctKeywords + legalKeywords + medKeywords + engKeywords;
  const totalPatterns = docPatterns + helpPatterns + convPatterns + editPatterns + memPatterns + prefPatterns + extPatterns + errPatterns + rsnPatterns + filePatterns + finPatterns + acctPatterns + legalPatterns + medPatterns + engPatterns;

  return {
    languages: SUPPORTED_LANGUAGES.length,
    jobCount: jobs.length,
    perLanguage: perLang,
    totals: {
      keywords: totalKeywords,
      patterns: totalPatterns,
      grandTotal: totalKeywords + totalPatterns
    },
    targets: {
      documents: '~9,676/lang (7 layers)',
      help: '2,670/lang',
      conversation: '4,760/lang',
      edit: '~3,300/lang',
      memory: '~3,500/lang',
      preferences: '~3,200/lang',
      extraction: '~2,400/lang',
      error: '~2,500/lang',
      reasoning: '~8,170/lang (9 layers)',
      fileAction: '~2,800/lang',
      finance: '~4,500/lang',
      accounting: '~2,400/lang',
      legal: '~2,200/lang',
      medical: '~2,000/lang',
      engineering: '~2,200/lang',
      total: '~56,276/lang | ~168,828 total'
    }
  };
}
