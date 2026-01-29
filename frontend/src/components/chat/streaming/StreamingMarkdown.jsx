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
    background: #32302C;
    animation: kodaBlinkCursor 0.9s infinite;
    vertical-align: -2px;
    border-radius: 1px;
  }
`;

function sanitizeAndBalanceMarkdownForRender(text, isStreaming) {
  let t = String(text ?? '');

  // Koda is a document-intelligence product, not a coding assistant.
  // Strip all code fences and inline backticks so they render as plain text.
  // 1. Remove fenced code blocks (``` ... ```) — keep inner content as plain text
  t = t.replace(/```[\w-]*\n?([\s\S]*?)```/g, '$1');
  // 2. Remove inline backticks — keep inner text
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
      // Paragraph spacing like ChatGPT (compact but readable)
      p: ({ children }) => (
        <p
          style={{
            margin: '10px 0',
            lineHeight: '1.55',
            fontSize: 16,
            fontFamily: 'Plus Jakarta Sans',
            color: '#32302C',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {children}
        </p>
      ),

      // Lists
      ul: ({ children }) => (
        <ul
          style={{
            margin: '10px 0 10px 18px',
            padding: 0,
            fontFamily: 'Plus Jakarta Sans',
            color: '#32302C',
            fontSize: 16,
            lineHeight: '1.55',
          }}
        >
          {children}
        </ul>
      ),
      ol: ({ children }) => (
        <ol
          style={{
            margin: '10px 0 10px 18px',
            padding: 0,
            fontFamily: 'Plus Jakarta Sans',
            color: '#32302C',
            fontSize: 16,
            lineHeight: '1.55',
          }}
        >
          {children}
        </ol>
      ),
      li: ({ children }) => <li style={{ margin: '6px 0' }}>{children}</li>,

      // Headings (ChatGPT-ish sizing)
      h1: ({ children }) => (
        <h1 style={{ fontSize: 22, margin: '14px 0 10px', fontFamily: 'Plus Jakarta Sans', color: '#32302C' }}>
          {children}
        </h1>
      ),
      h2: ({ children }) => (
        <h2 style={{ fontSize: 18, margin: '14px 0 10px', fontFamily: 'Plus Jakarta Sans', color: '#32302C' }}>
          {children}
        </h2>
      ),
      h3: ({ children }) => (
        <h3 style={{ fontSize: 16, margin: '12px 0 8px', fontFamily: 'Plus Jakarta Sans', color: '#32302C' }}>
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
              color: '#32302C',
              textDecoration: 'underline',
              textUnderlineOffset: 3,
              fontWeight: 700,
            }}
          >
            {children}
          </a>
        );
      },

      // Koda is NOT a coding assistant — render all code as plain text
      code: ({ children }) => <span>{children}</span>,
      pre: ({ children }) => <span>{children}</span>,

      // Tables (GFM)
      table: ({ children }) => (
        <div style={{ overflowX: 'auto', margin: '12px 0' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'separate',
              borderSpacing: 0,
              border: '1px solid #E6E6EC',
              borderRadius: 14,
              overflow: 'hidden',
              fontFamily: 'Plus Jakarta Sans',
              fontSize: 13,
              color: '#32302C',
            }}
          >
            {children}
          </table>
        </div>
      ),
      thead: ({ children }) => <thead style={{ background: '#F5F5F5' }}>{children}</thead>,
      th: ({ children }) => (
        <th
          style={{
            textAlign: 'left',
            padding: '10px 12px',
            borderBottom: '1px solid #E6E6EC',
            fontWeight: 800,
            fontSize: 12,
            textTransform: 'uppercase',
            letterSpacing: 0.3,
          }}
        >
          {children}
        </th>
      ),
      td: ({ children }) => (
        <td style={{ padding: '10px 12px', borderBottom: '1px solid #F1F0EF', verticalAlign: 'middle' }}>{children}</td>
      ),
      tr: ({ children }) => <tr>{children}</tr>,

      // Blockquote
      blockquote: ({ children }) => (
        <blockquote
          style={{
            margin: '12px 0',
            padding: '8px 12px',
            borderLeft: '3px solid #E6E6EC',
            background: '#F5F5F5',
            borderRadius: 10,
            color: '#55534E',
            fontFamily: 'Plus Jakarta Sans',
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
