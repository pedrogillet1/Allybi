/**
 * Markdown processing helpers extracted from StreamingMarkdown.
 * Used for sanitizing, balancing, and cleaning markdown content.
 */

export function balanceMarkdownDelimiters(text, isStreaming) {
  if (!isStreaming) return text;
  let t = String(text || '');

  const fenceCount = (t.match(/```/g) || []).length;
  if (fenceCount % 2 === 1) t += '\n```';

  const inlineBackticks = (t.replace(/```/g, '').match(/`/g) || []).length;
  if (inlineBackticks % 2 === 1) t += '`';

  return t;
}

function splitPipeCells(line) {
  return String(line || '')
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

function normalizeHeaderKey(input) {
  return String(input || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function stripSourceColumnsFromMarkdownTables(text) {
  const lines = String(text || '').split('\n');
  const out = [];
  const isSep = (line) => /^[:\-\|\s]+$/.test(String(line || '').trim());
  const sourcePatterns = ['source', 'sources', 'fonte', 'fontes', 'documento fonte', 'evidencia', 'evidence'];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const next = lines[i + 1] || '';
    const startsTable = line.includes('|') && next.includes('|') && isSep(next);
    if (!startsTable) {
      out.push(line);
      continue;
    }

    const block = [line, next];
    let j = i + 2;
    while (j < lines.length && lines[j].includes('|')) {
      block.push(lines[j]);
      j += 1;
    }
    i = j - 1;

    const headers = splitPipeCells(block[0]);
    if (headers.length < 2) {
      out.push(...block);
      continue;
    }
    const sourceIndexes = new Set();
    headers.forEach((h, idx) => {
      const key = normalizeHeaderKey(h);
      if (sourcePatterns.some((p) => key.includes(p))) sourceIndexes.add(idx);
    });
    if (sourceIndexes.size === 0) {
      out.push(...block);
      continue;
    }

    const colCount = headers.length;
    const rewrite = (row) => {
      const cells = splitPipeCells(row);
      const padded = cells.length >= colCount
        ? [...cells.slice(0, colCount - 1), cells.slice(colCount - 1).join(' | ').trim()]
        : [...cells, ...Array.from({ length: colCount - cells.length }, () => '')];
      const filtered = padded.filter((_, idx) => !sourceIndexes.has(idx));
      return `| ${filtered.join(' | ')} |`;
    };

    const header = rewrite(block[0]);
    const cols = splitPipeCells(header).length;
    out.push(header);
    out.push(`| ${Array.from({ length: cols }, () => '---').join(' | ')} |`);
    for (let k = 2; k < block.length; k += 1) out.push(rewrite(block[k]));
  }
  return out.join('\n');
}

export function stripInlineCitationArtifacts(text) {
  let t = String(text || '');
  const marker =
    /d:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\|p:-?\d+\|c:\d+/gi;
  t = t.replace(new RegExp(`\\(\\s*${marker.source}\\s*\\)`, 'gi'), '');
  t = t.replace(marker, '');
  t = t
    .replace(/\(\s*[,;]+\s*\)/g, '')
    .replace(/\(\s*\)/g, '')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ');
  return t.trim();
}

export function sanitizeAndBalanceMarkdownForRender(text, isStreaming, preserveTableSourceColumns = true) {
  let t = String(text ?? '');

  if (!preserveTableSourceColumns) {
    t = stripSourceColumnsFromMarkdownTables(t);
  }
  t = stripInlineCitationArtifacts(t);
  t = balanceMarkdownDelimiters(t, isStreaming);

  return t;
}
