// Utilities for turning a DOM selection inside our DOCX contentEditable canvas
// into a stable, selection-preserving model (paragraphId + offsets).
//
// Notes:
// - Offsets are based on `innerText` of the paragraph element, which matches the
//   user's visible text better than raw text nodes. This is sufficient for
//   selection-span editing (EDIT_SPAN) and avoids brittle DOM-path anchoring.

function normalizeNbsp(s) {
  // Treat NBSP as a normal space so offsets remain stable.
  return String(s || "").replace(/\u00A0/g, " ");
}

// Lightweight, deterministic hash (FNV-1a 32-bit) for mismatch detection.
export function fnv1a32(input) {
  const s = normalizeNbsp(input);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    // h *= 16777619 (with overflow)
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return (`0000000${h.toString(16)}`).slice(-8);
}

function closestParagraphEl(containerEl) {
  const el = containerEl?.nodeType === 1 ? containerEl : containerEl?.parentElement || null;
  return el?.closest?.("[data-paragraph-id]") || null;
}

function safeRangeText(range) {
  try {
    return normalizeNbsp(range?.toString?.() || "");
  } catch {
    return "";
  }
}

function safeInnerText(el) {
  try {
    return normalizeNbsp(el?.innerText || "");
  } catch {
    return "";
  }
}

function computeOffsetsWithinParagraph(paragraphEl, selectionRange) {
  // Use a DOM Range from paragraph start to selection start to compute start offset
  // in the same "string space" as `innerText`.
  const full = safeInnerText(paragraphEl);
  const selected = safeRangeText(selectionRange);
  if (!full || !selected) return null;

  let start = 0;
  try {
    const prefix = window.document.createRange();
    prefix.selectNodeContents(paragraphEl);
    prefix.setEnd(selectionRange.startContainer, selectionRange.startOffset);
    const prefixText = normalizeNbsp(prefix.toString() || "");
    start = prefixText.length;
  } catch {
    // Fallback: first occurrence search.
    const idx = full.indexOf(selected);
    if (idx < 0) return null;
    start = idx;
  }

  const end = start + selected.length;
  if (start < 0 || end < 0 || end < start || end > full.length) {
    // As a safety net, attempt a direct search.
    const idx = full.indexOf(selected);
    if (idx < 0) return null;
    return { start: idx, end: idx + selected.length, fullText: full, selectedText: selected };
  }

  // Ensure the computed slice matches; if not, fall back to a direct search.
  if (full.slice(start, end) !== selected) {
    const idx = full.indexOf(selected);
    if (idx < 0) return null;
    return { start: idx, end: idx + selected.length, fullText: full, selectedText: selected };
  }

  return { start, end, fullText: full, selectedText: selected };
}

/**
 * getDocxViewerSelectionV2
 * Returns a stable viewerSelection object for chat meta:
 * {
 *   domain: "docx",
 *   text, paragraphId,
 *   ranges: [{ paragraphId, start, end, text, paragraphTextHash }],
 *   frozenAtIso
 * }
 */
export function getDocxViewerSelectionV2(documentContainerEl) {
  const sel = window.getSelection?.();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;

  const range = sel.getRangeAt(0);
  return getDocxViewerSelectionV2FromRangeAny(documentContainerEl, range);
}

/**
 * getDocxViewerSelectionV2FromRange
 * Same output as getDocxViewerSelectionV2, but uses an explicit Range (typically a cached clone).
 * This avoids selection drift when a click collapses/moves the live selection.
 */
export function getDocxViewerSelectionV2FromRange(documentContainerEl, range) {
  // Preserve multi-paragraph selections from cached ranges so viewer chat can
  // apply bundle edits to exactly what the user highlighted.
  return getDocxViewerSelectionV2FromRangeAny(documentContainerEl, range, { allowMulti: true });
}

function getDocxViewerSelectionV2FromRangeAny(documentContainerEl, range, opts) {
  const allowMulti = opts?.allowMulti !== false;
  if (!range) return null;
  try {
    if (range.collapsed) return null;
  } catch {}

  const ancestor = range.commonAncestorContainer;
  const containerEl = ancestor?.nodeType === 1 ? ancestor : ancestor?.parentElement || null;
  if (!containerEl || !documentContainerEl?.contains?.(containerEl)) return null;

  const startPara = closestParagraphEl(range.startContainer);
  const endPara = closestParagraphEl(range.endContainer);

  // Multi-paragraph selection: represent as multiple ranges so the backend can apply bulk edits.
  if (allowMulti && startPara && endPara) {
    const startPid = String(startPara?.getAttribute?.("data-paragraph-id") || "").trim();
    const endPid = String(endPara?.getAttribute?.("data-paragraph-id") || "").trim();
    if (startPid && endPid && startPid !== endPid) {
      return getDocxViewerSelectionV2FromRangeMulti(documentContainerEl, range);
    }
  }

  const paragraphEl = closestParagraphEl(containerEl);
  const paragraphId = String(paragraphEl?.getAttribute?.("data-paragraph-id") || "").trim();
  if (!paragraphId) return null;

  const computed = computeOffsetsWithinParagraph(paragraphEl, range);
  if (!computed) return null;

  const { start, end, fullText, selectedText } = computed;
  const clipped = selectedText.trim().replace(/\s+/g, " ");
  const preview = clipped.length <= 280 ? clipped : `${clipped.slice(0, 280).trimEnd()}…`;

  return {
    domain: "docx",
    paragraphId,
    text: selectedText,
    ranges: [
      {
        paragraphId,
        start,
        end,
        text: selectedText,
        paragraphTextHash: fnv1a32(fullText),
      },
    ],
    frozenAtIso: new Date().toISOString(),
    preview,
  };
}

export function getDocxViewerSelectionV2FromRangeMulti(documentContainerEl, range) {
  if (!documentContainerEl || !range) return null;
  try {
    if (range.collapsed) return null;
  } catch {}

  const startPara = closestParagraphEl(range.startContainer);
  const endPara = closestParagraphEl(range.endContainer);
  const startPid = String(startPara?.getAttribute?.("data-paragraph-id") || "").trim();
  const endPid = String(endPara?.getAttribute?.("data-paragraph-id") || "").trim();
  if (!startPid || !endPid) return null;

  const all = Array.from(documentContainerEl.querySelectorAll?.("[data-paragraph-id]") || []);
  const selectedParas = [];
  for (const el of all) {
    try {
      if (range.intersectsNode?.(el)) selectedParas.push(el);
    } catch {
      // intersectsNode can throw for some nodes; ignore.
    }
  }
  if (!selectedParas.length) return null;

  // Keep document order and clamp to avoid pathological selections.
  const paras = selectedParas.slice(0, 60);

  const ranges = [];
  const textChunks = [];

  for (const el of paras) {
    const pid = String(el.getAttribute?.("data-paragraph-id") || "").trim();
    if (!pid) continue;

    const fullText = safeInnerText(el);
    if (!fullText) continue;

    const r = window.document.createRange();
    r.selectNodeContents(el);

    // If the selection starts/ends inside this paragraph, clamp accordingly.
    try {
      if (el.contains?.(range.startContainer)) r.setStart(range.startContainer, range.startOffset);
    } catch {}
    try {
      if (el.contains?.(range.endContainer)) r.setEnd(range.endContainer, range.endOffset);
    } catch {}

    const selectedText = normalizeNbsp(r.toString() || "");
    if (!selectedText.trim()) continue;

    const computed = computeOffsetsWithinParagraph(el, r);
    if (!computed) continue;

    ranges.push({
      paragraphId: pid,
      start: computed.start,
      end: computed.end,
      text: selectedText,
      paragraphTextHash: fnv1a32(fullText),
    });
    textChunks.push(selectedText.trim());
  }

  if (!ranges.length) return null;

  const joined = textChunks.join("\n").trim();
  const preview = (() => {
    const clipped = joined.replace(/\s+/g, " ").trim();
    return clipped.length <= 280 ? clipped : `${clipped.slice(0, 280).trimEnd()}…`;
  })();

  // Heuristic: if everything selected looks like list items, label as 'list' so suggestions match.
  const isList = paras
    .filter((el) => String(el?.innerText || "").trim())
    .every((el) => {
      try {
        if (el.classList?.contains?.("koda-docx-li")) return true;
        const t = String(el.innerText || "").trim();
        return /^(?:[\u2022\u2023\u25E6\u2043\u2219\u25A1\u2610\u25AA\u25CF]|[-*])\s+/.test(t);
      } catch {
        return false;
      }
    });

  return {
    domain: "docx",
    paragraphId: String(ranges[0]?.paragraphId || startPid),
    text: joined,
    ranges,
    frozenAtIso: new Date().toISOString(),
    preview,
    selectionKind: isList ? "list" : "multi",
  };
}

function collectLinearSegments(rootEl) {
  // Build a linear view over TEXT + <br> so we can map offsets back to DOM positions.
  const segs = [];
  const walk = (node) => {
    if (!node) return;
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.nodeValue || "";
      if (text.length) segs.push({ kind: "text", node, len: text.length });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node;
    if (String(el.tagName || "").toUpperCase() === "BR") {
      segs.push({ kind: "br", node: el, len: 1 });
      return;
    }
    const children = Array.from(el.childNodes || []);
    for (const c of children) walk(c);
  };
  walk(rootEl);
  return segs;
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
      if (seg.kind === "text") {
        const inside = Math.max(0, Math.min(seg.len, target - cur));
        return { container: seg.node, offset: inside };
      }
      // <br> maps to a boundary before/after it.
      const parent = seg.node.parentNode;
      const idx = indexOfChild(parent, seg.node);
      if (!parent || idx < 0) return { container: rootEl, offset: 0 };
      return target - cur <= 0
        ? { container: parent, offset: idx }
        : { container: parent, offset: idx + 1 };
    }
    cur = next;
  }
  return { container: rootEl, offset: rootEl.childNodes?.length || 0 };
}

export function createRangeFromDocxViewerSelectionV2(documentContainerEl, viewerSelectionV2) {
  const sel = viewerSelectionV2 || null;
  const r0 = Array.isArray(sel?.ranges) ? sel.ranges[0] : null;
  const paragraphId = String(r0?.paragraphId || sel?.paragraphId || "").trim();
  const start = typeof r0?.start === "number" ? r0.start : null;
  const end = typeof r0?.end === "number" ? r0.end : null;
  if (!documentContainerEl || !paragraphId || start == null || end == null || end <= start) return null;

  let p = null;
  try {
    const escaped = window.CSS?.escape ? window.CSS.escape(paragraphId) : paragraphId;
    p = documentContainerEl.querySelector?.(`[data-paragraph-id="${escaped}"]`) || null;
  } catch {
    p = documentContainerEl.querySelector?.(`[data-paragraph-id="${paragraphId.replace(/"/g, '\\"')}"]`) || null;
  }
  if (!p) return null;

  try {
    const startPos = offsetToDomPosition(p, start);
    const endPos = offsetToDomPosition(p, end);
    const range = window.document.createRange();
    range.setStart(startPos.container, startPos.offset);
    range.setEnd(endPos.container, endPos.offset);
    return range;
  } catch {
    return null;
  }
}

export function getDocxViewerSelectionV2ClientRects(documentContainerEl, viewerSelectionV2, opts) {
  const maxRects = Number(opts?.maxRects ?? 16);
  const container = documentContainerEl;
  if (!container) return { rects: [], range: null };
  const containerRect = container.getBoundingClientRect?.();
  const sel = viewerSelectionV2 || null;
  const rs = Array.isArray(sel?.ranges) ? sel.ranges : [];

  // Clamp overlay rects to the docx page so highlights never bleed into the margin.
  const pageEl = container.querySelector?.('[data-docx-edit-host]');
  const pageRect = pageEl?.getBoundingClientRect?.();
  let pageLeft = 0;
  let pageRight = Infinity;
  if (pageRect && containerRect) {
    pageLeft = pageRect.left - containerRect.left + container.scrollLeft;
    pageRight = pageLeft + pageRect.width;
  }

  const outRects = [];
  const pushFromRange = (range) => {
    const rects = Array.from(range.getClientRects?.() || [])
      .filter((r) => r && r.width > 0 && r.height > 0)
      .map((r) => {
        const top = containerRect ? (r.top - containerRect.top + container.scrollTop) : r.top;
        let left = containerRect ? (r.left - containerRect.left + container.scrollLeft) : r.left;
        let width = r.width;
        if (left < pageLeft) { width -= (pageLeft - left); left = pageLeft; }
        if (left + width > pageRight) { width = pageRight - left; }
        return { top, left, width, height: r.height };
      })
      .filter((r) => r.width > 1);
    for (const r of rects) outRects.push(r);
  };

  if (rs.length >= 2) {
    for (const seg of rs.slice(0, 10)) {
      const single = { domain: "docx", paragraphId: seg.paragraphId, ranges: [seg] };
      const range = createRangeFromDocxViewerSelectionV2(container, single);
      if (range) pushFromRange(range);
      if (outRects.length >= maxRects) break;
    }
    return { rects: outRects.slice(0, maxRects), range: null };
  }

  const range = createRangeFromDocxViewerSelectionV2(container, viewerSelectionV2);
  if (!range) return { rects: [], range: null };
  pushFromRange(range);
  return { rects: outRects.slice(0, maxRects), range };
}
