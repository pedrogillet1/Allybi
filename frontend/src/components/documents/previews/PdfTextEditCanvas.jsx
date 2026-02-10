import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import api from '../../../services/api';

function clamp(n, lo, hi) {
  const x = Number(n);
  if (!Number.isFinite(x)) return lo;
  return Math.max(lo, Math.min(hi, x));
}

function wrapSelectionWithSpanStyle(styleMap = {}) {
  const sel = window.getSelection?.();
  if (!sel || sel.rangeCount === 0) return false;
  const r = sel.getRangeAt(0);
  if (!r || r.collapsed) return false;

  const span = window.document.createElement('span');
  Object.entries(styleMap || {}).forEach(([k, v]) => {
    if (!k) return;
    span.style.setProperty(String(k), String(v));
  });
  try {
    r.surroundContents(span);
    // keep selection around newly styled contents
    sel.removeAllRanges();
    const nr = window.document.createRange();
    nr.selectNodeContents(span);
    sel.addRange(nr);
    return true;
  } catch {
    // Fallback: extract/insert
    try {
      const frag = r.extractContents();
      span.appendChild(frag);
      r.insertNode(span);
      sel.removeAllRanges();
      const nr = window.document.createRange();
      nr.selectNodeContents(span);
      sel.addRange(nr);
      return true;
    } catch {
      return false;
    }
  }
}

function splitIntoParagraphs(text) {
  const raw = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  // Split on blank lines, but keep something usable even for dense PDFs.
  const parts = raw
    .split(/\n{2,}/g)
    .map((p) => p.trimEnd())
    .filter((p) => p.trim().length > 0);
  if (!parts.length) return [''];
  return parts;
}

const PdfTextEditCanvas = forwardRef(function PdfTextEditCanvas(
  { document, onStatusMsg, onApplied, onAvailability },
  ref
) {
  const docId = document?.id;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [blocks, setBlocks] = useState([]); // { id, text }
  const rootRef = useRef(null);
  const pageHostRef = useRef(null);
  const lastSelectionRef = useRef(null);
  const [htmlSeedVersion, setHtmlSeedVersion] = useState(0);
  const draftSnapshotsRef = useRef(new Map()); // draftId -> { paragraphId, text }

  const setMsg = useCallback((m) => {
    setStatusMsg(m);
    onStatusMsg?.(m);
  }, [onStatusMsg]);

  const load = useCallback(async () => {
    if (!docId) return;
    setLoading(true);
    setError('');
    setMsg('');
    try {
      const res = await api.get(`/api/documents/${docId}/editing/pdf-text`);
      const text = String(res.data?.text || '');
      const charCount = Number(res.data?.charCount || 0);
      // If there's no selectable text, treat as scanned.
      if (charCount < 50) {
        const msg = 'This PDF appears to be scanned (no selectable text). Editing is not available.';
        setError(msg);
        onAvailability?.({ editable: false, reason: 'scanned', message: msg });
        setBlocks([]);
        return;
      }
      onAvailability?.({ editable: true });
      const paragraphs = splitIntoParagraphs(text);
      const nextBlocks = paragraphs.map((p, idx) => ({ id: `pdf:p:${idx + 1}`, text: p }));
      setBlocks(nextBlocks);
      setHtmlSeedVersion((v) => v + 1);
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || 'Failed to load PDF text.';
      setError(msg);
      onAvailability?.({ editable: false, reason: 'error', message: msg });
    } finally {
      setLoading(false);
    }
  }, [docId, onAvailability, setMsg]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onSel = () => {
      const root = rootRef.current;
      const sel = window.getSelection?.();
      if (!root || !sel || sel.rangeCount === 0) return;
      const a = sel.anchorNode;
      const f = sel.focusNode;
      if (!a || !f) return;
      if (!root.contains(a) || !root.contains(f)) return;
      try {
        lastSelectionRef.current = sel.getRangeAt(0).cloneRange();
      } catch {
        // ignore
      }
    };
    window.document.addEventListener('selectionchange', onSel);
    return () => window.document.removeEventListener('selectionchange', onSel);
  }, []);

  const restoreSelection = useCallback(() => {
    try { pageHostRef.current?.focus?.(); } catch {}
    const r = lastSelectionRef.current;
    if (!r) return false;
    const sel = window.getSelection?.();
    if (!sel) return false;
    try {
      sel.removeAllRanges();
      sel.addRange(r);
      return true;
    } catch {
      return false;
    }
  }, []);

  const applyParagraphStyleFromSelection = useCallback((styleMap = {}) => {
    // Word-like behavior: if there's no highlight (collapsed cursor), apply style to the active paragraph.
    try {
      const sel = window.getSelection?.();
      const node = sel?.anchorNode || null;
      const parentEl = node?.nodeType === 1 ? node : node?.parentElement;
      const p = parentEl?.closest?.('[data-paragraph-id]');
      if (!p) return false;

      const next = styleMap || {};
      if (next.color) p.style.color = String(next.color);
      if (next['font-size']) p.style.fontSize = String(next['font-size']);
      if (next['font-family']) p.style.fontFamily = String(next['font-family']);
      return true;
    } catch {
      return false;
    }
  }, []);

  const findParagraphEl = useCallback((paragraphId) => {
    const host = pageHostRef.current;
    if (!host || !paragraphId) return null;
    try {
      return host.querySelector(`[data-paragraph-id="${CSS.escape(paragraphId)}"]`);
    } catch {
      return host.querySelector(`[data-paragraph-id="${String(paragraphId).replace(/\"/g, '\\"')}"]`);
    }
  }, []);

  const snapshotTarget = useCallback((paragraphId) => {
    const el = findParagraphEl(paragraphId);
    if (!el) return null;
    return {
      paragraphId,
      text: (el.innerText || '').replace(/\u00A0/g, ''),
    };
  }, [findParagraphEl]);

  const clearDraftDecoration = (el) => {
    if (!el) return;
    try {
      const badge = el.querySelector?.('[data-allybi-draft-badge="1"]');
      if (badge && badge.parentNode) badge.parentNode.removeChild(badge);
    } catch {}
    try { delete el.dataset.allybiDraftId; } catch {}
    try { el.style.backgroundColor = ''; } catch {}
    try { el.style.boxShadow = ''; } catch {}
  };

  const applyDraft = useCallback(({ draftId, targetId, afterText }) => {
    const paragraphId = targetId;
    if (!draftId || !paragraphId) return false;
    const el = findParagraphEl(paragraphId);
    if (!el) return false;

    if (!draftSnapshotsRef.current.has(draftId)) {
      draftSnapshotsRef.current.set(draftId, { paragraphId, text: el.innerText || '' });
    }

    el.innerText = String(afterText || '');
    el.dataset.allybiDraftId = String(draftId);
    el.style.backgroundColor = 'rgba(245, 158, 11, 0.12)';
    el.style.boxShadow = 'inset 0 0 0 1px rgba(245, 158, 11, 0.18)';
    el.style.position = el.style.position || 'relative';

    try {
      const badgeExisting = el.querySelector?.('[data-allybi-draft-badge="1"]');
      if (badgeExisting && badgeExisting.parentNode) badgeExisting.parentNode.removeChild(badgeExisting);
      const badge = window.document.createElement('span');
      badge.setAttribute('data-allybi-draft-badge', '1');
      badge.setAttribute('contenteditable', 'false');
      badge.innerText = 'Draft';
      badge.style.position = 'absolute';
      badge.style.top = '-12px';
      badge.style.right = '0px';
      badge.style.height = '22px';
      badge.style.display = 'inline-flex';
      badge.style.alignItems = 'center';
      badge.style.padding = '0 10px';
      badge.style.borderRadius = '999px';
      badge.style.border = '1px solid rgba(17,24,39,0.12)';
      badge.style.background = 'rgba(255,255,255,0.92)';
      badge.style.fontFamily = 'Plus Jakarta Sans, sans-serif';
      badge.style.fontWeight = '900';
      badge.style.fontSize = '11px';
      badge.style.color = '#111827';
      badge.style.boxShadow = '0 10px 22px rgba(17,24,39,0.08)';
      el.appendChild(badge);
    } catch {}

    try { el.scrollIntoView?.({ behavior: 'smooth', block: 'center' }); } catch {}
    return true;
  }, [findParagraphEl]);

  const discardDraft = useCallback(({ draftId }) => {
    if (!draftId) return false;
    const snap = draftSnapshotsRef.current.get(draftId);
    if (!snap) return false;
    const el = findParagraphEl(snap.paragraphId);
    if (!el) return false;
    el.innerText = snap.text || '';
    clearDraftDecoration(el);
    draftSnapshotsRef.current.delete(draftId);
    return true;
  }, [findParagraphEl]);

  const scrollToTarget = useCallback((paragraphId) => {
    const el = findParagraphEl(paragraphId);
    if (!el) return false;
    try { el.scrollIntoView?.({ behavior: 'smooth', block: 'center' }); } catch {}
    try {
      const prev = el.style.backgroundColor;
      el.style.backgroundColor = 'rgba(59,130,246,0.10)';
      el.style.transition = 'background-color 180ms ease';
      setTimeout(() => { el.style.backgroundColor = prev || ''; }, 750);
    } catch {}
    return true;
  }, [findParagraphEl]);

  const getFullText = useCallback(() => {
    const host = pageHostRef.current;
    if (!host) return '';
    // Preserve paragraph breaks as blank lines.
    const paras = Array.from(host.querySelectorAll('[data-paragraph-id]'));
    const lines = paras.map((p) => String(p.innerText || '').replace(/\u00A0/g, ''));
    return lines.join('\n\n').trim();
  }, []);

  const apply = useCallback(async () => {
    if (!docId) return;
    const revisedText = getFullText();
    if (!revisedText) {
      setMsg('Nothing to save.');
      return;
    }
    setMsg('Saving as PDF…');
    try {
      const res = await api.post(`/api/documents/${docId}/editing/pdf-revise`, {
        revisedText,
        outputFormat: 'pdf',
      });
      const createdId = res.data?.createdDocumentId || null;
      setMsg('Saved.');
      if (createdId) onApplied?.(createdId);
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || 'Save failed.';
      setMsg(msg);
    } finally {
      setTimeout(() => setMsg(''), 1500);
    }
  }, [docId, getFullText, onApplied, setMsg]);

  useImperativeHandle(ref, () => ({
    reload: () => load(),
    apply,
    revert: () => load(),
    exec: (cmd) => {
      restoreSelection();
      try { window.document.execCommand(cmd); } catch {}
    },
    wrapSelectionStyle: (styleMap) => {
      restoreSelection();
      let out = wrapSelectionWithSpanStyle(styleMap);
      if (!out) out = applyParagraphStyleFromSelection(styleMap);
      return out;
    },
    restoreSelection,
    snapshotTarget,
    applyDraft,
    discardDraft,
    scrollToTarget,
    focus: () => {
      try { pageHostRef.current?.focus?.(); } catch {}
    },
    getStatusMsg: () => statusMsg,
  }), [apply, load, restoreSelection, statusMsg, snapshotTarget, applyDraft, discardDraft, scrollToTarget, applyParagraphStyleFromSelection]);

  const seededBlocks = useMemo(() => blocks, [blocks]);

  if (loading) {
    return (
      <div style={{ padding: 40, background: 'white', borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
        Loading editor…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 40, background: 'white', borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
        <div style={{ fontFamily: 'Plus Jakarta Sans', fontWeight: 800, fontSize: 16, color: '#111827', marginBottom: 8 }}>
          PDF editor not available
        </div>
        <div style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 13, color: '#6B7280' }}>{error}</div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', maxWidth: 1100, position: 'relative' }}>
      {statusMsg ? (
        <div style={{
          marginBottom: 12,
          padding: '10px 12px',
          borderRadius: 12,
          border: '1px solid #E5E7EB',
          background: 'rgba(255,255,255,0.85)',
          fontFamily: 'Plus Jakarta Sans',
          fontWeight: 700,
          fontSize: 13,
          color: '#111827',
        }}>
          {statusMsg}
        </div>
      ) : null}

      <div ref={rootRef} style={{ background: 'transparent', borderRadius: 0, padding: 0 }}>
        <div
          ref={pageHostRef}
          contentEditable
          suppressContentEditableWarning
          spellCheck
          style={{
            width: 'min(860px, 100%)',
            margin: '0 auto',
            background: 'white',
            borderRadius: 10,
            border: '1px solid #E5E7EB',
            boxShadow: '0 10px 28px rgba(17, 24, 39, 0.10)',
            padding: '48px 56px',
            lineHeight: 1.6,
            fontFamily: 'Calibri, Arial, sans-serif',
            fontSize: 16,
            color: '#111827',
            outline: 'none',
          }}
        >
          {seededBlocks.map((b) => (
            <div
              key={b.id}
              data-paragraph-id={b.id}
              style={{
                outline: 'none',
                padding: 0,
                margin: '0 0 10px 0',
                background: 'transparent',
                cursor: 'text',
                whiteSpace: 'pre-wrap',
                wordBreak: 'normal',
                overflowWrap: 'break-word',
                hyphens: 'none',
              }}
              ref={(el) => {
                if (!el) return;
                const key = String(htmlSeedVersion);
                if (el.dataset.seedVersion === key) return;
                el.innerText = b.text || '';
                el.dataset.seedVersion = key;
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
});

export default PdfTextEditCanvas;
