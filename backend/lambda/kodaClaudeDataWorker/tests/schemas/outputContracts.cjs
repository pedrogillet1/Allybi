/**
 * KODA Output Format Contracts
 *
 * Defines required and forbidden elements for each intent/domain combination.
 * Used to validate that responses conform to the format contract.
 */

const OUTPUT_CONTRACTS = {
  // Legal domain contracts
  LEGAL: {
    DOCUMENTS: {
      required_sections: ['Relevant Sections', 'Key Clauses'],
      optional_sections: ['Cross-References', 'Navigation'],
      forbidden_content: ['legal advice', 'should sue', 'will win'],
      required_patterns: [/section\s+\d+/i, /article\s+\d+/i, /clause/i],
      disclaimer_required: false
    },
    EXTRACTION: {
      required_sections: ['Extracted Values', 'Source Citations'],
      optional_sections: ['Confidence', 'Context'],
      forbidden_content: ['interpretation', 'advice', 'recommendation'],
      required_patterns: [],
      disclaimer_required: false
    },
    REASONING: {
      required_sections: ['Analysis', 'Implications'],
      optional_sections: ['Risks', 'Recommendations', 'Considerations'],
      forbidden_content: ['will definitely', 'guaranteed', 'you should'],
      required_patterns: [],
      disclaimer_required: true,
      disclaimer_text: 'This analysis is not legal advice'
    }
  },

  // Medical domain contracts
  MEDICAL: {
    DOCUMENTS: {
      required_sections: ['Relevant Records'],
      optional_sections: ['Lab Values', 'Timeline', 'History'],
      forbidden_content: ['diagnosis', 'prescribe', 'treatment plan'],
      required_patterns: [],
      disclaimer_required: false
    },
    EXTRACTION: {
      required_sections: ['Extracted Data'],
      optional_sections: ['Reference Ranges', 'Units', 'Date'],
      forbidden_content: ['abnormal', 'concerning', 'dangerous'],
      required_patterns: [/\d+(\.\d+)?\s*(mg|ml|mmol|%|g\/dL)?/i],
      disclaimer_required: false
    },
    REASONING: {
      required_sections: ['Clinical Interpretation', 'Considerations'],
      optional_sections: ['Limitations', 'Follow-up'],
      forbidden_content: ['diagnose', 'prescribe', 'you have', 'treatment'],
      required_patterns: [],
      disclaimer_required: true,
      disclaimer_text: 'This is not medical advice. Consult a healthcare professional'
    }
  },

  // Finance domain contracts
  FINANCE: {
    DOCUMENTS: {
      required_sections: ['Relevant Data'],
      optional_sections: ['Key Figures', 'Period Comparison'],
      forbidden_content: ['buy', 'sell', 'invest', 'guaranteed return'],
      required_patterns: [],
      disclaimer_required: false
    },
    EXTRACTION: {
      required_sections: ['Extracted Figures'],
      optional_sections: ['Calculations', 'Sources', 'Period'],
      forbidden_content: ['recommendation', 'should invest'],
      required_patterns: [/\$?\d+([,\.]\d+)*(\s*(million|billion|M|B|K))?/i],
      disclaimer_required: false
    },
    REASONING: {
      required_sections: ['Financial Analysis'],
      optional_sections: ['Trends', 'Risks', 'Comparisons'],
      forbidden_content: ['buy', 'sell', 'guaranteed', 'will increase'],
      required_patterns: [],
      disclaimer_required: true,
      disclaimer_text: 'This is not financial advice'
    }
  },

  // Engineering domain contracts
  ENGINEERING: {
    DOCUMENTS: {
      required_sections: ['Specifications'],
      optional_sections: ['Diagrams', 'References', 'Standards'],
      forbidden_content: [],
      required_patterns: [],
      disclaimer_required: false
    },
    EXTRACTION: {
      required_sections: ['Extracted Specifications'],
      optional_sections: ['Units', 'Tolerances', 'Standards Reference'],
      forbidden_content: [],
      required_patterns: [/\d+(\.\d+)?\s*(mm|cm|m|kg|N|MPa|psi)?/i],
      disclaimer_required: false
    },
    REASONING: {
      required_sections: ['Technical Analysis'],
      optional_sections: ['Safety Considerations', 'Compliance', 'Recommendations'],
      forbidden_content: ['certified safe', 'guaranteed to work'],
      required_patterns: [],
      disclaimer_required: true,
      disclaimer_text: 'Verify with qualified engineer'
    }
  },

  // Excel domain contracts
  EXCEL: {
    DOCUMENTS: {
      required_sections: ['Data Overview'],
      optional_sections: ['Structure', 'Sheets', 'Charts'],
      forbidden_content: [],
      required_patterns: [],
      disclaimer_required: false
    },
    EXTRACTION: {
      required_sections: ['Extracted Data'],
      optional_sections: ['Cell References', 'Formulas Used'],
      forbidden_content: [],
      required_patterns: [/[A-Z]+\d+/], // Cell reference pattern
      disclaimer_required: false
    },
    REASONING: {
      required_sections: ['Data Analysis'],
      optional_sections: ['Trends', 'Anomalies', 'Suggestions'],
      forbidden_content: [],
      required_patterns: [],
      disclaimer_required: false
    }
  },

  // Generic intent contracts (no domain)
  GENERIC: {
    HELP: {
      required_sections: ['Answer'],
      optional_sections: ['Related Features', 'Next Steps', 'Examples'],
      forbidden_content: ['cannot help', 'not supported'],
      required_patterns: [],
      disclaimer_required: false
    },
    CONVERSATION: {
      required_sections: ['Response'],
      optional_sections: [],
      forbidden_content: [],
      required_patterns: [],
      disclaimer_required: false
    },
    ERROR: {
      required_sections: ['Error Description'],
      optional_sections: ['Suggested Actions', 'Support Contact'],
      forbidden_content: ['your fault', 'user error'],
      required_patterns: [],
      disclaimer_required: false
    },
    FILE_ACTIONS: {
      required_sections: ['Action Status'],
      optional_sections: ['File Details', 'Next Steps'],
      forbidden_content: [],
      required_patterns: [],
      disclaimer_required: false
    },
    MEMORY: {
      required_sections: ['Information'],
      optional_sections: ['Context', 'Relevance'],
      forbidden_content: [],
      required_patterns: [],
      disclaimer_required: false
    },
    PREFERENCES: {
      required_sections: ['Setting Status'],
      optional_sections: ['Current Value', 'Related Settings'],
      forbidden_content: [],
      required_patterns: [],
      disclaimer_required: false
    },
    EDIT: {
      required_sections: ['Changes'],
      optional_sections: ['Original', 'Rationale'],
      forbidden_content: [],
      required_patterns: [],
      disclaimer_required: false
    }
  }
};

/**
 * Get the contract for a given intent/domain combination
 */
function getContract(intent, domain = 'GENERIC') {
  const domainUpper = domain.toUpperCase();
  const intentUpper = intent.toUpperCase();

  // Try domain-specific contract first
  if (OUTPUT_CONTRACTS[domainUpper]?.[intentUpper]) {
    return OUTPUT_CONTRACTS[domainUpper][intentUpper];
  }

  // Fall back to generic intent contract
  if (OUTPUT_CONTRACTS.GENERIC[intentUpper]) {
    return OUTPUT_CONTRACTS.GENERIC[intentUpper];
  }

  // Ultimate fallback
  return OUTPUT_CONTRACTS.GENERIC.CONVERSATION;
}

/**
 * Validate output against contract
 */
function validateOutput(output, intent, domain) {
  const contract = getContract(intent, domain);
  const failures = [];
  const warnings = [];

  // Check required sections
  for (const section of contract.required_sections) {
    const sectionPattern = new RegExp(section.replace(/\s+/g, '\\s*'), 'i');
    if (!sectionPattern.test(output)) {
      failures.push({
        type: 'missing_required_section',
        section,
        severity: 'error'
      });
    }
  }

  // Check forbidden content
  for (const forbidden of contract.forbidden_content) {
    if (output.toLowerCase().includes(forbidden.toLowerCase())) {
      failures.push({
        type: 'forbidden_content',
        content: forbidden,
        severity: 'error'
      });
    }
  }

  // Check required patterns
  for (const pattern of contract.required_patterns) {
    if (!pattern.test(output)) {
      warnings.push({
        type: 'missing_pattern',
        pattern: pattern.toString(),
        severity: 'warning'
      });
    }
  }

  // Check disclaimer if required
  if (contract.disclaimer_required) {
    const hasDisclaimer = output.toLowerCase().includes('not') &&
      (output.toLowerCase().includes('advice') ||
       output.toLowerCase().includes('consult') ||
       output.toLowerCase().includes('verify'));

    if (!hasDisclaimer) {
      failures.push({
        type: 'missing_disclaimer',
        expected: contract.disclaimer_text,
        severity: 'error'
      });
    }
  }

  return {
    valid: failures.length === 0,
    failures,
    warnings,
    contract: {
      intent,
      domain,
      required_sections: contract.required_sections
    }
  };
}

module.exports = {
  OUTPUT_CONTRACTS,
  getContract,
  validateOutput
};
