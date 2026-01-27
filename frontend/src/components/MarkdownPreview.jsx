import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkEmoji from 'remark-emoji';
import rehypeRaw from 'rehype-raw';
import { useTranslation } from 'react-i18next';
import './chat/MarkdownStyles.css';
import '../styles/PreviewModalBase.css';

const MarkdownPreview = ({ document, zoom }) => {
  const { t } = useTranslation();
  const [markdownContent, setMarkdownContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchMarkdown = async () => {
      if (!document || !document.metadata || !document.metadata.markdownContent) {
        setError(t('markdownEditor.contentNotAvailable'));
        setLoading(false);
        return;
      }

      try {
        setMarkdownContent(document.metadata.markdownContent);
        setLoading(false);
      } catch (err) {
        console.error('Error loading markdown:', err);
        setError(t('markdownEditor.failedToLoad'));
        setLoading(false);
      }
    };

    fetchMarkdown();
  }, [document]);

  if (loading) {
    return (
      <div className="preview-modal-loading">
        <div className="preview-modal-loading-spinner" />
        <div>{t('documentPreview.loadingPreview')}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="preview-modal-error">
        <div className="preview-modal-error-icon">📄</div>
        <div className="preview-modal-error-title">{t('markdownEditor.previewNotAvailable')}</div>
        <div className="preview-modal-error-filename">{document.filename}</div>
        <div className="preview-modal-error-message">{error}</div>
      </div>
    );
  }

  return (
    <div style={{
      width: `${zoom}%`,
      maxWidth: '900px',
      background: 'white',
      borderRadius: 8,
      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
      overflow: 'hidden',
      transition: 'width 0.2s ease'
    }}>
      {/* Document Header */}
      <div style={{
        padding: 16,
        background: '#F5F5F5',
        borderBottom: '1px solid #E6E6EC',
        fontSize: 14,
        fontWeight: '600',
        color: '#32302C',
        fontFamily: 'Plus Jakarta Sans',
        display: 'flex',
        alignItems: 'center',
        gap: 8
      }}>
        <span style={{ fontSize: 20 }}>
          {document.mimeType.includes('pdf') ? '📄' :
           document.mimeType.includes('word') ? '📝' :
           document.mimeType.includes('spreadsheet') || document.mimeType.includes('excel') ? '📊' :
           document.mimeType.includes('presentation') || document.mimeType.includes('powerpoint') ? '📽️' : '📄'}
        </span>
        {document.filename}
      </div>

      {/* Markdown Content */}
      <div className="markdown-preview-container" style={{
        padding: '32px 48px',
        overflow: 'auto',
        maxHeight: '70vh',
        fontSize: `${zoom / 10}px`,
        transition: 'font-size 0.2s ease'
      }}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkEmoji]}
          rehypePlugins={[rehypeRaw]}
          components={{
            // Headings with line numbers for deep linking
            h1: ({node, children, ref, key, ...props}) => (
              <h1 id={`line-${node.position?.start.line}`} className="markdown-h1" {...props}>
                {children}
              </h1>
            ),
            h2: ({node, children, ref, key, ...props}) => (
              <h2 id={`line-${node.position?.start.line}`} className="markdown-h2" {...props}>
                {children}
              </h2>
            ),
            h3: ({node, children, ref, key, ...props}) => (
              <h3 id={`line-${node.position?.start.line}`} className="markdown-h3" {...props}>
                {children}
              </h3>
            ),
            h4: ({node, children, ref, key, ...props}) => (
              <h4 id={`line-${node.position?.start.line}`} className="markdown-h4" {...props}>
                {children}
              </h4>
            ),
            h5: ({node, children, ref, key, ...props}) => (
              <h5 id={`line-${node.position?.start.line}`} className="markdown-h5" {...props}>
                {children}
              </h5>
            ),
            h6: ({node, children, ref, key, ...props}) => (
              <h6 id={`line-${node.position?.start.line}`} className="markdown-h6" {...props}>
                {children}
              </h6>
            ),
            // Paragraphs
            p: ({node, children, ref, key, ...props}) => (
              <p className="markdown-paragraph" {...props}>
                {children}
              </p>
            ),
            // Code blocks
            code: ({node, inline, className, children, ref, key, ...props}) => {
              return inline ? (
                <code className="markdown-inline-code" {...props}>
                  {children}
                </code>
              ) : (
                <code className="markdown-code-block" {...props}>
                  {children}
                </code>
              );
            },
            // Tables
            table: ({node, children, ref, key, ...props}) => (
              <div className="table-wrapper">
                <table className="markdown-table" {...props}>
                  {children}
                </table>
              </div>
            ),
            th: ({node, children, ref, key, isHeader, ...props}) => (
              <th {...props}>
                {children}
              </th>
            ),
            td: ({node, children, ref, key, isHeader, ...props}) => (
              <td {...props}>
                {children}
              </td>
            ),
            // Lists
            ul: ({node, children, ref, key, ...props}) => (
              <ul className="markdown-ul" {...props}>
                {children}
              </ul>
            ),
            ol: ({node, children, ref, key, ...props}) => (
              <ol className="markdown-ol" {...props}>
                {children}
              </ol>
            ),
            li: ({node, children, ref, key, ...props}) => (
              <li {...props}>
                {children}
              </li>
            ),
            // Blockquotes
            blockquote: ({node, children, ref, key, ...props}) => (
              <blockquote className="markdown-blockquote" {...props}>
                {children}
              </blockquote>
            ),
            // Links
            a: ({node, children, ref, key, ...props}) => (
              <a className="markdown-link" {...props}>
                {children}
              </a>
            ),
            // Horizontal rules
            hr: ({node, ref, key, ...props}) => (
              <hr className="markdown-hr" {...props} />
            ),
            // Images
            img: ({node, ref, key, ...props}) => (
              <img className="markdown-image" {...props} alt={props.alt || ''} />
            )
          }}
        >
          {markdownContent}
        </ReactMarkdown>
      </div>
    </div>
  );
};

export default MarkdownPreview;
