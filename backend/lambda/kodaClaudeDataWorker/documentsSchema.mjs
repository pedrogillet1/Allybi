/**
 * Documents Intent Schema - Full Production Spec
 * 16 Sub-intents (D1-D16) + 14 Facets + Depths + Templates + Policies
 *
 * Total targets:
 * - Patterns: 22,620 (16,320 sub-intents + 6,300 facets)
 * - Keywords: 17,520 (12,480 sub-intents + 5,040 facets)
 * - Depth examples: 9,600
 * - Output templates: 36
 * - Policies: 11
 */

export const SUPPORTED_LANGUAGES = ['en', 'pt', 'es'];

// 16 Sub-intents with exact counts per language
export const SUB_INTENTS = {
  D1_ASK: {
    description: 'General Q&A grounded in documents',
    patterns: { P0: 120, P1: 220 }, // 340 total per lang
    keywords: 260,
    depthExamples: 40 // per depth level (5 levels = 200 total)
  },
  D2_FIND: {
    description: 'Find a specific file/document',
    patterns: { P0: 120, P1: 220 },
    keywords: 260,
    depthExamples: 40
  },
  D3_LIST: {
    description: 'List documents, counts, inventory views',
    patterns: { P0: 120, P1: 220 },
    keywords: 260,
    depthExamples: 40
  },
  D4_SUMMARIZE: {
    description: 'Summaries, TL;DR, section summaries',
    patterns: { P0: 120, P1: 220 },
    keywords: 260,
    depthExamples: 40
  },
  D5_COMPARE: {
    description: 'Compare docs/clauses/values',
    patterns: { P0: 120, P1: 220 },
    keywords: 260,
    depthExamples: 40
  },
  D6_EXTRACT: {
    description: 'Extract structured fields',
    patterns: { P0: 120, P1: 220 },
    keywords: 260,
    depthExamples: 40
  },
  D7_ANALYZE: {
    description: 'Analysis, risk, interpretation, reasoning grounded in docs',
    patterns: { P0: 120, P1: 220 },
    keywords: 260,
    depthExamples: 40
  },
  D8_ORGANIZE: {
    description: 'Foldering, tagging, categorizing, naming',
    patterns: { P0: 120, P1: 220 },
    keywords: 260,
    depthExamples: 40
  },
  D9_TIMELINE: {
    description: 'Events, dates, chronological extraction',
    patterns: { P0: 120, P1: 220 },
    keywords: 260,
    depthExamples: 40
  },
  D10_CALC: {
    description: 'Calculations based on document numbers',
    patterns: { P0: 120, P1: 220 },
    keywords: 260,
    depthExamples: 40
  },
  D11_TABLES: {
    description: 'Convert/explain tables, CSV/XLSX logic, "make a table from doc"',
    patterns: { P0: 120, P1: 220 },
    keywords: 260,
    depthExamples: 40
  },
  D12_CITATIONS: {
    description: 'Requests about sources, "where did you get this", citation formatting',
    patterns: { P0: 120, P1: 220 },
    keywords: 260,
    depthExamples: 40
  },
  D13_TRANSLATE: {
    description: 'Translate doc content, multilingual doc handling',
    patterns: { P0: 120, P1: 220 },
    keywords: 260,
    depthExamples: 40
  },
  D14_REDACT: {
    description: 'Redaction, masking, removing sensitive parts',
    patterns: { P0: 120, P1: 220 },
    keywords: 260,
    depthExamples: 40
  },
  D15_VALIDATE: {
    description: 'Validate consistency, contradictions, missing info',
    patterns: { P0: 120, P1: 220 },
    keywords: 260,
    depthExamples: 40
  },
  D16_WORKFLOW: {
    description: 'Multi-step doc workflows: "summarize then extract then compare"',
    patterns: { P0: 120, P1: 220 },
    keywords: 260,
    depthExamples: 40
  }
};

// 14 Facets with exact counts per language
export const FACETS = {
  F_DOC_REFERENCE: {
    description: 'Explicit doc name mention / "that contract"',
    patterns: { P0: 60, P1: 90 }, // 150 total per lang
    keywords: 120
  },
  F_FOLDER_PATH: {
    description: 'Folder/subfolder mention',
    patterns: { P0: 60, P1: 90 },
    keywords: 120
  },
  F_FILETYPE: {
    description: 'pdf/docx/xlsx/pptx/image',
    patterns: { P0: 60, P1: 90 },
    keywords: 120
  },
  F_TIME: {
    description: 'Date ranges, "last month", "in 2023"',
    patterns: { P0: 60, P1: 90 },
    keywords: 120
  },
  F_LANGUAGE_MENTION: {
    description: 'Mentions language preference or doc language',
    patterns: { P0: 60, P1: 90 },
    keywords: 120
  },
  F_OUTPUT_STYLE: {
    description: 'Bullets/table/short/long/step-by-step',
    patterns: { P0: 60, P1: 90 },
    keywords: 120
  },
  F_SCOPE_LIMIT: {
    description: 'Only this doc / only last 3 / only invoices',
    patterns: { P0: 60, P1: 90 },
    keywords: 120
  },
  F_ENTITY_FOCUS: {
    description: 'Company/person/vendor/client focus',
    patterns: { P0: 60, P1: 90 },
    keywords: 120
  },
  F_NUMERIC_HEAVY: {
    description: 'Numbers/tables/finance',
    patterns: { P0: 60, P1: 90 },
    keywords: 120
  },
  F_LEGAL_TONE: {
    description: 'Legal terms, clauses, compliance',
    patterns: { P0: 60, P1: 90 },
    keywords: 120
  },
  F_MEDICAL_TONE: {
    description: 'Lab results, symptoms, meds',
    patterns: { P0: 60, P1: 90 },
    keywords: 120
  },
  F_ACCOUNTING_TONE: {
    description: 'Ledger, tax, invoices, reconciliation',
    patterns: { P0: 60, P1: 90 },
    keywords: 120
  },
  F_PRIVACY_RISK: {
    description: 'PII, sensitive info',
    patterns: { P0: 60, P1: 90 },
    keywords: 120
  },
  F_AMBIGUITY_SIGNAL: {
    description: 'Unclear pronouns, missing doc reference',
    patterns: { P0: 60, P1: 90 },
    keywords: 120
  }
};

// Depth levels
export const DEPTH_LEVELS = ['D0', 'D1', 'D2', 'D3', 'D4'];
export const DEPTH_DESCRIPTIONS = {
  D0: 'Micro request (one fact / one short answer)',
  D1: 'Simple request (few bullets)',
  D2: 'Medium (light structure, short sections)',
  D3: 'Complex (multi-step, multi-doc, needs strategy)',
  D4: 'Expert (audit-grade, strict validation, multiple constraints)'
};

// Output templates
export const OUTPUT_TEMPLATES = [
  'O_ONE_LINER',
  'O_BULLETS',
  'O_NUMBERED_STEPS',
  'O_SHORT_SECTIONS',
  'O_TABLE',
  'O_MIXED_HEADINGS_BULLETS',
  'O_CARD_ACTIONS',
  'O_ASK_FOLLOWUP',
  'O_SHOW_MORE',
  'O_EXPORT_READY',
  'O_RISK_HIGHLIGHT',
  'O_CITATION_FORWARD'
];

// Policies
export const POLICIES = [
  'P_DOC_FACTUAL_STRICT',
  'P_DOC_SUMMARY_SAFE',
  'P_DOC_EXTRACTION_SCHEMA_STRICT',
  'P_DOC_LEGAL_CAUTION',
  'P_DOC_MEDICAL_CAUTION',
  'P_DOC_ACCOUNTING_CAUTION',
  'P_DOC_PRIVACY_REDACTION',
  'P_DOC_CONTRADICTION_CHECK',
  'P_DOC_LOW_CONFIDENCE_FALLBACK',
  'P_DOC_CITATION_REQUIRED',
  'P_DOC_NO_HALLUCINATION'
];

// Batch configuration - User minimum requirements
export const BATCH_SIZE = {
  patterns: 15,
  keywords: 25,
  depthExamples: 20
};

// Artifact types for job partitioning
export const ARTIFACT_TYPES = [
  'documents_patterns',
  'documents_keywords',
  'documents_facets_patterns',
  'documents_facets_keywords',
  'documents_depth_examples',
  'documents_output_templates',
  'documents_policies'
];

/**
 * Generate all jobs following Lambda batching strategy
 * Atomic slices: language × target × tier × part
 */
export function generateAllJobs() {
  const jobs = [];

  for (const language of SUPPORTED_LANGUAGES) {
    // Sub-intent patterns (P0 and P1)
    for (const [subIntent, config] of Object.entries(SUB_INTENTS)) {
      for (const tier of ['P0', 'P1']) {
        const totalCount = config.patterns[tier];
        const batchCount = Math.ceil(totalCount / BATCH_SIZE.patterns);

        for (let part = 0; part < batchCount; part++) {
          const remaining = totalCount - (part * BATCH_SIZE.patterns);
          const count = Math.min(BATCH_SIZE.patterns, remaining);

          jobs.push({
            jobId: `documents_patterns.${language}.${subIntent}.${tier}.part${String(part).padStart(2, '0')}`,
            artifactType: 'documents_patterns',
            language,
            target: subIntent,
            tier,
            part,
            count,
            totalTarget: totalCount,
            description: config.description
          });
        }
      }

      // Sub-intent keywords
      const kwBatchCount = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatchCount; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);

        jobs.push({
          jobId: `documents_keywords.${language}.${subIntent}.part${String(part).padStart(2, '0')}`,
          artifactType: 'documents_keywords',
          language,
          target: subIntent,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description
        });
      }

      // Depth examples (one job per depth level)
      for (const depth of DEPTH_LEVELS) {
        const examplesPerDepth = config.depthExamples;
        const batchCount = Math.ceil(examplesPerDepth / BATCH_SIZE.depthExamples);

        for (let part = 0; part < batchCount; part++) {
          const remaining = examplesPerDepth - (part * BATCH_SIZE.depthExamples);
          const count = Math.min(BATCH_SIZE.depthExamples, remaining);

          jobs.push({
            jobId: `documents_depth_examples.${language}.${subIntent}.${depth}.part${String(part).padStart(2, '0')}`,
            artifactType: 'documents_depth_examples',
            language,
            target: subIntent,
            depth,
            part,
            count,
            totalTarget: examplesPerDepth,
            description: config.description,
            depthDescription: DEPTH_DESCRIPTIONS[depth]
          });
        }
      }
    }

    // Facet patterns (P0 and P1)
    for (const [facet, config] of Object.entries(FACETS)) {
      for (const tier of ['P0', 'P1']) {
        const totalCount = config.patterns[tier];
        const batchCount = Math.ceil(totalCount / BATCH_SIZE.patterns);

        for (let part = 0; part < batchCount; part++) {
          const remaining = totalCount - (part * BATCH_SIZE.patterns);
          const count = Math.min(BATCH_SIZE.patterns, remaining);

          jobs.push({
            jobId: `documents_facets_patterns.${language}.${facet}.${tier}.part${String(part).padStart(2, '0')}`,
            artifactType: 'documents_facets_patterns',
            language,
            target: facet,
            tier,
            part,
            count,
            totalTarget: totalCount,
            description: config.description
          });
        }
      }

      // Facet keywords
      const kwBatchCount = Math.ceil(config.keywords / BATCH_SIZE.keywords);
      for (let part = 0; part < kwBatchCount; part++) {
        const remaining = config.keywords - (part * BATCH_SIZE.keywords);
        const count = Math.min(BATCH_SIZE.keywords, remaining);

        jobs.push({
          jobId: `documents_facets_keywords.${language}.${facet}.part${String(part).padStart(2, '0')}`,
          artifactType: 'documents_facets_keywords',
          language,
          target: facet,
          part,
          count,
          totalTarget: config.keywords,
          description: config.description
        });
      }
    }
  }

  // Output templates (single job for all languages)
  jobs.push({
    jobId: 'documents_output_templates.ALL_LANGUAGES',
    artifactType: 'documents_output_templates',
    language: 'all',
    templates: OUTPUT_TEMPLATES,
    count: OUTPUT_TEMPLATES.length
  });

  // Policies (single job for all languages)
  jobs.push({
    jobId: 'documents_policies.ALL_LANGUAGES',
    artifactType: 'documents_policies',
    language: 'all',
    policies: POLICIES,
    count: POLICIES.length
  });

  return jobs;
}

/**
 * Calculate totals for reporting
 */
export function calculateTotals() {
  const subIntentCount = Object.keys(SUB_INTENTS).length;
  const facetCount = Object.keys(FACETS).length;
  const langCount = SUPPORTED_LANGUAGES.length;

  // Per language
  const patternsPerSubIntent = 120 + 220; // P0 + P1
  const patternsPerFacet = 60 + 90;
  const keywordsPerSubIntent = 260;
  const keywordsPerFacet = 120;
  const depthExamplesPerSubIntent = 40 * 5; // 5 depth levels

  const perLanguage = {
    subIntentPatterns: subIntentCount * patternsPerSubIntent,
    facetPatterns: facetCount * patternsPerFacet,
    subIntentKeywords: subIntentCount * keywordsPerSubIntent,
    facetKeywords: facetCount * keywordsPerFacet,
    depthExamples: subIntentCount * depthExamplesPerSubIntent
  };

  perLanguage.totalPatterns = perLanguage.subIntentPatterns + perLanguage.facetPatterns;
  perLanguage.totalKeywords = perLanguage.subIntentKeywords + perLanguage.facetKeywords;
  perLanguage.totalItems = perLanguage.totalPatterns + perLanguage.totalKeywords + perLanguage.depthExamples;

  const allLanguages = {
    totalPatterns: perLanguage.totalPatterns * langCount,
    totalKeywords: perLanguage.totalKeywords * langCount,
    depthExamples: perLanguage.depthExamples * langCount,
    outputTemplates: OUTPUT_TEMPLATES.length * langCount,
    policies: POLICIES.length,
    totalItems: (perLanguage.totalItems * langCount) + (OUTPUT_TEMPLATES.length * langCount) + POLICIES.length
  };

  const jobs = generateAllJobs();

  return {
    subIntentCount,
    facetCount,
    langCount,
    perLanguage,
    allLanguages,
    jobCount: jobs.length
  };
}
