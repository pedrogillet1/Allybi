import React, { useCallback, useEffect, useMemo, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import api from '../../../services/api';
import { applyEdit } from '../../../services/editingService';
import cleanDocumentName from '../../../utils/cleanDocumentName';
import EditorToolbar from '../editor/EditorToolbar';
import { getDocxViewerSelectionV2FromRange } from '../../../utils/editor/docxSelectionModel';
import { wordDiff } from '../../../utils/diff/wordDiff';
import { renderSuggestionHtml } from '../../../utils/diff/renderSuggestionHtml';

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

function stripHtml(raw) {
  try {
    const tmp = document.createElement('div');
    tmp.innerHTML = String(raw || '');
    return String(tmp.innerText || tmp.textContent || '').replace(/\u00A0/g, ' ').trim();
  } catch {
    return String(raw || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
}

function collectLinearSegments(rootEl) {
  // Build a linear view over text nodes + <br> so we can map offsets to DOM positions.
  const segs = [];
  const walk = (node) => {
    if (!node) return;
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.nodeValue || '';
      if (text.length) segs.push({ kind: 'text', node, len: text.length });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node;
    // Ignore UI-only elements and non-editable decorations.
    try {
      const ce = String(el.getAttribute?.('contenteditable') || '').toLowerCase();
      if (ce === 'false') return;
      if (el.getAttribute?.('data-allybi-draft-badge') === '1') return;
      if (el.getAttribute?.('data-allybi-ui') === '1') return;
    } catch {}
    if (el.tagName === 'BR') {
      segs.push({ kind: 'br', node: el, len: 1 });
      return;
    }
    const children = Array.from(el.childNodes || []);
    for (const c of children) walk(c);
  };
  walk(rootEl);
  return segs;
}

function normalizeSpaces(s) {
  return String(s || '').replace(/\u00A0/g, ' ');
}

function linearTextFromSegments(segs) {
  return (Array.isArray(segs) ? segs : [])
    .map((seg) => (seg?.kind === 'br' ? '\n' : normalizeSpaces(seg?.node?.nodeValue || '')))
    .join('');
}

function findAllIndices(hay, needle) {
  const out = [];
  const h = String(hay || '');
  const n = String(needle || '');
  if (!h || !n) return out;
  let idx = 0;
  while (idx <= h.length) {
    const next = h.indexOf(n, idx);
    if (next < 0) break;
    out.push(next);
    idx = next + Math.max(n.length, 1);
    if (out.length >= 50) break;
  }
  return out;
}

function pickClosestIndex(indices, hintStart) {
  const list = Array.isArray(indices) ? indices : [];
  if (!list.length) return -1;
  const hint = Number.isFinite(Number(hintStart)) ? Number(hintStart) : null;
  if (hint == null) return list[0];
  let best = list[0];
  let bestD = Math.abs(best - hint);
  for (const i of list.slice(1)) {
    const d = Math.abs(i - hint);
    if (d < bestD) {
      best = i;
      bestD = d;
    }
  }
  return best;
}

function indexOfChild(parent, child) {
  if (!parent || !child) return -1;
  const nodes = parent.childNodes || [];
  for (let i = 0; i < nodes.length; i += 1) {
    if (nodes[i] === child) return i;
  }
  return -1;
}

function offsetToDomPosition(rootEl, offset) {
  const target = Math.max(0, Number(offset) || 0);
  const segs = collectLinearSegments(rootEl);
  let cur = 0;
  for (const seg of segs) {
    const next = cur + seg.len;
    if (target <= next) {
      if (seg.kind === 'text') {
        const inside = Math.max(0, Math.min(seg.len, target - cur));
        return { container: seg.node, offset: inside };
      }
      // <br> contributes one newline char in innerText; map that to a boundary before/after the node.
      const parent = seg.node.parentNode;
      const idx = indexOfChild(parent, seg.node);
      if (!parent || idx < 0) return { container: rootEl, offset: 0 };
      return target - cur <= 0
        ? { container: parent, offset: idx }
        : { container: parent, offset: idx + 1 };
    }
    cur = next;
  }
  // Past end: place at end of rootEl.
  return { container: rootEl, offset: rootEl.childNodes?.length || 0 };
}

function applyTextPatchToParagraphEl(paragraphEl, start, end, afterText) {
  if (!paragraphEl) return false;
  const s = Math.max(0, Number(start) || 0);
  const e = Math.max(s, Number(end) || 0);
  const after = String(afterText || '');

  try {
    // Safety: ensure offsets correspond to the expected "before" substring when possible.
    // If offsets are off (e.g. browser text normalization differences), we'll fall back
    // to searching by string match in applySpanPatches.
    const startPos = offsetToDomPosition(paragraphEl, s);
    const endPos = offsetToDomPosition(paragraphEl, e);
    const r = window.document.createRange();
    r.setStart(startPos.container, startPos.offset);
    r.setEnd(endPos.container, endPos.offset);

    // Capture the styling at the insertion point so span rewrites preserve inline
    // formatting (bold/italic/underline/font/color) instead of flattening to plain text.
    const styleCarrier = (() => {
      try {
        const node = startPos?.container || null;
        const el = node?.nodeType === 1 ? node : node?.parentElement;
        if (!el) return null;
        const cs = window.getComputedStyle?.(el);
        if (!cs) return null;
        const span = window.document.createElement('span');
        const style = [];
        if (String(cs.fontWeight || '').trim()) style.push(`font-weight:${cs.fontWeight}`);
        if (String(cs.fontStyle || '').trim()) style.push(`font-style:${cs.fontStyle}`);
        if (String(cs.textDecorationLine || '').trim() && cs.textDecorationLine !== 'none') {
          style.push(`text-decoration:${cs.textDecorationLine}`);
        }
        if (String(cs.color || '').trim()) style.push(`color:${cs.color}`);
        if (String(cs.fontFamily || '').trim()) style.push(`font-family:${cs.fontFamily}`);
        if (String(cs.fontSize || '').trim()) style.push(`font-size:${cs.fontSize}`);
        if (!style.length) return null;
        span.setAttribute('style', style.join(';'));
        return span;
      } catch {
        return null;
      }
    })();

    r.deleteContents();
    if (styleCarrier) {
      styleCarrier.appendChild(window.document.createTextNode(after));
      r.insertNode(styleCarrier);
    } else {
      r.insertNode(window.document.createTextNode(after));
    }
    // Normalize merges adjacent text nodes after insertion.
    paragraphEl.normalize?.();
    return true;
  } catch {
    return false;
  }
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
    reviewMode = false,
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
  const lastSelectionRef = useRef(null); // Range clone (best-effort, may break across rerenders)
  const lastViewerSelectionRef = useRef(null); // semantic selection model (paragraphId + offsets)
  const [fontSizePx, setFontSizePx] = useState('16px');
  const [fontFamily, setFontFamily] = useState('Calibri');
  const [colorHex, setColorHex] = useState('#111827');
  const [htmlSeedVersion, setHtmlSeedVersion] = useState(0);
  const [draftListOverrides, setDraftListOverrides] = useState({}); // paragraphId -> { isList, level }
  const draftSnapshotsRef = useRef(new Map()); // draftId -> { paragraphs: { [paragraphId]: { html } } } (back-compat accepted)
  // Browser `execCommand('undo')` is unreliable once we programmatically assign `innerHTML`.
  // Keep a lightweight per-paragraph undo/redo stack for toolbar buttons.
  const lastHtmlByPidRef = useRef(new Map()); // pid -> sanitized html
  const undoByPidRef = useRef(new Map()); // pid -> string[]
  const redoByPidRef = useRef(new Map()); // pid -> string[]
  const reviewModeRef = useRef(Boolean(reviewMode));
  reviewModeRef.current = Boolean(reviewMode);

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
      const res = await api.get(`/api/documents/${docId}/editing/docx-html`, {
        params: { ts: Date.now() },
        headers: {
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
      });
      const nextBlocks = Array.isArray(res.data?.blocks) ? res.data.blocks : [];
      setBlocks(nextBlocks);
      onBlocksLoadedRef.current?.(nextBlocks);
      // Initialize local baseline HTML so we can detect formatting-only changes without reloading.
      const nextBaseline = new Map();
      for (const b of nextBlocks) {
        if (b?.paragraphId) nextBaseline.set(b.paragraphId, toHtmlFromPlain(b.text || '').trim());
      }
      baselineHtmlRef.current = nextBaseline;
      setDraftListOverrides({});
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
        const r = sel.getRangeAt(0).cloneRange();
        lastSelectionRef.current = r;
        // Also persist a semantic selection model (paragraphId + offsets) so we can
        // restore selection even if React rerenders replace text nodes.
        try {
          lastViewerSelectionRef.current = getDocxViewerSelectionV2FromRange(root, r);
        } catch {
          // ignore
        }
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
    const sel = window.getSelection?.();
    if (!sel) return false;

    const model = lastViewerSelectionRef.current;
    const r0 = Array.isArray(model?.ranges) ? model.ranges[0] : null;
    const pid = String(r0?.paragraphId || model?.paragraphId || '').trim();
    const start = typeof r0?.start === 'number' ? r0.start : null;
    const end = typeof r0?.end === 'number' ? r0.end : null;

    if (pid && start != null && end != null) {
      try {
        const root = rootRef.current;
        if (!root) return false;
        const escaped = window.CSS?.escape ? window.CSS.escape(pid) : pid;
        const p = root.querySelector(`[data-paragraph-id="${escaped}"]`);
        if (!p) return false;
        const startPos = offsetToDomPosition(p, start);
        const endPos = offsetToDomPosition(p, end);
        const r = window.document.createRange();
        r.setStart(startPos.container, startPos.offset);
        r.setEnd(endPos.container, endPos.offset);
        sel.removeAllRanges();
        sel.addRange(r);
        return true;
      } catch {
        // fall through to Range-based restore
      }
    }

    const r = lastSelectionRef.current;
    if (!r) return false;
    try {
      sel.removeAllRanges();
      sel.addRange(r);
      return true;
    } catch {
      return false;
    }
  }, []);

  const getViewerSelectionV2 = useCallback(() => {
    const root = rootRef.current;
    if (!root) return null;
    // Prefer the semantic model, which is stable across rerenders/layout changes.
    const enrich = (sel) => {
      if (!sel?.text || !sel?.ranges?.[0]?.paragraphId) return sel || null;
      const pid = String(sel.ranges[0].paragraphId || '').trim();
      const start = typeof sel.ranges[0].start === 'number' ? sel.ranges[0].start : null;
      const end = typeof sel.ranges[0].end === 'number' ? sel.ranges[0].end : null;
      const selectedText = String(sel.text || '');

      const block = Array.isArray(blocks) ? blocks.find((b) => String(b?.paragraphId || '') === pid) : null;
      const headingLevel = typeof block?.headingLevel === 'number' ? block.headingLevel : null;
      const paragraphText = typeof block?.text === 'string'
        ? String(block.text || '')
        : (() => {
            try {
              const el = findParagraphEl(pid);
              return String(el?.innerText || '').replace(/\u00A0/g, ' ');
            } catch {
              return '';
            }
          })();
      const paraLen = paragraphText.length;

      const isHeading = headingLevel != null && headingLevel >= 1 && headingLevel <= 6;
      const isListItem = Boolean(block?.numberingSignature) || (() => {
        try { return !!findParagraphEl(pid)?.classList?.contains?.('koda-docx-li'); } catch { return false; }
      })();

      const coversWholeParagraph =
        start != null && end != null &&
        start <= 0 &&
        end >= paraLen;

      const isWordLike = (() => {
        const t = selectedText.trim();
        if (!t) return false;
        if (t.split(/\s+/).length !== 1) return false;
        if (start == null || end == null) return false;
        const before = start > 0 ? paragraphText[start - 1] : ' ';
        const after = end < paraLen ? paragraphText[end] : ' ';
        const isBoundary = (ch) => !ch || /\s|[.,;:!?()"'\[\]{}]/.test(ch);
        return isBoundary(before) && isBoundary(after);
      })();

      const isSentenceLike = (() => {
        const t = selectedText.trim();
        if (!t) return false;
        if (t.split(/\s+/).length < 3) return false;
        if (start == null || end == null) return false;
        const before = start > 0 ? paragraphText[start - 1] : '';
        const after = end < paraLen ? paragraphText[end] : '';
        const leftOk = start <= 0 || /[.?!]\s*$/.test(String(before));
        const rightOk = end >= paraLen || /^\s*[.?!]/.test(String(after)) || /[.?!]\s*$/.test(t);
        return leftOk && rightOk;
      })();

      const selectionKind =
        isHeading && coversWholeParagraph ? 'header'
          : coversWholeParagraph && isListItem ? 'list'
            : coversWholeParagraph ? 'paragraph'
              : isWordLike ? 'word'
                : isSentenceLike ? 'sentence'
                  : 'span';

      return {
        ...sel,
        selectionKind,
        paragraphMeta: {
          paragraphId: pid,
          headingLevel,
          isHeading,
          isListItem,
        },
      };
    };

    if (lastViewerSelectionRef.current?.text) return enrich(lastViewerSelectionRef.current);
    const r = lastSelectionRef.current;
    if (!r) return null;
    return enrich(getDocxViewerSelectionV2FromRange(root, r));
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
    // NBSP should behave like a normal space; removing it breaks selection offsets.
    return (el.innerText || '').replace(/\u00A0/g, ' ');
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

  const getActiveParagraphIdFromDom = useCallback(() => {
    try {
      const sel = window.getSelection?.();
      const node = sel?.anchorNode || null;
      const parentEl = node?.nodeType === 1 ? node : node?.parentElement;
      const el = parentEl?.closest?.('[data-paragraph-id]');
      const pid = el?.getAttribute?.('data-paragraph-id') || '';
      return String(pid || '').trim() || null;
    } catch {
      return null;
    }
  }, []);

  const setUndoState = useCallback((pid, nextHtml, { clearHistory = false } = {}) => {
    const p = String(pid || '').trim();
    if (!p) return;
    const sanitized = sanitizeDocxRichHtml(String(nextHtml || ''));
    lastHtmlByPidRef.current.set(p, sanitized);
    if (clearHistory) {
      undoByPidRef.current.set(p, []);
      redoByPidRef.current.set(p, []);
    }
  }, []);

  const pushUndoSnapshot = useCallback((pid, prevHtml) => {
    const p = String(pid || '').trim();
    if (!p) return;
    const prev = sanitizeDocxRichHtml(String(prevHtml || ''));
    const stack = undoByPidRef.current.get(p) || [];
    if (stack.length && stack[stack.length - 1] === prev) return;
    stack.push(prev);
    while (stack.length > 60) stack.shift();
    undoByPidRef.current.set(p, stack);
    redoByPidRef.current.set(p, []);
  }, []);

  const applyUndoRedo = useCallback((direction /* 'undo'|'redo' */) => {
    const pid = getActiveParagraphIdFromDom() || (effectiveSelectedId ? String(effectiveSelectedId) : null);
    if (!pid) return false;
    const el = findParagraphEl(pid);
    if (!el) return false;
    const current = sanitizeDocxRichHtml(el.innerHTML || '');

    const undoStack = undoByPidRef.current.get(pid) || [];
    const redoStack = redoByPidRef.current.get(pid) || [];

    if (direction === 'undo') {
      if (!undoStack.length) return false;
      const prev = undoStack.pop();
      redoStack.push(current);
      el.innerHTML = String(prev || '');
      undoByPidRef.current.set(pid, undoStack);
      redoByPidRef.current.set(pid, redoStack);
      lastHtmlByPidRef.current.set(pid, sanitizeDocxRichHtml(el.innerHTML || ''));
      dirtyParagraphsRef.current?.add?.(pid);
      if (controlledSelectedId == null) setSelectedId(pid);
      onSelectedIdChange?.(pid);
      return true;
    }

    if (direction === 'redo') {
      if (!redoStack.length) return false;
      const next = redoStack.pop();
      undoStack.push(current);
      el.innerHTML = String(next || '');
      undoByPidRef.current.set(pid, undoStack);
      redoByPidRef.current.set(pid, redoStack);
      lastHtmlByPidRef.current.set(pid, sanitizeDocxRichHtml(el.innerHTML || ''));
      dirtyParagraphsRef.current?.add?.(pid);
      if (controlledSelectedId == null) setSelectedId(pid);
      onSelectedIdChange?.(pid);
      return true;
    }

    return false;
  }, [controlledSelectedId, effectiveSelectedId, findParagraphEl, getActiveParagraphIdFromDom, onSelectedIdChange]);

  const snapshotTarget = useCallback((paragraphId) => {
    const el = findParagraphEl(paragraphId);
    if (!el) return null;
    return {
      paragraphId,
      html: sanitizeDocxRichHtml(el.innerHTML || ''),
      text: (el.innerText || '').replace(/\u00A0/g, ' '),
    };
  }, [findParagraphEl]);

  const decorateAsDraft = (el, draftId) => {
    if (!el) return;
    // Decorate as a draft (subtle highlight). Draft badges are handled separately
    // so bundle edits can display only one badge.
    el.dataset.allybiDraftId = String(draftId);
    // Light gray highlight (avoid "warning yellow" feel).
    el.style.backgroundColor = 'rgba(17, 24, 39, 0.05)';
    el.style.boxShadow = 'inset 0 0 0 1px rgba(17, 24, 39, 0.10)';
  };

	  const upsertDraftBadge = (el) => {
	    // Inline "Draft" badges inside the document created visual duplication and appeared to
	    // "move" during scrolling when multiple paragraphs were affected. The right-panel
	    // confirmation strip already communicates draft state, so disable inline badges.
	    return;
	    if (!el) return;
	    // Add badge (contentEditable=false so it doesn't get edited).
	    try {
	      const pid = String(el.getAttribute?.('data-paragraph-id') || '').trim();
      // IMPORTANT: attach to the paragraph element. Attaching to the parent container
      // makes badges look like they "move" when you scroll.
      const host = el;
      host.style.position = host.style.position || 'relative';

      // Remove any previous badge for this paragraph.
      try {
        const old = pid
          ? host.querySelector?.(`[data-allybi-draft-badge-for="${CSS.escape(pid)}"]`)
          : host.querySelector?.('[data-allybi-draft-badge="1"]');
        if (old && old.parentNode) old.parentNode.removeChild(old);
      } catch {}

      const badge = window.document.createElement('span');
      badge.setAttribute('data-allybi-draft-badge', '1');
      if (pid) badge.setAttribute('data-allybi-draft-badge-for', pid);
      badge.setAttribute('data-allybi-ui', '1');
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
      host.appendChild(badge);
    } catch {}
  };

  const clearDraftDecoration = (el) => {
    if (!el) return;
    try {
      const pid = String(el.getAttribute?.('data-paragraph-id') || '').trim();
      const host = el;
      const badge = pid
        ? host.querySelector?.(`[data-allybi-draft-badge-for="${CSS.escape(pid)}"]`)
        : host.querySelector?.('[data-allybi-draft-badge="1"]');
      if (badge && badge.parentNode) badge.parentNode.removeChild(badge);
    } catch {}
    try { delete el.dataset.allybiDraftId; } catch {}
    try {
      // Restore any per-paragraph mutations we made for preview (e.g. hiding deletes, list->paragraph).
      if (el.dataset.allybiOrigClass) {
        el.className = String(el.dataset.allybiOrigClass || el.className || '');
        delete el.dataset.allybiOrigClass;
      }
      if (el.dataset.allybiOrigListLevel) {
        el.setAttribute('data-list-level', String(el.dataset.allybiOrigListLevel));
        delete el.dataset.allybiOrigListLevel;
      }
      if (el.dataset.allybiOrigDisplay) {
        el.style.display = String(el.dataset.allybiOrigDisplay);
        delete el.dataset.allybiOrigDisplay;
      } else if (el.dataset.allybiDeleted === '1') {
        el.style.display = '';
      }
      if (el.dataset.allybiDeleted) delete el.dataset.allybiDeleted;
    } catch {}
    try { el.style.backgroundColor = ''; } catch {}
    try { el.style.boxShadow = ''; } catch {}
  };

  const applyDraft = useCallback(({ draftId, targetId, beforeText, afterText, afterHtml }) => {
    const paragraphId = targetId;
    if (!draftId || !paragraphId) return false;
    const el = findParagraphEl(paragraphId);
    if (!el) return false;

    if (!draftSnapshotsRef.current.has(draftId)) {
      draftSnapshotsRef.current.set(draftId, { paragraphs: { [paragraphId]: { html: el.innerHTML || '' } } });
    }

    const nextHtml = afterHtml ? sanitizeDocxRichHtml(afterHtml) : toHtmlFromPlain(afterText || '');

    // Capture pre-edit HTML so undo can restore it.
    const preEditHtml = sanitizeDocxRichHtml(el.innerHTML || '');

    if (reviewModeRef.current) {
      const beforeT =
        String(beforeText || '').trim() ||
        (el.innerText || '').replace(/\u00A0/g, ' ');
      const afterT =
        String(afterText || '').trim() ||
        (afterHtml ? (el.innerText || '') : '');
      const parts = wordDiff(beforeT, afterT);
      const sugg = renderSuggestionHtml(parts) || nextHtml;
      el.innerHTML = sugg;
    } else {
      el.innerHTML = nextHtml;
    }
    // Push pre-edit state to undo stack so toolbar undo can revert AI edits.
    try {
      pushUndoSnapshot(paragraphId, preEditHtml);
      lastHtmlByPidRef.current.set(paragraphId, sanitizeDocxRichHtml(el.innerHTML || ''));
    } catch {}

    decorateAsDraft(el, draftId);
    upsertDraftBadge(el);

    try { el.scrollIntoView?.({ behavior: 'smooth', block: 'center' }); } catch {}
    return true;
  }, [findParagraphEl, pushUndoSnapshot]);

  const applySpanPatches = useCallback(({ draftId, patches }) => {
    if (!draftId) return false;
    const list = Array.isArray(patches) ? patches : [];
    if (!list.length) return false;

    // Snapshot first, so discard restores cleanly.
    if (!draftSnapshotsRef.current.has(draftId)) {
      draftSnapshotsRef.current.set(draftId, { paragraphs: {} });
    }
    const snap = draftSnapshotsRef.current.get(draftId);
    const paragraphs = snap?.paragraphs && typeof snap.paragraphs === 'object' ? snap.paragraphs : (snap?.paragraphId ? { [snap.paragraphId]: { html: snap.html || '' } } : {});

    const grouped = new Map();
    for (const p of list) {
      const pid = String(p?.paragraphId || '').trim();
      if (!pid) continue;
      if (!grouped.has(pid)) grouped.set(pid, []);
      grouped.get(pid).push(p);
    }

    let touched = 0;
    let badgePlaced = false;
    for (const [pid, ps] of Array.from(grouped.entries())) {
      const el = findParagraphEl(pid);
      if (!el) continue;
      if (!paragraphs[pid]) paragraphs[pid] = { html: el.innerHTML || '' };

      // Apply patches in descending order so offsets remain stable.
      const sorted = [...ps].sort((a, b) => Number(b?.start || 0) - Number(a?.start || 0));
      for (const patch of sorted) {
        const beforeNeedle = normalizeSpaces(String(patch?.before || ""));
        const after = String(patch?.after || "");
        const hintStart = Number(patch?.start || 0);
        const hintEnd = Number(patch?.end || 0);

        const segs = collectLinearSegments(el);
        const linear = linearTextFromSegments(segs);

        // Preferred: match by exact "before" string within the paragraph text.
        // This is safer than trusting offsets from another text-normalization space.
        let start = -1;
        let end = -1;
        if (beforeNeedle) {
          const indices = findAllIndices(linear, beforeNeedle);
          const picked = pickClosestIndex(indices, hintStart);
          if (picked >= 0) {
            start = picked;
            end = picked + beforeNeedle.length;
          }
        }

        // Fallback: use provided offsets (clamped).
        if (start < 0 || end < 0) {
          const s = Number.isFinite(hintStart) ? Math.max(0, hintStart) : 0;
          const e = Number.isFinite(hintEnd) ? Math.max(s, hintEnd) : s;
          start = Math.min(s, linear.length);
          end = Math.min(e, linear.length);
        }

        // Last safety: refuse to delete "everything" on a small patch request.
        if (linear.length && (end - start) > Math.max(1200, linear.length * 0.8) && beforeNeedle.length < 200) {
          continue;
        }

        const ok = applyTextPatchToParagraphEl(el, start, end, after);
        if (ok) touched += 1;
      }

      if (reviewModeRef.current) {
        try {
          const beforeT = String(paragraphs?.[pid]?.html ? stripHtml(paragraphs[pid].html) : (el.innerText || '')).replace(/\u00A0/g, ' ');
          const afterT = (el.innerText || '').replace(/\u00A0/g, ' ');
          const parts = wordDiff(beforeT, afterT);
          const sugg = renderSuggestionHtml(parts);
          if (sugg) el.innerHTML = sugg;
        } catch {}
      }

      decorateAsDraft(el, draftId);
      // Push pre-patch state to undo stack so toolbar undo can revert AI edits.
      try {
        const preHtml = paragraphs[pid]?.html || '';
        if (preHtml) pushUndoSnapshot(pid, sanitizeDocxRichHtml(preHtml));
        lastHtmlByPidRef.current.set(pid, sanitizeDocxRichHtml(el.innerHTML || ''));
      } catch {}
      if (!badgePlaced && el.style.display !== 'none') {
        upsertDraftBadge(el);
        badgePlaced = true;
      }
    }

    draftSnapshotsRef.current.set(draftId, { paragraphs });
    return touched > 0;
  }, [findParagraphEl, pushUndoSnapshot]);

  const applyParagraphPatches = useCallback(({ draftId, patches }) => {
    if (!draftId) return false;
    const list = Array.isArray(patches) ? patches : [];
    if (!list.length) return false;

    if (!draftSnapshotsRef.current.has(draftId)) {
      draftSnapshotsRef.current.set(draftId, { paragraphs: {} });
    }
    const snap = draftSnapshotsRef.current.get(draftId);
    const paragraphs = snap?.paragraphs && typeof snap.paragraphs === 'object'
      ? snap.paragraphs
      : snap?.paragraphId
        ? { [snap.paragraphId]: { html: snap.html || '' } }
        : {};

    let touched = 0;
    let badgePlaced = false;
    const nextListOverrides = {};
    for (const p of list) {
      const kind = String(p?.kind || 'docx_paragraph');
      const pid = String(p?.paragraphId || '').trim();
      if (!pid) continue;
      const el = findParagraphEl(pid);
      if (!el) continue;
      if (!paragraphs[pid]) paragraphs[pid] = { html: el.innerHTML || '' };

      if (kind === 'docx_delete_paragraph') {
        // Preview deletes by hiding the paragraph (so discard can restore it).
        try {
          if (el.dataset.allybiOrigDisplay == null) el.dataset.allybiOrigDisplay = el.style.display || '';
          el.dataset.allybiDeleted = '1';
          el.style.display = 'none';
          decorateAsDraft(el, draftId);
          touched += 1;
        } catch {}
        continue;
      }

      const afterHtmlRaw = String(p?.afterHtml || '').trim();
      const afterTextRaw = String(p?.afterText || '').trim();
      const nextHtml = afterHtmlRaw ? sanitizeDocxRichHtml(afterHtmlRaw) : toHtmlFromPlain(afterTextRaw || '');
      if (!nextHtml) continue;

      // If the patch wants to convert a list item into a normal paragraph, remove list styling in the preview.
      if (p?.removeNumbering) {
        try {
          if (el.dataset.allybiOrigClass == null) el.dataset.allybiOrigClass = el.className || '';
          if (el.dataset.allybiOrigListLevel == null) el.dataset.allybiOrigListLevel = String(el.getAttribute('data-list-level') || '0');
          el.classList.remove('koda-docx-li');
          el.setAttribute('data-list-level', '0');
          nextListOverrides[pid] = { isList: false, level: 0 };
        } catch {}
      }

      if (p?.applyNumbering) {
        try {
          if (el.dataset.allybiOrigClass == null) el.dataset.allybiOrigClass = el.className || '';
          if (el.dataset.allybiOrigListLevel == null) el.dataset.allybiOrigListLevel = String(el.getAttribute('data-list-level') || '0');

          const parseLevel = (value) => {
            const n = Number(value);
            return Number.isFinite(n) && n >= 0 ? n : null;
          };
          const ownLevel = parseLevel(el.getAttribute('data-list-level'));
          let resolvedLevel = ownLevel == null ? 0 : ownLevel;

          if (ownLevel == null) {
            const paragraphEls = Array.from(rootRef.current?.querySelectorAll?.('[data-paragraph-id]') || []);
            const idx = paragraphEls.indexOf(el);
            if (idx >= 0) {
              for (let i = idx - 1; i >= 0; i -= 1) {
                const candidate = paragraphEls[i];
                if (!candidate?.classList?.contains?.('koda-docx-li')) continue;
                const lvl = parseLevel(candidate.getAttribute('data-list-level'));
                if (lvl != null) { resolvedLevel = lvl; break; }
              }
              if (resolvedLevel === 0) {
                for (let i = idx + 1; i < paragraphEls.length; i += 1) {
                  const candidate = paragraphEls[i];
                  if (!candidate?.classList?.contains?.('koda-docx-li')) continue;
                  const lvl = parseLevel(candidate.getAttribute('data-list-level'));
                  if (lvl != null) { resolvedLevel = lvl; break; }
                }
              }
            }
          }

          el.classList.add('koda-docx-li');
          el.setAttribute('data-list-level', String(resolvedLevel));
          nextListOverrides[pid] = { isList: true, level: resolvedLevel };
        } catch {}
      }

      el.innerHTML = nextHtml;
      decorateAsDraft(el, draftId);
      // Push pre-patch state to undo stack so toolbar undo can revert AI edits.
      try {
        const preHtml = paragraphs[pid]?.html || '';
        if (preHtml) pushUndoSnapshot(pid, sanitizeDocxRichHtml(preHtml));
        lastHtmlByPidRef.current.set(pid, sanitizeDocxRichHtml(el.innerHTML || ''));
      } catch {}
      if (!badgePlaced && el.style.display !== 'none') {
        upsertDraftBadge(el);
        badgePlaced = true;
      }
      touched += 1;
    }

    if (Object.keys(nextListOverrides).length) {
      setDraftListOverrides((prev) => {
        const out = { ...(prev || {}) };
        for (const [pid, value] of Object.entries(nextListOverrides)) {
          if (!value) delete out[pid];
          else out[pid] = value;
        }
        return out;
      });
    }

    draftSnapshotsRef.current.set(draftId, { paragraphs });
    return touched > 0;
  }, [findParagraphEl, pushUndoSnapshot]);

  const discardDraft = useCallback(({ draftId }) => {
    if (!draftId) return false;
    const snap = draftSnapshotsRef.current.get(draftId);
    if (!snap) return false;

    // Back-compat: older snapshots were { paragraphId, html }.
    const paragraphs = snap?.paragraphs && typeof snap.paragraphs === 'object'
      ? snap.paragraphs
      : snap?.paragraphId
        ? { [snap.paragraphId]: { html: snap.html || '' } }
        : {};

    const ids = Object.keys(paragraphs || {});
    if (!ids.length) return false;
    for (const pid of ids) {
      const el = findParagraphEl(pid);
      if (!el) continue;
      el.innerHTML = String(paragraphs[pid]?.html || '');
      clearDraftDecoration(el);
      try { setUndoState(pid, el.innerHTML || '', { clearHistory: true }); } catch {}
    }
    setDraftListOverrides((prev) => {
      if (!prev || typeof prev !== 'object') return prev;
      let changed = false;
      const out = { ...prev };
      for (const pid of ids) {
        if (Object.prototype.hasOwnProperty.call(out, pid)) {
          delete out[pid];
          changed = true;
        }
      }
      return changed ? out : prev;
    });
    draftSnapshotsRef.current.delete(draftId);
    return true;
  }, [findParagraphEl, setUndoState]);

  const acceptDraft = useCallback(({ draftId }) => {
    if (!draftId) return false;
    const snap = draftSnapshotsRef.current.get(draftId);
    if (!snap) return false;

    const paragraphs = snap?.paragraphs && typeof snap.paragraphs === 'object'
      ? snap.paragraphs
      : snap?.paragraphId
        ? { [snap.paragraphId]: { html: snap.html || '' } }
        : {};

    const ids = Object.keys(paragraphs || {});
    if (!ids.length) {
      draftSnapshotsRef.current.delete(draftId);
      return false;
    }

    const nextTextByPid = new Map();
    for (const pid of ids) {
      const el = findParagraphEl(pid);
      if (!el) continue;
      clearDraftDecoration(el);
      const currentHtml = sanitizeDocxRichHtml(el.innerHTML || '');
      baselineHtmlRef.current.set(pid, currentHtml);
      nextTextByPid.set(pid, (el.innerText || '').replace(/\u00A0/g, ' '));
      try { setUndoState(pid, currentHtml, { clearHistory: true }); } catch {}
    }

    if (nextTextByPid.size) {
      setBlocks((prev) => (Array.isArray(prev)
        ? prev.map((b) => {
            const pid = String(b?.paragraphId || '');
            if (!pid || !nextTextByPid.has(pid)) return b;
            return { ...b, text: String(nextTextByPid.get(pid) || '') };
          })
        : prev));
    }

    draftSnapshotsRef.current.delete(draftId);
    return true;
  }, [findParagraphEl, setUndoState]);

  const scrollToTarget = useCallback((paragraphId) => {
    const el = findParagraphEl(paragraphId);
    if (!el) return false;
    try { el.scrollIntoView?.({ behavior: 'smooth', block: 'center' }); } catch {}
    // Pulse highlight briefly for affordance.
    try {
      const prev = el.style.backgroundColor;
      el.style.backgroundColor = 'rgba(107,114,128,0.14)';
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
    try { setUndoState(selectedBlock.paragraphId, baselineHtml, { clearHistory: true }); } catch {}
    const msg = 'Reverted.';
    setStatusMsg(msg);
    onStatusMsg?.(msg);
    setTimeout(() => { setStatusMsg(''); onStatusMsg?.(''); }, 1200);
  }, [onStatusMsg, selectedBlock, setUndoState]);

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
      const res = await applyEdit({
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
      // Return backend response for callers that need revision ids.
      // (In overwrite mode this is usually the same docId.)
      const revisionId = res?.result?.revisionId || res?.revisionId || null;

      // Update local baseline so the doc doesn't flicker on autosave.
      baselineHtmlRef.current.set(paragraphId, String(nextHtml || '').trim());
      setBlocks((prev) => prev.map((b) => (b.paragraphId === paragraphId ? { ...b, text: proposedText } : b)));
      dirtyParagraphsRef.current?.delete?.(paragraphId);
      onApplied?.();
      try {
        const el = findParagraphEl(paragraphId);
        clearDraftDecoration(el);
      } catch {}

      if (!silent) {
        setStatusMsg('Saved.');
        onStatusMsg?.('Saved.');
        setTimeout(() => { setStatusMsg(''); onStatusMsg?.(''); }, 900);
      }
      return { ok: true, revisionId };
    } catch (e) {
      const msg = e?.response?.data?.error?.message || e?.response?.data?.error || e?.message || 'Save failed.';
      setStatusMsg(msg);
      onStatusMsg?.(msg);
      return { ok: false, error: msg };
    } finally {
      inflightApplyRef.current.delete(paragraphId);
      setIsApplying(false);
    }
  }, [blocks, docId, document?.filename, getLiveHtmlFor, getLiveTextFor, onApplied, onStatusMsg]);

  const commitParagraph = useCallback(async ({ paragraphId, instruction, operator = 'EDIT_PARAGRAPH' } = {}) => {
    if (!docId || !paragraphId) return { ok: false, error: 'Missing document or paragraph.' };
    if (inflightApplyRef.current.has(paragraphId)) return { ok: false, error: 'Save in progress.' };
    const block = blocks.find((b) => b.paragraphId === paragraphId) || null;
    if (!block) return { ok: false, error: 'Paragraph not found.' };

    const nextText = getLiveTextFor(paragraphId);
    const nextHtml = getLiveHtmlFor(paragraphId);
    if (nextText == null || nextHtml == null) return { ok: false, error: 'Unable to read edited paragraph.' };

    const beforeText = String(block.text || '');
    const proposedText = String(nextText || '').trim();
    if (!proposedText) return { ok: false, error: 'Cannot apply an empty paragraph.' };

    inflightApplyRef.current.add(paragraphId);
    setIsApplying(true);
    setStatusMsg('Saving…');
    onStatusMsg?.('Saving…');
    try {
      const res = await applyEdit({
        instruction: String(instruction || `Manual edit in viewer: ${cleanDocumentName(document?.filename)}`),
        operator: operator === 'EDIT_SPAN' ? 'EDIT_SPAN' : 'EDIT_PARAGRAPH',
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
          resolutionReason: 'viewer_commit',
        },
        beforeText,
        proposedText,
        proposedHtml: nextHtml,
        userConfirmed: true,
      });

      baselineHtmlRef.current.set(paragraphId, String(nextHtml || '').trim());
      setBlocks((prev) => prev.map((b) => (b.paragraphId === paragraphId ? { ...b, text: proposedText } : b)));
      dirtyParagraphsRef.current?.delete?.(paragraphId);
      onApplied?.();
      try {
        const el = findParagraphEl(paragraphId);
        clearDraftDecoration(el);
      } catch {}

      setStatusMsg('Saved.');
      onStatusMsg?.('Saved.');
      setTimeout(() => { setStatusMsg(''); onStatusMsg?.(''); }, 900);
      const revisionId = res?.result?.revisionId || res?.revisionId || null;
      return { ok: true, revisionId };
    } catch (e) {
      const msg = e?.response?.data?.error?.message || e?.response?.data?.error || e?.message || 'Save failed.';
      setStatusMsg(msg);
      onStatusMsg?.(msg);
      return { ok: false, error: msg };
    } finally {
      inflightApplyRef.current.delete(paragraphId);
      setIsApplying(false);
    }
  }, [blocks, docId, document?.filename, getLiveHtmlFor, getLiveTextFor, onApplied, onStatusMsg]);

  const commitParagraphs = useCallback(async ({ paragraphIds, instruction, operator } = {}) => {
    const ids = Array.isArray(paragraphIds) ? paragraphIds.map((x) => String(x || '').trim()).filter(Boolean) : [];
    if (!ids.length) return { ok: false, error: 'No paragraphs to commit.' };
    const results = [];
    for (const pid of ids) {
      // eslint-disable-next-line no-await-in-loop
      results.push({ paragraphId: pid, ...(await commitParagraph({ paragraphId: pid, instruction, operator })) });
    }
    const ok = results.every((r) => r.ok);
    const revisionId = results.find((r) => r.revisionId)?.revisionId || null;
    return { ok, revisionId, results };
  }, [commitParagraph]);

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
      const c = String(cmd || '').toLowerCase().trim();

      // Prefer internal history for undo/redo; fall back to execCommand if empty.
      if (c === 'undo') {
        const ok = applyUndoRedo('undo');
        if (ok) return;
      } else if (c === 'redo') {
        const ok = applyUndoRedo('redo');
        if (ok) return;
      }

      // Snapshot before programmatic commands, so toolbar actions are undoable.
      const pid = getActiveParagraphIdFromDom() || (effectiveSelectedId ? String(effectiveSelectedId) : null);
      const beforeEl = pid ? findParagraphEl(pid) : null;
      const beforeHtml = beforeEl ? sanitizeDocxRichHtml(beforeEl.innerHTML || '') : null;

      try { window.document.execCommand(cmd); } catch {}

      if (pid && beforeEl) {
        const afterHtml = sanitizeDocxRichHtml(beforeEl.innerHTML || '');
        if (beforeHtml != null && afterHtml !== beforeHtml) {
          pushUndoSnapshot(pid, beforeHtml);
          lastHtmlByPidRef.current.set(pid, afterHtml);
        }
      }

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
    applySpanPatches,
    applyParagraphPatches,
    discardDraft,
    acceptDraft,
    scrollToTarget,
    restoreSelection,
    getViewerSelectionV2,
    commitParagraph,
    commitParagraphs,
    focus: () => {
      try { pageHostRef.current?.focus?.(); } catch {}
    },
    getSelectedParagraphId: () => effectiveSelectedId,
    getStatusMsg: () => statusMsg,
    getIsApplying: () => isApplying,
  }), [
    applySelected,
    revertSelected,
    effectiveSelectedId,
    statusMsg,
    isApplying,
    load,
    restoreSelection,
    getViewerSelectionV2,
    markDirtyFromSelection,
    snapshotTarget,
    applyDraft,
    applySpanPatches,
    applyParagraphPatches,
    discardDraft,
    acceptDraft,
    scrollToTarget,
    applyParagraphStyleFromSelection,
    applyUndoRedo,
    getActiveParagraphIdFromDom,
    findParagraphEl,
    pushUndoSnapshot,
  ]);

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
      <style>{`
        [data-docx-edit-host="1"] ::selection {
          background: rgba(107, 114, 128, 0.28);
          color: inherit;
        }
        [data-docx-edit-host="1"] ::-moz-selection {
          background: rgba(107, 114, 128, 0.28);
          color: inherit;
        }
      `}</style>
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
          data-docx-edit-host="1"
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
          onKeyDown={(e) => {
            if (readOnly) return;
            const isMeta = e.metaKey || e.ctrlKey;
            if (!isMeta) return;
            const key = e.key?.toLowerCase?.();
            if (key === 'z' && !e.shiftKey) {
              e.preventDefault();
              applyUndoRedo('undo');
            } else if ((key === 'z' && e.shiftKey) || key === 'y') {
              e.preventDefault();
              applyUndoRedo('redo');
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
            // Record per-paragraph undo snapshots for typing/paste. `onInput` fires after mutation,
            // so we use our last seen HTML as the "before" state.
            try {
              const prevHtml = lastHtmlByPidRef.current.get(pid) ?? sanitizeDocxRichHtml(el.innerHTML || '');
              const nextHtml = sanitizeDocxRichHtml(el.innerHTML || '');
              if (nextHtml !== prevHtml) {
                pushUndoSnapshot(pid, prevHtml);
                lastHtmlByPidRef.current.set(pid, nextHtml);
              }
            } catch {}
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
            const listOverride = draftListOverrides?.[b.paragraphId] || null;
            const isList = listOverride ? Boolean(listOverride.isList) : Boolean(b.numberingSignature);
            const listLevel = (() => {
              if (listOverride) {
                const n = Number(listOverride.level);
                if (Number.isFinite(n) && n >= 0) return n;
              }
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
                  try { setUndoState(b.paragraphId, baselineHtml, { clearHistory: true }); } catch {}
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
