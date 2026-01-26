/**
 * Intent Types - KODA's Brain
 * Defines every action KODA can understand and perform
 */

export enum Intent {
  // ==========================================
  // CONTENT & RETRIEVAL INTENTS (Document Analysis)
  // ==========================================
  SUMMARIZE_DOCUMENT = 'SUMMARIZE_DOCUMENT',     // "Summarize the business plan"
  SEARCH_CONTENT = 'SEARCH_CONTENT',             // "Find mentions of Baxter Hotel"
  COMPARE_DOCUMENTS = 'COMPARE_DOCUMENTS',       // "Compare Q3 and Q4 reports"
  EXTRACT_TABLES = 'EXTRACT_TABLES',             // "Extract all tables from the contract"
  ANALYZE_DOCUMENT = 'ANALYZE_DOCUMENT',         // "What are the key differences?"

  // ==========================================
  // EXCEL/SPREADSHEET OPERATIONS
  // ==========================================
  READ_EXCEL_CELL = 'READ_EXCEL_CELL',           // "What is the value of cell C9?"
  READ_EXCEL_RANGE = 'READ_EXCEL_RANGE',         // "Show me cells A1 to C10"
  EXCEL_CALCULATION = 'EXCEL_CALCULATION',       // "Sum all values in column B"

  // ==========================================
  // NAVIGATION & LISTING INTENTS
  // ==========================================
  LIST_FILES = 'LIST_FILES',                     // "Show me all PDFs"
  DESCRIBE_FOLDER = 'DESCRIBE_FOLDER',           // "What's in the Finance folder?"
  FIND_DOCUMENT_LOCATION = 'FIND_DOCUMENT_LOCATION', // "Where is the business plan?"
  FIND_DUPLICATES = 'FIND_DUPLICATES',           // "Find duplicate files"

  // ==========================================
  // ACTION-BASED INTENTS (File Management)
  // ==========================================
  CREATE_FOLDER = 'CREATE_FOLDER',               // "Create a folder named Projects"
  RENAME_FOLDER = 'RENAME_FOLDER',               // "Rename folder X to Y"
  MOVE_FILES = 'MOVE_FILES',                     // "Move all documents to Archive"
  DELETE_FILES = 'DELETE_FILES',                 // "Delete all documents tagged as drafts"
  RENAME_FILES = 'RENAME_FILES',                 // "Rename all documents using pattern"
  AUTO_CATEGORIZE = 'AUTO_CATEGORIZE',           // "Automatically categorize all documents"
  CREATE_FILE = 'CREATE_FILE',                   // "Create a budget spreadsheet for 2024"

  // ==========================================
  // PROACTIVE FEATURES
  // ==========================================
  SET_REMINDER = 'SET_REMINDER',                 // "Remind me before contract expires"
  DETECT_MISSING = 'DETECT_MISSING',             // "Detect files missing signatures"
  FLAG_UNTAGGED = 'FLAG_UNTAGGED',               // "Which documents aren't tagged yet?"

  // ==========================================
  // SECURITY & SHARING
  // ==========================================
  VERIFY_INTEGRITY = 'VERIFY_INTEGRITY',         // "Verify this file hasn't been altered"
  GENERATE_SHARE_LINK = 'GENERATE_SHARE_LINK',  // "Generate a secure sharing link"
  CHECK_ACCESS = 'CHECK_ACCESS',                 // "Who has accessed this file?"

  // ==========================================
  // FALLBACK
  // ==========================================
  GENERAL_QA = 'GENERAL_QA'                      // General question - use RAG
}

/**
 * Result of intent classification
 */
export interface IntentResult {
  intent: Intent;
  confidence: number;
  entities: {
    documentName?: string;
    folderName?: string;
    targetName?: string;
    searchQuery?: string;
    cellReference?: string;
    sheetName?: string;
    compareTargets?: string[];
    renamePattern?: string;
    fileType?: string; // For CREATE_FILE: 'md', 'docx', 'pdf', 'pptx', 'xlsx'
    topic?: string; // For CREATE_FILE: topic/subject of file
    format?: string; // For CREATE_FILE: additional format info
  };
}

/**
 * Intent categories for routing
 */
export enum IntentCategory {
  CONTENT_ANALYSIS = 'CONTENT_ANALYSIS',
  NAVIGATION = 'NAVIGATION',
  FILE_ACTIONS = 'FILE_ACTIONS',
  EXCEL_OPS = 'EXCEL_OPS',
  PROACTIVE = 'PROACTIVE',
  SECURITY = 'SECURITY',
  GENERAL = 'GENERAL'
}

/**
 * Map intents to categories for easier routing
 */
export const INTENT_CATEGORY_MAP: Record<Intent, IntentCategory> = {
  // Content Analysis
  [Intent.SUMMARIZE_DOCUMENT]: IntentCategory.CONTENT_ANALYSIS,
  [Intent.SEARCH_CONTENT]: IntentCategory.CONTENT_ANALYSIS,
  [Intent.COMPARE_DOCUMENTS]: IntentCategory.CONTENT_ANALYSIS,
  [Intent.EXTRACT_TABLES]: IntentCategory.CONTENT_ANALYSIS,
  [Intent.ANALYZE_DOCUMENT]: IntentCategory.CONTENT_ANALYSIS,

  // Excel Operations
  [Intent.READ_EXCEL_CELL]: IntentCategory.EXCEL_OPS,
  [Intent.READ_EXCEL_RANGE]: IntentCategory.EXCEL_OPS,
  [Intent.EXCEL_CALCULATION]: IntentCategory.EXCEL_OPS,

  // Navigation
  [Intent.LIST_FILES]: IntentCategory.NAVIGATION,
  [Intent.DESCRIBE_FOLDER]: IntentCategory.NAVIGATION,
  [Intent.FIND_DOCUMENT_LOCATION]: IntentCategory.NAVIGATION,
  [Intent.FIND_DUPLICATES]: IntentCategory.NAVIGATION,

  // File Actions
  [Intent.CREATE_FILE]: IntentCategory.FILE_ACTIONS,
  [Intent.CREATE_FOLDER]: IntentCategory.FILE_ACTIONS,
  [Intent.RENAME_FOLDER]: IntentCategory.FILE_ACTIONS,
  [Intent.MOVE_FILES]: IntentCategory.FILE_ACTIONS,
  [Intent.DELETE_FILES]: IntentCategory.FILE_ACTIONS,
  [Intent.RENAME_FILES]: IntentCategory.FILE_ACTIONS,
  [Intent.AUTO_CATEGORIZE]: IntentCategory.FILE_ACTIONS,

  // Proactive
  [Intent.SET_REMINDER]: IntentCategory.PROACTIVE,
  [Intent.DETECT_MISSING]: IntentCategory.PROACTIVE,
  [Intent.FLAG_UNTAGGED]: IntentCategory.PROACTIVE,

  // Security
  [Intent.VERIFY_INTEGRITY]: IntentCategory.SECURITY,
  [Intent.GENERATE_SHARE_LINK]: IntentCategory.SECURITY,
  [Intent.CHECK_ACCESS]: IntentCategory.SECURITY,

  // General
  [Intent.GENERAL_QA]: IntentCategory.GENERAL,
};
