// src/components/attachments/inline/InlineDocumentList.jsx
import React, { useMemo } from "react";
import InlineDocumentButton from "./InlineDocumentButton";
import InlineFolderButton from "./InlineFolderButton";

/**
 * InlineDocumentList.jsx (ChatGPT-parity, in-message)
 * --------------------------------------------------
 * Renders an inline list of “chat-place” buttons:
 *  - document buttons
 *  - folder buttons
 *
 * This is used when the assistant’s message wants to show:
 *  - “Here are the relevant items:” (intro line in message text)
 *  - then the buttons
 *
 * Props:
 *  - items: array of { kind: "document"|"folder", ... }
 *  - onOpenDocument(item)
 *  - onOpenFolder(item)
 *  - max?: number (soft cap)
 */

function normalizeItems(items) {
  const arr = Array.isArray(items) ? items : [];
  return arr
    .map((x) => {
      if (!x) return null;
      const kind = x.kind || x.type;
      if (kind === "folder") return { kind: "folder", ...x };
      return { kind: "document", ...x };
    })
    .filter(Boolean);
}

export default function InlineDocumentList({
  items = [],
  onOpenDocument,
  onOpenFolder,
  max = 8,
  className = "",
  style = {},
}) {
  const list = useMemo(() => normalizeItems(items).slice(0, Math.max(1, max)), [items, max]);

  if (!list.length) return null;

  return (
    <div className={`koda-inline-doc-list ${className}`} style={style}>
      {list.map((item, idx) => {
        if (item.kind === "folder") {
          return (
            <InlineFolderButton
              key={`${item.id || item.folderId || "folder"}-${idx}`}
              folder={item}
              onOpen={onOpenFolder}
            />
          );
        }

        return (
          <InlineDocumentButton
            key={`${item.id || item.docId || item.documentId || "doc"}-${idx}`}
            document={item}
            onOpen={onOpenDocument}
          />
        );
      })}

      <style>{css}</style>
    </div>
  );
}

const css = `
.koda-inline-doc-list{
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 10px;
}
`;
