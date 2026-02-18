/**
 * Shared utility functions for the DOCX edit canvas.
 * Extracted from DocxEditCanvas.jsx for reusability and testability.
 */

export function escapeHtml(text) {
  return String(text || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function toHtmlFromPlain(text) {
  return escapeHtml(text).replace(/\n/g, '<br/>');
}

export function sanitizeDocxRichHtml(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${String(html || '')}</div>`, 'text/html');
  const root = doc.body.firstChild;
  if (!root) return '';

  const allowedTags = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'BR', 'SPAN', 'UL', 'OL', 'LI', '#text']);
  const allowedStyle = new Set([
    'font-size',
    'color',
    'font-family',
    'font-weight',
    'font-style',
    'text-decoration',
    'text-decoration-line',
  ]);

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
              if (k === 'font-weight' && !/^(normal|bold|[1-9]00)$/i.test(v)) return null;
              if (k === 'font-style' && !/^(normal|italic|oblique)$/i.test(v)) return null;
              if (k === 'text-decoration' || k === 'text-decoration-line') {
                if (!/^(none|underline|line-through|underline line-through|line-through underline)$/i.test(v)) {
                  return null;
                }
              }
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

export function stripHtml(raw) {
  try {
    const tmp = document.createElement('div');
    tmp.innerHTML = String(raw || '');
    return String(tmp.innerText || tmp.textContent || '').replace(/\u00A0/g, ' ').trim();
  } catch {
    return String(raw || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
}

export function looksLikePatchPayloadText(value) {
  const text = String(value || '').trim();
  if (!text) return false;
  if (/^\{\s*"patches"\s*:/i.test(text)) return true;
  if (/^\[\s*\{\s*"kind"\s*:\s*"docx_/i.test(text)) return true;
  return false;
}

export function collectLinearSegments(rootEl) {
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

export function normalizeSpaces(s) {
  return String(s || '').replace(/\u00A0/g, ' ');
}

export function linearTextFromSegments(segs) {
  return (Array.isArray(segs) ? segs : [])
    .map((seg) => (seg?.kind === 'br' ? '\n' : normalizeSpaces(seg?.node?.nodeValue || '')))
    .join('');
}

export function findAllIndices(hay, needle) {
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

export function pickClosestIndex(indices, hintStart) {
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
