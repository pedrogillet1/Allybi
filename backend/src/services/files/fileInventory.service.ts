// src/services/files/fileInventory.service.ts

/**
 * FileInventoryService
 * Single source of truth for:
 * - listing user files
 * - resolving files by id/name
 * - emitting UI-ready buttons for:
 *   (A) sources/evidence buttons (appear as “Sources”)
 *   (B) query action buttons (appear as “Here it is:” / open/where/find)
 *
 * IMPORTANT: Both use attachment.type = "source_buttons" for backwards compatibility,
 * but are distinguished via `purpose` + `uiVariant`.
 */

export interface FileRecord {
  id: string;
  ownerUserId: string;

  filename: string;     // full filename with extension
  extension: string;    // normalized extension, e.g. "pdf"
  mimeType: string;

  storageKey: string;   // where file is stored
  folderPath?: string;

  sizeBytes?: number;
  pageCount?: number;

  createdAt: string;
  updatedAt: string;

  isDeleted?: boolean;
  isProcessing?: boolean;
}

export type ButtonPurpose = 'sources' | 'query_action';
export type ButtonUiVariant = 'sources' | 'query';

export type NavType = 'open' | 'where' | 'discover' | 'not_found';

export interface SourceButton {
  documentId: string;
  title: string;
  filename: string;
  mimeType?: string;

  // Optional location hints (used by UI for subtitles/badges)
  location?: {
    type: 'page' | 'slide' | 'sheet' | 'cell' | 'section';
    value: string | number;
    label?: string;
  };

  // Optional UI hints
  icon?: string; // "pdf" | "excel" | ...
  subtitle?: string; // e.g., "Page 3", "Sheet: Budget"
}

export interface SourceButtonsAttachment {
  type: 'source_buttons';

  /**
   * Distinguish styles:
   * - "sources": evidence buttons under Sources area
   * - "query": action buttons for open/where/find
   */
  purpose?: ButtonPurpose;
  uiVariant?: ButtonUiVariant;

  /**
   * How chat UI should treat this attachment (your render_policy contract).
   */
  answerMode?: 'nav_pills' | 'inline';
  navType?: NavType;

  buttons: SourceButton[];

  seeAll?: {
    label?: string;
    totalCount: number;
    remainingCount: number;

    // Optional dynamic filters for “See all”
    filterExtensions?: string[];
    filterDomainId?: string;
    filterKeyword?: string;
  };
}

export interface FileRepository {
  listByUser(userId: string): Promise<FileRecord[]>;
  getByIds(userId: string, ids: string[]): Promise<FileRecord[]>;
  searchByFilenameTokens(userId: string, tokens: string[], limit: number): Promise<FileRecord[]>;
}

const FILE_ICON_MAP: Record<string, string> = {
  pdf: 'pdf',
  doc: 'doc',
  docx: 'doc',
  xls: 'excel',
  xlsx: 'excel',
  csv: 'table',
  ppt: 'ppt',
  pptx: 'ppt',
  txt: 'text',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  default: 'file',
};

export class FileInventoryService {
  constructor(
    private readonly repo: FileRepository,
    private readonly logger: Pick<Console, 'info' | 'warn' | 'error'> = console
  ) {}

  // -----------------------------
  // Listing & lookup
  // -----------------------------

  async listUserFiles(userId: string): Promise<FileRecord[]> {
    const all = await this.repo.listByUser(userId);
    return this.sortStable(all.filter(f => !f.isDeleted));
  }

  async getFilesByIds(userId: string, ids: string[]): Promise<FileRecord[]> {
    if (!ids?.length) return [];
    const files = await this.repo.getByIds(userId, ids);
    return this.sortStable(files.filter(f => !f.isDeleted));
  }

  /**
   * Used when the user says “open the mezanino document” (not exact filename).
   * You pass tokens extracted from query (after stopwords removal).
   */
  async searchByFilename(userId: string, tokens: string[], limit = 8): Promise<FileRecord[]> {
    const clean = tokens
      .map(t => this.normalizeToken(t))
      .filter(Boolean)
      .slice(0, 8);

    if (!clean.length) return [];

    const hits = await this.repo.searchByFilenameTokens(userId, clean, limit);
    return this.sortStable(hits.filter(f => !f.isDeleted));
  }

  // -----------------------------
  // UI Attachments (the important part)
  // -----------------------------

  /**
   * SOURCES attachment:
   * - Appears under “Sources”
   * - Should look visually different (uiVariant: "sources")
   * - Should NOT be treated as nav pills
   */
  buildSourcesAttachment(params: {
    files: FileRecord[];
    maxButtons?: number;
    seeAllEnabled?: boolean;
    seeAllLabel?: string;
    filterExtensions?: string[];
    filterDomainId?: string;
    filterKeyword?: string;
  }): SourceButtonsAttachment | null {
    const {
      files,
      maxButtons = 3, // sources usually 1–3 docs
      seeAllEnabled = false,
      seeAllLabel = 'See all',
      filterExtensions,
      filterDomainId,
      filterKeyword,
    } = params;

    const visible = this.sortStable(files.filter(f => !f.isDeleted)).slice(0, maxButtons);
    if (!visible.length) return null;

    const buttons = visible.map(f => this.toSourceButton(f));

    const totalCount = files.filter(f => !f.isDeleted).length;
    const remaining = Math.max(0, totalCount - visible.length);

    return {
      type: 'source_buttons',
      purpose: 'sources',
      uiVariant: 'sources',
      answerMode: 'inline',
      buttons,
      ...(seeAllEnabled && totalCount > visible.length
        ? {
            seeAll: {
              label: seeAllLabel,
              totalCount,
              remainingCount: remaining,
              filterExtensions,
              filterDomainId,
              filterKeyword,
            },
          }
        : {}),
    };
  }

  /**
   * QUERY ACTION attachment:
   * - Used for open/where/find/locate_docs
   * - Must behave like ChatGPT nav_pills: short intro text + pill(s)
   * - Must look different from sources (uiVariant: "query")
   */
  buildQueryActionAttachment(params: {
    files: FileRecord[];
    navType: NavType;
    maxButtons?: number; // open usually 1, discover maybe up to 5
    seeAllEnabled?: boolean;
    seeAllLabel?: string;
    filterExtensions?: string[];
    filterDomainId?: string;
    filterKeyword?: string;
  }): SourceButtonsAttachment | null {
    const {
      files,
      navType,
      maxButtons = navType === 'discover' ? 5 : 1,
      seeAllEnabled = true,
      seeAllLabel = 'See all',
      filterExtensions,
      filterDomainId,
      filterKeyword,
    } = params;

    const visible = this.sortStable(files.filter(f => !f.isDeleted)).slice(0, maxButtons);

    // For nav_pills, we can return null when empty (router/quality gate emits not_found microcopy)
    if (!visible.length) return null;

    const buttons = visible.map(f => ({
      ...this.toSourceButton(f),
      // extra UI hint for query actions
      subtitle: f.folderPath ? this.shortFolderHint(f.folderPath) : undefined,
    }));

    const totalCount = files.filter(f => !f.isDeleted).length;
    const remaining = Math.max(0, totalCount - visible.length);

    return {
      type: 'source_buttons',
      purpose: 'query_action',
      uiVariant: 'query',
      answerMode: 'nav_pills',
      navType,
      buttons,
      ...(seeAllEnabled && totalCount > visible.length
        ? {
            seeAll: {
              label: seeAllLabel,
              totalCount,
              remainingCount: remaining,
              filterExtensions,
              filterDomainId,
              filterKeyword,
            },
          }
        : {}),
    };
  }

  // -----------------------------
  // Helpers
  // -----------------------------

  private toSourceButton(file: FileRecord): SourceButton {
    const ext = (file.extension || this.getExt(file.filename)).toLowerCase();
    return {
      documentId: file.id,
      title: this.humanizeFilename(file.filename),
      filename: file.filename,
      mimeType: file.mimeType,
      icon: FILE_ICON_MAP[ext] || FILE_ICON_MAP.default,
    };
  }

  private sortStable(files: FileRecord[]): FileRecord[] {
    // Stable order:
    // 1) updatedAt desc
    // 2) createdAt desc
    // 3) filename asc
    return [...files].sort((a, b) => {
      const ua = Date.parse(a.updatedAt || a.createdAt || '0');
      const ub = Date.parse(b.updatedAt || b.createdAt || '0');
      if (ub !== ua) return ub - ua;

      const ca = Date.parse(a.createdAt || '0');
      const cb = Date.parse(b.createdAt || '0');
      if (cb !== ca) return cb - ca;

      return (a.filename || '').localeCompare(b.filename || '');
    });
  }

  private getExt(filename: string): string {
    const m = (filename || '').toLowerCase().match(/\.([a-z0-9]{1,8})$/);
    return m ? m[1] : '';
  }

  private humanizeFilename(filename: string): string {
    // Keep extension, but remove path + tidy whitespace
    const base = (filename || '').split('/').pop()?.split('\\').pop() || filename;
    return base.replace(/\s+/g, ' ').trim();
  }

  private normalizeToken(t: string): string {
    return (t || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // strip diacritics
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  private shortFolderHint(folderPath: string): string {
    // Show last segment only (keeps UI clean)
    const parts = folderPath.split('/').filter(Boolean);
    if (!parts.length) return '';
    const last = parts[parts.length - 1];
    return `Folder: ${last}`;
  }
}
