// src/services/files/utils/buildFolderTree.ts

/**
 * Converts a flat list of folder paths into a hierarchical tree for clean display.
 *
 * Design goals:
 *  - Deterministic ordering (stable output)
 *  - Deduplicate paths
 *  - Handles trailing slashes, repeated slashes, whitespace
 *  - Preserves original casing in folder names
 */

export type FolderTreeNode = {
  name: string;
  path: string;
  isFolder: boolean;
  children: FolderTreeNode[];
};

type InternalNode = {
  name: string;
  path: string;
  children: Map<string, InternalNode>;
  originalNames: Map<string, string>;
};

function normalizePath(p: string): string {
  if (!p) return "";
  let s = p.trim().replace(/\\/g, "/");
  s = s.replace(/\/{2,}/g, "/");
  s = s.replace(/^\/+/, "");
  s = s.replace(/\/+$/, "");
  return s;
}

function normalizeSegment(seg: string): string {
  return seg
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function stableSortNodes(nodes: FolderTreeNode[]): FolderTreeNode[] {
  return [...nodes].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

/**
 * Build a folder tree from flat path strings.
 */
export function buildFolderTree(paths: string[]): FolderTreeNode {
  const root: InternalNode = {
    name: "__root__",
    path: "",
    children: new Map(),
    originalNames: new Map(),
  };

  const seen = new Set<string>();

  for (const raw of paths || []) {
    const norm = normalizePath(raw);
    if (!norm) continue;
    if (seen.has(norm)) continue;
    seen.add(norm);

    const segments = norm.split("/").filter(Boolean);
    if (!segments.length) continue;

    let cursor = root;
    let currentPath = "";

    for (const segRaw of segments) {
      const segNorm = normalizeSegment(segRaw);
      const displayName =
        cursor.originalNames.get(segNorm) || segRaw.trim();

      if (!cursor.originalNames.has(segNorm)) {
        cursor.originalNames.set(segNorm, displayName);
      }

      currentPath = currentPath ? `${currentPath}/${displayName}` : displayName;

      if (!cursor.children.has(segNorm)) {
        cursor.children.set(segNorm, {
          name: displayName,
          path: currentPath,
          children: new Map(),
          originalNames: new Map(),
        });
      }

      cursor = cursor.children.get(segNorm)!;
    }
  }

  const toPublic = (node: InternalNode): FolderTreeNode => {
    const kids: FolderTreeNode[] = [];
    for (const child of node.children.values()) {
      kids.push(toPublic(child));
    }
    return {
      name: node.name,
      path: node.path,
      isFolder: true,
      children: stableSortNodes(kids),
    };
  };

  return toPublic(root);
}

/**
 * Convert a FolderTreeNode to a readable text tree for chat responses.
 * Uses ASCII tree characters so it renders well in markdown.
 */
export function renderFolderTreeText(tree: FolderTreeNode, opts?: { icon?: string; maxDepth?: number }): string {
  const icon = opts?.icon ?? "\u{1F4C1}";
  const maxDepth = opts?.maxDepth ?? 10;

  const lines: string[] = [];

  const walk = (node: FolderTreeNode, depth: number, prefix: string, isLast: boolean) => {
    if (depth > maxDepth) return;

    if (node.name !== "__root__") {
      const connector = depth === 0 ? "" : isLast ? "\u2514\u2500 " : "\u251C\u2500 ";
      lines.push(`${prefix}${connector}${icon} ${node.name}/`);
      prefix = depth === 0 ? "" : prefix + (isLast ? "   " : "\u2502  ");
    }

    const children = node.children || [];
    children.forEach((child, idx) => {
      const last = idx === children.length - 1;
      walk(child, depth + 1, prefix, last);
    });
  };

  tree.children.forEach((child, idx) => {
    walk(child, 0, "", idx === tree.children.length - 1);
    if (idx !== tree.children.length - 1) lines.push("");
  });

  return lines.join("\n").trim();
}

/**
 * Build a tree from DB folder records (id, name, parentFolderId) instead of path strings.
 * More reliable since it uses the actual parent-child relationships.
 */
export function buildFolderTreeFromRecords(
  folders: Array<{ id: string; name: string | null; parentFolderId: string | null }>,
  documents?: Array<{ filename: string | null; folderId: string | null }>,
): FolderTreeNode {
  // Build a map of folderId -> folder
  const folderMap = new Map(folders.map(f => [f.id, f]));

  // Build children map
  const childFolders = new Map<string | null, typeof folders>();
  for (const f of folders) {
    const parentKey = f.parentFolderId || null;
    if (!childFolders.has(parentKey)) childFolders.set(parentKey, []);
    childFolders.get(parentKey)!.push(f);
  }

  // Sort children alphabetically
  for (const [, children] of childFolders) {
    children.sort((a, b) => (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" }));
  }

  // Group documents by folderId
  const docsByFolder = new Map<string | null, string[]>();
  if (documents) {
    for (const d of documents) {
      const key = d.folderId || null;
      if (!docsByFolder.has(key)) docsByFolder.set(key, []);
      docsByFolder.get(key)!.push(d.filename || "Untitled");
    }
  }

  // Recursive builder
  function buildNode(folderId: string | null, folderName: string, folderPath: string): FolderTreeNode {
    const children: FolderTreeNode[] = [];

    // Add document leaf nodes
    const docs = docsByFolder.get(folderId) ?? [];
    for (const docName of docs.sort()) {
      children.push({ name: docName, path: folderPath ? `${folderPath}/${docName}` : docName, isFolder: false, children: [] });
    }

    // Add child folders
    const subFolders = childFolders.get(folderId) ?? [];
    for (const sub of subFolders) {
      const subName = sub.name || "Unnamed Folder";
      const subPath = folderPath ? `${folderPath}/${subName}` : subName;
      children.push(buildNode(sub.id, subName, subPath));
    }

    return { name: folderName, path: folderPath, isFolder: true, children };
  }

  return buildNode(null, "__root__", "");
}

/**
 * Render a tree that includes both folders and documents.
 * Folders get 📁 icon, documents get 📄 icon.
 */
export function renderFolderTreeWithDocs(tree: FolderTreeNode, opts?: { maxDepth?: number }): string {
  const maxDepth = opts?.maxDepth ?? 10;
  const lines: string[] = [];

  const walk = (node: FolderTreeNode, depth: number, prefix: string, isLast: boolean) => {
    if (depth > maxDepth) return;

    if (node.name !== "__root__") {
      const icon = node.isFolder ? "\u{1F4C1}" : "\u{1F4C4}";
      const displayName = node.isFolder ? node.name.replace(/\/$/, "") + "/" : node.name;
      const connector = depth === 0 ? "" : isLast ? "\u2514\u2500 " : "\u251C\u2500 ";
      lines.push(`${prefix}${connector}${icon} ${displayName}`);
      prefix = depth === 0 ? "" : prefix + (isLast ? "   " : "\u2502  ");
    }

    const children = node.children || [];
    children.forEach((child, idx) => {
      const last = idx === children.length - 1;
      walk(child, depth + 1, prefix, last);
    });
  };

  tree.children.forEach((child, idx) => {
    walk(child, 0, "", idx === tree.children.length - 1);
    if (idx !== tree.children.length - 1) lines.push("");
  });

  return lines.join("\n").trim();
}

export default buildFolderTree;
