// src/types/attachment.types.ts

/**
 * Attachment contract used across chat + documents UI.
 * Keep this file “UI-facing”: safe fields only.
 */

export type AttachmentType =
  | 'source_buttons'
  | 'file_list'
  | 'grouped_files'
  | 'select_file'
  | 'slides_deck'
  | 'options'
  | 'debug'
  | string;

/**
 * Location inside a document for evidence/sources UX.
 */
export type SourceLocation =
  | { type: 'page'; value: number; label?: string }
  | { type: 'slide'; value: number; label?: string }
  | { type: 'sheet'; value: string; label?: string }
  | { type: 'cell'; value: string; label?: string }
  | { type: 'section'; value: string; label?: string };

export type SourceButton = {
  documentId: string;
  title: string;
  filename?: string;
  mimeType?: string;
  location?: SourceLocation;
};

export type SeeAllMeta = {
  label: string;
  totalCount: number;
  remainingCount: number;

  /**
   * Optional filters used by the Documents screen when user clicks “See all”.
   */
  filterExtensions?: string[];
  filterDomain?: string;
  folderPath?: string;
};

export type SourceButtonsAttachment = {
  type: 'source_buttons';

  /**
   * If set to nav_pill(s), frontend should:
   * - hide “Sources:” label + divider
   * - hide message actions
   */
  answerMode?: 'nav_pill' | 'nav_pills' | string;

  buttons: SourceButton[];
  seeAll?: SeeAllMeta;
};

export type FileItem = {
  documentId: string;
  filename: string;
  title?: string;
  mimeType?: string;

  folderPath?: string;
  sizeBytes?: number;
  uploadedAt?: string;

  /**
   * Optional doc metadata
   */
  docType?: string; // pdf/xlsx/docx...
  domain?: string; // finance/legal/etc.
};

export type FileListAttachment = {
  type: 'file_list';
  items: FileItem[];
  totalCount: number;

  // Legacy support
  seeAllLabel?: string;

  // Preferred contract
  seeAll?: SeeAllMeta;
};

export type GroupedFilesAttachment = {
  type: 'grouped_files';
  totalCount: number;
  groups: Array<{
    groupKey: string; // e.g. "pdf", "finance", "/Receipts"
    label?: string;
    count: number;
    items: FileItem[];
  }>;
  seeAll?: SeeAllMeta;
};

export type SelectFileAttachment = {
  type: 'select_file';
  prompt?: string;
  options: FileItem[];
};

export type SlidesDeckAttachment = {
  type: 'slides_deck';
  title?: string;
  presentationId: string;
  url: string;
  slides?: Array<{ slideObjectId: string; thumbnailUrl: string; width?: number; height?: number }>;
};

export type Attachment =
  | SourceButtonsAttachment
  | FileListAttachment
  | GroupedFilesAttachment
  | SelectFileAttachment
  | SlidesDeckAttachment
  | {
      type: AttachmentType;
      [k: string]: any;
    };

export function isSourceButtonsAttachment(a: any): a is SourceButtonsAttachment {
  return !!a && a.type === 'source_buttons' && Array.isArray(a.buttons);
}

export function isFileListAttachment(a: any): a is FileListAttachment {
  return !!a && a.type === 'file_list' && Array.isArray(a.items);
}

export function isGroupedFilesAttachment(a: any): a is GroupedFilesAttachment {
  return !!a && a.type === 'grouped_files' && Array.isArray(a.groups);
}

export function isSelectFileAttachment(a: any): a is SelectFileAttachment {
  return !!a && a.type === 'select_file' && Array.isArray(a.options);
}
