/**
 * Capability Registry Service
 *
 * Central registry of what Koda can actually do.
 * Follow-ups must ONLY suggest actions that are enabled here.
 */

export interface CapabilityConfig {
  // Document operations
  doc_summarize: boolean;
  doc_extract: boolean;
  doc_locate: boolean;
  doc_compare: boolean;
  doc_qa: boolean;

  // File operations
  file_open: boolean;
  file_preview: boolean;
  file_list: boolean;
  file_filter: boolean;
  file_search: boolean;
  file_stats: boolean;
  file_move: boolean;
  file_rename: boolean;
  file_delete: boolean;

  // Finance/Excel
  excel_compute: boolean;
  excel_compare_periods: boolean;
  excel_trend: boolean;
  excel_extract_metric: boolean;

  // Formatting
  format_bullets: boolean;
  format_table: boolean;
  format_numbered: boolean;

  // UI features
  source_buttons: boolean;
  follow_up_chips: boolean;
  file_pills: boolean;
}

export interface FileTypeSupport {
  summarize: boolean;
  extract: boolean;
  locate: boolean;
  preview: boolean;
  ocr: boolean;
}

export type SupportedMimeType =
  | 'application/pdf'
  | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  | 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  | 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  | 'text/plain'
  | 'text/csv'
  | 'image/png'
  | 'image/jpeg';

const FILE_TYPE_SUPPORT: Record<SupportedMimeType, FileTypeSupport> = {
  'application/pdf': {
    summarize: true,
    extract: true,
    locate: true,
    preview: true,
    ocr: true,
  },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    summarize: true,
    extract: true,
    locate: true,
    preview: true,
    ocr: false,
  },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
    summarize: true,
    extract: true,
    locate: true,
    preview: true,
    ocr: false,
  },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': {
    summarize: true,
    extract: true,
    locate: true,
    preview: true,
    ocr: false,
  },
  'text/plain': {
    summarize: true,
    extract: true,
    locate: true,
    preview: true,
    ocr: false,
  },
  'text/csv': {
    summarize: true,
    extract: true,
    locate: true,
    preview: true,
    ocr: false,
  },
  'image/png': {
    summarize: false,
    extract: false,
    locate: false,
    preview: true,
    ocr: true,
  },
  'image/jpeg': {
    summarize: false,
    extract: false,
    locate: false,
    preview: true,
    ocr: true,
  },
};

/**
 * Current capabilities - all enabled features
 */
const CURRENT_CAPABILITIES: CapabilityConfig = {
  // Document operations - all enabled
  doc_summarize: true,
  doc_extract: true,
  doc_locate: true,
  doc_compare: true,
  doc_qa: true,

  // File operations
  file_open: true,
  file_preview: true,
  file_list: true,
  file_filter: true,
  file_search: true,
  file_stats: true,
  file_move: true,  // virtual folders
  file_rename: true,
  file_delete: true,

  // Finance/Excel
  excel_compute: true,
  excel_compare_periods: true,
  excel_trend: true,
  excel_extract_metric: true,

  // Formatting
  format_bullets: true,
  format_table: true,
  format_numbered: true,

  // UI features
  source_buttons: true,
  follow_up_chips: true,
  file_pills: true,
};

export class CapabilityRegistry {
  private static instance: CapabilityRegistry;
  private capabilities: CapabilityConfig;

  private constructor() {
    this.capabilities = { ...CURRENT_CAPABILITIES };
  }

  static getInstance(): CapabilityRegistry {
    if (!CapabilityRegistry.instance) {
      CapabilityRegistry.instance = new CapabilityRegistry();
    }
    return CapabilityRegistry.instance;
  }

  /**
   * Check if a capability is enabled
   */
  isEnabled(capability: keyof CapabilityConfig): boolean {
    return this.capabilities[capability] === true;
  }

  /**
   * Check if a file type supports an operation
   */
  fileTypeSupports(mimeType: string, operation: keyof FileTypeSupport): boolean {
    const support = FILE_TYPE_SUPPORT[mimeType as SupportedMimeType];
    if (!support) return false;
    return support[operation] === true;
  }

  /**
   * Get all enabled capabilities
   */
  getEnabledCapabilities(): (keyof CapabilityConfig)[] {
    return (Object.keys(this.capabilities) as (keyof CapabilityConfig)[])
      .filter(key => this.capabilities[key]);
  }

  /**
   * Check if a follow-up action is feasible
   */
  isActionFeasible(action: FollowUpActionType, context?: { mimeType?: string }): boolean {
    const mapping: Record<FollowUpActionType, keyof CapabilityConfig> = {
      'summarize': 'doc_summarize',
      'extract': 'doc_extract',
      'locate': 'doc_locate',
      'compare': 'doc_compare',
      'open': 'file_open',
      'preview': 'file_preview',
      'list_files': 'file_list',
      'filter_files': 'file_filter',
      'show_sources': 'source_buttons',
      'compute': 'excel_compute',
      'compare_periods': 'excel_compare_periods',
      'format_bullets': 'format_bullets',
      'format_table': 'format_table',
    };

    const capability = mapping[action];
    if (!capability) return false;

    if (!this.isEnabled(capability)) return false;

    // Check file type support if provided
    if (context?.mimeType && ['summarize', 'extract', 'locate'].includes(action)) {
      return this.fileTypeSupports(context.mimeType, action as keyof FileTypeSupport);
    }

    return true;
  }
}

export type FollowUpActionType =
  | 'summarize'
  | 'extract'
  | 'locate'
  | 'compare'
  | 'open'
  | 'preview'
  | 'list_files'
  | 'filter_files'
  | 'show_sources'
  | 'compute'
  | 'compare_periods'
  | 'format_bullets'
  | 'format_table';

export function getCapabilityRegistry(): CapabilityRegistry {
  return CapabilityRegistry.getInstance();
}
