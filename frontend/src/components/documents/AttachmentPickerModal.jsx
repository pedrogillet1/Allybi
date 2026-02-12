import React, { useEffect, useMemo, useState } from "react";
import FolderPreviewModal from "../folders/FolderPreviewModal";
import { useDocuments } from "../../context/DocumentsContext";

function safeString(x) {
  return typeof x === "string" ? x : x == null ? "" : String(x);
}

function cleanName(name) {
  return safeString(name).trim().replace(/\s+/g, " ");
}

export default function AttachmentPickerModal({
  isOpen,
  onClose,
  documents = [],
  folders = [],
  initialSelectedIds = [],
  onConfirm,
  title = "Add files",
  embedded = false,
}) {
  const docsCtx = useDocuments?.();
  const ctxDocuments = Array.isArray(docsCtx?.documents) ? docsCtx.documents : [];
  const ctxFolders = Array.isArray(docsCtx?.folders) ? docsCtx.folders : [];

  // Prefer explicit props, but fall back to global library state (same as Home screen).
  const effectiveDocuments = Array.isArray(documents) && documents.length ? documents : ctxDocuments;
  const effectiveFolders = Array.isArray(folders) && folders.length ? folders : ctxFolders;

  const [currentFolderId, setCurrentFolderId] = useState(null); // null = Home
  const [selected, setSelected] = useState(() => new Set(initialSelectedIds || []));

  const docTotalByFolderId = useMemo(() => {
    // Total documents per folder, including all descendant subfolders.
    // We compute this locally to match Home semantics and to avoid relying on partial folder shapes.
    const direct = new Map();
    for (const d of effectiveDocuments || []) {
      if (!d?.id) continue;
      if (d?.status === "deleted") continue;
      const fid = d?.folderId ?? null;
      direct.set(fid, (direct.get(fid) || 0) + 1);
    }

    const children = new Map();
    for (const f of effectiveFolders || []) {
      if (!f?.id) continue;
      const pid = f?.parentFolderId ?? null;
      const arr = children.get(pid) || [];
      arr.push(f.id);
      children.set(pid, arr);
    }

    const memo = new Map();
    const visiting = new Set();
    const totalFor = (folderId) => {
      if (memo.has(folderId)) return memo.get(folderId);
      if (visiting.has(folderId)) return direct.get(folderId) || 0;
      visiting.add(folderId);
      let total = direct.get(folderId) || 0;
      const kids = children.get(folderId) || [];
      for (const k of kids) total += totalFor(k);
      visiting.delete(folderId);
      memo.set(folderId, total);
      return total;
    };

    for (const f of effectiveFolders || []) {
      if (!f?.id) continue;
      totalFor(f.id);
    }
    totalFor(null);
    return memo;
  }, [effectiveDocuments, effectiveFolders]);

  // The chat UI doesn't always prefetch the library; ensure we have data when opening the picker.
  const [requested, setRequested] = useState(false);
  useEffect(() => {
    if (!isOpen) { setRequested(false); return; }
    if (requested) return;
    const shouldFetchDocs = (!effectiveDocuments || effectiveDocuments.length === 0) && typeof docsCtx?.fetchDocuments === "function";
    const shouldFetchFolders = (!effectiveFolders || effectiveFolders.length === 0) && typeof docsCtx?.fetchFolders === "function";
    if (shouldFetchDocs) {
      try { docsCtx.fetchDocuments(true); } catch {}
    }
    if (shouldFetchFolders) {
      try { docsCtx.fetchFolders(true); } catch {}
    }
    if (shouldFetchDocs || shouldFetchFolders) setRequested(true);
  }, [docsCtx, effectiveDocuments, effectiveFolders, isOpen, requested]);

  useEffect(() => {
    if (!isOpen) return;
    setCurrentFolderId(null);
    setSelected(new Set(initialSelectedIds || []));
  }, [isOpen, initialSelectedIds]);

  const folderById = useMemo(() => {
    const m = new Map();
    for (const f of effectiveFolders || []) {
      if (f?.id) m.set(f.id, f);
    }
    return m;
  }, [effectiveFolders]);

  const breadcrumb = useMemo(() => {
    const out = [{ id: null, name: "Home" }];
    if (!currentFolderId) return out;
    let cur = folderById.get(currentFolderId) || null;
    const guard = new Set();
    const stack = [];
    while (cur && cur.id && !guard.has(cur.id)) {
      guard.add(cur.id);
      stack.unshift({ id: cur.id, name: cur.name });
      cur = cur.parentFolderId ? folderById.get(cur.parentFolderId) : null;
    }
    return out.concat(stack);
  }, [currentFolderId, folderById]);

  const currentFolder = useMemo(() => {
    if (!currentFolderId) return { id: null, name: "Home" };
    const f = folderById.get(currentFolderId);
    return f ? { id: f.id, name: f.name, emoji: f.emoji } : { id: currentFolderId, name: "Folder" };
  }, [currentFolderId, folderById]);

  const contents = useMemo(() => {
    const files = (effectiveDocuments || [])
      .filter((d) => (d?.folderId ?? null) === (currentFolderId ?? null) && d?.status !== "deleted")
      .map((d) => ({
        id: d.id,
        filename: d.filename || d.name || "Document",
        mimeType: d.mimeType,
        fileSize: d.fileSize,
        createdAt: d.createdAt,
      }));

    const subfolders = (effectiveFolders || [])
      .filter((f) => (f?.parentFolderId ?? null) === (currentFolderId ?? null))
      .map((f) => ({
        id: f.id,
        name: f.name,
        emoji: f.emoji,
        fileCount: docTotalByFolderId.get(f.id) ?? 0,
      }));

    return { files, subfolders };
  }, [currentFolderId, docTotalByFolderId, effectiveDocuments, effectiveFolders]);

  const toggleFile = (fileId) => {
    if (!fileId) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  };

  const confirm = () => onConfirm?.(Array.from(selected));

  return (
    <FolderPreviewModal
      isOpen={isOpen}
      onClose={onClose}
      folder={{ id: currentFolder.id, name: cleanName(currentFolder.name || title || "Home"), emoji: currentFolder.emoji }}
      breadcrumb={breadcrumb}
      contents={contents}
      onNavigateToFolder={(folderId) => setCurrentFolderId(folderId ?? null)}
      onOpenFile={(fileId) => toggleFile(fileId)}
      mode="select"
      selectedFileIds={Array.from(selected)}
      onToggleFile={toggleFile}
      onConfirmSelection={confirm}
      confirmLabel={`Add selected (${selected.size})`}
      embedded={embedded}
    />
  );
}
