/**
 * Schema: Formatting Rules
 * Runtime answer formatting rules by intent/sub-intent
 */

import { IntentName } from './intents.schema.js';

// =============================================================================
// FORMATTING RULE STRUCTURE
// =============================================================================

export interface FormattingRule {
  /** Parent intent */
  intent: IntentName;
  /** Specific sub-intent */
  subIntent: string;
  /** Block configuration */
  blocks: {
    /** Title configuration */
    title: {
      allowed: boolean;
      required: boolean;
      maxLines: number;
      noEmojis: boolean;
      noTrailingPunctuation: boolean;
      condition?: string; // e.g., "only if complex"
    };
    /** Core answer configuration */
    core: {
      maxParagraphs: number;
      maxSentencesPerParagraph: number;
      allowLists: boolean;
      style: 'only' | 'required' | 'optional';
    };
    /** Sections configuration */
    sections: {
      allowed: boolean;
      maxCount: number;
      headerStyle: 'bold' | 'h3' | 'h4';
      maxBulletsPerSection: number;
      maxParagraphsPerSection: number;
    };
    /** Bullets configuration */
    bullets: {
      allowed: boolean;
      maxCount: number;
      allowNesting: boolean;
      nestingException?: string; // e.g., "compare/analytics may have small table"
    };
    /** Tables configuration */
    tables: {
      allowed: boolean;
      maxRows: number;
      allowedFor?: string[]; // e.g., ["compare", "analytics", "excel extract"]
      notFor?: string[]; // e.g., ["raw citation dumps"]
    };
    /** Quoted blocks for extracts */
    quotedBlock: {
      allowed: boolean;
      useFor?: string; // e.g., "extracted text"
    };
    /** Inline document references */
    inlineDocRefs: {
      allowed: boolean;
      format: 'bold_name' | 'link' | 'citation';
      note?: string; // e.g., "frontend resolves to doc id"
    };
    /** Next steps / suggestions */
    nextSteps: {
      allowed: boolean;
      maxItems: number;
    };
  };
  /** Block order (determines rendering sequence) */
  blockOrder: Array<'title' | 'core' | 'sections' | 'bullets' | 'table' | 'quotedBlock' | 'nextSteps' | 'inlineDocRefs'>;
  /** Additional notes for this formatting rule */
  notes?: string;
}

// =============================================================================
// GLOBAL FORMATTING DEFAULTS
// =============================================================================

export const GLOBAL_FORMATTING_DEFAULTS: Omit<FormattingRule, 'intent' | 'subIntent'> = {
  blocks: {
    title: {
      allowed: false,
      required: false,
      maxLines: 1,
      noEmojis: true,
      noTrailingPunctuation: true
    },
    core: {
      maxParagraphs: 3,
      maxSentencesPerParagraph: 2,
      allowLists: false,
      style: 'required'
    },
    sections: {
      allowed: false,
      maxCount: 3,
      headerStyle: 'bold',
      maxBulletsPerSection: 3,
      maxParagraphsPerSection: 3
    },
    bullets: {
      allowed: true,
      maxCount: 5,
      allowNesting: false
    },
    tables: {
      allowed: false,
      maxRows: 5
    },
    quotedBlock: {
      allowed: false
    },
    inlineDocRefs: {
      allowed: true,
      format: 'bold_name',
      note: 'frontend resolves to doc id'
    },
    nextSteps: {
      allowed: true,
      maxItems: 3
    }
  },
  blockOrder: ['title', 'core', 'sections', 'bullets', 'table', 'nextSteps', 'inlineDocRefs']
};

// =============================================================================
// INTENT-SPECIFIC FORMATTING RULES
// =============================================================================

export const FORMATTING_RULES: FormattingRule[] = [
  // =========================================================================
  // DOCUMENTS
  // =========================================================================
  {
    intent: 'documents',
    subIntent: 'factual',
    blocks: {
      title: { allowed: false, required: false, maxLines: 1, noEmojis: true, noTrailingPunctuation: true },
      core: { maxParagraphs: 2, maxSentencesPerParagraph: 2, allowLists: false, style: 'only' },
      sections: { allowed: false, maxCount: 0, headerStyle: 'bold', maxBulletsPerSection: 0, maxParagraphsPerSection: 0 },
      bullets: { allowed: false, maxCount: 0, allowNesting: false },
      tables: { allowed: false, maxRows: 0 },
      quotedBlock: { allowed: false },
      inlineDocRefs: { allowed: true, format: 'bold_name' },
      nextSteps: { allowed: false, maxItems: 0 }
    },
    blockOrder: ['core', 'inlineDocRefs'],
    notes: 'Core answer only; no title/sections/lists; inline doc refs allowed'
  },
  {
    intent: 'documents',
    subIntent: 'summary',
    blocks: {
      title: { allowed: true, required: false, maxLines: 1, noEmojis: true, noTrailingPunctuation: true, condition: 'medium/detailed only' },
      core: { maxParagraphs: 3, maxSentencesPerParagraph: 2, allowLists: false, style: 'required' },
      sections: { allowed: true, maxCount: 2, headerStyle: 'bold', maxBulletsPerSection: 3, maxParagraphsPerSection: 2 },
      bullets: { allowed: true, maxCount: 5, allowNesting: false },
      tables: { allowed: false, maxRows: 0 },
      quotedBlock: { allowed: false },
      inlineDocRefs: { allowed: true, format: 'bold_name' },
      nextSteps: { allowed: false, maxItems: 0 }
    },
    blockOrder: ['title', 'core', 'sections', 'inlineDocRefs'],
    notes: 'Short → core only; medium/detailed → optional title + core + up to 2 sections'
  },
  {
    intent: 'documents',
    subIntent: 'compare',
    blocks: {
      title: { allowed: true, required: true, maxLines: 1, noEmojis: true, noTrailingPunctuation: true },
      core: { maxParagraphs: 2, maxSentencesPerParagraph: 2, allowLists: false, style: 'required' },
      sections: { allowed: true, maxCount: 1, headerStyle: 'bold', maxBulletsPerSection: 5, maxParagraphsPerSection: 2 },
      bullets: { allowed: true, maxCount: 5, allowNesting: false },
      tables: { allowed: true, maxRows: 5, allowedFor: ['comparison'] },
      quotedBlock: { allowed: false },
      inlineDocRefs: { allowed: true, format: 'bold_name' },
      nextSteps: { allowed: false, maxItems: 0 }
    },
    blockOrder: ['title', 'core', 'sections', 'bullets', 'table', 'inlineDocRefs'],
    notes: 'Title required; core + comparison section; bullets or small table allowed'
  },
  {
    intent: 'documents',
    subIntent: 'analytics',
    blocks: {
      title: { allowed: true, required: true, maxLines: 1, noEmojis: true, noTrailingPunctuation: true },
      core: { maxParagraphs: 2, maxSentencesPerParagraph: 2, allowLists: false, style: 'required' },
      sections: { allowed: true, maxCount: 2, headerStyle: 'bold', maxBulletsPerSection: 5, maxParagraphsPerSection: 2 },
      bullets: { allowed: true, maxCount: 5, allowNesting: false },
      tables: { allowed: true, maxRows: 5, allowedFor: ['breakdown', 'statistics'] },
      quotedBlock: { allowed: false },
      inlineDocRefs: { allowed: true, format: 'bold_name' },
      nextSteps: { allowed: false, maxItems: 0 }
    },
    blockOrder: ['title', 'core', 'sections', 'table', 'inlineDocRefs'],
    notes: 'Title required; core + breakdown/assumptions sections; optional small table'
  },
  {
    intent: 'documents',
    subIntent: 'extract',
    blocks: {
      title: { allowed: false, required: false, maxLines: 0, noEmojis: true, noTrailingPunctuation: true },
      core: { maxParagraphs: 1, maxSentencesPerParagraph: 2, allowLists: false, style: 'required' },
      sections: { allowed: false, maxCount: 0, headerStyle: 'bold', maxBulletsPerSection: 0, maxParagraphsPerSection: 0 },
      bullets: { allowed: false, maxCount: 0, allowNesting: false },
      tables: { allowed: false, maxRows: 0 },
      quotedBlock: { allowed: true, useFor: 'extracted text' },
      inlineDocRefs: { allowed: true, format: 'bold_name' },
      nextSteps: { allowed: false, maxItems: 0 }
    },
    blockOrder: ['core', 'quotedBlock', 'inlineDocRefs'],
    notes: 'Core + quoted block; no title/analysis language'
  },
  {
    intent: 'documents',
    subIntent: 'manage',
    blocks: {
      title: { allowed: false, required: false, maxLines: 0, noEmojis: true, noTrailingPunctuation: true },
      core: { maxParagraphs: 2, maxSentencesPerParagraph: 2, allowLists: false, style: 'required' },
      sections: { allowed: false, maxCount: 0, headerStyle: 'bold', maxBulletsPerSection: 0, maxParagraphsPerSection: 0 },
      bullets: { allowed: true, maxCount: 10, allowNesting: false },
      tables: { allowed: false, maxRows: 0 },
      quotedBlock: { allowed: false },
      inlineDocRefs: { allowed: true, format: 'bold_name' },
      nextSteps: { allowed: true, maxItems: 3 }
    },
    blockOrder: ['core', 'bullets', 'nextSteps', 'inlineDocRefs'],
    notes: 'Core summary + structured list (e.g., recent docs/folders); no tables'
  },

  // =========================================================================
  // HELP
  // =========================================================================
  {
    intent: 'help',
    subIntent: 'tutorial',
    blocks: {
      title: { allowed: true, required: false, maxLines: 1, noEmojis: true, noTrailingPunctuation: true, condition: 'only if complex' },
      core: { maxParagraphs: 2, maxSentencesPerParagraph: 2, allowLists: false, style: 'required' },
      sections: { allowed: false, maxCount: 0, headerStyle: 'bold', maxBulletsPerSection: 0, maxParagraphsPerSection: 0 },
      bullets: { allowed: true, maxCount: 7, allowNesting: false },
      tables: { allowed: false, maxRows: 0 },
      quotedBlock: { allowed: false },
      inlineDocRefs: { allowed: false, format: 'bold_name' },
      nextSteps: { allowed: true, maxItems: 1 }
    },
    blockOrder: ['title', 'core', 'bullets', 'nextSteps'],
    notes: 'Core answer + steps/bullets; optional title only if complex; include one example question; no tables'
  },
  {
    intent: 'help',
    subIntent: 'feature',
    blocks: {
      title: { allowed: true, required: false, maxLines: 1, noEmojis: true, noTrailingPunctuation: true, condition: 'only if complex' },
      core: { maxParagraphs: 2, maxSentencesPerParagraph: 2, allowLists: false, style: 'required' },
      sections: { allowed: false, maxCount: 0, headerStyle: 'bold', maxBulletsPerSection: 0, maxParagraphsPerSection: 0 },
      bullets: { allowed: true, maxCount: 5, allowNesting: false },
      tables: { allowed: false, maxRows: 0 },
      quotedBlock: { allowed: false },
      inlineDocRefs: { allowed: false, format: 'bold_name' },
      nextSteps: { allowed: true, maxItems: 1 }
    },
    blockOrder: ['title', 'core', 'bullets', 'nextSteps'],
    notes: 'Core answer + steps/bullets; optional title only if complex; include one example question; no tables'
  },
  {
    intent: 'help',
    subIntent: 'product',
    blocks: {
      title: { allowed: true, required: false, maxLines: 1, noEmojis: true, noTrailingPunctuation: true, condition: 'only if complex' },
      core: { maxParagraphs: 2, maxSentencesPerParagraph: 2, allowLists: false, style: 'required' },
      sections: { allowed: false, maxCount: 0, headerStyle: 'bold', maxBulletsPerSection: 0, maxParagraphsPerSection: 0 },
      bullets: { allowed: true, maxCount: 5, allowNesting: false },
      tables: { allowed: false, maxRows: 0 },
      quotedBlock: { allowed: false },
      inlineDocRefs: { allowed: false, format: 'bold_name' },
      nextSteps: { allowed: true, maxItems: 1 }
    },
    blockOrder: ['title', 'core', 'bullets', 'nextSteps'],
    notes: 'Core answer + steps/bullets; optional title only if complex; include one example question; no tables'
  },

  // =========================================================================
  // CONVERSATION
  // =========================================================================
  {
    intent: 'conversation',
    subIntent: 'capabilities',
    blocks: {
      title: { allowed: false, required: false, maxLines: 0, noEmojis: true, noTrailingPunctuation: true },
      core: { maxParagraphs: 1, maxSentencesPerParagraph: 3, allowLists: false, style: 'only' },
      sections: { allowed: false, maxCount: 0, headerStyle: 'bold', maxBulletsPerSection: 0, maxParagraphsPerSection: 0 },
      bullets: { allowed: false, maxCount: 0, allowNesting: false },
      tables: { allowed: false, maxRows: 0 },
      quotedBlock: { allowed: false },
      inlineDocRefs: { allowed: false, format: 'bold_name' },
      nextSteps: { allowed: false, maxItems: 0 }
    },
    blockOrder: ['core'],
    notes: 'Brief core answer (1-3 sentences); no title; no sections/tables; keep concise'
  },
  {
    intent: 'conversation',
    subIntent: 'limitations',
    blocks: {
      title: { allowed: false, required: false, maxLines: 0, noEmojis: true, noTrailingPunctuation: true },
      core: { maxParagraphs: 1, maxSentencesPerParagraph: 3, allowLists: false, style: 'only' },
      sections: { allowed: false, maxCount: 0, headerStyle: 'bold', maxBulletsPerSection: 0, maxParagraphsPerSection: 0 },
      bullets: { allowed: false, maxCount: 0, allowNesting: false },
      tables: { allowed: false, maxRows: 0 },
      quotedBlock: { allowed: false },
      inlineDocRefs: { allowed: false, format: 'bold_name' },
      nextSteps: { allowed: false, maxItems: 0 }
    },
    blockOrder: ['core'],
    notes: 'Brief core answer (1-3 sentences); no title; no sections/tables; keep concise'
  },
  {
    intent: 'conversation',
    subIntent: 'privacy',
    blocks: {
      title: { allowed: false, required: false, maxLines: 0, noEmojis: true, noTrailingPunctuation: true },
      core: { maxParagraphs: 1, maxSentencesPerParagraph: 3, allowLists: false, style: 'only' },
      sections: { allowed: false, maxCount: 0, headerStyle: 'bold', maxBulletsPerSection: 0, maxParagraphsPerSection: 0 },
      bullets: { allowed: false, maxCount: 0, allowNesting: false },
      tables: { allowed: false, maxRows: 0 },
      quotedBlock: { allowed: false },
      inlineDocRefs: { allowed: false, format: 'bold_name' },
      nextSteps: { allowed: false, maxItems: 0 }
    },
    blockOrder: ['core'],
    notes: 'Brief core answer (1-3 sentences); no title; no sections/tables; keep concise'
  },
  {
    intent: 'conversation',
    subIntent: 'honesty',
    blocks: {
      title: { allowed: false, required: false, maxLines: 0, noEmojis: true, noTrailingPunctuation: true },
      core: { maxParagraphs: 1, maxSentencesPerParagraph: 3, allowLists: false, style: 'only' },
      sections: { allowed: false, maxCount: 0, headerStyle: 'bold', maxBulletsPerSection: 0, maxParagraphsPerSection: 0 },
      bullets: { allowed: false, maxCount: 0, allowNesting: false },
      tables: { allowed: false, maxRows: 0 },
      quotedBlock: { allowed: false },
      inlineDocRefs: { allowed: false, format: 'bold_name' },
      nextSteps: { allowed: false, maxItems: 0 }
    },
    blockOrder: ['core'],
    notes: 'Brief core answer (1-3 sentences); no title; no sections/tables; keep concise'
  },

  // =========================================================================
  // EDIT
  // =========================================================================
  {
    intent: 'edit',
    subIntent: 'rewrite',
    blocks: {
      title: { allowed: false, required: false, maxLines: 0, noEmojis: true, noTrailingPunctuation: true },
      core: { maxParagraphs: 3, maxSentencesPerParagraph: 3, allowLists: false, style: 'only' },
      sections: { allowed: false, maxCount: 0, headerStyle: 'bold', maxBulletsPerSection: 0, maxParagraphsPerSection: 0 },
      bullets: { allowed: true, maxCount: 5, allowNesting: false },
      tables: { allowed: false, maxRows: 0 },
      quotedBlock: { allowed: false },
      inlineDocRefs: { allowed: false, format: 'bold_name' },
      nextSteps: { allowed: false, maxItems: 0 }
    },
    blockOrder: ['core', 'bullets'],
    notes: 'Core answer only; no title/sections/tables; if guidance, use 3-5 bullets max'
  },
  {
    intent: 'edit',
    subIntent: 'simplify',
    blocks: {
      title: { allowed: false, required: false, maxLines: 0, noEmojis: true, noTrailingPunctuation: true },
      core: { maxParagraphs: 3, maxSentencesPerParagraph: 3, allowLists: false, style: 'only' },
      sections: { allowed: false, maxCount: 0, headerStyle: 'bold', maxBulletsPerSection: 0, maxParagraphsPerSection: 0 },
      bullets: { allowed: true, maxCount: 5, allowNesting: false },
      tables: { allowed: false, maxRows: 0 },
      quotedBlock: { allowed: false },
      inlineDocRefs: { allowed: false, format: 'bold_name' },
      nextSteps: { allowed: false, maxItems: 0 }
    },
    blockOrder: ['core', 'bullets'],
    notes: 'Core answer only; no title/sections/tables; if guidance, use 3-5 bullets max'
  },
  {
    intent: 'edit',
    subIntent: 'expand',
    blocks: {
      title: { allowed: false, required: false, maxLines: 0, noEmojis: true, noTrailingPunctuation: true },
      core: { maxParagraphs: 3, maxSentencesPerParagraph: 3, allowLists: false, style: 'only' },
      sections: { allowed: false, maxCount: 0, headerStyle: 'bold', maxBulletsPerSection: 0, maxParagraphsPerSection: 0 },
      bullets: { allowed: true, maxCount: 5, allowNesting: false },
      tables: { allowed: false, maxRows: 0 },
      quotedBlock: { allowed: false },
      inlineDocRefs: { allowed: false, format: 'bold_name' },
      nextSteps: { allowed: false, maxItems: 0 }
    },
    blockOrder: ['core', 'bullets'],
    notes: 'Core answer only; no title/sections/tables; if guidance, use 3-5 bullets max'
  },
  {
    intent: 'edit',
    subIntent: 'translate',
    blocks: {
      title: { allowed: false, required: false, maxLines: 0, noEmojis: true, noTrailingPunctuation: true },
      core: { maxParagraphs: 3, maxSentencesPerParagraph: 3, allowLists: false, style: 'only' },
      sections: { allowed: false, maxCount: 0, headerStyle: 'bold', maxBulletsPerSection: 0, maxParagraphsPerSection: 0 },
      bullets: { allowed: true, maxCount: 5, allowNesting: false },
      tables: { allowed: false, maxRows: 0 },
      quotedBlock: { allowed: false },
      inlineDocRefs: { allowed: false, format: 'bold_name' },
      nextSteps: { allowed: false, maxItems: 0 }
    },
    blockOrder: ['core', 'bullets'],
    notes: 'Core answer only; no title/sections/tables; if guidance, use 3-5 bullets max'
  },
  {
    intent: 'edit',
    subIntent: 'format',
    blocks: {
      title: { allowed: false, required: false, maxLines: 0, noEmojis: true, noTrailingPunctuation: true },
      core: { maxParagraphs: 3, maxSentencesPerParagraph: 3, allowLists: false, style: 'only' },
      sections: { allowed: false, maxCount: 0, headerStyle: 'bold', maxBulletsPerSection: 0, maxParagraphsPerSection: 0 },
      bullets: { allowed: true, maxCount: 5, allowNesting: false },
      tables: { allowed: false, maxRows: 0 },
      quotedBlock: { allowed: false },
      inlineDocRefs: { allowed: false, format: 'bold_name' },
      nextSteps: { allowed: false, maxItems: 0 }
    },
    blockOrder: ['core', 'bullets'],
    notes: 'Core answer only; no title/sections/tables; if guidance, use 3-5 bullets max'
  },

  // =========================================================================
  // REASONING
  // =========================================================================
  {
    intent: 'reasoning',
    subIntent: 'explain',
    blocks: {
      title: { allowed: true, required: false, maxLines: 1, noEmojis: true, noTrailingPunctuation: true, condition: 'only if complex' },
      core: { maxParagraphs: 2, maxSentencesPerParagraph: 2, allowLists: false, style: 'required' },
      sections: { allowed: true, maxCount: 1, headerStyle: 'bold', maxBulletsPerSection: 5, maxParagraphsPerSection: 2 },
      bullets: { allowed: true, maxCount: 5, allowNesting: false },
      tables: { allowed: false, maxRows: 0 },
      quotedBlock: { allowed: false },
      inlineDocRefs: { allowed: true, format: 'bold_name' },
      nextSteps: { allowed: false, maxItems: 0 }
    },
    blockOrder: ['title', 'core', 'sections', 'inlineDocRefs'],
    notes: 'Core + optional short section of key points; no title unless complex'
  },
  {
    intent: 'reasoning',
    subIntent: 'compare',
    blocks: {
      title: { allowed: true, required: false, maxLines: 1, noEmojis: true, noTrailingPunctuation: true },
      core: { maxParagraphs: 2, maxSentencesPerParagraph: 2, allowLists: false, style: 'required' },
      sections: { allowed: false, maxCount: 0, headerStyle: 'bold', maxBulletsPerSection: 0, maxParagraphsPerSection: 0 },
      bullets: { allowed: true, maxCount: 5, allowNesting: false },
      tables: { allowed: true, maxRows: 5 },
      quotedBlock: { allowed: false },
      inlineDocRefs: { allowed: true, format: 'bold_name' },
      nextSteps: { allowed: false, maxItems: 0 }
    },
    blockOrder: ['title', 'core', 'bullets', 'table', 'inlineDocRefs'],
    notes: 'Title optional; core + comparison bullets/table (max 5 rows)'
  },
  {
    intent: 'reasoning',
    subIntent: 'calculate',
    blocks: {
      title: { allowed: false, required: false, maxLines: 0, noEmojis: true, noTrailingPunctuation: true },
      core: { maxParagraphs: 1, maxSentencesPerParagraph: 2, allowLists: false, style: 'required' },
      sections: { allowed: false, maxCount: 0, headerStyle: 'bold', maxBulletsPerSection: 0, maxParagraphsPerSection: 0 },
      bullets: { allowed: true, maxCount: 5, allowNesting: false },
      tables: { allowed: false, maxRows: 0 },
      quotedBlock: { allowed: false },
      inlineDocRefs: { allowed: true, format: 'bold_name' },
      nextSteps: { allowed: false, maxItems: 0 }
    },
    blockOrder: ['core', 'bullets', 'inlineDocRefs'],
    notes: 'Core with result; optional 3-5 bullet breakdown; no long sections'
  },
  {
    intent: 'reasoning',
    subIntent: 'scenario',
    blocks: {
      title: { allowed: false, required: false, maxLines: 0, noEmojis: true, noTrailingPunctuation: true },
      core: { maxParagraphs: 2, maxSentencesPerParagraph: 2, allowLists: false, style: 'required' },
      sections: { allowed: true, maxCount: 1, headerStyle: 'bold', maxBulletsPerSection: 3, maxParagraphsPerSection: 2 },
      bullets: { allowed: true, maxCount: 3, allowNesting: false },
      tables: { allowed: false, maxRows: 0 },
      quotedBlock: { allowed: false },
      inlineDocRefs: { allowed: true, format: 'bold_name' },
      nextSteps: { allowed: false, maxItems: 0 }
    },
    blockOrder: ['core', 'sections', 'inlineDocRefs'],
    notes: 'Core + 1 section ("What this means") with up to 3 bullets'
  },
  {
    intent: 'reasoning',
    subIntent: 'decision',
    blocks: {
      title: { allowed: false, required: false, maxLines: 0, noEmojis: true, noTrailingPunctuation: true },
      core: { maxParagraphs: 2, maxSentencesPerParagraph: 2, allowLists: false, style: 'required' },
      sections: { allowed: true, maxCount: 1, headerStyle: 'bold', maxBulletsPerSection: 3, maxParagraphsPerSection: 2 },
      bullets: { allowed: true, maxCount: 3, allowNesting: false },
      tables: { allowed: false, maxRows: 0 },
      quotedBlock: { allowed: false },
      inlineDocRefs: { allowed: true, format: 'bold_name' },
      nextSteps: { allowed: false, maxItems: 0 }
    },
    blockOrder: ['core', 'sections', 'inlineDocRefs'],
    notes: 'Core + 1 section ("Options") with up to 3 bullets'
  },

  // =========================================================================
  // MEMORY
  // =========================================================================
  {
    intent: 'memory',
    subIntent: 'store',
    blocks: {
      title: { allowed: false, required: false, maxLines: 0, noEmojis: true, noTrailingPunctuation: true },
      core: { maxParagraphs: 1, maxSentencesPerParagraph: 2, allowLists: false, style: 'required' },
      sections: { allowed: false, maxCount: 0, headerStyle: 'bold', maxBulletsPerSection: 0, maxParagraphsPerSection: 0 },
      bullets: { allowed: true, maxCount: 4, allowNesting: false },
      tables: { allowed: false, maxRows: 0 },
      quotedBlock: { allowed: false },
      inlineDocRefs: { allowed: false, format: 'bold_name' },
      nextSteps: { allowed: false, maxItems: 0 }
    },
    blockOrder: ['core', 'bullets'],
    notes: 'Core answer + 2-4 bullets for clarification/steps; no title/tables'
  },
  {
    intent: 'memory',
    subIntent: 'recall',
    blocks: {
      title: { allowed: false, required: false, maxLines: 0, noEmojis: true, noTrailingPunctuation: true },
      core: { maxParagraphs: 1, maxSentencesPerParagraph: 2, allowLists: false, style: 'required' },
      sections: { allowed: false, maxCount: 0, headerStyle: 'bold', maxBulletsPerSection: 0, maxParagraphsPerSection: 0 },
      bullets: { allowed: true, maxCount: 4, allowNesting: false },
      tables: { allowed: false, maxRows: 0 },
      quotedBlock: { allowed: false },
      inlineDocRefs: { allowed: false, format: 'bold_name' },
      nextSteps: { allowed: false, maxItems: 0 }
    },
    blockOrder: ['core', 'bullets'],
    notes: 'Core answer + 2-4 bullets for clarification/steps; no title/tables'
  },
  {
    intent: 'memory',
    subIntent: 'update',
    blocks: {
      title: { allowed: false, required: false, maxLines: 0, noEmojis: true, noTrailingPunctuation: true },
      core: { maxParagraphs: 1, maxSentencesPerParagraph: 2, allowLists: false, style: 'required' },
      sections: { allowed: false, maxCount: 0, headerStyle: 'bold', maxBulletsPerSection: 0, maxParagraphsPerSection: 0 },
      bullets: { allowed: true, maxCount: 4, allowNesting: false },
      tables: { allowed: false, maxRows: 0 },
      quotedBlock: { allowed: false },
      inlineDocRefs: { allowed: false, format: 'bold_name' },
      nextSteps: { allowed: false, maxItems: 0 }
    },
    blockOrder: ['core', 'bullets'],
    notes: 'Core answer + 2-4 bullets for clarification/steps; no title/tables'
  },

  // =========================================================================
  // ERROR
  // =========================================================================
  {
    intent: 'error',
    subIntent: 'no_document',
    blocks: {
      title: { allowed: false, required: false, maxLines: 0, noEmojis: true, noTrailingPunctuation: true },
      core: { maxParagraphs: 1, maxSentencesPerParagraph: 1, allowLists: false, style: 'required' },
      sections: { allowed: false, maxCount: 0, headerStyle: 'bold', maxBulletsPerSection: 0, maxParagraphsPerSection: 0 },
      bullets: { allowed: true, maxCount: 2, allowNesting: false },
      tables: { allowed: false, maxRows: 0 },
      quotedBlock: { allowed: false },
      inlineDocRefs: { allowed: false, format: 'bold_name' },
      nextSteps: { allowed: true, maxItems: 2 }
    },
    blockOrder: ['core', 'bullets'],
    notes: 'No title; 1 sentence stating issue + 1-2 bullets for next steps; no tables/lists beyond that'
  },
  {
    intent: 'error',
    subIntent: 'not_found',
    blocks: {
      title: { allowed: false, required: false, maxLines: 0, noEmojis: true, noTrailingPunctuation: true },
      core: { maxParagraphs: 1, maxSentencesPerParagraph: 1, allowLists: false, style: 'required' },
      sections: { allowed: false, maxCount: 0, headerStyle: 'bold', maxBulletsPerSection: 0, maxParagraphsPerSection: 0 },
      bullets: { allowed: true, maxCount: 2, allowNesting: false },
      tables: { allowed: false, maxRows: 0 },
      quotedBlock: { allowed: false },
      inlineDocRefs: { allowed: false, format: 'bold_name' },
      nextSteps: { allowed: true, maxItems: 2 }
    },
    blockOrder: ['core', 'bullets'],
    notes: 'No title; 1 sentence stating issue + 1-2 bullets for next steps; no tables/lists beyond that'
  },
  {
    intent: 'error',
    subIntent: 'limitation',
    blocks: {
      title: { allowed: false, required: false, maxLines: 0, noEmojis: true, noTrailingPunctuation: true },
      core: { maxParagraphs: 1, maxSentencesPerParagraph: 1, allowLists: false, style: 'required' },
      sections: { allowed: false, maxCount: 0, headerStyle: 'bold', maxBulletsPerSection: 0, maxParagraphsPerSection: 0 },
      bullets: { allowed: true, maxCount: 2, allowNesting: false },
      tables: { allowed: false, maxRows: 0 },
      quotedBlock: { allowed: false },
      inlineDocRefs: { allowed: false, format: 'bold_name' },
      nextSteps: { allowed: true, maxItems: 2 }
    },
    blockOrder: ['core', 'bullets'],
    notes: 'No title; 1 sentence stating issue + 1-2 bullets for next steps; no tables/lists beyond that'
  },
  {
    intent: 'error',
    subIntent: 'ambiguous',
    blocks: {
      title: { allowed: false, required: false, maxLines: 0, noEmojis: true, noTrailingPunctuation: true },
      core: { maxParagraphs: 1, maxSentencesPerParagraph: 1, allowLists: false, style: 'required' },
      sections: { allowed: false, maxCount: 0, headerStyle: 'bold', maxBulletsPerSection: 0, maxParagraphsPerSection: 0 },
      bullets: { allowed: true, maxCount: 2, allowNesting: false },
      tables: { allowed: false, maxRows: 0 },
      quotedBlock: { allowed: false },
      inlineDocRefs: { allowed: false, format: 'bold_name' },
      nextSteps: { allowed: true, maxItems: 2 }
    },
    blockOrder: ['core', 'bullets'],
    notes: 'No title; 1 sentence stating issue + 1-2 bullets for next steps; no tables/lists beyond that'
  },

  // =========================================================================
  // PREFERENCES
  // =========================================================================
  {
    intent: 'preferences',
    subIntent: 'language',
    blocks: {
      title: { allowed: false, required: false, maxLines: 0, noEmojis: true, noTrailingPunctuation: true },
      core: { maxParagraphs: 1, maxSentencesPerParagraph: 2, allowLists: false, style: 'required' },
      sections: { allowed: false, maxCount: 0, headerStyle: 'bold', maxBulletsPerSection: 0, maxParagraphsPerSection: 0 },
      bullets: { allowed: true, maxCount: 4, allowNesting: false },
      tables: { allowed: false, maxRows: 0 },
      quotedBlock: { allowed: false },
      inlineDocRefs: { allowed: false, format: 'bold_name' },
      nextSteps: { allowed: false, maxItems: 0 }
    },
    blockOrder: ['core', 'bullets'],
    notes: 'Core answer + 2-4 bullets for options; no title/tables'
  },
  {
    intent: 'preferences',
    subIntent: 'style',
    blocks: {
      title: { allowed: false, required: false, maxLines: 0, noEmojis: true, noTrailingPunctuation: true },
      core: { maxParagraphs: 1, maxSentencesPerParagraph: 2, allowLists: false, style: 'required' },
      sections: { allowed: false, maxCount: 0, headerStyle: 'bold', maxBulletsPerSection: 0, maxParagraphsPerSection: 0 },
      bullets: { allowed: true, maxCount: 4, allowNesting: false },
      tables: { allowed: false, maxRows: 0 },
      quotedBlock: { allowed: false },
      inlineDocRefs: { allowed: false, format: 'bold_name' },
      nextSteps: { allowed: false, maxItems: 0 }
    },
    blockOrder: ['core', 'bullets'],
    notes: 'Core answer + 2-4 bullets for options; no title/tables'
  },
  {
    intent: 'preferences',
    subIntent: 'format',
    blocks: {
      title: { allowed: false, required: false, maxLines: 0, noEmojis: true, noTrailingPunctuation: true },
      core: { maxParagraphs: 1, maxSentencesPerParagraph: 2, allowLists: false, style: 'required' },
      sections: { allowed: false, maxCount: 0, headerStyle: 'bold', maxBulletsPerSection: 0, maxParagraphsPerSection: 0 },
      bullets: { allowed: true, maxCount: 4, allowNesting: false },
      tables: { allowed: false, maxRows: 0 },
      quotedBlock: { allowed: false },
      inlineDocRefs: { allowed: false, format: 'bold_name' },
      nextSteps: { allowed: false, maxItems: 0 }
    },
    blockOrder: ['core', 'bullets'],
    notes: 'Core answer + 2-4 bullets for options; no title/tables'
  },
  {
    intent: 'preferences',
    subIntent: 'focus',
    blocks: {
      title: { allowed: false, required: false, maxLines: 0, noEmojis: true, noTrailingPunctuation: true },
      core: { maxParagraphs: 1, maxSentencesPerParagraph: 2, allowLists: false, style: 'required' },
      sections: { allowed: false, maxCount: 0, headerStyle: 'bold', maxBulletsPerSection: 0, maxParagraphsPerSection: 0 },
      bullets: { allowed: true, maxCount: 4, allowNesting: false },
      tables: { allowed: false, maxRows: 0 },
      quotedBlock: { allowed: false },
      inlineDocRefs: { allowed: false, format: 'bold_name' },
      nextSteps: { allowed: false, maxItems: 0 }
    },
    blockOrder: ['core', 'bullets'],
    notes: 'Core answer + 2-4 bullets for options; no title/tables'
  },
  {
    intent: 'preferences',
    subIntent: 'persistence',
    blocks: {
      title: { allowed: false, required: false, maxLines: 0, noEmojis: true, noTrailingPunctuation: true },
      core: { maxParagraphs: 1, maxSentencesPerParagraph: 2, allowLists: false, style: 'required' },
      sections: { allowed: false, maxCount: 0, headerStyle: 'bold', maxBulletsPerSection: 0, maxParagraphsPerSection: 0 },
      bullets: { allowed: true, maxCount: 4, allowNesting: false },
      tables: { allowed: false, maxRows: 0 },
      quotedBlock: { allowed: false },
      inlineDocRefs: { allowed: false, format: 'bold_name' },
      nextSteps: { allowed: false, maxItems: 0 }
    },
    blockOrder: ['core', 'bullets'],
    notes: 'Core answer + 2-4 bullets for options; no title/tables'
  },

  // =========================================================================
  // EXTRACTION
  // =========================================================================
  {
    intent: 'extraction',
    subIntent: 'table',
    blocks: {
      title: { allowed: false, required: false, maxLines: 0, noEmojis: true, noTrailingPunctuation: true },
      core: { maxParagraphs: 1, maxSentencesPerParagraph: 1, allowLists: false, style: 'required' },
      sections: { allowed: false, maxCount: 0, headerStyle: 'bold', maxBulletsPerSection: 0, maxParagraphsPerSection: 0 },
      bullets: { allowed: false, maxCount: 0, allowNesting: false },
      tables: { allowed: true, maxRows: 5, allowedFor: ['table extract'] },
      quotedBlock: { allowed: false },
      inlineDocRefs: { allowed: true, format: 'bold_name' },
      nextSteps: { allowed: false, maxItems: 0 }
    },
    blockOrder: ['core', 'table', 'inlineDocRefs'],
    notes: 'Core answer; tables only for explicit table extract (max 5 rows); no title; no analysis prose'
  },
  {
    intent: 'extraction',
    subIntent: 'list',
    blocks: {
      title: { allowed: false, required: false, maxLines: 0, noEmojis: true, noTrailingPunctuation: true },
      core: { maxParagraphs: 1, maxSentencesPerParagraph: 1, allowLists: false, style: 'required' },
      sections: { allowed: false, maxCount: 0, headerStyle: 'bold', maxBulletsPerSection: 0, maxParagraphsPerSection: 0 },
      bullets: { allowed: true, maxCount: 10, allowNesting: false },
      tables: { allowed: false, maxRows: 0 },
      quotedBlock: { allowed: false },
      inlineDocRefs: { allowed: true, format: 'bold_name' },
      nextSteps: { allowed: false, maxItems: 0 }
    },
    blockOrder: ['core', 'bullets', 'inlineDocRefs'],
    notes: 'Core answer; compact bullets for lists; no title; no analysis prose'
  },
  {
    intent: 'extraction',
    subIntent: 'reference',
    blocks: {
      title: { allowed: false, required: false, maxLines: 0, noEmojis: true, noTrailingPunctuation: true },
      core: { maxParagraphs: 1, maxSentencesPerParagraph: 1, allowLists: false, style: 'required' },
      sections: { allowed: false, maxCount: 0, headerStyle: 'bold', maxBulletsPerSection: 0, maxParagraphsPerSection: 0 },
      bullets: { allowed: true, maxCount: 5, allowNesting: false },
      tables: { allowed: false, maxRows: 0 },
      quotedBlock: { allowed: true, useFor: 'citations' },
      inlineDocRefs: { allowed: true, format: 'bold_name' },
      nextSteps: { allowed: false, maxItems: 0 }
    },
    blockOrder: ['core', 'quotedBlock', 'bullets', 'inlineDocRefs'],
    notes: 'Core answer; use quoted block for text; no title; no analysis prose'
  },
  {
    intent: 'extraction',
    subIntent: 'numbers',
    blocks: {
      title: { allowed: false, required: false, maxLines: 0, noEmojis: true, noTrailingPunctuation: true },
      core: { maxParagraphs: 1, maxSentencesPerParagraph: 1, allowLists: false, style: 'required' },
      sections: { allowed: false, maxCount: 0, headerStyle: 'bold', maxBulletsPerSection: 0, maxParagraphsPerSection: 0 },
      bullets: { allowed: true, maxCount: 5, allowNesting: false },
      tables: { allowed: false, maxRows: 0 },
      quotedBlock: { allowed: false },
      inlineDocRefs: { allowed: true, format: 'bold_name' },
      nextSteps: { allowed: false, maxItems: 0 }
    },
    blockOrder: ['core', 'bullets', 'inlineDocRefs'],
    notes: 'Core answer; compact bullets for numbers; no title; no analysis prose'
  },

  // =========================================================================
  // DOMAIN_SPECIALIZED
  // (Follow parent intent formatting - documents/reasoning/extraction)
  // =========================================================================
  {
    intent: 'domain_specialized',
    subIntent: 'finance',
    blocks: {
      title: { allowed: true, required: false, maxLines: 1, noEmojis: true, noTrailingPunctuation: true, condition: 'only for compare/analytics' },
      core: { maxParagraphs: 2, maxSentencesPerParagraph: 2, allowLists: false, style: 'required' },
      sections: { allowed: true, maxCount: 2, headerStyle: 'bold', maxBulletsPerSection: 3, maxParagraphsPerSection: 2 },
      bullets: { allowed: true, maxCount: 5, allowNesting: false },
      tables: { allowed: true, maxRows: 5, allowedFor: ['analytics', 'comparison'] },
      quotedBlock: { allowed: true, useFor: 'extracted figures' },
      inlineDocRefs: { allowed: true, format: 'bold_name' },
      nextSteps: { allowed: false, maxItems: 0 }
    },
    blockOrder: ['title', 'core', 'sections', 'bullets', 'table', 'quotedBlock', 'inlineDocRefs'],
    notes: 'Follow documents/reasoning rules; no extra titles unless compare/analytics; keep concise'
  },
  {
    intent: 'domain_specialized',
    subIntent: 'legal',
    blocks: {
      title: { allowed: true, required: false, maxLines: 1, noEmojis: true, noTrailingPunctuation: true, condition: 'only for compare/analytics' },
      core: { maxParagraphs: 2, maxSentencesPerParagraph: 2, allowLists: false, style: 'required' },
      sections: { allowed: true, maxCount: 2, headerStyle: 'bold', maxBulletsPerSection: 3, maxParagraphsPerSection: 2 },
      bullets: { allowed: true, maxCount: 5, allowNesting: false },
      tables: { allowed: true, maxRows: 5, allowedFor: ['analytics', 'comparison'] },
      quotedBlock: { allowed: true, useFor: 'legal excerpts' },
      inlineDocRefs: { allowed: true, format: 'bold_name' },
      nextSteps: { allowed: false, maxItems: 0 }
    },
    blockOrder: ['title', 'core', 'sections', 'bullets', 'table', 'quotedBlock', 'inlineDocRefs'],
    notes: 'Follow documents/reasoning rules; no extra titles unless compare/analytics; keep concise'
  },
  {
    intent: 'domain_specialized',
    subIntent: 'medical',
    blocks: {
      title: { allowed: true, required: false, maxLines: 1, noEmojis: true, noTrailingPunctuation: true, condition: 'only for compare/analytics' },
      core: { maxParagraphs: 2, maxSentencesPerParagraph: 2, allowLists: false, style: 'required' },
      sections: { allowed: true, maxCount: 2, headerStyle: 'bold', maxBulletsPerSection: 3, maxParagraphsPerSection: 2 },
      bullets: { allowed: true, maxCount: 5, allowNesting: false },
      tables: { allowed: true, maxRows: 5, allowedFor: ['analytics', 'comparison'] },
      quotedBlock: { allowed: true, useFor: 'medical excerpts' },
      inlineDocRefs: { allowed: true, format: 'bold_name' },
      nextSteps: { allowed: false, maxItems: 0 }
    },
    blockOrder: ['title', 'core', 'sections', 'bullets', 'table', 'quotedBlock', 'inlineDocRefs'],
    notes: 'Follow documents/reasoning rules; no extra titles unless compare/analytics; keep concise'
  },
  {
    intent: 'domain_specialized',
    subIntent: 'accounting',
    blocks: {
      title: { allowed: true, required: false, maxLines: 1, noEmojis: true, noTrailingPunctuation: true, condition: 'only for compare/analytics' },
      core: { maxParagraphs: 2, maxSentencesPerParagraph: 2, allowLists: false, style: 'required' },
      sections: { allowed: true, maxCount: 2, headerStyle: 'bold', maxBulletsPerSection: 3, maxParagraphsPerSection: 2 },
      bullets: { allowed: true, maxCount: 5, allowNesting: false },
      tables: { allowed: true, maxRows: 5, allowedFor: ['analytics', 'comparison', 'ledger'] },
      quotedBlock: { allowed: true, useFor: 'accounting figures' },
      inlineDocRefs: { allowed: true, format: 'bold_name' },
      nextSteps: { allowed: false, maxItems: 0 }
    },
    blockOrder: ['title', 'core', 'sections', 'bullets', 'table', 'quotedBlock', 'inlineDocRefs'],
    notes: 'Follow documents/reasoning rules; no extra titles unless compare/analytics; keep concise'
  },
  {
    intent: 'domain_specialized',
    subIntent: 'engineering',
    blocks: {
      title: { allowed: true, required: false, maxLines: 1, noEmojis: true, noTrailingPunctuation: true, condition: 'only for compare/analytics' },
      core: { maxParagraphs: 2, maxSentencesPerParagraph: 2, allowLists: false, style: 'required' },
      sections: { allowed: true, maxCount: 2, headerStyle: 'bold', maxBulletsPerSection: 3, maxParagraphsPerSection: 2 },
      bullets: { allowed: true, maxCount: 5, allowNesting: false },
      tables: { allowed: true, maxRows: 5, allowedFor: ['analytics', 'comparison', 'specs'] },
      quotedBlock: { allowed: true, useFor: 'technical excerpts' },
      inlineDocRefs: { allowed: true, format: 'bold_name' },
      nextSteps: { allowed: false, maxItems: 0 }
    },
    blockOrder: ['title', 'core', 'sections', 'bullets', 'table', 'quotedBlock', 'inlineDocRefs'],
    notes: 'Follow documents/reasoning rules; no extra titles unless compare/analytics; keep concise'
  },
  {
    intent: 'domain_specialized',
    subIntent: 'excel',
    blocks: {
      title: { allowed: true, required: false, maxLines: 1, noEmojis: true, noTrailingPunctuation: true, condition: 'only for compare/analytics' },
      core: { maxParagraphs: 2, maxSentencesPerParagraph: 2, allowLists: false, style: 'required' },
      sections: { allowed: true, maxCount: 2, headerStyle: 'bold', maxBulletsPerSection: 3, maxParagraphsPerSection: 2 },
      bullets: { allowed: true, maxCount: 5, allowNesting: false },
      tables: { allowed: true, maxRows: 5, allowedFor: ['excel extract', 'analytics', 'comparison'] },
      quotedBlock: { allowed: false },
      inlineDocRefs: { allowed: true, format: 'bold_name' },
      nextSteps: { allowed: false, maxItems: 0 }
    },
    blockOrder: ['title', 'core', 'sections', 'bullets', 'table', 'inlineDocRefs'],
    notes: 'Follow documents/reasoning rules; tables allowed for excel extract; keep concise'
  }
];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get formatting rule for a specific intent/sub-intent combination
 */
export function getFormattingRule(intent: IntentName, subIntent: string): FormattingRule | undefined {
  return FORMATTING_RULES.find(r => r.intent === intent && r.subIntent === subIntent);
}

/**
 * Get all formatting rules for an intent
 */
export function getFormattingRulesForIntent(intent: IntentName): FormattingRule[] {
  return FORMATTING_RULES.filter(r => r.intent === intent);
}

/**
 * Validate if a block type is allowed for given intent/sub-intent
 */
export function isBlockAllowed(
  intent: IntentName,
  subIntent: string,
  blockType: keyof FormattingRule['blocks']
): boolean {
  const rule = getFormattingRule(intent, subIntent);
  if (!rule) return false;
  const block = rule.blocks[blockType];
  return 'allowed' in block ? block.allowed : false;
}
