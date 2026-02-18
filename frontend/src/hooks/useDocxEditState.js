import { useCallback, useRef, useState } from 'react';

/**
 * Centralized state management for the DOCX edit canvas.
 *
 * Consolidates the 8+ independent state/ref stores that previously lived
 * inline in DocxEditCanvas into a single hook with named actions.
 */

function sanitizeDocxRichHtml(html) {
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
        const text = doc.createTextNode(el.textContent || '');
        el.parentNode?.replaceChild(text, el);
        continue;
      }
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

export default function useDocxEditState() {
  // --- Core paragraph state ---
  const [blocks, setBlocks] = useState([]);
  const [htmlSeedVersion, setHtmlSeedVersion] = useState(0);
  const [draftListOverrides, setDraftListOverrides] = useState({});

  // --- Refs (mutable, no re-renders) ---
  const baselineHtmlRef = useRef(new Map());       // paragraphId -> last applied HTML (sanitized)
  const inflightApplyRef = useRef(new Set());       // paragraphId currently saving
  const dirtyParagraphsRef = useRef(new Set());     // paragraphId edited since last focus
  const draftSnapshotsRef = useRef(new Map());      // draftId -> { paragraphs: { [pid]: { html } } }
  const lastHtmlByPidRef = useRef(new Map());       // pid -> sanitized html
  const undoByPidRef = useRef(new Map());           // pid -> string[]
  const redoByPidRef = useRef(new Map());           // pid -> string[]

  // --- Single active draft tracking ---
  const activeDraftIdRef = useRef(null);

  // ── Blocks ──

  const loadBlocks = useCallback((rawBlocks) => {
    setBlocks(rawBlocks);
  }, []);

  const updateBlockText = useCallback((paragraphId, text) => {
    setBlocks((prev) =>
      Array.isArray(prev)
        ? prev.map((b) => (b.paragraphId === paragraphId ? { ...b, text: String(text || '') } : b))
        : prev,
    );
  }, []);

  const updateBlocksText = useCallback((textByPid /* Map<string, string> */) => {
    if (!textByPid || !textByPid.size) return;
    setBlocks((prev) =>
      Array.isArray(prev)
        ? prev.map((b) => {
            const pid = String(b?.paragraphId || '');
            if (!pid || !textByPid.has(pid)) return b;
            return { ...b, text: String(textByPid.get(pid) || '') };
          })
        : prev,
    );
  }, []);

  // ── Baseline HTML ──

  const updateBaseline = useCallback((pid, html) => {
    baselineHtmlRef.current.set(pid, String(html || '').trim());
  }, []);

  const getBaseline = useCallback((pid) => {
    return baselineHtmlRef.current.get(pid) || null;
  }, []);

  const resetBaselines = useCallback((nextBaseline /* Map */) => {
    baselineHtmlRef.current = nextBaseline;
  }, []);

  // ── Dirty tracking ──

  const markDirty = useCallback((pid) => {
    dirtyParagraphsRef.current.add(pid);
  }, []);

  const clearDirty = useCallback((pid) => {
    dirtyParagraphsRef.current.delete(pid);
  }, []);

  const isDirty = useCallback((pid) => {
    return dirtyParagraphsRef.current.has(pid);
  }, []);

  const getDirtyPids = useCallback(() => {
    return Array.from(dirtyParagraphsRef.current);
  }, []);

  // ── Inflight tracking ──

  const startInflight = useCallback((pid) => {
    inflightApplyRef.current.add(pid);
  }, []);

  const endInflight = useCallback((pid) => {
    inflightApplyRef.current.delete(pid);
  }, []);

  const isInflight = useCallback((pid) => {
    return inflightApplyRef.current.has(pid);
  }, []);

  // ── Draft snapshots ──

  const snapshotDraft = useCallback((draftId, paragraphs) => {
    draftSnapshotsRef.current.set(draftId, { paragraphs });
  }, []);

  const getDraft = useCallback((draftId) => {
    return draftSnapshotsRef.current.get(draftId) || null;
  }, []);

  const hasDraft = useCallback((draftId) => {
    return draftSnapshotsRef.current.has(draftId);
  }, []);

  const deleteDraft = useCallback((draftId) => {
    draftSnapshotsRef.current.delete(draftId);
    if (activeDraftIdRef.current === draftId) {
      activeDraftIdRef.current = null;
    }
  }, []);

  /**
   * Normalize legacy snapshot shapes (single-paragraph { paragraphId, html })
   * into the canonical multi-paragraph shape { paragraphs: { [pid]: { html } } }.
   */
  const normalizeDraftParagraphs = useCallback((draftId) => {
    const snap = draftSnapshotsRef.current.get(draftId);
    if (!snap) return {};
    if (snap.paragraphs && typeof snap.paragraphs === 'object') return snap.paragraphs;
    if (snap.paragraphId) return { [snap.paragraphId]: { html: snap.html || '' } };
    return {};
  }, []);

  // ── Active draft tracking (single-draft enforcement) ──

  const getActiveDraftId = useCallback(() => {
    return activeDraftIdRef.current;
  }, []);

  const startDraft = useCallback((draftId) => {
    activeDraftIdRef.current = draftId;
    if (!draftSnapshotsRef.current.has(draftId)) {
      draftSnapshotsRef.current.set(draftId, { paragraphs: {} });
    }
  }, []);

  const isInActiveDraft = useCallback((pid) => {
    const activeId = activeDraftIdRef.current;
    if (!activeId) return false;
    const snap = draftSnapshotsRef.current.get(activeId);
    if (!snap) return false;
    const paragraphs = snap.paragraphs && typeof snap.paragraphs === 'object'
      ? snap.paragraphs
      : snap.paragraphId
        ? { [snap.paragraphId]: { html: snap.html || '' } }
        : {};
    return Boolean(paragraphs[pid]);
  }, []);

  // ── Undo/Redo ──

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

  const pushUndo = useCallback((pid, prevHtml) => {
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

  const getLastHtml = useCallback((pid) => {
    return lastHtmlByPidRef.current.get(pid) ?? null;
  }, []);

  const setLastHtml = useCallback((pid, html) => {
    lastHtmlByPidRef.current.set(pid, sanitizeDocxRichHtml(String(html || '')));
  }, []);

  const getUndoStack = useCallback((pid) => {
    return undoByPidRef.current.get(pid) || [];
  }, []);

  const getRedoStack = useCallback((pid) => {
    return redoByPidRef.current.get(pid) || [];
  }, []);

  const setUndoStack = useCallback((pid, stack) => {
    undoByPidRef.current.set(pid, stack);
  }, []);

  const setRedoStack = useCallback((pid, stack) => {
    redoByPidRef.current.set(pid, stack);
  }, []);

  // ── Seed version ──

  const bumpSeedVersion = useCallback(() => {
    setHtmlSeedVersion((v) => v + 1);
  }, []);

  // ── List overrides ──

  const resetListOverrides = useCallback(() => {
    setDraftListOverrides({});
  }, []);

  const mergeListOverrides = useCallback((nextOverrides) => {
    if (!nextOverrides || !Object.keys(nextOverrides).length) return;
    setDraftListOverrides((prev) => {
      const out = { ...(prev || {}) };
      for (const [pid, value] of Object.entries(nextOverrides)) {
        if (!value) delete out[pid];
        else out[pid] = value;
      }
      return out;
    });
  }, []);

  const clearListOverridesForPids = useCallback((pids) => {
    if (!Array.isArray(pids) || !pids.length) return;
    setDraftListOverrides((prev) => {
      if (!prev || typeof prev !== 'object') return prev;
      let changed = false;
      const out = { ...prev };
      for (const pid of pids) {
        if (Object.prototype.hasOwnProperty.call(out, pid)) {
          delete out[pid];
          changed = true;
        }
      }
      return changed ? out : prev;
    });
  }, []);

  return {
    state: {
      blocks,
      htmlSeedVersion,
      draftListOverrides,
    },
    actions: {
      // Blocks
      loadBlocks,
      setBlocks,
      updateBlockText,
      updateBlocksText,
      // Baseline
      updateBaseline,
      getBaseline,
      resetBaselines,
      // Dirty
      markDirty,
      clearDirty,
      isDirty,
      getDirtyPids,
      // Inflight
      startInflight,
      endInflight,
      isInflight,
      // Drafts
      snapshotDraft,
      getDraft,
      hasDraft,
      deleteDraft,
      normalizeDraftParagraphs,
      getActiveDraftId,
      startDraft,
      isInActiveDraft,
      // Undo/Redo
      setUndoState,
      pushUndo,
      getLastHtml,
      setLastHtml,
      getUndoStack,
      getRedoStack,
      setUndoStack,
      setRedoStack,
      // Seed version
      bumpSeedVersion,
      // List overrides
      setDraftListOverrides,
      resetListOverrides,
      mergeListOverrides,
      clearListOverridesForPids,
    },
  };
}
