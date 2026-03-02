// src/components/attachments/AttachmentsRenderer.jsx
import React, { useMemo } from "react";
import SourcePill from "./pills/SourcePill";
import FilePill from "./pills/FilePill";
import FolderPill from "./pills/FolderPill";
import ChartCard from "./cards/ChartCard";
import ImageCard from "./cards/ImageCard";
import SlidesDeckCard from "./cards/SlidesDeckCard";
import EditSessionCard from "./cards/EditSessionCard";
import EmailCard from "./cards/EmailCard";
import ConnectorStatusPill from "./pills/ConnectorStatusPill";
import ConnectorPromptCard from "./cards/ConnectorPromptCard";
import SlackMessageCard from "./cards/SlackMessageCard";

/**
 * AttachmentsRenderer.jsx (ChatGPT-parity, centralized)
 * ----------------------------------------------------
 * This is the ONE place that decides how to render any “attachment-like” payload:
 *  - source buttons/pills (assistant sources)
 *  - file pills (open/where/discover results)
 *  - folder pills
 *  - inline file lists (if you ever need list rendering)
 *
 * Design principles:
 *  - Input is normalized to a small internal shape
 *  - Rendering is deterministic
 *  - No "Sources:" label here (SourcesRow handles that label)
 *  - nav_pills behavior is enforced by parent (intro line only, no actions)
 *
 * Props:
 *  - attachments: array of attachment objects (any shape)
 *  - variant:
 *      - "sources"  => used below assistant messages (pill look)
 *      - "inline"   => used inside a chat message bubble (pill look)
 *  - onFileClick(attachment)
 *  - onFolderClick(attachment)
 *  - onSeeAllClick?(payload)
 *
 * Attachment normalized shape:
 *  {
 *    kind: "file"|"folder"|"source"|"unknown",
 *    id?: string,
 *    title?: string,
 *    filename?: string,
 *    mimeType?: string,
 *    url?: string,
 *    page?: number,
 *    slide?: number,
 *    sheet?: string,
 *    folderPath?: string,
 *    meta?: any
 *  }
 */

function normalizeAttachments(input) {
  const arr = Array.isArray(input) ? input : [];
  const out = [];

  for (const raw of arr) {
    if (!raw) continue;

    // Edit session attachment (document edit preview/apply)
    if (raw.type === "edit_session") {
      out.push({
        kind: "edit_session",
        title: raw.title || "Edit preview",
        meta: raw,
      });
      continue;
    }

    // Chart attachment (visual)
    if (raw.type === "chart" && Array.isArray(raw.data)) {
      out.push({
        kind: "chart",
        title: raw.title || "Chart",
        meta: raw,
      });
      continue;
    }

    // Image attachment (generated images)
    if (raw.type === "image" && raw.url) {
      out.push({
        kind: "image",
        url: raw.url,
        title: raw.title,
        alt: raw.alt,
        width: raw.width,
        height: raw.height,
        mimeType: raw.mimeType,
        generatedBy: raw.generatedBy,
        meta: raw,
      });
      continue;
    }

    // Slides deck attachment (Google Slides output)
    if (raw.type === "slides_deck" && raw.url && raw.presentationId) {
      out.push({
        kind: "slides_deck",
        title: raw.title,
        presentationId: raw.presentationId,
        url: raw.url,
        slides: Array.isArray(raw.slides) ? raw.slides : [],
        meta: raw,
      });
      continue;
    }

    // Connector status pill (show my integrations)
    if (raw.type === "connector_status") {
      out.push({
        kind: "connector_status",
        provider: raw.provider,
        title: raw.provider,
        meta: raw,
      });
      continue;
    }

    // Connector prompt (e.g. "select your email first" with Gmail/Outlook pills)
    if (raw.type === "connector_prompt") {
      out.push({
        kind: "connector_prompt",
        title: raw.title,
        meta: raw,
      });
      continue;
    }

    // Internal snapshot used by the chat UI; not meant to render as a generic attachment.
    if (raw.type === "email_draft_snapshot") {
      continue;
    }

    // Connector email attachment (Gmail/Outlook)
    if (raw.type === "connector_email") {
      out.push({
        kind: "email",
        title: raw.subject || "Email",
        meta: raw,
      });
      continue;
    }

    // Connector email ref (stored in conversation history; body is fetched on-demand in the preview modal)
    if (raw.type === "connector_email_ref") {
      out.push({
        kind: "email",
        title: raw.subject || "Email",
        meta: raw,
      });
      continue;
    }

    // Connector Slack message attachment
    if (raw.type === "connector_slack_message") {
      out.push({
        kind: "slack_message",
        title: "Slack message",
        meta: raw,
      });
      continue;
    }

    // Already normalized?
    if (raw.kind) {
      out.push(raw);
      continue;
    }

    // Source buttons common shapes:
    // {docId,title,filename,mimeType,url,page,...}
    // {documentId,title,mimeType, ...}
    if (raw.docId || raw.documentId || raw.locationKey || raw.page || raw.slide || raw.sheet) {
      out.push({
        kind: "source",
        id: raw.docId || raw.documentId || raw.id,
        title: raw.title || raw.filename || raw.name,
        filename: raw.filename || raw.title || raw.name,
        mimeType: raw.mimeType,
        url: raw.url,
        page: raw.page,
        slide: raw.slide,
        sheet: raw.sheet,
        folderPath: raw.folderPath,
        meta: raw,
      });
      continue;
    }

    // Folder shapes:
    // {folderId,name,path} or {id,name,folderPath}
    if (raw.folderId || raw.path || raw.folderPath) {
      out.push({
        kind: "folder",
        id: raw.folderId || raw.id,
        title: raw.name || raw.title || raw.folderName,
        folderPath: raw.path || raw.folderPath,
        meta: raw,
      });
      continue;
    }

    // File shapes:
    // {id,filename,mimeType,url}
    if (raw.id || raw.filename || raw.mimeType) {
      out.push({
        kind: "file",
        id: raw.id,
        title: raw.title || raw.filename || raw.name,
        filename: raw.filename || raw.name || raw.title,
        mimeType: raw.mimeType || raw.type,
        url: raw.url,
        meta: raw,
      });
      continue;
    }

    out.push({ kind: "unknown", meta: raw });
  }

  // Dedupe (stable)
  const seen = new Set();
  const deduped = [];
  for (const a of out) {
    const key = [
      a.kind,
      a.id || "",
      a.filename || "",
      a.title || "",
      a.page ?? "",
      a.slide ?? "",
      a.sheet ?? "",
      a.folderPath || "",
      a.url || "",
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(a);
  }

  return deduped;
}

export default function AttachmentsRenderer({
  attachments = [],
  variant = "sources",
  onFileClick,
  onFolderClick,
  onEmailClick,
  onConnectorClick,
  onConnectorPromptClick,
  onSeeAllClick,
  className = "",
  style = {},
}) {
  const items = useMemo(() => normalizeAttachments(attachments), [attachments]);

  if (!items.length) return null;

  return (
    <div className={`koda-attachments ${className}`} style={style}>
      <div className="koda-attachments-row">
        {items.map((a, idx) => {
          if (a.kind === "edit_session") {
            return (
              <div key={`edit-wrap-${idx}`} className="koda-attachments__cardItem">
                <EditSessionCard
                  session={a.meta}
                  onOpenDoc={(docId, meta) => {
                    if (!docId) return;
                    onFileClick?.({
                      id: docId,
                      filename: meta?.filename || a.meta?.filename || "Document",
                      mimeType: meta?.mimeType || a.meta?.mimeType || "application/octet-stream",
                    });
                  }}
                />
              </div>
            );
          }

          if (a.kind === "chart") {
            return (
              <div key={`chart-wrap-${idx}`} className="koda-attachments__cardItem">
                <ChartCard chart={a.meta} />
              </div>
            );
          }

          if (a.kind === "image") {
            return (
              <div key={`image-wrap-${idx}`} className="koda-attachments__cardItem">
                <ImageCard image={a} />
              </div>
            );
          }

          if (a.kind === "slides_deck") {
            return (
              <div key={`deck-wrap-${idx}`} className="koda-attachments__cardItem">
                <SlidesDeckCard deck={a} />
              </div>
            );
          }

          if (a.kind === "email") {
            return (
              <div key={`email-wrap-${idx}`} className="koda-attachments__cardItem">
                <EmailCard
                  email={a.meta}
                  onOpen={(email) => onEmailClick?.(email)}
                  variant={variant === "inline" ? "compact" : "default"}
                />
              </div>
            );
          }

          if (a.kind === "slack_message") {
            return (
              <div key={`slack-wrap-${idx}`} className="koda-attachments__cardItem">
                <SlackMessageCard
                  message={a.meta}
                  variant={variant === "inline" ? "compact" : "default"}
                />
              </div>
            );
          }

          if (a.kind === "connector_status") {
            return (
              <ConnectorStatusPill
                key={`conn-${a.provider || idx}`}
                connector={a.meta}
                onClick={() => onConnectorClick?.(a.meta)}
              />
            );
          }

          if (a.kind === "connector_prompt") {
            return (
              <div key={`conn-prompt-${idx}`} className="koda-attachments__cardItem">
                <ConnectorPromptCard
                  prompt={a.meta}
                  onPick={(provider) => onConnectorPromptClick?.({ provider, prompt: a.meta })}
                />
              </div>
            );
          }

          if (a.kind === "source") {
            return (
              <SourcePill
                key={`${a.id || "src"}-${a.locationKey || idx}`}
                source={a}
                variant={variant}
                onOpen={() => {
                  // Prefer URL if present, otherwise call onFileClick
                  if (a.url) window.open(a.url, "_blank", "noopener,noreferrer");
                  else onFileClick?.(a);
                }}
              />
            );
          }

          if (a.kind === "folder") {
            return (
              <FolderPill
                key={`${a.id || "folder"}-${idx}`}
                folder={a}
                variant={variant}
                onOpen={() => onFolderClick?.(a)}
              />
            );
          }

          if (a.kind === "file") {
            return (
              <FilePill
                key={`${a.id || "file"}-${idx}`}
                file={a}
                variant={variant}
                onOpen={() => {
                  if (a.url) window.open(a.url, "_blank", "noopener,noreferrer");
                  else onFileClick?.(a);
                }}
              />
            );
          }

          return null;
        })}
      </div>

      <style>{css}</style>
    </div>
  );
}

const css = `
.koda-attachments{
  display: block;
  width: 100%;
}

.koda-attachments-row{
  display: flex;
  align-items: flex-start;
  gap: 10px;
  flex-wrap: wrap;
}

.koda-attachments__cardItem{
  flex: 1 1 100%;
  min-width: min(720px, 100%);
}
`;
