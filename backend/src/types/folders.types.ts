/**
 * Folders Types - Folder structure and navigation
 */

/** Folder node in tree */
export interface FolderNode {
  id: string;
  name: string;
  path: string;
  count: number;
  children: FolderNode[];
}

/** Folder info */
export interface FolderInfo {
  id: string;
  name: string;
  parentId?: string;
  path: string;
  documentCount: number;
  createdAt: Date;
}

/** Folder breadcrumb */
export interface FolderBreadcrumb {
  id: string;
  name: string;
}
