// backend/src/services/folders/foldersApp.service.ts
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * FoldersAppService (ChatGPT-parity, lightweight)
 * ----------------------------------------------
 * Centralizes folder behavior for:
 *  - document dashboards (folder tree, folder list)
 *  - file_actions operators (group by folder, move doc, locate file)
 *  - chat UI "where" navigation (folderPath display)
 *
 * Design:
 *  - Folder info is derived from document metadata (folderPath) by default.
 *  - Optional dedicated folder index can be added later; this service remains stable.
 *  - Never returns absolute server paths.
 *
 * Dependencies:
 *  - DocumentAppService as canonical doc metadata source.
 */

import type { DocumentAppService, ClientDoc } from "./documentsApp.service";

export type FolderNode = {
  id: string;            // stable id (normalized path)
  name: string;          // leaf name
  path: string;          // full folderPath
  count: number;         // number of docs in this folder subtree
  children: FolderNode[];
};

function normalizeFolderPath(p: string): string {
  return String(p || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/")
    .replace(/^\/+|\/+$/g, "");
}

function splitFolderPath(p: string): string[] {
  const n = normalizeFolderPath(p);
  return n ? n.split("/").filter(Boolean) : [];
}

function leafName(p: string): string {
  const parts = splitFolderPath(p);
  return parts.length ? parts[parts.length - 1] : "";
}

function stableId(p: string): string {
  // stable id: normalized path (good enough; you can hash if you prefer)
  return normalizeFolderPath(p) || "root";
}

export class FoldersAppService {
  constructor(private readonly documentApp: DocumentAppService) {}

  /**
   * Get a flat list of unique folder paths from document metadata.
   */
  async listFolderPaths(): Promise<string[]> {
    const docs = await this.documentApp.listDocs({ limit: 20000 });
    const set = new Set<string>();
    for (const d of docs) {
      if (d.folderPath) set.add(normalizeFolderPath(d.folderPath));
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }

  /**
   * Build a folder tree from document metadata (folderPath).
   * This matches a typical “Documents dashboard” UX.
   */
  async buildFolderTree(): Promise<FolderNode[]> {
    const docs = await this.documentApp.listDocs({ limit: 20000 });

    // Root nodes map by path
    const nodeMap = new Map<string, FolderNode>();

    const ensureNode = (folderPath: string): FolderNode => {
      const p = normalizeFolderPath(folderPath);
      const id = stableId(p);

      const existing = nodeMap.get(id);
      if (existing) return existing;

      const node: FolderNode = {
        id,
        name: leafName(p) || "Root",
        path: p,
        count: 0,
        children: [],
      };
      nodeMap.set(id, node);
      return node;
    };

    // Build nodes
    for (const doc of docs) {
      const fp = doc.folderPath ? normalizeFolderPath(doc.folderPath) : "";
      if (!fp) continue;

      const parts = splitFolderPath(fp);
      let currentPath = "";

      // Increment counts up the chain
      for (let i = 0; i < parts.length; i++) {
        currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];
        const node = ensureNode(currentPath);
        node.count += 1;
      }
    }

    // Link parent-child relationships
    const roots: FolderNode[] = [];
    for (const node of nodeMap.values()) {
      const parts = splitFolderPath(node.path);
      if (parts.length <= 1) {
        roots.push(node);
        continue;
      }
      const parentPath = parts.slice(0, -1).join("/");
      const parent = ensureNode(parentPath);
      // add if not already present
      if (!parent.children.find((c) => c.id === node.id)) parent.children.push(node);
    }

    // Sort children alphabetically, deterministic
    const sortTree = (nodes: FolderNode[]) => {
      nodes.sort((a, b) => a.name.localeCompare(b.name));
      for (const n of nodes) sortTree(n.children);
    };
    sortTree(roots);

    return roots;
  }

  /**
   * List docs in a specific folderPath (exact match).
   */
  async listDocsInFolder(folderPath: string, opts?: { limit?: number }): Promise<ClientDoc[]> {
    const fp = normalizeFolderPath(folderPath);
    const all = await this.documentApp.listDocs({ limit: 20000 });

    const docs = all.filter((d) => normalizeFolderPath(d.folderPath || "") === fp);
    const limit = typeof opts?.limit === "number" ? Math.max(1, opts.limit) : 500;
    return docs.slice(0, limit);
  }
}

export default FoldersAppService;
