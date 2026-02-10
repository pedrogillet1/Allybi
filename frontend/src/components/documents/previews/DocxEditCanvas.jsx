import React, { useCallback, useEffect, useMemo, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import api from '../../../services/api';
import { applyEdit } from '../../../services/editingService';
import cleanDocumentName from '../../../utils/cleanDocumentName';
import EditorToolbar from '../editor/EditorToolbar';

function escapeHtml(text) {
  return String(text || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function toHtmlFromPlain(text) {
  return escapeHtml(text).replace(/\n/g, '<br/>');
}

function sanitizeDocxRichHtml(html) {
  // Allow: inline formatting + lists. (We keep this conservative; backend may still normalize.)
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${String(html || '')}</div>`, 'text/html');
  const root = doc.body.firstChild;
  if (!root) return '';

  const allowedTags = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'BR', 'SPAN', 'UL', 'OL', 'LI', '#text']);
  const allowedStyle = new Set(['font-size', 'color', 'font-family']);

  const walk = (node) => {
    const children = Array.from(node.childNodes || []);
    for (const child of children) {
      if (child.nodeType === Node.TEXT_NODE) continue;
      const el = child;
      const tag = el.nodeName;
      if (!allowedTags.has(tag)) {
        // Replace unknown element with its text content (keeps user-visible text).
        const text = doc.createTextNode(el.textContent || '');
        el.parentNode?.replaceChild(text, el);
        continue;
      }

      // Strip attributes except span style whitelist.
      if (el.nodeType === Node.ELEMENT_NODE) {
        const attrs = Array.from(el.attributes || []);
        for (const a of attrs) {
          if (tag === 'SPAN' && a.name.toLowerCase() === 'style') continue;
          el.removeAttribute(a.name);
        }

        if (tag === 'SPAN') {
          const style = String(el.getAttribute('style') || '');
          const cleaned = style
            .split(';')
            .map((pair) => pair.trim())
            .filter(Boolean)
            .map((pair) => {
              const idx = pair.indexOf(':');
              if (idx <= 0) return null;
              const k = pair.slice(0, idx).trim().toLowerCase();
              const v = pair.slice(idx + 1).trim();
              if (!allowedStyle.has(k)) return null;
              if (!v) return null;
              if (k === 'color' && !/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) return null;
              if (k === 'font-size' && !/^[0-9.]+(px|pt)$/.test(v)) return null;
              return `${k}:${v}`;
            })
            .filter(Boolean)
            .join(';');
          if (cleaned) el.setAttribute('style', cleaned);
          else el.removeAttribute('style');
        }
      }

      walk(el);
    }
  };

  walk(root);
  return root.innerHTML || '';
}

function wrapSelectionWithSpanStyle(styleMap) {
  const sel = window.getSelection?.();
  if (!sel || sel.rangeCount === 0) return false;
  const range = sel.getRangeAt(0);
  if (range.collapsed) return false;

  const span = document.createElement('span');
  const css = Object.entries(styleMap || {})
    .filter(([, v]) => v != null && String(v).trim() !== '')
    .map(([k, v]) => `${k}:${v}`)
    .join(';');
  if (!css) return false;
  span.setAttribute('style', css);

  try {
    range.surroundContents(span);
  } catch {
    // Fallback: extract and wrap.
    const frag = range.extractContents();
    span.appendChild(frag);
    range.insertNode(span);
  }
  // Move cursor to end of span.
  sel.removeAllRanges();
  const nextRange = document.createRange();
  nextRange.selectNodeContents(span);
  nextRange.collapse(false);
  sel.addRange(nextRange);
  return true;
}

const DocxEditCanvas = forwardRef(function DocxEditCanvas(
  {
    document,
    onApplied,
    selectedId: controlledSelectedId,
    onSelectedIdChange,
    onBlocksLoaded,
    hideToolbar = false,
    readOnly = false,
    autoSaveOnBlur = true,
    onStatusMsg,
  },
  ref
) {
  const docId = document?.id;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [blocks, setBlocks] = useState([]); // { paragraphId, text, sectionPath, docIndex, headingLevel?, numberingSignature?, alignment? }
  const [selectedId, setSelectedId] = useState('');
  const [isApplying, setIsApplying] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const rootRef = useRef(null);
  const pageHostRef = useRef(null);
  const baselineHtmlRef = useRef(new Map()); // paragraphId -> last applied HTML (sanitized)
  const inflightApplyRef = useRef(new Set()); // paragraphId currently saving
  const dirtyParagraphsRef = useRef(new Set()); // paragraphId edited since last focus
  const lastSelectionRef = useRef(null); // Range clone for toolbar actions
  const [fontSizePx, setFontSizePx] = useState('16px');
  const [fontFamily, setFontFamily] = useState('Calibri');
  const [colorHex, setColorHex] = useState('#111827');
  const [htmlSeedVersion, setHtmlSeedVersion] = useState(0);
  const draftSnapshotsRef = useRef(new Map()); // draftId -> { paragraphId, html }

  const effectiveSelectedId = controlledSelectedId != null ? controlledSelectedId : selectedId;

  // Refs for values used inside load() that shouldn't trigger re-fetches when they change.
  const controlledSelectedIdRef = useRef(controlledSelectedId);
  controlledSelectedIdRef.current = controlledSelectedId;
  const effectiveSelectedIdRef = useRef(effectiveSelectedId);
  effectiveSelectedIdRef.current = effectiveSelectedId;
  const onBlocksLoadedRef = useRef(onBlocksLoaded);
  onBlocksLoadedRef.current = onBlocksLoaded;
  const onSelectedIdChangeRef = useRef(onSelectedIdChange);
  onSelectedIdChangeRef.current = onSelectedIdChange;

  const selectedBlock = useMemo(
    () => blocks.find((b) => b.paragraphId === effectiveSelectedId) || null,
    [blocks, effectiveSelectedId]
  );

  const load = useCallback(async () => {
    if (!docId) return;
    setLoading(true);
    setError('');
    setStatusMsg('');
    try {
      const res = await api.get(`/api/documents/${docId}/editing/docx-html`);
      const nextBlocks = Array.isArray(res.data?.blocks) ? res.data.blocks : [];
      setBlocks(nextBlocks);
      onBlocksLoadedRef.current?.(nextBlocks);
      // Initialize local baseline HTML so we can detect formatting-only changes without reloading.
      const nextBaseline = new Map();
      for (const b of nextBlocks) {
        if (b?.paragraphId) nextBaseline.set(b.paragraphId, toHtmlFromPlain(b.text || '').trim());
      }
      baselineHtmlRef.current = nextBaseline;
      // Force a reseed of paragraph HTML on the next render after a load/reload.
      setHtmlSeedVersion((v) => v + 1);

      // Initialize selection if unset.
      const firstId = nextBlocks?.[0]?.paragraphId || '';
      if (controlledSelectedIdRef.current == null) {
        setSelectedId((prev) => prev || firstId);
      }
      if (!effectiveSelectedIdRef.current && firstId) {
        onSelectedIdChangeRef.current?.(firstId);
      }
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Failed to load DOCX editor.');
    } finally {
      setLoading(false);
    }
  }, [docId]);

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
      // Only track selection if it originates in our editor surface.
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
    // execCommand needs an active contentEditable host.
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

  const markDirtyFromSelection = useCallback(() => {
    try {
      const sel = window.getSelection?.();
      const node = sel?.anchorNode || null;
      const parentEl = node?.nodeType === 1 ? node : node?.parentElement;
      const el = parentEl?.closest?.('[data-paragraph-id]');
      const pid = el?.getAttribute?.('data-paragraph-id') || '';
      if (!pid) return;
      dirtyParagraphsRef.current?.add?.(pid);
      if (controlledSelectedId == null) setSelectedId(pid);
      onSelectedIdChange?.(pid);
    } catch {
      // ignore
    }
  }, [controlledSelectedId, onSelectedIdChange]);

  const getLiveTextFor = useCallback((paragraphId) => {
    const root = rootRef.current;
    if (!root) return null;
    const el = root.querySelector(`[data-paragraph-id="${CSS.escape(paragraphId)}"]`);
    if (!el) return null;
    return (el.innerText || '').replace(/\u00A0/g, ''); // normalize nbsp
  }, []);

  const getLiveHtmlFor = useCallback((paragraphId) => {
    const root = rootRef.current;
    if (!root) return null;
    const el = root.querySelector(`[data-paragraph-id="${CSS.escape(paragraphId)}"]`);
    if (!el) return null;
    return sanitizeDocxRichHtml(el.innerHTML || '');
  }, []);

  const findParagraphEl = useCallback((paragraphId) => {
    const root = rootRef.current;
    if (!root || !paragraphId) return null;
    try {
      return root.querySelector(`[data-paragraph-id="${CSS.escape(paragraphId)}"]`);
    } catch {
      // Fallback if CSS.escape isn't available for some reason
      return root.querySelector(`[data-paragraph-id="${String(paragraphId).replace(/\"/g, '\\"')}"]`);
    }
  }, []);

  const snapshotTarget = useCallback((paragraphId) => {
    const el = findParagraphEl(paragraphId);
    if (!el) return null;
    return {
      paragraphId,
      html: sanitizeDocxRichHtml(el.innerHTML || ''),
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

  const applyDraft = useCallback(({ draftId, targetId, afterText, afterHtml }) => {
    const paragraphId = targetId;
    if (!draftId || !paragraphId) return false;
    const el = findParagraphEl(paragraphId);
    if (!el) return false;

    if (!draftSnapshotsRef.current.has(draftId)) {
      draftSnapshotsRef.current.set(draftId, { paragraphId, html: el.innerHTML || '' });
    }

    const nextHtml = afterHtml ? sanitizeDocxRichHtml(afterHtml) : toHtmlFromPlain(afterText || '');
    el.innerHTML = nextHtml;

    // Decorate as a draft (subtle highlight + chip).
    el.dataset.allybiDraftId = String(draftId);
    el.style.backgroundColor = 'rgba(245, 158, 11, 0.12)';
    el.style.boxShadow = 'inset 0 0 0 1px rgba(245, 158, 11, 0.18)';
    // Ensure badge can anchor.
    el.style.position = el.style.position || 'relative';

    // Add badge (contentEditable=false so it doesn't get edited).
    try {
      // Remove any previous badge but keep current highlight.
      try {
        const badge = el.querySelector?.('[data-allybi-draft-badge="1"]');
        if (badge && badge.parentNode) badge.parentNode.removeChild(badge);
      } catch {}
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
    el.innerHTML = snap.html || '';
    clearDraftDecoration(el);
    draftSnapshotsRef.current.delete(draftId);
    return true;
  }, [findParagraphEl]);

  const scrollToTarget = useCallback((paragraphId) => {
    const el = findParagraphEl(paragraphId);
    if (!el) return false;
    try { el.scrollIntoView?.({ behavior: 'smooth', block: 'center' }); } catch {}
    // Pulse highlight briefly for affordance.
    try {
      const prev = el.style.backgroundColor;
      el.style.backgroundColor = 'rgba(59,130,246,0.10)';
      el.style.transition = 'background-color 180ms ease';
      setTimeout(() => { el.style.backgroundColor = prev || ''; }, 750);
    } catch {}
    return true;
  }, [findParagraphEl]);

  const revertSelected = useCallback(() => {
    if (!selectedBlock?.paragraphId) return;
    const root = rootRef.current;
    if (!root) return;
    const el = root.querySelector(`[data-paragraph-id="${CSS.escape(selectedBlock.paragraphId)}"]`);
    if (!el) return;
    const baselineHtml = baselineHtmlRef.current.get(selectedBlock.paragraphId) || toHtmlFromPlain(selectedBlock.text || '');
    el.innerHTML = baselineHtml;
    const msg = 'Reverted.';
    setStatusMsg(msg);
    onStatusMsg?.(msg);
    setTimeout(() => { setStatusMsg(''); onStatusMsg?.(''); }, 1200);
  }, [onStatusMsg, selectedBlock]);

  const applyParagraph = useCallback(async (paragraphId, { silent = false } = {}) => {
    if (!docId || !paragraphId) return;
    if (inflightApplyRef.current.has(paragraphId)) return;

    const block = blocks.find((b) => b.paragraphId === paragraphId) || null;
    if (!block) return;

    const nextText = getLiveTextFor(paragraphId);
    const nextHtml = getLiveHtmlFor(paragraphId);
    if (nextText == null || nextHtml == null) return;

    const beforeText = String(block.text || '');
    const proposedText = String(nextText || '').trim();
    if (!proposedText) return;

    const baselineHtml = String(baselineHtmlRef.current.get(paragraphId) || toHtmlFromPlain(beforeText.trim()));
    const baselineNorm = baselineHtml.replace(/\s+/g, '');
    const nextNorm = String(nextHtml || '').replace(/\s+/g, '');
    const textChanged = proposedText !== beforeText.trim();
    const htmlChanged = nextNorm !== baselineNorm;

    if (!textChanged && !htmlChanged) return;

    inflightApplyRef.current.add(paragraphId);
    if (!silent) {
      setStatusMsg('Saving…');
      onStatusMsg?.('Saving…');
    }
    setIsApplying(true);
    try {
      await applyEdit({
        instruction: `Manual edit in viewer: ${cleanDocumentName(document?.filename)}`,
        operator: 'EDIT_PARAGRAPH',
        domain: 'docx',
        documentId: docId,
        targetHint: paragraphId,
        target: {
          id: paragraphId,
          label: 'Paragraph',
          confidence: 1,
          candidates: [],
          decisionMargin: 1,
          isAmbiguous: false,
          resolutionReason: 'viewer_autosave',
        },
        beforeText,
        proposedText,
        proposedHtml: nextHtml,
        userConfirmed: true,
      });

      // Update local baseline so the doc doesn't flicker on autosave.
      baselineHtmlRef.current.set(paragraphId, String(nextHtml || '').trim());
      setBlocks((prev) => prev.map((b) => (b.paragraphId === paragraphId ? { ...b, text: proposedText } : b)));
      dirtyParagraphsRef.current?.delete?.(paragraphId);
      onApplied?.();

      if (!silent) {
        setStatusMsg('Saved.');
        onStatusMsg?.('Saved.');
        setTimeout(() => { setStatusMsg(''); onStatusMsg?.(''); }, 900);
      }
    } catch (e) {
      const msg = e?.response?.data?.error?.message || e?.response?.data?.error || e?.message || 'Save failed.';
      setStatusMsg(msg);
      onStatusMsg?.(msg);
    } finally {
      inflightApplyRef.current.delete(paragraphId);
      setIsApplying(false);
    }
  }, [blocks, docId, document?.filename, getLiveHtmlFor, getLiveTextFor, onApplied, onStatusMsg]);

  const applySelected = useCallback(async () => {
    if (!docId || !selectedBlock?.paragraphId) return;
    return applyParagraph(selectedBlock.paragraphId);
  }, [applyParagraph, docId, selectedBlock?.paragraphId]);

  /*
   * Backwards-compatible imperative call sites still use applySelected/revertSelected,
   * but the default UX is "edit like Word": autosave on blur (no Apply/Revert UI).
   */
  const applySelectedLegacy = useCallback(async () => {
    if (!docId || !selectedBlock?.paragraphId) return;
    const nextText = getLiveTextFor(selectedBlock.paragraphId);
    const nextHtml = getLiveHtmlFor(selectedBlock.paragraphId);
    if (nextText == null || nextHtml == null) return;

    const beforeText = String(selectedBlock.text || '');
    const proposedText = String(nextText || '').trim();
    if (!proposedText) {
      setStatusMsg('Cannot apply an empty paragraph.');
      return;
    }
    if (proposedText === beforeText.trim()) {
      // Allow formatting-only changes.
      // If HTML is identical to baseline plain conversion, treat as no-op.
      const baseline = toHtmlFromPlain(beforeText.trim());
      if (nextHtml.replace(/\s+/g, '') === baseline.replace(/\s+/g, '')) {
        setStatusMsg('No changes to apply.');
        return;
      }
    }

    setIsApplying(true);
    setStatusMsg('');
    try {
      await applyEdit({
        instruction: `Manual edit in viewer: ${cleanDocumentName(document?.filename)}`,
        operator: 'EDIT_PARAGRAPH',
        domain: 'docx',
        documentId: docId,
        targetHint: selectedBlock.paragraphId,
        target: {
          id: selectedBlock.paragraphId,
          label: 'Paragraph',
          confidence: 1,
          candidates: [],
          decisionMargin: 1,
          isAmbiguous: false,
          resolutionReason: 'viewer_selection',
        },
        beforeText,
        proposedText,
        proposedHtml: nextHtml,
        userConfirmed: true,
      });

      setStatusMsg('Applied. Refreshing…');
      onStatusMsg?.('Applied. Refreshing…');
      await load();
      onApplied?.();
      setStatusMsg('Applied.');
      onStatusMsg?.('Applied.');
      setTimeout(() => { setStatusMsg(''); onStatusMsg?.(''); }, 1500);
    } catch (e) {
      const msg = e?.response?.data?.error?.message || e?.response?.data?.error || e?.message || 'Apply failed.';
      setStatusMsg(msg);
      onStatusMsg?.(msg);
    } finally {
      setIsApplying(false);
    }
  }, [docId, document?.filename, getLiveHtmlFor, getLiveTextFor, load, onApplied, onStatusMsg, selectedBlock]);

  useImperativeHandle(ref, () => ({
    applySelected: applySelectedLegacy,
    revertSelected,
    reload: () => load(),
    exec: (cmd) => {
      // Ensure formatting still applies even if the user clicked the toolbar.
      restoreSelection();
      try { window.document.execCommand(cmd); } catch {}
      // Formatting operations don't always fire `input` reliably; mark dirty explicitly.
      markDirtyFromSelection();
    },
    wrapSelectionStyle: (styleMap) => {
      restoreSelection();
      let out = wrapSelectionWithSpanStyle(styleMap);
      if (!out) out = applyParagraphStyleFromSelection(styleMap);
      markDirtyFromSelection();
      return out;
    },
    snapshotTarget,
    applyDraft,
    discardDraft,
    scrollToTarget,
    restoreSelection,
    focus: () => {
      try { pageHostRef.current?.focus?.(); } catch {}
    },
    getSelectedParagraphId: () => effectiveSelectedId,
    getStatusMsg: () => statusMsg,
    getIsApplying: () => isApplying,
  }), [applySelected, revertSelected, effectiveSelectedId, statusMsg, isApplying, load, restoreSelection, markDirtyFromSelection, snapshotTarget, applyDraft, discardDraft, scrollToTarget, applyParagraphStyleFromSelection]);

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
          DOCX editor not available
        </div>
        <div style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 13, color: '#6B7280' }}>{error}</div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', maxWidth: 1100, position: 'relative' }}>
      {!hideToolbar ? (
        <>
          <EditorToolbar
            title={`Editing ${cleanDocumentName(document?.filename)}`}
            subtitle="Select text to format. Apply saves the active paragraph."
            scopeLabel={selectedBlock?.paragraphId ? `Paragraph ${selectedBlock.paragraphId}` : 'Paragraph'}
            format="docx"
            canFormatText
            fontFamily={fontFamily}
            fontSizePx={fontSizePx}
            colorHex={colorHex}
            onFontFamilyChange={setFontFamily}
            onFontSizeChange={setFontSizePx}
            onColorChange={setColorHex}
            onBold={() => window.document.execCommand('bold')}
            onItalic={() => window.document.execCommand('italic')}
            onUnderline={() => window.document.execCommand('underline')}
            onUndo={() => window.document.execCommand('undo')}
            onRedo={() => window.document.execCommand('redo')}
            onAlignLeft={() => window.document.execCommand('justifyLeft')}
            onAlignCenter={() => window.document.execCommand('justifyCenter')}
            onAlignRight={() => window.document.execCommand('justifyRight')}
            onAlignJustify={() => window.document.execCommand('justifyFull')}
            onBullets={() => window.document.execCommand('insertUnorderedList')}
            onNumbers={() => window.document.execCommand('insertOrderedList')}
            onIndent={() => window.document.execCommand('indent')}
            onOutdent={() => window.document.execCommand('outdent')}
            onClearFormatting={() => window.document.execCommand('removeFormat')}
            onApplyTextStyle={() => wrapSelectionWithSpanStyle({ color: colorHex, 'font-size': fontSizePx, 'font-family': fontFamily })}
            onRevert={revertSelected}
            onApply={applySelected}
            applyLabel="Apply paragraph"
            revertLabel="Revert"
            isApplying={isApplying}
            canApply={Boolean(selectedBlock)}
            canRevert={Boolean(selectedBlock)}
          />

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
        </>
      ) : null}

      <div ref={rootRef} style={{ background: 'transparent', borderRadius: 0, padding: 0 }}>
        {/* Page surface (single editing host so Select All works like Word) */}
        <div
          ref={pageHostRef}
          contentEditable={!readOnly}
          suppressContentEditableWarning
          spellCheck={!readOnly}
          onFocus={(e) => {
            if (readOnly) return;
            const el = e.target?.closest?.('[data-paragraph-id]');
            const pid = el?.getAttribute?.('data-paragraph-id') || '';
            if (pid) {
              if (controlledSelectedId == null) setSelectedId(pid);
              onSelectedIdChange?.(pid);
            }
          }}
          onMouseUp={(e) => {
            if (readOnly) return;
            const el = e.target?.closest?.('[data-paragraph-id]');
            const pid = el?.getAttribute?.('data-paragraph-id') || '';
            if (pid) {
              if (controlledSelectedId == null) setSelectedId(pid);
              onSelectedIdChange?.(pid);
            }
          }}
          onKeyUp={(e) => {
            if (readOnly) return;
            const sel = window.getSelection?.();
            const node = sel?.anchorNode || null;
            const parentEl = node?.nodeType === 1 ? node : node?.parentElement;
            const el = parentEl?.closest?.('[data-paragraph-id]');
            const pid = el?.getAttribute?.('data-paragraph-id') || '';
            if (pid) {
              if (controlledSelectedId == null) setSelectedId(pid);
              onSelectedIdChange?.(pid);
            }
          }}
          onInput={(e) => {
            if (readOnly) return;
            const el = e.target?.closest?.('[data-paragraph-id]');
            const pid = el?.getAttribute?.('data-paragraph-id') || '';
            if (!pid) return;
            dirtyParagraphsRef.current?.add?.(pid);
            if (controlledSelectedId == null) setSelectedId(pid);
            onSelectedIdChange?.(pid);
          }}
          onBlur={() => {
            if (readOnly) return;
            if (!autoSaveOnBlur) return;
            // Save any paragraphs touched since last focus. (Keeps "edit like Word" feel.)
            (async () => {
              const dirty = Array.from(dirtyParagraphsRef.current || []);
              for (const pid of dirty) {
                // eslint-disable-next-line no-await-in-loop
                await applyParagraph(pid, { silent: false });
              }
            })();
          }}
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
          {blocks.map((b) => {
            const isHeading = typeof b.headingLevel === 'number' && b.headingLevel >= 1 && b.headingLevel <= 6;
            const headingSize = isHeading ? (b.headingLevel === 1 ? 26 : b.headingLevel === 2 ? 22 : 18) : 16;
            const isList = Boolean(b.numberingSignature);
            const listLevel = (() => {
              const sig = String(b.numberingSignature || '');
              if (!sig) return 0;
              const n = Number(sig.split(':')[0]);
              return Number.isFinite(n) && n >= 0 ? n : 0;
            })();
            const align = String(b.alignment || '').toLowerCase();
            const textAlign = align === 'center' ? 'center' : align === 'right' ? 'right' : align === 'both' ? 'justify' : 'left';

            const baselineHtml = baselineHtmlRef.current.get(b.paragraphId) || toHtmlFromPlain(b.text || '');
            const paragraphEl = (
              <div
                data-paragraph-id={b.paragraphId}
                style={{
                  outline: 'none',
                  borderRadius: 0,
                  padding: 0,
                  margin: '0 0 10px 0',
                  background: 'transparent',
                  boxShadow: 'none',
                  cursor: 'text',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'normal',
                  overflowWrap: 'break-word',
                  hyphens: 'none',
                  fontWeight: isHeading ? 800 : 400,
                  fontSize: headingSize,
                  textAlign,
                  paddingLeft: isList ? 18 + listLevel * 18 : undefined,
                }}
                ref={(el) => {
                  if (!el) return;
                  const key = String(htmlSeedVersion);
                  if (el.dataset.seedVersion === key) return;
                  // Seed initial HTML once per load(); after that, let contentEditable mutate DOM.
                  // This prevents toolbar actions from being overwritten by React re-renders.
                  el.innerHTML = baselineHtml;
                  el.dataset.seedVersion = key;
                }}
              />
            );

            if (!isList) {
              return (
                <div key={b.paragraphId} style={{ marginBottom: 10 }}>
                  {paragraphEl}
                </div>
              );
            }

            return (
              <div
                key={b.paragraphId}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 6,
                  marginBottom: 10,
                  paddingLeft: listLevel * 18,
                }}
              >
                <div
                  aria-hidden="true"
                  style={{
                    width: 18,
                    flexShrink: 0,
                    paddingTop: 10,
                    fontSize: 14,
                    lineHeight: '16px',
                    color: '#111827',
                    textAlign: 'center',
                    userSelect: 'none',
                  }}
                >
                  •
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {paragraphEl}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

export default DocxEditCanvas;
