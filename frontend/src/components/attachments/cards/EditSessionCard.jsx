import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { applyEdit } from "../../../services/editingService";
import { buildRoute } from "../../../constants/routes";
import kodaIconBlack from "../../../assets/koda-dark-knot.svg";
import docIcon from "../../../assets/doc.svg";
import pdfIcon from "../../../assets/pdf.svg";
import pptxIcon from "../../../assets/pptx.png";
import sheetIcon from "../../../assets/spreadsheet.svg";
import "./EditSessionCard.css";

function safeString(x) {
  return typeof x === "string" ? x : x == null ? "" : String(x);
}

function clip(s, n = 140) {
  const t = String(s || "").trim().replace(/\s+/g, " ");
  if (!t) return "";
  return t.length <= n ? t : t.slice(0, n).trimEnd() + "…";
}

function normalizeCandidates(session) {
  const list = Array.isArray(session?.targetCandidates)
    ? session.targetCandidates
    : Array.isArray(session?.target?.candidates)
      ? session.target.candidates
      : [];
  return list
    .map((c) => ({
      id: safeString(c?.id),
      label: safeString(c?.label),
      confidence: typeof c?.confidence === "number" ? c.confidence : null,
      reasons: Array.isArray(c?.reasons) ? c.reasons : [],
      previewText: safeString(c?.previewText),
    }))
    .filter((c) => c.id && c.label);
}

function buildInlineDiff(diff) {
  const changes = Array.isArray(diff?.changes) ? diff.changes : [];
  if (!changes.length) return [{ type: "same", text: safeString(diff?.after || "") }];

  const out = [];
  for (const ch of changes) {
    const type = safeString(ch?.type);
    if (type === "add") out.push({ type: "add", text: safeString(ch?.after) });
    else if (type === "remove") out.push({ type: "remove", text: safeString(ch?.before) });
    else if (type === "replace") {
      out.push({ type: "remove", text: safeString(ch?.before) });
      out.push({ type: "add", text: safeString(ch?.after) });
    } else {
      out.push({ type: "same", text: safeString(ch?.after || ch?.before) });
    }
  }
  return out.filter((p) => p.text);
}

export default function EditSessionCard({ session, onOpenDoc }) {
  const navigate = useNavigate();
  const isBundle = Boolean(session?.bundle) && Array.isArray(session?.bundlePatches || []);
  const [view, setView] = useState("diff"); // diff|before|after
  const [expanded, setExpanded] = useState(false);
  const [manualEdit, setManualEdit] = useState(false);
  const [draftAfter, setDraftAfter] = useState("");
  const [selectedTargetId, setSelectedTargetId] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const [isApplying, setIsApplying] = useState(false);
  const [applyErr, setApplyErr] = useState("");
  const [appliedRevisionId, setAppliedRevisionId] = useState(null);
  const [rejected, setRejected] = useState(false);

  const textareaRef = useRef(null);

  const diff = session?.diff || null;
  const candidates = useMemo(() => normalizeCandidates(session), [session]);

  const requiresConfirmation = Boolean(session?.requiresConfirmation) || Boolean(session?.target?.isAmbiguous);
  const requiresTargetPick = Boolean(requiresConfirmation && candidates.length > 1);

  const locationLabel =
    safeString(session?.locationLabel) ||
    safeString(session?.target?.label) ||
    safeString(session?.filename) ||
    "Edit";

  const afterText = safeString(diff?.after || session?.proposedText);
  const beforeText = safeString(diff?.before || session?.beforeText);
  const inlineDiffParts = useMemo(() => buildInlineDiff(diff), [diff]);

  useEffect(() => {
    setDraftAfter(afterText);
    const initialTargetId =
      safeString(session?.target?.id) ||
      safeString(candidates?.[0]?.id) ||
      "";
    setSelectedTargetId(initialTargetId);
    setConfirmed(!requiresConfirmation);
    setRejected(false);
    setAppliedRevisionId(null);
    setApplyErr("");
    setIsApplying(false);
    setManualEdit(Boolean(session?.__ui?.openEdit));
    setView("diff");
    setExpanded(false);
  }, [afterText, candidates, requiresConfirmation, session?.target?.id]);

  useEffect(() => {
    if (manualEdit) setTimeout(() => textareaRef.current?.focus?.(), 0);
  }, [manualEdit]);

  const selectedTarget = useMemo(() => {
    const id = safeString(selectedTargetId);
    if (!id) return session?.target || undefined;
    if (session?.target?.id === id && session?.target?.isAmbiguous === false) return session.target;
    const picked = candidates.find((c) => c.id === id) || null;
    const label = safeString(picked?.label) || safeString(session?.target?.label) || "Target";
    const confidence =
      typeof picked?.confidence === "number"
        ? picked.confidence
        : typeof session?.target?.confidence === "number"
          ? session.target.confidence
          : 0.5;
    return {
      id,
      label,
      confidence,
      candidates: [],
      decisionMargin: 1,
      isAmbiguous: false,
      resolutionReason: "user_selected",
    };
  }, [candidates, selectedTargetId, session?.target]);

  const canApply =
    !rejected &&
    !isApplying &&
    Boolean(safeString(session?.documentId)) &&
    Boolean(safeString(session?.operator)) &&
    Boolean(safeString(session?.domain)) &&
    Boolean(safeString(beforeText)) &&
    Boolean(safeString(draftAfter)) &&
    (!requiresTargetPick || Boolean(safeString(selectedTargetId))) &&
    (!requiresConfirmation || confirmed);

  const onApply = async () => {
    if (!session) return;
    if (!canApply) return;

    setIsApplying(true);
    setApplyErr("");
    try {
      const payload = {
        instruction: safeString(session.instruction),
        operator: session.operator,
        domain: session.domain,
        documentId: session.documentId,
        targetHint: session?.targetHint || undefined,
        target: selectedTarget || undefined,
        beforeText: safeString(session.beforeText || beforeText || "(bulk edit)"),
        proposedText: isBundle ? safeString(session.proposedText) : safeString(draftAfter),
        userConfirmed: requiresConfirmation ? confirmed : true,
      };

      const res = await applyEdit(payload);
      if (res?.requiresUserChoice) {
        setApplyErr("This edit needs an explicit target choice or confirmation before applying.");
        setConfirmed(false);
        return;
      }

      const revisionId = res?.result?.revisionId || res?.result?.restoredRevisionId || null;
      if (revisionId) setAppliedRevisionId(revisionId);
      else setApplyErr("Applied, but no revisionId was returned.");
    } catch (e) {
      const msg =
        e?.response?.data?.error?.message ||
        e?.response?.data?.error ||
        e?.message ||
        "Apply failed.";
      setApplyErr(msg);
    } finally {
      setIsApplying(false);
    }
  };

  const mainText = view === "before" ? beforeText : view === "after" ? draftAfter : "";
  const showInlineDiff = view === "diff";

  const fileIcon = useMemo(() => {
    const domain = String(session?.domain || "").toLowerCase();
    const mime = String(session?.mimeType || "").toLowerCase();
    if (domain === "slides" || mime.includes("presentation")) return pptxIcon;
    if (domain === "sheets" || mime.includes("spreadsheet") || mime.includes("excel")) return sheetIcon;
    if (mime.includes("pdf")) return pdfIcon;
    return docIcon;
  }, [session?.domain, session?.mimeType]);

  const goToViewerWithChange = useMemo(() => {
    const docId = safeString(session?.documentId);
    if (!docId) return null;
    const targetId = safeString(session?.target?.id || session?.targetId);

    const encodeB64Url = (obj) => {
      const json = JSON.stringify(obj || {});
      // encodeURIComponent -> utf-8 safe base64
      const b64 = btoa(unescape(encodeURIComponent(json)));
      return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    };

    const qs = new URLSearchParams();
    qs.set("edit", "1");
    qs.set("tab", "ask");
    if (targetId) qs.set("target", targetId);
    // Pass a small UI hint so the injected card opens in "Edit" mode by default.
    qs.set("kodaEditSession", encodeB64Url({ ...(session || {}), __ui: { ...(session?.__ui || {}), openEdit: true } }));

    return `${buildRoute.document(docId)}?${qs.toString()}`;
  }, [session]);

  if (isBundle) {
    const bp = Array.isArray(session?.bundlePatches) ? session.bundlePatches : [];
    const summary = safeString(session?.bundle?.summary) || `Bulk edit with ${bp.length} change(s).`;
    const domainLabel = String(session?.domain || "").toUpperCase();
    return (
      <div className="koda-editSessionCard">
        <div className="koda-editSessionCard__header">
          <div className="koda-editSessionCard__titleRow">
            <div className="koda-editSessionCard__title">Bulk draft</div>
          </div>
          <div className="koda-editSessionCard__meta">
            <span className="koda-editSessionCard__metaPill">{domainLabel}</span>
            <span className="koda-editSessionCard__metaText">{safeString(session?.filename) || "Document"}</span>
          </div>
          <div className="koda-editSessionCard__summary">{summary}</div>
        </div>

        <div className="koda-editSessionCard__body">
          <div style={{ fontSize: 12, color: "#52525B", marginBottom: 10 }}>
            Changes: <b>{bp.length}</b>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: expanded ? 420 : 180, overflow: "auto" }}>
            {(expanded ? bp : bp.slice(0, 8)).map((p, idx) => (
              <div key={`${p?.paragraphId || p?.rangeA1 || idx}`} style={{ border: "1px solid #E6E6EC", borderRadius: 12, padding: "10px 12px", background: "white" }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#111827", marginBottom: 6 }}>
                  {safeString(p?.paragraphId || p?.rangeA1 || p?.a1 || "Change")}
                </div>
                <div style={{ fontSize: 12, color: "#52525B" }}>
                  {clip(safeString(p?.beforeText))}
                </div>
                <div style={{ fontSize: 12, color: "#111827", marginTop: 6 }}>
                  {clip(safeString(p?.afterText))}
                </div>
              </div>
            ))}
          </div>

          {bp.length > 8 ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              style={{
                marginTop: 10,
                border: "1px solid #E6E6EC",
                background: "white",
                borderRadius: 999,
                padding: "8px 12px",
                cursor: "pointer",
                fontWeight: 800,
                fontSize: 12,
                color: "#111827",
                alignSelf: "flex-start",
              }}
            >
              {expanded ? "Show less" : "Show all"}
            </button>
          ) : null}

          <div className="koda-editSessionCard__actionsRow" style={{ marginTop: 12 }}>
            <button
              type="button"
              disabled={isApplying || rejected}
              onClick={() => onOpenDoc?.(session?.documentId, session)}
              className="koda-editSessionCard__secondaryBtn"
            >
              Open
            </button>
            <button
              type="button"
              disabled={!canApply}
              onClick={() => {
                if (requiresConfirmation && !confirmed) setConfirmed(true);
                onApply();
              }}
              className="koda-editSessionCard__primaryBtn"
            >
              Apply
            </button>
          </div>
          {applyErr ? <div className="koda-editSessionCard__error">{applyErr}</div> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="koda-editSessionCard">
      <div className="koda-editSessionCard__header">
        <div className="koda-editSessionCard__titleRow">
          <div className="koda-editSessionCard__title">Proposed change</div>
          <div className="koda-editSessionCard__viewTabs" role="tablist" aria-label="Diff view">
            <button
              className={`koda-editSessionCard__tab ${view === "diff" ? "isActive" : ""}`}
              onClick={() => setView("diff")}
              type="button"
              role="tab"
              aria-selected={view === "diff"}
            >
              Changes
            </button>
            <button
              className={`koda-editSessionCard__tab ${view === "before" ? "isActive" : ""}`}
              onClick={() => setView("before")}
              type="button"
              role="tab"
              aria-selected={view === "before"}
            >
              Before
            </button>
            <button
              className={`koda-editSessionCard__tab ${view === "after" ? "isActive" : ""}`}
              onClick={() => setView("after")}
              type="button"
              role="tab"
              aria-selected={view === "after"}
            >
              After
            </button>

            <button
              type="button"
              className="koda-editSessionCard__jumpBtn"
              title="Open this change in the document viewer"
              onClick={() => {
                if (!goToViewerWithChange) return;
                navigate(goToViewerWithChange);
              }}
            >
              <img src={kodaIconBlack} alt="Open in viewer" />
            </button>
          </div>
        </div>

        <div className="koda-editSessionCard__meta">
          <span className="koda-editSessionCard__metaPill koda-editSessionCard__metaPill--icon" title={String(session?.domain || "").toUpperCase()}>
            <img src={fileIcon} alt={String(session?.domain || "").toUpperCase()} />
          </span>
          <span className="koda-editSessionCard__metaText">{locationLabel}</span>
        </div>

        {diff?.summary ? (
          <div className="koda-editSessionCard__summary">{safeString(diff.summary)}</div>
        ) : null}
      </div>

      <div className="koda-editSessionCard__body">
        <div className={`koda-editSessionCard__diff ${expanded ? "isExpanded" : ""}`}>
          {showInlineDiff ? (
            <div className="koda-editSessionCard__diffText" aria-label="Inline diff">
              {inlineDiffParts.map((p, idx) => {
                const cls =
                  p.type === "add"
                    ? "isAdd"
                    : p.type === "remove"
                      ? "isRemove"
                      : "isSame";
                return (
                  <span key={`${p.type}-${idx}`} className={`koda-editSessionCard__diffPart ${cls}`}>
                    {p.text}
                    {" "}
                  </span>
                );
              })}
            </div>
          ) : manualEdit && view === "after" ? (
            <textarea
              ref={textareaRef}
              value={draftAfter}
              onChange={(e) => setDraftAfter(e.target.value)}
              rows={8}
              className="koda-editSessionCard__textarea"
            />
          ) : (
            <div className="koda-editSessionCard__plainText">{mainText}</div>
          )}

          <button
            type="button"
            className="koda-editSessionCard__expand"
            onClick={() => setExpanded((p) => !p)}
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        </div>

        {requiresTargetPick ? (
          <div className="koda-editSessionCard__disambiguation">
            <div className="koda-editSessionCard__disambiguationTitle">Pick a target</div>
            <select
              value={selectedTargetId}
              onChange={(e) => setSelectedTargetId(e.target.value)}
              className="koda-editSessionCard__select"
            >
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}{typeof c.confidence === "number" ? ` (${Math.round(c.confidence * 100)}%)` : ""}
                </option>
              ))}
            </select>
            {selectedTargetId ? (
              <div className="koda-editSessionCard__disambiguationHint">
                {clip(candidates.find((c) => c.id === selectedTargetId)?.previewText || "", 180)}
              </div>
            ) : null}
          </div>
        ) : null}

        {requiresConfirmation ? (
          <label className="koda-editSessionCard__confirm">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            <span>I reviewed this change</span>
          </label>
        ) : null}

        {applyErr ? (
          <div className="koda-editSessionCard__error">{applyErr}</div>
        ) : null}

        {appliedRevisionId ? (
          <div className="koda-editSessionCard__applied">
            Applied.{" "}
            <button
              type="button"
              className="koda-editSessionCard__linkBtn"
              onClick={() => onOpenDoc?.(appliedRevisionId, { filename: session?.filename, mimeType: session?.mimeType })}
            >
              Open
            </button>
          </div>
        ) : null}
      </div>

      <div className="koda-editSessionCard__actions">
        <button
          type="button"
          className="koda-editSessionCard__btn koda-editSessionCard__btnSecondary"
          disabled={rejected || isApplying}
          onClick={() => setRejected(true)}
        >
          Reject
        </button>
        <button
          type="button"
          className="koda-editSessionCard__btn koda-editSessionCard__btnSecondary"
          disabled={rejected || isApplying}
          onClick={() => setManualEdit((p) => !p)}
        >
          {manualEdit ? "Done editing" : "Edit"}
        </button>
        <button
          type="button"
          className="koda-editSessionCard__btn koda-editSessionCard__btnPrimary"
          disabled={!canApply}
          onClick={onApply}
        >
          {isApplying ? "Applying…" : "Apply"}
        </button>
      </div>
    </div>
  );
}
