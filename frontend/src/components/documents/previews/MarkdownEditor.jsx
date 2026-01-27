import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { useTranslation } from 'react-i18next';
import { useNotifications } from '../../../context/NotificationsStore';

const MarkdownEditor = ({ document, zoom, onSave }) => {
  const { t } = useTranslation();
  const { showError } = useNotifications();
  const [markdownContent, setMarkdownContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    const fetchMarkdown = async () => {
      if (!document || !document.metadata || !document.metadata.markdownContent) {
        setError(t('markdownEditor.contentNotAvailable'));
        setLoading(false);
        return;
      }

      try {
        setMarkdownContent(document.metadata.markdownContent);
        setOriginalContent(document.metadata.markdownContent);
        setLoading(false);
      } catch (err) {
        console.error('Error loading markdown:', err);
        setError(t('markdownEditor.failedToLoad'));
        setLoading(false);
      }
    };

    fetchMarkdown();
  }, [document]);

  useEffect(() => {
    setHasChanges(markdownContent !== originalContent);
  }, [markdownContent, originalContent]);

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleCancel = () => {
    setMarkdownContent(originalContent);
    setIsEditing(false);
    setHasChanges(false);
  };

  const handleSave = async () => {
    if (!hasChanges) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    try {
      await onSave(document.id, markdownContent);
      setOriginalContent(markdownContent);
      setIsEditing(false);
      setHasChanges(false);
    } catch (err) {
      console.error('Error saving markdown:', err);
      showError(t('alerts.failedToSaveChanges'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleExport = async () => {
    try {
      const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
      const token = await window.Clerk?.session?.getToken();

      const response = await fetch(`${API_URL}/api/documents/${document.id}/export?format=markdown`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Export failed');
      }

      // Get the filename from Content-Disposition header or create one
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = 'document.md';
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch) {
          filename = decodeURIComponent(filenameMatch[1]);
        }
      }

      // Download the file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = filename;
      window.document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      window.document.body.removeChild(a);
    } catch (err) {
      console.error('Error exporting document:', err);
      showError(t('alerts.failedToExportDocument'));
    }
  };

  if (loading) {
    return (
      <div style={{
        padding: 40,
        background: 'white',
        borderRadius: 12,
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        color: '#6C6B6E',
        fontSize: 16,
        fontFamily: 'Plus Jakarta Sans',
        textAlign: 'center'
      }}>
        Loading preview...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        padding: 40,
        background: 'white',
        borderRadius: 12,
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        textAlign: 'center'
      }}>
        <div style={{ fontSize: 64, marginBottom: 20 }}>📄</div>
        <div style={{ fontSize: 18, fontWeight: '600', color: '#32302C', fontFamily: 'Plus Jakarta Sans', marginBottom: 12 }}>
          {t('markdownEditor.previewNotAvailable')}
        </div>
        <div style={{ fontSize: 14, color: '#6C6B6E', fontFamily: 'Plus Jakarta Sans', marginBottom: 12 }}>
          {document.filename}
        </div>
        <div style={{
          padding: 12,
          background: '#FEF2F2',
          borderRadius: 6,
          fontSize: 14,
          color: '#DC2626',
          marginBottom: 20
        }}>
          {error}
        </div>
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
        justifyContent: 'space-between',
        gap: 8
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}>
            {document.mimeType.includes('pdf') ? '📄' :
             document.mimeType.includes('word') ? '📝' :
             document.mimeType.includes('spreadsheet') || document.mimeType.includes('excel') ? '📊' :
             document.mimeType.includes('presentation') || document.mimeType.includes('powerpoint') ? '📽️' : '📄'}
          </span>
          {document.filename}
          {hasChanges && (
            <span style={{ color: '#DC2626', fontSize: 12, marginLeft: 8 }}>
              ({t('markdownEditor.unsavedChanges')})
            </span>
          )}
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: 8 }}>
          {!isEditing ? (
            <>
              {/* Export button hidden per user request */}
              {/* Edit button hidden per user request */}
            </>
          ) : (
            <>
              <button
                onClick={handleCancel}
                disabled={isSaving}
                style={{
                  padding: '6px 12px',
                  background: '#F5F5F5',
                  color: '#32302C',
                  border: '1px solid #E6E6EC',
                  borderRadius: 6,
                  cursor: isSaving ? 'not-allowed' : 'pointer',
                  fontSize: 14,
                  fontFamily: 'Plus Jakarta Sans',
                  fontWeight: '500',
                  opacity: isSaving ? 0.5 : 1
                }}
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving || !hasChanges}
                style={{
                  padding: '6px 12px',
                  background: hasChanges ? '#181818' : '#E6E6EC',
                  color: hasChanges ? 'white' : '#6C6B6E',
                  border: 'none',
                  borderRadius: 6,
                  cursor: (isSaving || !hasChanges) ? 'not-allowed' : 'pointer',
                  fontSize: 14,
                  fontFamily: 'Plus Jakarta Sans',
                  fontWeight: '500',
                  opacity: (isSaving || !hasChanges) ? 0.5 : 1
                }}
              >
                {isSaving ? t('common.saving') : t('common.save')}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Content Area - Editable or Preview */}
      {isEditing ? (
        <div style={{
          padding: '32px 48px',
          maxHeight: '70vh',
          overflow: 'auto'
        }}>
          <textarea
            value={markdownContent}
            onChange={(e) => setMarkdownContent(e.target.value)}
            style={{
              width: '100%',
              minHeight: '500px',
              padding: 16,
              fontFamily: 'monospace',
              fontSize: '14px',
              lineHeight: 1.6,
              border: '1px solid #E6E6EC',
              borderRadius: 6,
              resize: 'vertical',
              outline: 'none'
            }}
            placeholder={t('markdownEditor.placeholder')}
          />
          <div style={{
            marginTop: 16,
            fontSize: 12,
            color: '#6C6B6E',
            fontFamily: 'Plus Jakarta Sans'
          }}>
            Tip: Use markdown syntax for formatting. Preview will update when you save.
          </div>
        </div>
      ) : (
        <div style={{
          padding: '32px 48px',
          overflow: 'auto',
          maxHeight: '70vh',
          fontSize: `${zoom / 10}px`,
          lineHeight: 1.8,
          transition: 'font-size 0.2s ease'
        }}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeRaw]}
            components={{
              // Headings with line numbers for deep linking
              h1: ({node, children, ref, key, ...props}) => (
                <h1 id={`line-${node.position?.start.line}`} style={{
                  fontSize: '2em',
                  fontWeight: '700',
                  marginTop: '24px',
                  marginBottom: '16px',
                  color: '#32302C',
                  fontFamily: 'Plus Jakarta Sans',
                  borderBottom: '2px solid #E6E6EC',
                  paddingBottom: '8px'
                }} {...props}>
                  {children}
                </h1>
              ),
              h2: ({node, children, ref, key, ...props}) => (
                <h2 id={`line-${node.position?.start.line}`} style={{
                  fontSize: '1.75em',
                  fontWeight: '700',
                  marginTop: '20px',
                  marginBottom: '12px',
                  color: '#32302C',
                  fontFamily: 'Plus Jakarta Sans'
                }} {...props}>
                  {children}
                </h2>
              ),
              h3: ({node, children, ref, key, ...props}) => (
                <h3 id={`line-${node.position?.start.line}`} style={{
                  fontSize: '1.5em',
                  fontWeight: '600',
                  marginTop: '16px',
                  marginBottom: '10px',
                  color: '#32302C',
                  fontFamily: 'Plus Jakarta Sans'
                }} {...props}>
                  {children}
                </h3>
              ),
              h4: ({node, children, ref, key, ...props}) => (
                <h4 id={`line-${node.position?.start.line}`} style={{
                  fontSize: '1.25em',
                  fontWeight: '600',
                  marginTop: '14px',
                  marginBottom: '8px',
                  color: '#32302C',
                  fontFamily: 'Plus Jakarta Sans'
                }} {...props}>
                  {children}
                </h4>
              ),
              h5: ({node, children, ref, key, ...props}) => (
                <h5 id={`line-${node.position?.start.line}`} style={{
                  fontSize: '1.1em',
                  fontWeight: '600',
                  marginTop: '12px',
                  marginBottom: '6px',
                  color: '#32302C',
                  fontFamily: 'Plus Jakarta Sans'
                }} {...props}>
                  {children}
                </h5>
              ),
              h6: ({node, children, ref, key, ...props}) => (
                <h6 id={`line-${node.position?.start.line}`} style={{
                  fontSize: '1em',
                  fontWeight: '600',
                  marginTop: '10px',
                  marginBottom: '6px',
                  color: '#6C6B6E',
                  fontFamily: 'Plus Jakarta Sans'
                }} {...props}>
                  {children}
                </h6>
              ),
              // Paragraphs
              p: ({node, children, ref, key, ...props}) => (
                <p style={{
                  marginBottom: '16px',
                  color: '#32302C',
                  fontFamily: 'Plus Jakarta Sans',
                  lineHeight: '1.8'
                }} {...props}>
                  {children}
                </p>
              ),
              // Code blocks
              code: ({node, inline, className, children, ref, key, ...props}) => {
                return inline ? (
                  <code style={{
                    background: '#F5F5F5',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontFamily: 'monospace',
                    fontSize: '0.9em',
                    color: '#DC2626'
                  }} {...props}>
                    {children}
                  </code>
                ) : (
                  <code style={{
                    display: 'block',
                    background: '#F5F5F5',
                    padding: '16px',
                    borderRadius: '8px',
                    fontFamily: 'monospace',
                    fontSize: '0.9em',
                    overflow: 'auto',
                    border: '1px solid #E6E6EC'
                  }} {...props}>
                    {children}
                  </code>
                );
              },
              // Tables
              table: ({node, children, ref, key, ...props}) => (
                <div style={{ overflow: 'auto', marginBottom: '16px' }}>
                  <table style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    border: '1px solid #E6E6EC',
                    fontSize: '0.95em'
                  }} {...props}>
                    {children}
                  </table>
                </div>
              ),
              th: ({node, children, ref, key, isHeader, ...props}) => (
                <th style={{
                  background: '#F5F5F5',
                  padding: '12px',
                  textAlign: 'left',
                  fontWeight: '600',
                  border: '1px solid #E6E6EC',
                  color: '#32302C',
                  fontFamily: 'Plus Jakarta Sans'
                }} {...props}>
                  {children}
                </th>
              ),
              td: ({node, children, ref, key, isHeader, ...props}) => (
                <td style={{
                  padding: '12px',
                  border: '1px solid #E6E6EC',
                  color: '#32302C',
                  fontFamily: 'Plus Jakarta Sans'
                }} {...props}>
                  {children}
                </td>
              ),
              // Lists
              ul: ({node, children, ref, key, ...props}) => (
                <ul style={{
                  marginBottom: '16px',
                  paddingLeft: '24px',
                  color: '#32302C',
                  fontFamily: 'Plus Jakarta Sans'
                }} {...props}>
                  {children}
                </ul>
              ),
              ol: ({node, children, ref, key, ...props}) => (
                <ol style={{
                  marginBottom: '16px',
                  paddingLeft: '24px',
                  color: '#32302C',
                  fontFamily: 'Plus Jakarta Sans'
                }} {...props}>
                  {children}
                </ol>
              ),
              li: ({node, children, ref, key, ...props}) => (
                <li style={{
                  marginBottom: '8px',
                  lineHeight: '1.8'
                }} {...props}>
                  {children}
                </li>
              ),
              // Blockquotes
              blockquote: ({node, children, ref, key, ...props}) => (
                <blockquote style={{
                  borderLeft: '4px solid #E6E6EC',
                  paddingLeft: '16px',
                  marginLeft: '0',
                  marginBottom: '16px',
                  color: '#6C6B6E',
                  fontStyle: 'italic',
                  fontFamily: 'Plus Jakarta Sans'
                }} {...props}>
                  {children}
                </blockquote>
              ),
              // Links
              a: ({node, children, ref, key, ...props}) => (
                <a style={{
                  color: '#181818',
                  textDecoration: 'underline',
                  fontWeight: '500'
                }} {...props}>
                  {children}
                </a>
              ),
              // Horizontal rules
              hr: ({node, ref, key, ...props}) => (
                <hr style={{
                  border: 'none',
                  borderTop: '2px solid #E6E6EC',
                  marginTop: '24px',
                  marginBottom: '24px'
                }} {...props} />
              ),
              // Images
              img: ({node, ref, key, ...props}) => (
                <img style={{
                  maxWidth: '100%',
                  height: 'auto',
                  borderRadius: '8px',
                  marginTop: '16px',
                  marginBottom: '16px'
                }} {...props} alt={props.alt || ''} />
              )
            }}
          >
            {markdownContent}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
};

export default MarkdownEditor;
