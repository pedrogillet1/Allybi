import React, { useEffect, useMemo, useRef, useState } from "react";
import api from "../../../services/api";

import gmailSvg from "../../../assets/Gmail.svg";
import outlookSvg from "../../../assets/outlook.svg";
import paperclipSvg from "../../../assets/Paperclip.svg";

import "./EmailDraftActionCard.css";
import AttachmentPickerModal from "../../documents/AttachmentPickerModal";
import EmailCard from "../../attachments/cards/EmailCard";
import Modal from "../../ui/Modal";

function safeString(x) {
  return typeof x === "string" ? x : x == null ? "" : String(x);
}

function normalizeDraftBody(text) {
  const t = safeString(text).trim();
  if (!t) return "";
  if (/^\(?\s*your message here\s*\)?$/i.test(t)) return "";
  return t;
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

  const body = normalizeDraftBody(bodyLines.join("\n").trim());
  return {
    providerLabel: providerLabel || (provider ? (provider === "gmail" ? "Gmail" : "Outlook") : ""),
    provider,
    to,
    subject,
    attachmentNames,
    body,
  };
}

function normalizeProvider(provider) {
  const p = safeString(provider).toLowerCase();
  if (p === "gmail") return "gmail";
  if (p === "outlook") return "outlook";
  return "";
}

function providerIconSrc(provider) {
  if (provider === "gmail") return gmailSvg;
  if (provider === "outlook") return outlookSvg;
  return null;
}

function cleanFilename(name) {
  return safeString(name).trim().replace(/\s+/g, " ");
}

export default function EmailDraftActionCard({
  message,
  confirmationToken,
  documents = [],
  folders = [],
  onConfirmToken,
  onCancel,
  isMobile = false,
  readOnly = false,
  draft = null,
}) {
  const actionStatus = safeString(message?.actionStatus || "").toLowerCase().trim();
  const isSent = Boolean(
    actionStatus === "sent" ||
    safeString(draft?.status || "").toLowerCase().trim() === "sent" ||
    (/\\bemail sent\\b/i.test(safeString(message?.content || "")) && readOnly)
  );

  const parsed = useMemo(() => {
    if (draft && typeof draft === "object") {
      const provider = normalizeProvider(draft.provider || "");
      return {
        providerLabel: safeString(draft.providerLabel) || (provider ? (provider === "gmail" ? "Gmail" : "Outlook") : ""),
        provider,
        to: safeString(draft.to),
        subject: safeString(draft.subject),
        attachmentNames: [],
        body: normalizeDraftBody(draft.body || ""),
      };
    }
    return parseEmailDraftFromMarkdown(message?.content || "");
  }, [draft, message?.content]);
  const provider = useMemo(() => normalizeProvider(parsed.provider), [parsed.provider]);
  const providerIcon = useMemo(() => providerIconSrc(provider), [provider]);

  const [open, setOpen] = useState(false);
  const [modalView, setModalView] = useState("draft"); // 'draft' | 'picker'
  const [to, setTo] = useState(parsed.to || "");
  const [subject, setSubject] = useState(parsed.subject || "");
  const [body, setBody] = useState(normalizeDraftBody(parsed.body || ""));
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const userEditedRef = useRef(false);

  // Resolve initial attachments by filename -> docId (best effort).
  const initialAttachmentIds = useMemo(() => {
    const names = Array.isArray(parsed.attachmentNames) ? parsed.attachmentNames : [];
    if (!names.length) return [];

    const normalize = (s) => safeString(s).toLowerCase().replace(/[^a-z0-9]+/g, "");

    const byLower = new Map();
    const candidates = [];
    for (const d of documents || []) {
      const fn = cleanFilename(d?.filename || "");
      if (!fn) continue;
      const key = fn.toLowerCase();
      if (!byLower.has(key)) byLower.set(key, d);
      candidates.push({
        id: d.id,
        filename: fn,
        norm: normalize(fn),
        normOriginal: normalize(d?.originalName || ""),
      });
    }

    const out = [];
    for (const n of names) {
      const key = cleanFilename(n).toLowerCase();
      const hit = byLower.get(key);
      if (hit?.id) {
        out.push(hit.id);
        continue;
      }

      // Fuzzy match: ignore punctuation/spaces and allow substring matches.
      const target = normalize(n);
      if (!target) continue;
      let best = null;
      for (const c of candidates) {
        if (!c?.id) continue;
        if (c.norm && c.norm === target) { best = c; break; }
        if (c.normOriginal && c.normOriginal === target) { best = c; break; }
      }
      if (!best) {
        for (const c of candidates) {
          if (!c?.id) continue;
          const hay = c.norm || "";
          const hay2 = c.normOriginal || "";
          if ((hay && (hay.includes(target) || target.includes(hay))) || (hay2 && (hay2.includes(target) || target.includes(hay2)))) {
            best = c;
            break;
          }
        }
      }
      if (best?.id) out.push(best.id);
    }
    // Dedupe
    const deduped = [];
    const seen = new Set();
    for (const id of out) {
      if (!id || seen.has(id)) continue;
      seen.add(id);
      deduped.push(id);
    }
    return deduped;
  }, [documents, parsed.attachmentNames]);

  const [attachmentIds, setAttachmentIds] = useState(initialAttachmentIds);
  // Replaced legacy inline picker with a full library picker modal.

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

  const openPicker = () => setModalView("picker");

  const removeAttachment = (id) => {
    userEditedRef.current = true;
    setAttachmentIds((prev) => (Array.isArray(prev) ? prev.filter((x) => x !== id) : []));
  };

  // Keep draft fields in sync while the message is still streaming/settling,
  // until the user starts editing.
  useEffect(() => {
    if (userEditedRef.current) return;
    setTo(parsed.to || "");
    setSubject(parsed.subject || "");
    setBody(normalizeDraftBody(parsed.body || ""));
  }, [parsed.body, parsed.subject, parsed.to]);

  useEffect(() => {
    if (userEditedRef.current) return;
    setAttachmentIds(initialAttachmentIds);
  }, [initialAttachmentIds]);

  const mintTokenAndSend = async () => {
    if (readOnly) return;
    setError("");
    const provider = parsed.provider || "";
    if (!provider) { setError("Email provider is missing."); return; }
    const toTrim = safeString(to).trim();
    if (!toTrim) { setError("Recipient is required."); return; }

    // If the user didn't change anything, use the original signed token so we don't lose attachments.
    if (!isDirty && confirmationToken) {
      await onConfirmToken?.(confirmationToken, {
        provider,
        to: toTrim,
        subject: safeString(subject),
        body: safeString(body),
        attachmentDocumentIds: Array.isArray(attachmentIds) ? attachmentIds : [],
      });
      setOpen(false);
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
      // NOTE: our axios wrapper unwraps { ok:true, data:{...} } into the payload directly.
      // Support both wrapped and unwrapped shapes.
      const payload = res?.data || {};
      const token =
        payload?.confirmationId ||
        payload?.data?.confirmationId ||
        (payload?.ok ? payload?.data?.confirmationId : null);
      if (!token) throw new Error(payload?.error?.message || payload?.message || "Failed to create send token.");
      await onConfirmToken?.(token, {
        provider,
        to: toTrim,
        subject: safeString(subject),
        body: safeString(body),
        attachmentDocumentIds: Array.isArray(attachmentIds) ? attachmentIds : [],
      });
      setOpen(false);
    } catch (e) {
      setError(e?.response?.data?.error?.message || e?.message || "Send failed.");
    } finally {
      setSending(false);
    }
  };

  const sendLabel = sending ? "Sending…" : "Send";

  const cardModel = useMemo(() => {
    return {
      cardTitle: "Email draft",
      actionLabel: "Open",
      provider,
      subject: safeString(subject).trim() || "(subject)",
      to: safeString(to).trim() || "(recipient)",
      // Card should be clean like the mock: subject + To only (no body preview).
      preview: "",
      previewIsPlaceholder: false,
      ...(isSent ? { status: "sent", statusLabel: "Sent" } : {}),
    };
  }, [provider, subject, to, isSent]);

  const closeModal = () => {
    setOpen(false);
    setModalView("draft");
    setError("");
  };

  return (
    <>
      <EmailCard
        email={cardModel}
        variant="compact"
        showAction={false}
        onOpen={() => {
          setModalView("draft");
          setOpen(true);
        }}
      />

      {/* Draft modal */}
      <Modal
        isOpen={open}
        onClose={closeModal}
        maxWidth={modalView === "picker" ? 860 : 760}
        backdrop="blur"
        placement="center"
        showCloseButton={false}
        contentPadding={modalView === "picker" ? "none" : "default"}
        header={
          modalView === "picker" ? (
            // Hide the generic modal header; FolderPreview provides its own header.
            <div style={{ display: "none" }} />
          ) : (
            <div
            style={{
              padding: "14px 16px",
              borderBottom: "1px solid #E6E6EC",
              display: "grid",
              gridTemplateColumns: "1fr auto 1fr",
              alignItems: "center",
              gap: 12,
              position: "sticky",
              top: 0,
              background: "#fff",
              zIndex: 1,
              fontFamily: "Plus Jakarta Sans, sans-serif",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              {providerIcon ? (
                <img src={providerIcon} alt="" width={22} height={22} style={{ objectFit: "contain", flexShrink: 0 }} />
              ) : null}
              <div style={{ fontWeight: 900, fontSize: 14, color: "#111827", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {parsed.providerLabel || (provider ? (provider === "gmail" ? "Gmail" : "Outlook") : "Email")}
              </div>
            </div>

            <div style={{ color: "#6B7280", fontWeight: 650, fontSize: 13, whiteSpace: "nowrap" }}>
              {safeString(to).trim() ? `To: ${safeString(to).trim()}` : ""}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "flex-end" }}>
              <button
                type="button"
                aria-label="Close"
                className="allybi-emailDraftModalCloseBtn"
                onClick={closeModal}
              >
                ×
              </button>
            </div>
          </div>
          )
        }
      >
        {modalView === "picker" ? (
          <AttachmentPickerModal
            embedded
            isOpen
            onClose={() => setModalView("draft")}
            documents={documents}
            folders={folders}
            initialSelectedIds={attachmentIds}
            onConfirm={(ids) => {
              userEditedRef.current = true;
              setAttachmentIds(Array.isArray(ids) ? ids : []);
              setModalView("draft");
            }}
          />
        ) : (
          <div className="allybi-emailDraftComposer">
          <div className={`allybi-emailDraftRow ${isMobile ? "allybi-emailDraftRowMobile" : ""}`}>
            <div className="allybi-emailDraftLabel">To</div>
            <input
              value={to}
              onChange={(e) => { userEditedRef.current = true; setTo(e.target.value); }}
              placeholder="name@company.com"
              className="allybi-emailDraftInput"
              disabled={readOnly}
            />
          </div>

          <div className={`allybi-emailDraftRow ${isMobile ? "allybi-emailDraftRowMobile" : ""}`}>
            <div className="allybi-emailDraftLabel">Subject</div>
            <input
              value={subject}
              onChange={(e) => { userEditedRef.current = true; setSubject(e.target.value); }}
              placeholder="Subject"
              className="allybi-emailDraftInput"
              disabled={readOnly}
            />
          </div>

            <div className="allybi-emailDraftSectionHeader">
            <div className="allybi-emailDraftSectionTitle">
              <img src={paperclipSvg} alt="" style={{ width: 16, height: 16 }} />
              Attachments
            </div>
            <button type="button" onClick={openPicker} className="allybi-emailDraftSmallBtn" disabled={readOnly}>
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
              ) : null}
            </div>

            <div className="allybi-emailDraftTextareaWrap">
              <textarea
                value={body}
                onChange={(e) => { userEditedRef.current = true; setBody(e.target.value); }}
                placeholder=""
                rows={isMobile ? 6 : 10}
                className="allybi-emailDraftTextarea"
                disabled={readOnly}
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
                  onClick={() => {
                    closeModal();
                    // Only allow cancelling while the action is pending confirmation.
                    if (!readOnly) onCancel?.();
                  }}
                  className={`allybi-emailDraftBtn allybi-emailDraftBtnSecondary`}
                >
                  {readOnly ? "Close" : "Cancel"}
                </button>
                {!readOnly ? (
                  <button
                    type="button"
                    onClick={() => mintTokenAndSend()}
                    disabled={sending || !confirmationToken}
                    className={`allybi-emailDraftBtn allybi-emailDraftBtnPrimary`}
                    title="Send this email"
                  >
                    {sendLabel}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
