import React, { useMemo, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * StreamingMarkdown.jsx
 *
 * ChatGPT-like streaming markdown renderer:
 * ✅ Safe markdown (no raw HTML execution)
 * ✅ GFM support (tables, task lists)
 * ✅ Code blocks with "Copy" button (ChatGPT-style)
 * ✅ Streaming cursor at end while generating
 * ✅ Handles partial/incomplete code fences during streaming (renders cleanly)
 *
 * Props:
 * - content: string (markdown)
 * - isStreaming: boolean (show cursor)
 * - className?: string
 */

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
  const t = String(text ?? '');

  // Do not allow raw HTML to render even if a markdown lib supports it.
  // react-markdown is safe by default unless rehypeRaw is used.
  // We still keep a minimal conservative approach:
  // - nothing special required here

  // ChatGPT-like streaming: if code fence is opened but not closed yet,
  // close it temporarily ONLY for rendering so layout doesn't explode.
  // (Doesn't mutate stored content; purely render-time.)
  if (!isStreaming) return t;

  const fenceCount = (t.match(/```/g) || []).length;
  if (fenceCount % 2 === 1) {
    return t + '\n```';
  }
  return t;
}

function isCodeBlockNode(inline, className) {
  return !inline && typeof className === 'string' && className.includes('language-');
}

function extractLanguage(className) {
  const m = /language-([a-zA-Z0-9_-]+)/.exec(className || '');
  return m?.[1] || '';
}

function copyToClipboard(text) {
  if (!text) return;
  // Use modern clipboard if available; fall back to execCommand.
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => {});
    return;
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  } catch {}
}

const CopyButton = ({ getText }) => {
  const [copied, setCopied] = React.useState(false);

  const onCopy = useCallback(() => {
    const text = getText?.() ?? '';
    copyToClipboard(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }, [getText]);

  return (
    <button
      type="button"
      onClick={onCopy}
      style={{
        border: '1px solid #E6E6EC',
        background: '#FFFFFF',
        borderRadius: 10,
        padding: '6px 10px',
        fontSize: 12,
        fontFamily: 'Plus Jakarta Sans',
        fontWeight: 700,
        color: '#32302C',
        cursor: 'pointer',
        transition: 'background 150ms ease, transform 120ms ease',
        userSelect: 'none',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = '#F5F5F5')}
      onMouseLeave={(e) => (e.currentTarget.style.background = '#FFFFFF')}
      onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.98)')}
      onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
      aria-label="Copy code"
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
};

export default function StreamingMarkdown({ content, isStreaming, className }) {
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

      // Links (open in new tab like ChatGPT)
      a: ({ href, children }) => (
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
      ),

      // Inline code + code blocks with copy
      code: ({ inline, className: cn, children }) => {
        const raw = String(children ?? '');
        const text = raw.replace(/\n$/, '');

        // Inline code
        if (inline) {
          return (
            <code
              style={{
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                fontSize: 13,
                background: '#F5F5F5',
                border: '1px solid #E6E6EC',
                padding: '2px 6px',
                borderRadius: 8,
                color: '#32302C',
              }}
            >
              {children}
            </code>
          );
        }

        // Block code
        const lang = extractLanguage(cn);
        return (
          <div
            style={{
              margin: '12px 0',
              border: '1px solid #E6E6EC',
              borderRadius: 14,
              overflow: 'hidden',
              background: '#0F0F10',
            }}
          >
            {/* Code header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 12px',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
                background: '#0F0F10',
              }}
            >
              <div
                style={{
                  fontFamily: 'Plus Jakarta Sans',
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'rgba(255,255,255,0.75)',
                  letterSpacing: 0.2,
                }}
              >
                {lang ? lang.toUpperCase() : 'CODE'}
              </div>
              <CopyButton getText={() => text} />
            </div>

            {/* Code body */}
            <pre
              style={{
                margin: 0,
                padding: '12px',
                overflowX: 'auto',
                color: 'rgba(255,255,255,0.92)',
                fontSize: 13,
                lineHeight: '1.55',
                fontFamily:
                  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                whiteSpace: 'pre',
              }}
            >
              <code className={cn}>{text}</code>
            </pre>
          </div>
        );
      },

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
        <td style={{ padding: '10px 12px', borderBottom: '1px solid #F1F0EF', verticalAlign: 'top' }}>{children}</td>
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
    []
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
