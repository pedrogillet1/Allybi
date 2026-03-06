import React, { createContext, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import SourcePill from '../../attachments/pills/SourcePill';

/**
 * StreamingMarkdown.jsx
 *
 * ChatGPT-like streaming markdown renderer:
 * ✅ Safe markdown (no raw HTML execution)
 * ✅ GFM support (tables, task lists)
 * ✅ Code blocks with "Copy" button (ChatGPT-style)
 * ✅ Streaming cursor at end while generating
 * ✅ Handles partial/incomplete code fences during streaming (renders cleanly)
 * ✅ koda://source links render as interactive SourcePill components
 *
 * Props:
 * - content: string (markdown)
 * - isStreaming: boolean (show cursor)
 * - className?: string
 * - onSourceClick?: (source: { docId, filename, mimeType, page, slide, sheet, cell, section, locationKey }) => void
 */

/**
 * Parse a koda://source?... href into a source descriptor object.
 * Returns null if the href is not a koda source link.
 */
function parseKodaSourceHref(href) {
  try {
    if (!href || !href.startsWith('koda://source?')) return null;
    const q = href.split('?')[1] || '';
    const p = new URLSearchParams(q);
    return {
      docId: p.get('docId') || undefined,
      documentId: p.get('docId') || undefined,
      filename: p.get('filename') || undefined,
      mimeType: p.get('mime') || undefined,
      page: p.get('page') ? Number(p.get('page')) : undefined,
      slide: p.get('slide') ? Number(p.get('slide')) : undefined,
      sheet: p.get('sheet') || undefined,
      cell: p.get('cell') || undefined,
      section: p.get('section') || undefined,
      locationKey: p.get('loc') || undefined,
      locationLabel: p.get('label') || undefined,
      snippet: p.get('snippet') || undefined,
    };
  } catch {
    return null;
  }
}

function resolveBooleanFlag(raw, defaultValue) {
  const value = String(raw || '').trim().toLowerCase();
  if (!value) return defaultValue;
  if (['1', 'true', 'yes', 'on'].includes(value)) return true;
  if (['0', 'false', 'no', 'off'].includes(value)) return false;
  return defaultValue;
}

const PRESERVE_TABLE_SOURCE_COLUMNS = (() => {
  if (
    typeof window !== 'undefined' &&
    typeof window.__KODA_CHAT_PRESERVE_TABLE_SOURCE_COLUMNS__ === 'boolean'
  ) {
    return window.__KODA_CHAT_PRESERVE_TABLE_SOURCE_COLUMNS__;
  }
  return resolveBooleanFlag(
    process.env.REACT_APP_CHAT_PRESERVE_TABLE_SOURCE_COLUMNS,
    true
  );
})();

const cursorStyles = `
  @keyframes kodaBlinkCursor {
    0%, 45% { opacity: 1; }
    46%, 100% { opacity: 0; }
  }
  .koda-stream-cursor {
    display: inline-block;
    width: 2px;
    height: 16px;
    margin-left: 2px;
    background: #18181B;
    animation: kodaBlinkCursor 0.9s infinite;
    vertical-align: -2px;
    border-radius: 1px;
  }
`;

const TableCellContext = createContext(false);

function balanceMarkdownDelimiters(text, isStreaming) {
  if (!isStreaming) return text;
  let t = String(text || '');

  // Keep fenced code blocks stable while the assistant is still streaming.
  const fenceCount = (t.match(/```/g) || []).length;
  if (fenceCount % 2 === 1) t += '\n```';

  // Balance stray inline backticks to avoid malformed markdown while partial tokens arrive.
  const inlineBackticks = (t.replace(/```/g, '').match(/`/g) || []).length;
  if (inlineBackticks % 2 === 1) t += '`';

  return t;
}

function sanitizeAndBalanceMarkdownForRender(text, isStreaming) {
  let t = String(text ?? '');

  // Preserve model table columns by default; legacy behavior can be re-enabled by flag.
  if (!PRESERVE_TABLE_SOURCE_COLUMNS) {
    t = stripSourceColumnsFromMarkdownTables(t);
  }
  // Remove leaked inline retrieval markers from model text.
  t = stripInlineCitationArtifacts(t);
  t = balanceMarkdownDelimiters(t, isStreaming);

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

function stripSourceColumnsFromMarkdownTables(text) {
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

function stripInlineCitationArtifacts(text) {
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


export default function StreamingMarkdown({ content, isStreaming, className, onSourceClick }) {
  const renderText = useMemo(
    () => sanitizeAndBalanceMarkdownForRender(content, !!isStreaming),
    [content, isStreaming]
  );

  const components = useMemo(
    () => ({
      // Paragraph spacing — clean and readable
      p: ({ children }) => (
        <p
          className="koda-md-paragraph"
          style={{
            lineHeight: '1.65',
            fontSize: 15,
            fontFamily: 'Plus Jakarta Sans',
            color: '#1F2937',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            letterSpacing: '0.01em',
          }}
        >
          {children}
        </p>
      ),

      // Lists
      ul: ({ children }) => (
        <ul
          style={{
            margin: '8px 0 8px 20px',
            padding: 0,
            fontFamily: 'Plus Jakarta Sans',
            color: '#1F2937',
            fontSize: 15,
            lineHeight: '1.65',
          }}
        >
          {children}
        </ul>
      ),
      ol: ({ children }) => (
        <ol
          style={{
            margin: '8px 0 8px 20px',
            padding: 0,
            fontFamily: 'Plus Jakarta Sans',
            color: '#1F2937',
            fontSize: 15,
            lineHeight: '1.65',
          }}
        >
          {children}
        </ol>
      ),
      li: ({ children }) => <li style={{ margin: '5px 0' }}>{children}</li>,

      // Headings
      h1: ({ children }) => (
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: '18px 0 8px', fontFamily: 'Plus Jakarta Sans', color: '#111827', letterSpacing: '-0.01em' }}>
          {children}
        </h1>
      ),
      h2: ({ children }) => (
        <h2 style={{ fontSize: 17, fontWeight: 700, margin: '16px 0 6px', fontFamily: 'Plus Jakarta Sans', color: '#111827', letterSpacing: '-0.01em' }}>
          {children}
        </h2>
      ),
      h3: ({ children }) => (
        <h3 style={{ fontSize: 15, fontWeight: 700, margin: '14px 0 4px', fontFamily: 'Plus Jakarta Sans', color: '#111827' }}>
          {children}
        </h3>
      ),

      // Links: koda://source → SourcePill, otherwise normal link
      a: ({ href, children }) => (
        <TableCellContext.Consumer>
          {(isInsideTableCell) => {
            const src = parseKodaSourceHref(href);
            if (src?.docId && src?.filename) {
              if (isInsideTableCell) {
                const label =
                  React.Children.toArray(children)
                    .map((child) => (typeof child === 'string' ? child : ''))
                    .join('')
                    .trim() || src.filename;
                return <span>{label}</span>;
              }
              return (
                <SourcePill
                  source={{
                    docId: src.docId,
                    documentId: src.documentId,
                    filename: src.filename,
                    mimeType: src.mimeType,
                    page: src.page,
                    slide: Number.isFinite(Number(src.slide)) ? Number(src.slide) : undefined,
                    sheet: src.sheet,
                    cell: src.cell,
                    section: src.section,
                    locationKey: src.locationKey,
                    locationLabel: src.locationLabel,
                    snippet: src.snippet,
                  }}
                  onOpen={onSourceClick}
                  style={{ display: 'inline-flex', verticalAlign: 'middle' }}
                />
              );
            }
            return (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                style={{
                  color: '#18181B',
                  textDecoration: 'underline',
                  textDecorationColor: '#D4D4D8',
                  textUnderlineOffset: 3,
                  fontWeight: 600,
                  transition: 'text-decoration-color 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.textDecorationColor = '#18181B'; }}
                onMouseLeave={(e) => { e.currentTarget.style.textDecorationColor = '#D4D4D8'; }}
              >
                {children}
              </a>
            );
          }}
        </TableCellContext.Consumer>
      ),
      // Preserve markdown code formatting (inline + fenced) with safe styling.
      code: ({ inline, className: codeClassName, children }) => {
        if (inline) {
          return (
            <code
              style={{
                background: '#F3F4F6',
                borderRadius: 6,
                padding: '1px 5px',
                fontSize: 13,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
              }}
            >
              {children}
            </code>
          );
        }
        return (
          <code
            className={codeClassName}
            style={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
              fontSize: 13,
              lineHeight: 1.6,
            }}
          >
            {children}
          </code>
        );
      },
      pre: ({ children }) => (
        <pre
          style={{
            margin: '12px 0',
            padding: '12px 14px',
            borderRadius: 10,
            background: '#111827',
            color: '#E5E7EB',
            overflowX: 'auto',
          }}
        >
          {children}
        </pre>
      ),

      // Tables (GFM)
      table: ({ children }) => (
        <div style={{ overflowX: 'auto', margin: '14px 0' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'separate',
              borderSpacing: 0,
              border: '1px solid #E5E7EB',
              borderRadius: 12,
              overflow: 'hidden',
              fontFamily: 'Plus Jakarta Sans',
              fontSize: 13,
              color: '#1F2937',
              tableLayout: 'fixed',
            }}
          >
            {children}
          </table>
        </div>
      ),
      thead: ({ children }) => <thead style={{ background: '#F9FAFB' }}>{children}</thead>,
      th: ({ children }) => (
        <th
          style={{
            textAlign: 'left',
            padding: '10px 14px',
            borderBottom: '1px solid #E5E7EB',
            borderRight: '1px solid #F3F4F6',
            fontWeight: 700,
            fontSize: 12,
            textTransform: 'uppercase',
            letterSpacing: 0.4,
            color: '#6B7280',
            whiteSpace: 'normal',
            wordBreak: 'break-word',
          }}
        >
          <TableCellContext.Provider value={true}>{children}</TableCellContext.Provider>
        </th>
      ),
      td: ({ children }) => (
        <td
          style={{
            padding: '10px 14px',
            borderBottom: '1px solid #F3F4F6',
            borderRight: '1px solid #F3F4F6',
            verticalAlign: 'top',
            whiteSpace: 'normal',
            wordBreak: 'break-word',
          }}
        >
          <TableCellContext.Provider value={true}>{children}</TableCellContext.Provider>
        </td>
      ),
      tr: ({ children }) => <tr>{children}</tr>,

      // Blockquote
      blockquote: ({ children }) => (
        <blockquote
          style={{
            margin: '14px 0',
            padding: '10px 14px',
            borderLeft: '3px solid #D1D5DB',
            background: '#F9FAFB',
            borderRadius: 8,
            color: '#4B5563',
            fontFamily: 'Plus Jakarta Sans',
            fontSize: 14,
          }}
        >
          {children}
        </blockquote>
      ),
    }),
    [onSourceClick]
  );

  const renderedWithCursor = useMemo(() => {
    // ChatGPT-like: cursor appears at very end of content while streaming
    if (!isStreaming) return renderText;
    return renderText + '\n\n<span class="koda-stream-cursor"></span>';
  }, [renderText, isStreaming]);

  return (
    <>
      <style>{cursorStyles}</style>
      <div className={['koda-markdown', className].filter(Boolean).join(' ')} style={{ width: '100%' }}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          // Important: do NOT enable rehypeRaw (keeps HTML from executing)
          components={components}
        >
          {renderedWithCursor.replace(
            '<span class="koda-stream-cursor"></span>',
            isStreaming ? '▍' : ''
          )}
        </ReactMarkdown>

        {/* Render a real blinking cursor visually (instead of relying on HTML in markdown) */}
        {isStreaming && (
          <div style={{ marginTop: -8 }}>
            <span className="koda-stream-cursor" />
          </div>
        )}
      </div>
    </>
  );
}

