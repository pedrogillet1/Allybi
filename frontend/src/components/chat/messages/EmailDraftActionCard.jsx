import React, { useMemo, useState } from "react";
import api from "../../../services/api";

import gmailSvg from "../../../assets/Gmail.svg";
import outlookSvg from "../../../assets/outlook.svg";
import allybiKnot from "../../../assets/koda-knot-black.svg";
import paperclipSvg from "../../../assets/Paperclip.svg";

import "./EmailDraftActionCard.css";

function safeString(x) {
  return typeof x === "string" ? x : x == null ? "" : String(x);
}

function parseEmailDraftFromMarkdown(content) {
  const raw = safeString(content);
  const lines = raw.split(/\r?\n/);

  let providerLabel = "";
  let provider = "";
  let to = "";
  let subject = "";
  const attachmentNames = [];
  const bodyLines = [];

  for (let i = 0; i < lines.length; i += 1) {
    const l = lines[i];
    const mProvider = l.match(/\*\*Draft Email\*\*\s*\(via\s+([^)]+)\)/i);
    if (mProvider?.[1]) {
      providerLabel = mProvider[1].trim();
      const p = providerLabel.toLowerCase();
      provider = p.includes("gmail") ? "gmail" : p.includes("outlook") ? "outlook" : "";
      continue;
    }

    const mTo = l.match(/^\*\*To:\*\*\s*(.+)\s*$/i);
    if (mTo?.[1]) {
      to = mTo[1].trim();
      continue;
    }

    const mSubject = l.match(/^\*\*Subject:\*\*\s*(.+)\s*$/i);
    if (mSubject?.[1]) {
      subject = mSubject[1].trim();
      continue;
    }

    if (l.trim() === "**Attachments:**") {
      // capture following "- name" lines
      for (let j = i + 1; j < lines.length; j += 1) {
        const li = lines[j];
        const m = li.match(/^\s*-\s+(.+)\s*$/);
        if (!m?.[1]) break;
        attachmentNames.push(m[1].trim());
        i = j;
      }
      continue;
    }

    const mBody = l.match(/^\s*>\s?(.*)$/);
    if (mBody) {
      bodyLines.push(mBody[1] || "");
    }
  }

  const body = bodyLines.join("\n").trim();
  return {
    providerLabel: providerLabel || (provider ? (provider === "gmail" ? "Gmail" : "Outlook") : ""),
    provider,
    to,
    subject,
    attachmentNames,
    body,
  };
}

function providerIcon(provider) {
  const p = safeString(provider).toLowerCase();
  if (p === "gmail") return gmailSvg;
  if (p === "outlook") return outlookSvg;
  return null;
}

function cleanFilename(name) {
  return safeString(name).trim().replace(/\s+/g, " ");
}

export default function EmailDraftActionCard({
  message,
  confirmationToken,
  documents = [],
  onConfirmToken,
  onCancel,
  isMobile = false,
}) {
  const parsed = useMemo(() => parseEmailDraftFromMarkdown(message?.content || ""), [message?.content]);
  const icon = useMemo(() => providerIcon(parsed.provider), [parsed.provider]);

  const [expanded, setExpanded] = useState(false);
  const [to, setTo] = useState(parsed.to || "");
  const [subject, setSubject] = useState(parsed.subject || "");
  const [body, setBody] = useState(parsed.body || "");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  // Resolve initial attachments by filename -> docId (best effort).
  const initialAttachmentIds = useMemo(() => {
    const names = Array.isArray(parsed.attachmentNames) ? parsed.attachmentNames : [];
    if (!names.length) return [];

    const byLower = new Map();
    for (const d of documents || []) {
      const fn = cleanFilename(d?.filename || "");
      if (!fn) continue;
      const key = fn.toLowerCase();
      if (!byLower.has(key)) byLower.set(key, d);
    }

    const out = [];
    for (const n of names) {
      const key = cleanFilename(n).toLowerCase();
      const hit = byLower.get(key);
      if (hit?.id) out.push(hit.id);
    }
    return out;
  }, [documents, parsed.attachmentNames]);

  const [attachmentIds, setAttachmentIds] = useState(initialAttachmentIds);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerSelected, setPickerSelected] = useState(() => new Set());

  const attachmentDocs = useMemo(() => {
    const byId = new Map((documents || []).map((d) => [d.id, d]));
    return (attachmentIds || []).map((id) => byId.get(id)).filter(Boolean);
  }, [attachmentIds, documents]);

  const resolvedNameSet = useMemo(() => {
    const byId = new Map((documents || []).map((d) => [d.id, d]));
    const out = new Set();
    for (const id of attachmentIds || []) {
      const d = byId.get(id);
      const name = cleanFilename(d?.filename || "");
      if (name) out.add(name.toLowerCase());
    }
    return out;
  }, [attachmentIds, documents]);

  const unresolvedAttachmentNames = useMemo(() => {
    const names = Array.isArray(parsed.attachmentNames) ? parsed.attachmentNames : [];
    return names
      .map((n) => cleanFilename(n))
      .filter(Boolean)
      .filter((n) => !resolvedNameSet.has(n.toLowerCase()));
  }, [parsed.attachmentNames, resolvedNameSet]);

  const isDirty = useMemo(() => {
    if (safeString(to).trim() !== safeString(parsed.to).trim()) return true;
    if (safeString(subject) !== safeString(parsed.subject)) return true;
    if (safeString(body).trim() !== safeString(parsed.body).trim()) return true;
    // Attachments: if user changed selection in the UI, treat as dirty.
    // (We don't compare against parsed names because those may be unresolvable.)
    const a = Array.isArray(attachmentIds) ? attachmentIds : [];
    const b = Array.isArray(initialAttachmentIds) ? initialAttachmentIds : [];
    if (a.length !== b.length) return true;
    const sa = new Set(a);
    for (const x of b) if (!sa.has(x)) return true;
    return false;
  }, [attachmentIds, body, initialAttachmentIds, parsed.body, parsed.subject, parsed.to, subject, to]);

  const filteredDocs = useMemo(() => {
    const q = safeString(pickerQuery).trim().toLowerCase();
    const list = Array.isArray(documents) ? documents : [];
    const filtered = q
      ? list.filter((d) => cleanFilename(d?.filename || "").toLowerCase().includes(q))
      : list;
    // keep it fast and readable
    return filtered.slice(0, 80);
  }, [documents, pickerQuery]);

  const openPicker = () => {
    setPickerSelected(new Set());
    setPickerQuery("");
    setPickerOpen(true);
  };

  const closePicker = () => setPickerOpen(false);

  const addSelectedAttachments = () => {
    const next = new Set(attachmentIds || []);
    for (const id of pickerSelected) next.add(id);
    setAttachmentIds(Array.from(next));
    closePicker();
  };

  const removeAttachment = (id) => {
    setAttachmentIds((prev) => (Array.isArray(prev) ? prev.filter((x) => x !== id) : []));
  };

  const mintTokenAndSend = async () => {
    setError("");
    const provider = parsed.provider || "";
    if (!provider) { setError("Email provider is missing."); return; }
    const toTrim = safeString(to).trim();
    if (!toTrim) { setError("Recipient is required."); return; }

    // If the user didn't change anything, use the original signed token so we don't lose attachments.
    if (!isDirty && confirmationToken) {
      await onConfirmToken?.(confirmationToken);
      return;
    }

    // If user edited anything but we couldn't resolve original attachment filenames -> docIds,
    // we must block sending to avoid silently dropping attachments.
    if (unresolvedAttachmentNames.length) {
      setError("Some original attachments couldn't be matched. Add them again using Add files before sending.");
      return;
    }

    setSending(true);
    try {
      const res = await api.post("/api/integrations/email/send-token", {
        provider,
        to: toTrim,
        subject: safeString(subject),
        body: safeString(body),
        attachmentDocumentIds: Array.isArray(attachmentIds) ? attachmentIds : [],
      });
      const token = res?.data?.ok ? res.data.data?.confirmationId : null;
      if (!token) throw new Error(res?.data?.error?.message || "Failed to create send token.");
      await onConfirmToken?.(token);
    } catch (e) {
      setError(e?.response?.data?.error?.message || e?.message || "Send failed.");
    } finally {
      setSending(false);
    }
  };

  const sendLabel = sending ? "Sending…" : "Send";

  const bodySnippet = useMemo(() => {
    const t = safeString(body).trim();
    if (!t) return "";
    const oneLine = t.replace(/\s+/g, " ");
    return oneLine.length > 92 ? `${oneLine.slice(0, 92)}…` : oneLine;
  }, [body]);

  const attachmentCount = attachmentDocs.length + unresolvedAttachmentNames.length;

  return (
    <div className="allybi-emailDraftCard">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="allybi-emailDraftHeaderBtn"
        aria-expanded={expanded ? "true" : "false"}
      >
        <div className="allybi-emailDraftHeaderLeft">
          <div className="allybi-emailDraftAvatar" title="Allybi">
            <img src={allybiKnot} alt="" style={{ width: 18, height: 18 }} />
          </div>

          <div className="allybi-emailDraftHeaderText">
            <div className="allybi-emailDraftTitleRow">
              <div className="allybi-emailDraftTitle">Email draft</div>
              <div className="allybi-emailDraftPill">
                {icon ? <img src={icon} alt="" style={{ width: 14, height: 14 }} /> : null}
                {parsed.providerLabel || "Email"}
              </div>
              {attachmentCount ? (
                <div className="allybi-emailDraftPill" title="Attachments">
                  <img src={paperclipSvg} alt="" style={{ width: 14, height: 14 }} />
                  {attachmentCount}
                </div>
              ) : null}
            </div>
            <div className="allybi-emailDraftMeta">
              To: {to || "(recipient)"} · Subject: {subject || "(subject)"}
            </div>
            {!expanded && bodySnippet ? (
              <div className="allybi-emailDraftSnippet">{bodySnippet}</div>
            ) : null}
          </div>
        </div>

        <div className="allybi-emailDraftToggle">{expanded ? "–" : "+"}</div>
      </button>

      {/* Body */}
      {expanded ? (
        <div className="allybi-emailDraftBody">
          <div className="allybi-emailDraftComposer">
            <img className="allybi-emailDraftWatermark" src={allybiKnot} alt="" />
            <div className={`allybi-emailDraftRow ${isMobile ? "allybi-emailDraftRowMobile" : ""}`}>
              <div className="allybi-emailDraftLabel">To</div>
              <input
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="name@company.com"
                className="allybi-emailDraftInput"
              />
            </div>

            <div className={`allybi-emailDraftRow ${isMobile ? "allybi-emailDraftRowMobile" : ""}`}>
              <div className="allybi-emailDraftLabel">Subject</div>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Subject"
                className="allybi-emailDraftInput"
              />
            </div>

            <div className="allybi-emailDraftSectionHeader">
              <div className="allybi-emailDraftSectionTitle">
                <img src={paperclipSvg} alt="" style={{ width: 16, height: 16 }} />
                Attachments
              </div>
              <button type="button" onClick={openPicker} className="allybi-emailDraftSmallBtn">
                Add files
              </button>
            </div>

            <div className="allybi-emailDraftAttachments">
              {attachmentDocs.length || unresolvedAttachmentNames.length ? (
                <div className="allybi-emailDraftAttachmentChipRow">
                  {attachmentDocs.map((d) => (
                    <div key={d.id} className="allybi-emailDraftAttachmentChip">
                      <span className="allybi-emailDraftAttachmentName">
                        {cleanFilename(d.filename || "Document")}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeAttachment(d.id)}
                        className="allybi-emailDraftRemoveChipBtn"
                        title="Remove attachment"
                      >
                        ×
                      </button>
                    </div>
                  ))}

                  {unresolvedAttachmentNames.map((n) => (
                    <div
                      key={n}
                      className="allybi-emailDraftAttachmentChip"
                      title="Included in the original signed draft. If you edit the draft, re-add it via Add files."
                      style={{ borderStyle: "dashed" }}
                    >
                      <span className="allybi-emailDraftAttachmentName">{n}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="allybi-emailDraftMuted">No attachments</div>
              )}
            </div>

            <div className="allybi-emailDraftTextareaWrap">
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write your email…"
                rows={isMobile ? 6 : 8}
                className="allybi-emailDraftTextarea"
              />
            </div>

            {error ? <div className="allybi-emailDraftError">{error}</div> : null}

            <div className="allybi-emailDraftFooter">
              <div className="allybi-emailDraftMuted">
                Draft by Allybi
              </div>
              <div className="allybi-emailDraftActions">
                <button
                  type="button"
                  onClick={() => onCancel?.()}
                  className={`allybi-emailDraftBtn allybi-emailDraftBtnSecondary`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => mintTokenAndSend()}
                  disabled={sending || !confirmationToken}
                  className={`allybi-emailDraftBtn allybi-emailDraftBtnPrimary`}
                  title="Send this email"
                >
                  {sendLabel}
                </button>
              </div>
            </div>
          </div>

          {/* Picker modal */}
          {pickerOpen ? (
            <div
              role="dialog"
              aria-modal="true"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) closePicker();
              }}
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(17,24,39,0.35)",
                zIndex: 99999,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 16,
              }}
            >
              <div
                style={{
                  width: "100%",
                  maxWidth: 620,
                  background: "white",
                  borderRadius: 18,
                  border: "1px solid #E6E6EC",
                  boxShadow: "0 22px 70px rgba(0,0,0,0.25)",
                  overflow: "hidden",
                }}
              >
                <div style={{ padding: 14, borderBottom: "1px solid #E6E6EC", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ fontWeight: 950, fontSize: 14, color: "#111827" }}>Add attachments</div>
                  <button
                    type="button"
                    onClick={closePicker}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 10,
                      border: "1px solid #E6E6EC",
                      background: "white",
                      cursor: "pointer",
                      fontWeight: 950,
                      color: "#6B7280",
                    }}
                  >
                    ×
                  </button>
                </div>

                <div style={{ padding: 14 }}>
                  <input
                    value={pickerQuery}
                    onChange={(e) => setPickerQuery(e.target.value)}
                    placeholder="Search files…"
                    style={{
                      width: "100%",
                      height: 40,
                      borderRadius: 12,
                      border: "1px solid #E6E6EC",
                      padding: "0 12px",
                      fontFamily: "Plus Jakarta Sans, sans-serif",
                      fontWeight: 700,
                      fontSize: 14,
                      outline: "none",
                    }}
                  />
                </div>

                <div style={{ maxHeight: 360, overflow: "auto", padding: "0 14px 14px" }}>
                  {filteredDocs.map((d) => {
                    const name = cleanFilename(d?.filename || "Document");
                    const checked = pickerSelected.has(d.id);
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => {
                          setPickerSelected((prev) => {
                            const next = new Set(prev);
                            if (next.has(d.id)) next.delete(d.id);
                            else next.add(d.id);
                            return next;
                          });
                        }}
                        style={{
                          width: "100%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 12,
                          padding: "10px 10px",
                          borderRadius: 14,
                          border: "1px solid #EEF2F7",
                          background: checked ? "#F3F4F6" : "white",
                          cursor: "pointer",
                          marginBottom: 8,
                          textAlign: "left",
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 850, fontSize: 13, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {name}
                          </div>
                          <div style={{ fontWeight: 700, fontSize: 12, color: "#6B7280" }}>
                            {safeString(d?.mimeType || "").split(";")[0]}
                          </div>
                        </div>
                        <input type="checkbox" readOnly checked={checked} />
                      </button>
                    );
                  })}
                  {!filteredDocs.length ? (
                    <div style={{ padding: 14, fontWeight: 700, fontSize: 12, color: "#6B7280" }}>
                      No files found
                    </div>
                  ) : null}
                </div>

                <div style={{ padding: 14, borderTop: "1px solid #E6E6EC", display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <button
                    type="button"
                    onClick={closePicker}
                    style={{
                      height: 36,
                      padding: "0 14px",
                      borderRadius: 999,
                      border: "1px solid #E6E6EC",
                      background: "white",
                      cursor: "pointer",
                      fontFamily: "Plus Jakarta Sans, sans-serif",
                      fontWeight: 900,
                      fontSize: 13,
                      color: "#111827",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={addSelectedAttachments}
                    style={{
                      height: 36,
                      padding: "0 14px",
                      borderRadius: 999,
                      border: "1px solid #111827",
                      background: "#111827",
                      cursor: "pointer",
                      fontFamily: "Plus Jakarta Sans, sans-serif",
                      fontWeight: 900,
                      fontSize: 13,
                      color: "white",
                    }}
                  >
                    Add selected
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
