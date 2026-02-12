import React, { useMemo, useState } from "react";
import Modal from "../ui/Modal";
import cleanDocumentName from "../../utils/cleanDocumentName";
import { getFileIcon } from "../../utils/files/iconMapper";

function safeString(x) {
  return typeof x === "string" ? x : x == null ? "" : String(x);
}

function byName(a, b) {
  return safeString(a?.name || a?.filename || a?.title).localeCompare(
    safeString(b?.name || b?.filename || b?.title),
    undefined,
    { sensitivity: "base" }
  );
}

export default function DocumentPickerModal({
  isOpen,
  onClose,
  documents = [],
  folders = [],
  initialSelectedIds = [],
  onConfirm,
  title = "Add files",
}) {
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(() => new Set(initialSelectedIds || []));

  const folderById = useMemo(() => {
    const m = new Map();
    for (const f of folders || []) {
      if (f?.id) m.set(f.id, f);
    }
    return m;
  }, [folders]);

  const breadcrumb = useMemo(() => {
    const out = [];
    let cur = currentFolderId ? folderById.get(currentFolderId) : null;
    const guard = new Set();
    while (cur && cur.id && !guard.has(cur.id)) {
      guard.add(cur.id);
      out.unshift(cur);
      cur = cur.parentFolderId ? folderById.get(cur.parentFolderId) : null;
    }
    return out;
  }, [currentFolderId, folderById]);

  const { visibleFolders, visibleDocs } = useMemo(() => {
    const q = safeString(query).trim().toLowerCase();
    const folderMatch = (f) => cleanDocumentName(f?.name || "").toLowerCase().includes(q);
    const docMatch = (d) => cleanDocumentName(d?.filename || d?.name || "").toLowerCase().includes(q);

    const allFolders = Array.isArray(folders) ? folders : [];
    const allDocs = Array.isArray(documents) ? documents : [];

    const inFolder = (d) => {
      if (d?.status === "deleted") return false;
      const fid = d?.folderId ?? null;
      return (currentFolderId ?? null) === (fid ?? null);
    };

    const folderChildren = allFolders.filter((f) => (f?.parentFolderId ?? null) === (currentFolderId ?? null));
    const docChildren = allDocs.filter(inFolder);

    const vf = q ? folderChildren.filter(folderMatch) : folderChildren;
    const vd = q ? docChildren.filter(docMatch) : docChildren;

    vf.sort(byName);
    vd.sort(byName);

    return { visibleFolders: vf, visibleDocs: vd };
  }, [currentFolderId, documents, folders, query]);

  const toggle = (docId) => {
    if (!docId) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });
  };

  const confirm = () => onConfirm?.(Array.from(selected));

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      maxWidth={860}
      backdrop="none"
      placement="center"
      actions={[
        { label: "Cancel", onClick: onClose, variant: "secondary" },
        { label: `Add selected (${selected.size})`, onClick: confirm, variant: "primary", disabled: selected.size === 0 },
      ]}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setCurrentFolderId(null)}
              style={{
                border: "1px solid #E5E7EB",
                background: "white",
                borderRadius: 999,
                padding: "6px 10px",
                fontFamily: "Plus Jakarta Sans, sans-serif",
                fontWeight: 800,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Home
            </button>
            {breadcrumb.map((f) => (
              <React.Fragment key={f.id}>
                <span style={{ color: "#9CA3AF", fontWeight: 900 }}>/</span>
                <button
                  type="button"
                  onClick={() => setCurrentFolderId(f.id)}
                  style={{
                    border: "1px solid #E5E7EB",
                    background: "white",
                    borderRadius: 999,
                    padding: "6px 10px",
                    fontFamily: "Plus Jakarta Sans, sans-serif",
                    fontWeight: 800,
                    fontSize: 12,
                    cursor: "pointer",
                    maxWidth: 220,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={cleanDocumentName(f.name)}
                >
                  {cleanDocumentName(f.name)}
                </button>
              </React.Fragment>
            ))}
          </div>

          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            style={{
              width: 260,
              maxWidth: "100%",
              height: 38,
              borderRadius: 999,
              border: "1px solid #E5E7EB",
              padding: "0 12px",
              fontFamily: "Plus Jakarta Sans, sans-serif",
              fontWeight: 700,
              fontSize: 13,
              outline: "none",
            }}
          />
        </div>

        {visibleFolders.length ? (
          <div>
            <div style={{ fontWeight: 900, fontSize: 12, color: "#6B7280", marginBottom: 8, textTransform: "uppercase" }}>
              Folders
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
              {visibleFolders.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => { setCurrentFolderId(f.id); setQuery(""); }}
                  style={{
                    textAlign: "left",
                    background: "white",
                    border: "1px solid #E5E7EB",
                    borderRadius: 12,
                    padding: 14,
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontWeight: 850, fontSize: 13, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {cleanDocumentName(f.name)}
                  </div>
                  <div style={{ marginTop: 4, fontWeight: 700, fontSize: 12, color: "#6B7280" }}>
                    {(f._count?.documents ?? f.totalDocuments ?? 0)} files
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div>
          <div style={{ fontWeight: 900, fontSize: 12, color: "#6B7280", marginBottom: 8, textTransform: "uppercase" }}>
            Files
          </div>

          {visibleDocs.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {visibleDocs.map((d) => {
                const id = d?.id;
                const name = cleanDocumentName(d?.filename || d?.name || "Document");
                const checked = id ? selected.has(id) : false;
                return (
                  <button
                    key={id || name}
                    type="button"
                    onClick={() => toggle(id)}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      padding: "10px 12px",
                      borderRadius: 14,
                      border: "1px solid #E5E7EB",
                      background: checked ? "#F3F4F6" : "white",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <img
                        src={getFileIcon(d?.filename, d?.mimeType)}
                        alt=""
                        style={{ width: 26, height: 26, objectFit: "contain", flexShrink: 0 }}
                      />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 850, fontSize: 13, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {name}
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 12, color: "#6B7280" }}>
                          {safeString(d?.mimeType || "").split(";")[0]}
                        </div>
                      </div>
                    </div>
                    <input type="checkbox" readOnly checked={checked} />
                  </button>
                );
              })}
            </div>
          ) : (
            <div style={{ padding: 14, border: "1px solid #E5E7EB", borderRadius: 12, color: "#6B7280", fontWeight: 700, fontSize: 13 }}>
              No files here
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

