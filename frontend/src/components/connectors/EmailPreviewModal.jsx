import React, { useEffect, useMemo, useRef, useState } from "react";
import api from "../../services/api";
import { useNotifications } from "../../context/NotificationsStore";
import Modal from "../ui/Modal";
import DestinationFolderModal from "../folders/DestinationFolderModal";

import gmailSvg from "../../assets/Gmail.svg";
import outlookSvg from "../../assets/outlook.svg";

function safeString(x) {
  return typeof x === "string" ? x : x == null ? "" : String(x);
}

function formatWhen(value) {
  const v = safeString(value).trim();
  if (!v) return "";
  const d = new Date(v);
  if (!Number.isNaN(d.getTime())) return d.toLocaleString();
  return v;
}

function providerIcon(provider) {
  const p = safeString(provider).toLowerCase();
  if (p === "gmail") return gmailSvg;
  if (p === "outlook") return outlookSvg;
  return null;
}

export default function EmailPreviewModal({ isOpen, email, onClose, folders = [], onSavedToKoda }) {
  const e = email || null;
  const provider = safeString(e?.provider).toLowerCase();
  const icon = useMemo(() => providerIcon(provider), [provider]);
  const closeBtnRef = useRef(null);
  const { showSuccess, showError } = useNotifications();

  const [attachmentMeta, setAttachmentMeta] = useState([]);
  const [loadingAtt, setLoadingAtt] = useState(false);
  const [bodyText, setBodyText] = useState("");
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [pendingSave, setPendingSave] = useState(null); // { mode:'one'|'all', ids: string[] }

  const messageId = safeString(e?.messageId).trim();

  // Reset between opens/emails so we don't flash a previous body.
  useEffect(() => {
    if (!isOpen) return;
    setBodyText(safeString(e?.bodyText || "").trim());
  }, [isOpen, messageId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Focus the close button on open.
  useEffect(() => {
    if (!isOpen) return;
    const t = window.setTimeout(() => closeBtnRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    if (!messageId || (provider !== "gmail" && provider !== "outlook")) return;

    let cancelled = false;
    setLoadingAtt(true);
    api
      .get(`/api/integrations/email/messages/${provider}/${encodeURIComponent(messageId)}?includeBody=1`)
      .then((res) => {
        if (cancelled) return;
        // NOTE: our axios wrapper unwraps { ok:true, data:{...} } into the payload directly.
        const payload = res?.data || {};
        const arr = payload?.attachments || (payload?.data?.attachments ?? []);
        setAttachmentMeta(Array.isArray(arr) ? arr : []);

        const nextBody = safeString(payload?.bodyText || payload?.data?.bodyText || "").trim();
        if (nextBody) setBodyText(nextBody);
      })
      .catch(() => {
        if (cancelled) return;
        setAttachmentMeta([]);
      })
      .finally(() => {
        if (cancelled) return;
        setLoadingAtt(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, messageId, provider]);

  if (!isOpen || !e) return null;

  const subject = safeString(e.subject).trim() || "(no subject)";
  const from = safeString(e.from).trim();
  const to = safeString(e.to).trim();
  const cc = safeString(e.cc).trim();
  const when = formatWhen(e.receivedAt);
  const initialBody = safeString(e.bodyText).trim();
  const body = bodyText || initialBody;

  const openSaveOne = (attachmentId) => {
    setPendingSave({ mode: "one", ids: [attachmentId] });
    setSaveModalOpen(true);
  };

  const openSaveAll = () => {
    const ids = (attachmentMeta || []).map((a) => safeString(a.attachmentId).trim()).filter(Boolean);
    if (!ids.length) return;
    setPendingSave({ mode: "all", ids });
    setSaveModalOpen(true);
  };

  const doSave = async (folderId) => {
    if (!pendingSave || !messageId) return;
    try {
      if (pendingSave.mode === "one") {
        const attachmentId = pendingSave.ids[0];
        await api.post("/api/integrations/email/attachments/save", {
          provider,
          messageId,
          attachmentId,
          folderId,
        });
        showSuccess("Saved to Allybi");
      } else {
        await api.post("/api/integrations/email/attachments/save-all", {
          provider,
          messageId,
          attachmentIds: pendingSave.ids,
          folderId,
        });
        showSuccess("Saved attachments to Allybi");
      }

      setSaveModalOpen(false);
      setPendingSave(null);
      onSavedToKoda?.();
    } catch (err) {
      showError("Failed to save attachment");
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={() => onClose?.()}
        maxWidth={860}
        backdrop="blur"
        placement="center"
        showCloseButton={false}
        header={
          <div
            style={{
              padding: "14px 16px",
              borderBottom: "1px solid #E6E6EC",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              position: "sticky",
              top: 0,
              background: "#fff",
              zIndex: 1,
              fontFamily: "Plus Jakarta Sans, sans-serif",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              {icon ? <img src={icon} alt="" width={22} height={22} style={{ objectFit: "contain" }} /> : null}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 850, fontSize: 15, color: "#18181B", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {subject}
                </div>
                <div style={{ marginTop: 2, fontSize: 12.5, fontWeight: 650, color: "#71717A" }}>
                  {provider ? provider.toUpperCase() : "EMAIL"}{when ? ` · ${when}` : ""}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onClose?.()}
              aria-label="Close"
              ref={closeBtnRef}
              style={{
                width: 34,
                height: 34,
                borderRadius: 12,
                border: "1px solid #E6E6EC",
                background: "#fff",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#52525B",
                fontWeight: 800,
              }}
            >
              ×
            </button>
          </div>
        }
      >
        <div
          style={{
            padding: "10px 16px 12px",
            borderBottom: "1px solid #EEF2F7",
            fontFamily: "Plus Jakarta Sans, sans-serif",
          }}
        >
          {from ? <Row k="From" v={from} /> : null}
          {to ? <Row k="To" v={to} /> : null}
          {cc ? <Row k="Cc" v={cc} /> : null}
        </div>

        <div style={{ padding: "12px 16px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
            <div style={{ fontWeight: 850, fontSize: 12.5, color: "#111827" }}>
              Attachments {loadingAtt ? "…" : ""}
            </div>
            {(attachmentMeta || []).length > 1 ? (
              <button
                type="button"
                onClick={openSaveAll}
                style={{
                  height: 30,
                  padding: "0 10px",
                  borderRadius: 999,
                  border: "1px solid #E6E6EC",
                  background: "white",
                  cursor: "pointer",
                  fontFamily: "Plus Jakarta Sans, sans-serif",
                  fontWeight: 800,
                  fontSize: 12,
                  color: "#111827",
                }}
              >
                Save all
              </button>
            ) : null}
          </div>

          {(attachmentMeta || []).length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {attachmentMeta.map((a) => {
                const aid = safeString(a?.attachmentId).trim();
                const fname = safeString(a?.filename).trim() || "attachment";
                return (
                  <div
                    key={aid || fname}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      padding: "10px 12px",
                      borderRadius: 14,
                      border: "1px solid #E5E7EB",
                      background: "white",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 850, fontSize: 13, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {fname}
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 12, color: "#6B7280" }}>
                        {safeString(a?.mimeType || "").split(";")[0]}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => openSaveOne(aid)}
                      disabled={!aid}
                      style={{
                        height: 32,
                        padding: "0 12px",
                        borderRadius: 999,
                        border: "1px solid #111827",
                        background: "#111827",
                        cursor: aid ? "pointer" : "not-allowed",
                        fontFamily: "Plus Jakarta Sans, sans-serif",
                        fontWeight: 850,
                        fontSize: 12,
                        color: "white",
                        opacity: aid ? 1 : 0.6,
                      }}
                    >
                      Save
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ padding: 12, border: "1px solid #E5E7EB", borderRadius: 12, color: "#6B7280", fontWeight: 700, fontSize: 13 }}>
              No attachments
            </div>
          )}
        </div>

        <div style={{ padding: "0 16px 16px" }}>
          <div
            style={{
              border: "1px solid #E5E7EB",
              borderRadius: 14,
              background: "#FFFFFF",
              padding: "12px 14px",
              boxShadow: "0 10px 18px rgba(17, 24, 39, 0.04)",
              overflow: "auto",
              maxHeight: "52vh",
            }}
          >
            <div
              style={{
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                fontFamily: "Plus Jakarta Sans, sans-serif",
                fontSize: 13.5,
                lineHeight: 1.65,
                color: "#111827",
                fontWeight: 550,
              }}
            >
              {body || "(empty)"}
            </div>
          </div>
        </div>
      </Modal>

      <DestinationFolderModal
        isOpen={saveModalOpen}
        onClose={() => { setSaveModalOpen(false); setPendingSave(null); }}
        folders={folders}
        onConfirm={async (folderId) => {
          await doSave(folderId);
        }}
        title="Where should I save it?"
      />
    </>
  );
}

function Row({ k, v }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "56px 1fr", gap: 10, alignItems: "center", padding: "4px 0" }}>
      <div style={{ color: "#71717A", fontWeight: 800, fontSize: 12 }}>{k}</div>
      <div
        style={{
          color: "#111827",
          fontWeight: 650,
          fontSize: 12.5,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={safeString(v)}
      >
        {v}
      </div>
    </div>
  );
}
