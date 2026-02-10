import React, { useMemo } from 'react';
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
 * - onSourceClick?: (source: { docId, filename, mimeType, page }) => void
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
    };
  } catch {
    return null;
  }
}

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

function sanitizeAndBalanceMarkdownForRender(text, isStreaming) {
  let t = String(text ?? '');

  // Allybi is a document-intelligence product, not a coding assistant.
  // Strip all code fences and inline backticks so they render as plain text.
  // 1. Remove fenced code blocks (``` ... ```) — keep inner content as plain text
  t = t.replace(/```[\w-]*\n?([\s\S]*?)```/g, '$1');
  // 2. Handle unclosed code fences (streaming edge case) — remove the opening fence
  t = t.replace(/```[\w-]*\n?/g, '');
  // 3. Remove inline backticks — keep inner text
  t = t.replace(/`([^`]+)`/g, '$1');

  return t;
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
            margin: '8px 0 0 0',
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
      a: ({ href, children }) => {
        const src = parseKodaSourceHref(href);
        if (src?.docId && src?.filename) {
          return (
            <SourcePill
              source={{
                docId: src.docId,
                documentId: src.documentId,
                filename: src.filename,
                mimeType: src.mimeType,
                page: src.page,
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
      },

      // Allybi is NOT a coding assistant — render all code as plain text
      code: ({ children }) => <span>{children}</span>,
      pre: ({ children }) => <span>{children}</span>,

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
              tableLayout: 'auto',
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
            whiteSpace: 'nowrap',
          }}
        >
          {children}
        </th>
      ),
      td: ({ children }) => (
        <td style={{ padding: '10px 14px', borderBottom: '1px solid #F3F4F6', borderRight: '1px solid #F3F4F6', verticalAlign: 'top', minWidth: 80 }}>{children}</td>
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

      <div className={className} style={{ width: '100%' }}>
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
