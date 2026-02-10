import React, { useEffect, useMemo, useRef, useState } from "react";
import { applyEdit } from "../../../services/editingService";
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
  const [view, setView] = useState("diff"); // diff|before|after
  const [expanded, setExpanded] = useState(false);
  const [showWhy, setShowWhy] = useState(false);
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
  const rationale = session?.rationale || null;
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
    setManualEdit(false);
    setView("diff");
    setExpanded(false);
    setShowWhy(false);
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
        beforeText: safeString(session.beforeText || beforeText),
        proposedText: safeString(draftAfter),
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
            >
              Diff
            </button>
            <button
              className={`koda-editSessionCard__tab ${view === "before" ? "isActive" : ""}`}
              onClick={() => setView("before")}
              type="button"
            >
              Before
            </button>
            <button
              className={`koda-editSessionCard__tab ${view === "after" ? "isActive" : ""}`}
              onClick={() => setView("after")}
              type="button"
            >
              After
            </button>
          </div>
        </div>

        <div className="koda-editSessionCard__meta">
          <span className="koda-editSessionCard__metaPill">{String(session?.domain || "").toUpperCase()}</span>
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

        <div className="koda-editSessionCard__why">
          <button
            type="button"
            className="koda-editSessionCard__whyToggle"
            onClick={() => setShowWhy((p) => !p)}
          >
            {showWhy ? "Hide why + proof" : "Why + proof"}
          </button>

          {showWhy ? (
            <div className="koda-editSessionCard__whyBody">
              {Array.isArray(rationale?.reasons) && rationale.reasons.length ? (
                <div className="koda-editSessionCard__whySection">
                  <div className="koda-editSessionCard__whyLabel">Why this edit</div>
                  <ul className="koda-editSessionCard__whyList">
                    {rationale.reasons.slice(0, 3).map((r, i) => (
                      <li key={`r-${i}`}>{safeString(r)}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="koda-editSessionCard__whySection">
                <div className="koda-editSessionCard__whyLabel">Proof</div>
                <div className="koda-editSessionCard__proofRow">
                  <span className="koda-editSessionCard__proofKey">Target</span>
                  <span className="koda-editSessionCard__proofVal">{safeString(session?.target?.label || "") || "—"}</span>
                </div>
                {safeString(session?.target?.id) ? (
                  <div className="koda-editSessionCard__proofRow">
                    <span className="koda-editSessionCard__proofKey">Internal id</span>
                    <code className="koda-editSessionCard__proofCode">{safeString(session?.target?.id)}</code>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
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

