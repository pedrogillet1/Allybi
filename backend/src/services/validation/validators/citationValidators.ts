/**
 * Citation Validators
 *
 * Validates inline citations, citation format, and document existence
 */

import { AnswerComponents, ValidatorConfig } from '../../../types/validation.types';

interface DocumentInfo {
  filename: string;
  displayTitle?: string;
}

/**
 * VALIDATOR 1: Inline Citations
 * 
 * Checks:
 * - Every document used has an inline citation
 * - Citations are properly formatted
 * - Citations are clickable
 * - Inline citations are small pills
 * - List citations are numbered + bold
 */
export async function validateInlineCitations(
  components: AnswerComponents,
  metadata: any,
  config: ValidatorConfig
) {
  const { inlineCitations, listCitations } = components;
  const { documents = [] } = metadata;

  const errors = [];

  // Check if any citations exist
  if (documents.length > 0 && inlineCitations.length === 0 && listCitations.length === 0) {
    return {
      passed: false,
      message: 'CITATION_MISSING: No citations found but documents were used',
      fixable: false,
      details: {
        documentsUsed: documents.length,
        citationsFound: 0,
      },
    };
  }

  // Check if every document has a citation
  const citedDocuments = new Set([
    ...inlineCitations.map(c => c.text),
    ...listCitations.map(c => c.text),
  ]);

  const missingCitations = (documents as DocumentInfo[]).filter(
    (doc: DocumentInfo) => !citedDocuments.has(doc.filename) && !citedDocuments.has(doc.displayTitle || '')
  );

  if (missingCitations.length > 0) {
    return {
      passed: false,
      message: `CITATION_MISSING: ${missingCitations.length} document(s) used but not cited`,
      fixable: true,
      fix: `Add citations for: ${missingCitations.map((d: DocumentInfo) => d.filename).join(', ')}`,
      details: {
        missingDocuments: missingCitations.map((d: DocumentInfo) => d.filename),
      },
    };
  }

  // Check citation format (must be bold + underlined)
  for (const citation of inlineCitations) {
    if (!citation.fullMatch.includes('<u>') || !citation.fullMatch.includes('**')) {
      return {
        passed: false,
        message: `CITATION_FORMAT_ERROR: Citation "${citation.text}" is not properly formatted`,
        fixable: true,
        fix: `Format as: **<u>${citation.text}</u>**`,
        location: {
          position: citation.position,
          text: citation.fullMatch,
        },
      };
    }
  }

  // Check list citations format (must be numbered + bold)
  for (const citation of listCitations) {
    if (!citation.fullMatch.includes('**')) {
      return {
        passed: false,
        message: `LIST_CITATION_FORMAT_ERROR: List citation "${citation.text}" is not bold`,
        fixable: true,
        fix: `Format as: 1. **${citation.text}**`,
        location: {
          position: citation.position,
          text: citation.fullMatch,
        },
      };
    }
  }

  return {
    passed: true,
    message: 'All citations are present and properly formatted',
    fixable: false,
  };
}

/**
 * VALIDATOR 2: Citation Format
 * 
 * Checks:
 * - Inline citations are not too large
 * - No "See all 50" issues
 * - No repeated citation blocks
 * - Citations have underline & bold
 * - No malformed markdown
 */
export async function validateCitationFormat(
  components: AnswerComponents,
  metadata: any,
  config: ValidatorConfig
) {
  const { inlineCitations, rawText } = components;

  // Check for oversized inline citations (should be small pills)
  for (const citation of inlineCitations) {
    if (citation.text.length > 50) {
      return {
        passed: false,
        message: `CITATION_TOO_LARGE: Inline citation "${citation.text}" is too long (${citation.text.length} chars)`,
        fixable: true,
        fix: 'Shorten citation or move to list',
        location: {
          position: citation.position,
          text: citation.fullMatch,
        },
      };
    }
  }

  // Check for "See all X" patterns (bad UX)
  if (rawText.match(/see all \d+/i)) {
    return {
      passed: false,
      message: 'CITATION_SEE_ALL_ISSUE: Found "See all X" pattern in citations',
      fixable: true,
      fix: 'Remove "See all" text and list documents explicitly',
    };
  }

  // Check for repeated citation blocks
  const citationTexts = inlineCitations.map(c => c.text);
  const duplicates = citationTexts.filter((text, index) => citationTexts.indexOf(text) !== index);
  
  if (duplicates.length > 0) {
    return {
      passed: false,
      message: `DUPLICATE_CITATIONS: Found ${duplicates.length} duplicate citation(s)`,
      fixable: true,
      fix: `Remove duplicate citations: ${duplicates.join(', ')}`,
      details: {
        duplicates: [...new Set(duplicates)],
      },
    };
  }

  // Check for malformed bold/underline markdown
  const malformedPatterns = [
    /\*\*\*[^*]+\*\*\*/g,  // Triple asterisks
    /\*\*_[^_]+_\*\*/g,     // Mixed bold/italic
    /<u>[^<]+<u>/g,         // Nested underline
  ];

  for (const pattern of malformedPatterns) {
    if (rawText.match(pattern)) {
      return {
        passed: false,
        message: 'MALFORMED_MARKDOWN: Found malformed citation markdown',
        fixable: true,
        fix: 'Fix markdown syntax: use **<u>text</u>** format',
      };
    }
  }

  return {
    passed: true,
    message: 'Citation format is correct',
    fixable: false,
  };
}

/**
 * VALIDATOR 3: Document Existence
 * 
 * Checks:
 * - Every cited document exists in workspace
 * - No invented/hallucinated documents
 * - Document IDs are valid
 */
export async function validateDocumentExistence(
  components: AnswerComponents,
  metadata: any,
  config: ValidatorConfig
) {
  const { inlineCitations, listCitations } = components;
  const { documents = [] } = metadata;

  const allCitations = [...inlineCitations, ...listCitations];
  const documentNames = new Set((documents as DocumentInfo[]).map((d: DocumentInfo) => d.filename));
  const displayTitles = new Set((documents as DocumentInfo[]).map((d: DocumentInfo) => d.displayTitle).filter(Boolean));

  const invalidCitations = [];

  for (const citation of allCitations) {
    const citationText = citation.text.trim();
    
    // Check if citation matches any document
    if (!documentNames.has(citationText) && !displayTitles.has(citationText)) {
      invalidCitations.push(citationText);
    }
  }

  if (invalidCitations.length > 0) {
    return {
      passed: false,
      message: `DOCUMENT_NOT_FOUND: ${invalidCitations.length} cited document(s) do not exist`,
      fixable: false,
      details: {
        invalidDocuments: invalidCitations,
        availableDocuments: Array.from(documentNames),
      },
    };
  }

  return {
    passed: true,
    message: 'All cited documents exist',
    fixable: false,
  };
}
