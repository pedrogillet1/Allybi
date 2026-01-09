/**
 * KODA Domain Schema v1.0 - MASTER GENERATION CONTRACT
 *
 * Domains are ORTHOGONAL to intents - they represent specialized vocabulary
 * for routing signals, NOT intent classification.
 *
 * ABSOLUTE RULES:
 * - NO REMOVALS - expansion only
 * - NO AUTO-CONFLICT RESOLUTION
 * - NO INTELLIGENCE DECISIONS
 * - EXACT COUNTS REQUIRED
 */

export const SUPPORTED_LANGUAGES = ['en', 'pt', 'es'];

// =============================================================================
// DOMAIN DEFINITIONS WITH EXACT BUCKET COUNTS
// =============================================================================

export const DOMAINS = {
  LEGAL: {
    tier: 0,
    totals: { keywords: 11900, patterns: 6050, tieBreakers: 500 },
    keywordTiers: { STRONG: 3800, MEDIUM: 6000, WEAK: 1400, NEGATIVE: 700 },
    keywordBuckets: {
      legal_state_signals: { count: 1300, description: 'Contract states, legal status indicators, document lifecycle' },
      legal_action_triggers: { count: 1850, description: 'Legal actions, obligations, requirements, demands' },
      scope_modifiers: { count: 850, description: 'Jurisdiction, parties, coverage, applicability' },
      depth_modifiers: { count: 750, description: 'D1-D5 analysis depth signals for legal content' },
      precision_quote_risk_cues: { count: 1200, description: 'Exact quote requests, precision needs, risk indicators' },
      temporal_version_cues: { count: 850, description: 'Effective dates, amendments, versions, renewals' },
      clause_archetype_cues: { count: 1450, description: 'Indemnification, liability, termination, force majeure, etc.' },
      definitions_term_cues: { count: 1050, description: 'Defined terms, definitions section, term meanings' },
      notice_dispute_venue_cues: { count: 900, description: 'Notice requirements, dispute resolution, venue, arbitration' },
      privacy_dpa_security_sla_cues: { count: 1000, description: 'Data protection, SLA, security terms, compliance' },
      negative_triggers: { count: 700, description: 'Non-legal signals, exclusion markers' }
    },
    patternBuckets: {
      legal_state_patterns: { count: 550, description: 'Patterns for contract/legal state detection' },
      legal_action_patterns: { count: 850, description: 'Patterns for legal action triggers' },
      scope_patterns: { count: 350, description: 'Patterns for scope/jurisdiction detection' },
      depth_patterns: { count: 400, description: 'Patterns for analysis depth signals' },
      precision_quote_risk_patterns: { count: 700, description: 'Patterns for precision/risk detection' },
      temporal_version_patterns: { count: 500, description: 'Patterns for temporal references' },
      clause_archetype_patterns: { count: 750, description: 'Patterns for clause type detection' },
      definitions_patterns: { count: 600, description: 'Patterns for defined terms' },
      notice_dispute_venue_patterns: { count: 500, description: 'Patterns for dispute/venue detection' },
      privacy_dpa_security_sla_patterns: { count: 550, description: 'Patterns for compliance terms' },
      negative_trigger_patterns: { count: 300, description: 'Patterns for non-legal exclusion' },
      tie_breaker_patterns: { count: 500, description: 'Disambiguation patterns for legal vs other domains' }
    }
  },

  MEDICAL: {
    tier: 0,
    totals: { keywords: 13050, patterns: 6200, tieBreakers: 550 },
    keywordTiers: { STRONG: 4200, MEDIUM: 7100, WEAK: 1000, NEGATIVE: 750 },
    keywordBuckets: {
      medical_state_signals: { count: 1350, description: 'Patient status, condition states, clinical findings' },
      medical_action_triggers: { count: 1950, description: 'Treatment actions, procedures, interventions' },
      scope_modifiers: { count: 900, description: 'Body systems, specialties, patient populations' },
      depth_modifiers: { count: 800, description: 'D1-D5 analysis depth for medical content' },
      precision_units_range_cues: { count: 1400, description: 'Lab values, measurements, normal ranges' },
      temporal_version_cues: { count: 900, description: 'Onset, duration, frequency, prognosis' },
      lab_panels_analytes: { count: 1500, description: 'Lab tests, panels, biomarkers, analytes' },
      medication_sig_safety_cues: { count: 1250, description: 'Drug names, dosing, interactions, contraindications' },
      imaging_pathology_structure: { count: 1050, description: 'Imaging modalities, pathology terms, anatomical structures' },
      risk_caution_urgency_cues: { count: 1200, description: 'Severity indicators, urgency levels, warnings' },
      negative_triggers: { count: 750, description: 'Non-medical signals, exclusion markers' }
    },
    patternBuckets: {
      medical_state_patterns: { count: 550, description: 'Patterns for clinical state detection' },
      medical_action_patterns: { count: 900, description: 'Patterns for treatment/procedure detection' },
      scope_patterns: { count: 400, description: 'Patterns for medical scope detection' },
      depth_patterns: { count: 350, description: 'Patterns for analysis depth signals' },
      precision_units_patterns: { count: 650, description: 'Patterns for lab values/measurements' },
      temporal_patterns: { count: 450, description: 'Patterns for temporal medical references' },
      lab_panel_patterns: { count: 700, description: 'Patterns for lab test detection' },
      medication_patterns: { count: 600, description: 'Patterns for medication references' },
      imaging_pathology_patterns: { count: 500, description: 'Patterns for imaging/pathology' },
      risk_urgency_patterns: { count: 550, description: 'Patterns for risk/urgency detection' },
      negative_trigger_patterns: { count: 300, description: 'Patterns for non-medical exclusion' },
      tie_breaker_patterns: { count: 550, description: 'Disambiguation patterns for medical vs other domains' }
    }
  },

  FINANCE: {
    tier: 1,
    totals: { keywords: 14000, patterns: 6000, tieBreakers: 500 },
    keywordTiers: { STRONG: 5000, MEDIUM: 6000, WEAK: 1750, NEGATIVE: 1250 },
    patternTiers: { STRONG: 1900, MEDIUM: 2300, WEAK: 800, NEGATIVE: 500 },
    keywordBuckets: {
      financial_state_signals: { count: 1400, description: 'Account status, portfolio state, market conditions' },
      financial_action_triggers: { count: 2000, description: 'Transactions, trades, transfers, investments' },
      scope_modifiers: { count: 950, description: 'Asset classes, markets, sectors, geographies' },
      depth_modifiers: { count: 850, description: 'D1-D5 analysis depth for financial content' },
      precision_calculation_cues: { count: 1500, description: 'Ratios, percentages, calculations, valuations' },
      temporal_period_cues: { count: 1000, description: 'Fiscal periods, quarters, YTD, horizons' },
      instrument_cues: { count: 1300, description: 'Securities, derivatives, bonds, equities' },
      regulatory_compliance_cues: { count: 1100, description: 'SEC, GAAP, IFRS, audit terms' },
      risk_metrics_cues: { count: 1200, description: 'VaR, beta, volatility, exposure' },
      reporting_statement_cues: { count: 1450, description: 'P&L, balance sheet, cash flow, statements' },
      negative_triggers: { count: 1250, description: 'Non-financial signals, exclusion markers' }
    },
    patternBuckets: {
      financial_state_patterns: { count: 500, description: 'Patterns for financial state detection' },
      financial_action_patterns: { count: 700, description: 'Patterns for transaction detection' },
      scope_patterns: { count: 400, description: 'Patterns for financial scope detection' },
      depth_patterns: { count: 350, description: 'Patterns for analysis depth signals' },
      calculation_patterns: { count: 600, description: 'Patterns for financial calculations' },
      temporal_patterns: { count: 450, description: 'Patterns for fiscal periods' },
      instrument_patterns: { count: 550, description: 'Patterns for financial instruments' },
      regulatory_patterns: { count: 500, description: 'Patterns for regulatory references' },
      risk_metric_patterns: { count: 550, description: 'Patterns for risk metrics' },
      reporting_patterns: { count: 600, description: 'Patterns for financial reporting' },
      negative_trigger_patterns: { count: 300, description: 'Patterns for non-financial exclusion' },
      tie_breaker_patterns: { count: 500, description: 'Disambiguation patterns for finance vs other domains' }
    }
  },

  ENGINEERING: {
    tier: 1,
    totals: { keywords: 14550, patterns: 7050, tieBreakers: 600 },
    keywordTiers: { STRONG: 4700, MEDIUM: 8000, WEAK: 1050, NEGATIVE: 800 },
    patternTiers: { STRONG: 2600, MEDIUM: 3950, WEAK: 200, NEGATIVE: 300 },
    keywordBuckets: {
      engineering_state_signals: { count: 1400, description: 'System states, operational status, lifecycle phases' },
      engineering_action_triggers: { count: 2100, description: 'Design, build, test, deploy, maintain actions' },
      scope_modifiers: { count: 1000, description: 'Disciplines, systems, subsystems, components' },
      depth_modifiers: { count: 900, description: 'D1-D5 analysis depth for engineering content' },
      precision_measurement_cues: { count: 1600, description: 'Tolerances, specifications, units, measurements' },
      temporal_lifecycle_cues: { count: 950, description: 'Project phases, milestones, schedules' },
      materials_components_cues: { count: 1500, description: 'Materials, parts, assemblies, BOM items' },
      standards_compliance_cues: { count: 1200, description: 'ISO, ASME, IEEE, industry standards' },
      safety_failure_cues: { count: 1350, description: 'Safety factors, failure modes, FMEA terms' },
      cad_simulation_cues: { count: 1100, description: 'CAD, FEA, CFD, simulation terms' },
      process_method_cues: { count: 1250, description: 'Manufacturing processes, methodologies' },
      negative_triggers: { count: 800, description: 'Non-engineering signals, exclusion markers' }
    },
    patternBuckets: {
      engineering_state_patterns: { count: 600, description: 'Patterns for system state detection' },
      engineering_action_patterns: { count: 800, description: 'Patterns for engineering action detection' },
      scope_patterns: { count: 450, description: 'Patterns for engineering scope detection' },
      depth_patterns: { count: 400, description: 'Patterns for analysis depth signals' },
      measurement_patterns: { count: 700, description: 'Patterns for measurements/specs' },
      lifecycle_patterns: { count: 500, description: 'Patterns for project lifecycle' },
      component_patterns: { count: 650, description: 'Patterns for materials/components' },
      standards_patterns: { count: 550, description: 'Patterns for standards references' },
      safety_failure_patterns: { count: 600, description: 'Patterns for safety/failure analysis' },
      simulation_patterns: { count: 500, description: 'Patterns for CAD/simulation' },
      process_patterns: { count: 550, description: 'Patterns for manufacturing processes' },
      negative_trigger_patterns: { count: 250, description: 'Patterns for non-engineering exclusion' },
      tie_breaker_patterns: { count: 600, description: 'Disambiguation patterns for engineering vs other domains' }
    }
  },

  EXCEL: {
    tier: 2,
    totals: { keywords: 7000, patterns: 5150, tieBreakers: 0 },
    keywordTiers: { STRONG: 2500, MEDIUM: 3200, WEAK: 700, NEGATIVE: 600 },
    keywordBuckets: {
      spreadsheet_object_cues: { count: 900, description: 'Workbook, worksheet, sheet, file references' },
      cell_range_cues: { count: 1100, description: 'Cell references, ranges, selections, addresses' },
      column_table_cues: { count: 900, description: 'Columns, rows, tables, headers, data regions' },
      calculation_cues: { count: 1000, description: 'Formulas, functions, SUM, VLOOKUP, calculations' },
      transform_cues: { count: 950, description: 'Sort, filter, pivot, group, transform operations' },
      validation_error_cues: { count: 850, description: 'Validation, errors, #REF, #VALUE, data quality' },
      export_format_cues: { count: 700, description: 'Export, import, CSV, format, conversion' },
      negative_triggers: { count: 600, description: 'Non-spreadsheet signals, exclusion markers' }
    },
    patternBuckets: {
      spreadsheet_object_patterns: { count: 600, description: 'Patterns for spreadsheet object detection' },
      cell_range_patterns: { count: 800, description: 'Patterns for cell/range references' },
      column_table_patterns: { count: 650, description: 'Patterns for table structure detection' },
      calculation_patterns: { count: 900, description: 'Patterns for formula/function detection' },
      transform_patterns: { count: 750, description: 'Patterns for data transformation' },
      validation_error_patterns: { count: 600, description: 'Patterns for validation/error detection' },
      export_format_patterns: { count: 500, description: 'Patterns for export/import detection' },
      negative_trigger_patterns: { count: 350, description: 'Patterns for non-spreadsheet exclusion' }
    }
  }
};

// =============================================================================
// JOB GENERATION
// =============================================================================

const MAX_KEYWORDS_PER_JOB = 18;
const MAX_PATTERNS_PER_JOB = 12;

export function generateJobsForDomain(domainName, language) {
  const domain = DOMAINS[domainName];
  if (!domain) throw new Error(`Unknown domain: ${domainName}`);

  const jobs = [];

  // Generate keyword jobs
  for (const [bucketName, bucket] of Object.entries(domain.keywordBuckets)) {
    const numJobs = Math.ceil(bucket.count / MAX_KEYWORDS_PER_JOB);
    for (let batch = 0; batch < numJobs; batch++) {
      const remaining = bucket.count - (batch * MAX_KEYWORDS_PER_JOB);
      const count = Math.min(MAX_KEYWORDS_PER_JOB, remaining);
      jobs.push({
        jobId: `${domainName}-${bucketName}-keywords-${language}-b${batch}`,
        domain: domainName,
        bucket: bucketName,
        language,
        artifactType: 'keywords',
        count,
        batch,
        totalBatches: numJobs,
        description: bucket.description,
        tiers: domain.keywordTiers
      });
    }
  }

  // Generate pattern jobs
  for (const [bucketName, bucket] of Object.entries(domain.patternBuckets)) {
    const numJobs = Math.ceil(bucket.count / MAX_PATTERNS_PER_JOB);
    for (let batch = 0; batch < numJobs; batch++) {
      const remaining = bucket.count - (batch * MAX_PATTERNS_PER_JOB);
      const count = Math.min(MAX_PATTERNS_PER_JOB, remaining);
      jobs.push({
        jobId: `${domainName}-${bucketName}-patterns-${language}-b${batch}`,
        domain: domainName,
        bucket: bucketName,
        language,
        artifactType: 'patterns',
        count,
        batch,
        totalBatches: numJobs,
        description: bucket.description
      });
    }
  }

  return jobs;
}

export function generateAllDomainJobs() {
  const allJobs = [];
  for (const domainName of Object.keys(DOMAINS)) {
    for (const lang of SUPPORTED_LANGUAGES) {
      allJobs.push(...generateJobsForDomain(domainName, lang));
    }
  }
  return allJobs;
}

export function getJobsForDomainTier(tier) {
  const jobs = [];
  for (const [domainName, domain] of Object.entries(DOMAINS)) {
    if (domain.tier === tier) {
      for (const lang of SUPPORTED_LANGUAGES) {
        jobs.push(...generateJobsForDomain(domainName, lang));
      }
    }
  }
  return jobs;
}

export function calculateDomainTotals() {
  let totalKeywords = 0;
  let totalPatterns = 0;
  const byDomain = {};

  for (const [name, domain] of Object.entries(DOMAINS)) {
    const kw = domain.totals.keywords * SUPPORTED_LANGUAGES.length;
    const pat = (domain.totals.patterns + domain.totals.tieBreakers) * SUPPORTED_LANGUAGES.length;
    totalKeywords += kw;
    totalPatterns += pat;
    byDomain[name] = { keywords: kw, patterns: pat };
  }

  return { keywords: totalKeywords, patterns: totalPatterns, byDomain };
}
