import React, { useMemo, useState } from "react";
import Modal from "../ui/Modal";
import cleanDocumentName from "../../utils/cleanDocumentName";

function safeString(x) {
  return typeof x === "string" ? x : x == null ? "" : String(x);
}

function byName(a, b) {
  return safeString(a?.name).localeCompare(safeString(b?.name), undefined, { sensitivity: "base" });
}

export default function DestinationFolderModal({
  isOpen,
  onClose,
  folders = [],
  onConfirm,
  title = "Save to…",
}) {
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [query, setQuery] = useState("");

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

  const visibleFolders = useMemo(() => {
    const q = safeString(query).trim().toLowerCase();
    const all = Array.isArray(folders) ? folders : [];
    const children = all.filter((f) => (f?.parentFolderId ?? null) === (currentFolderId ?? null));
    const filtered = q ? children.filter((f) => cleanDocumentName(f?.name || "").toLowerCase().includes(q)) : children;
    filtered.sort(byName);
    return filtered;
  }, [currentFolderId, folders, query]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      maxWidth={760}
      backdrop="blur"
      placement="center"
      actions={[
        { label: "Cancel", onClick: onClose, variant: "secondary" },
        { label: "Save to Root", onClick: () => onConfirm?.(null), variant: "primary" },
        ...(currentFolderId ? [{ label: "Save here", onClick: () => onConfirm?.(currentFolderId), variant: "primary" }] : []),
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
              Root
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
            placeholder="Search folders…"
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
        ) : (
          <div style={{ padding: 14, border: "1px solid #E5E7EB", borderRadius: 12, color: "#6B7280", fontWeight: 700, fontSize: 13 }}>
            No folders here
          </div>
        )}
      </div>
    </Modal>
  );
}
