import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotifications } from '../context/NotificationsStore';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkEmoji from 'remark-emoji';
import './chat/MarkdownStyles.css';

/**
 * GeneratedDocumentCard Component
 * Displays AI-generated documents in chat with download options (like Manus)
 */
const GeneratedDocumentCard = ({ chatDocument }) => {
  const { t } = useTranslation();
  const { showError } = useNotifications();
  const [isExpanded, setIsExpanded] = useState(true);
  const [copyStatus, setCopyStatus] = useState({ copied: false, format: null });
  const [isDownloading, setIsDownloading] = useState(false);

  const {
    id,
    title,
    markdownContent,
    documentType,
    wordCount,
    createdAt,
  } = chatDocument;

  // Get document type icon and color
  const getDocumentTypeInfo = (type) => {
    const types = {
      summary: { icon: '📋', label: t('generatedDocument.summary'), color: '#3B82F6' },
      analysis: { icon: '📊', label: t('generatedDocument.analysis'), color: '#8B5CF6' },
      deep_dive: { icon: '📖', label: t('generatedDocument.deepDive'), color: '#EF4444' },
      report: { icon: '📑', label: t('generatedDocument.report'), color: '#10B981' },
      general: { icon: '📄', label: t('generatedDocument.document'), color: '#6B7280' },
    };
    return types[type] || types.general;
  };

  const typeInfo = getDocumentTypeInfo(documentType);

  // Handle copy to clipboard
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(markdownContent);
      setCopyStatus({ copied: true, format: 'markdown' });
      setTimeout(() => setCopyStatus({ copied: false, format: null }), 2000);
    } catch (error) {
    }
  };

  // Handle download in different formats
  const handleDownload = async (format) => {
    try {
      setIsDownloading(true);
      const token = localStorage.getItem('accessToken');

      const response = await fetch(
        `${process.env.REACT_APP_API_URL}/api/chat-documents/${id}/export/${format}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Export failed');
      }

      // Get the blob and create download link
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title.replace(/[^a-z0-9]/gi, '_')}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setIsDownloading(false);
    } catch (error) {
      showError(t('alerts.failedToDownload'));
      setIsDownloading(false);
    }
  };

  return (
    <div
      style={{
        width: '100%',
        marginTop: 12,
        background: 'white',
        borderRadius: 16,
        border: '2px solid #E6E6EC',
        overflow: 'hidden',
        boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px 20px',
          background: 'linear-gradient(135deg, #FAFAFA 0%, #F5F5F5 100%)',
          borderBottom: '1px solid #E6E6EC',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
          {/* Document Type Icon */}
          <div
            style={{
              width: 40,
              height: 40,
              background: typeInfo.color,
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
              flexShrink: 0,
            }}
          >
            {typeInfo.icon}
          </div>

          {/* Title and Metadata */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 16,
                fontWeight: '700',
                color: '#181818',
                marginBottom: 4,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {title}
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                fontSize: 12,
                color: '#6B7280',
              }}
            >
              <span
                style={{
                  padding: '2px 8px',
                  background: typeInfo.color,
                  color: 'white',
                  borderRadius: 6,
                  fontWeight: '600',
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                {typeInfo.label}
              </span>
              <span>{wordCount?.toLocaleString()} {t('generatedDocument.words')}</span>
              <span>•</span>
              <span>{t('generatedDocument.generated')} {new Date(createdAt).toLocaleDateString()}</span>
            </div>
          </div>

          {/* Expand/Collapse Button */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            style={{
              padding: 8,
              background: 'white',
              border: '1px solid #E6E6EC',
              borderRadius: 8,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#6B7280',
              transition: 'all 0.2s',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#F5F5F5')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'white')}
            title={isExpanded ? t('generatedDocument.collapse') : t('generatedDocument.expand')}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s',
              }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      {isExpanded && (
        <>
          <div
            className="markdown-preview-container"
            style={{
              padding: '24px 28px',
              maxHeight: '600px',
              overflowY: 'auto',
              background: 'white',
            }}
          >
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkEmoji]}
              components={{
                // Custom components for better styling
                h1: ({ node, children, ...props }) => (
                  <h1 className="markdown-h1" {...props}>
                    {children}
                  </h1>
                ),
                h2: ({ node, children, ...props }) => (
                  <h2 className="markdown-h2" {...props}>
                    {children}
                  </h2>
                ),
                h3: ({ node, children, ...props }) => (
                  <h3 className="markdown-h3" {...props}>
                    {children}
                  </h3>
                ),
                p: ({ node, children, ...props }) => (
                  <p className="markdown-paragraph" {...props}>
                    {children}
                  </p>
                ),
                code: ({ node, inline, className, children, ...props }) => {
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
                table: ({ node, children, ...props }) => (
                  <div className="table-wrapper">
                    <table className="markdown-table" {...props}>
                      {children}
                    </table>
                  </div>
                ),
                blockquote: ({ node, children, ...props }) => (
                  <blockquote className="markdown-blockquote" {...props}>
                    {children}
                  </blockquote>
                ),
              }}
            >
              {markdownContent}
            </ReactMarkdown>
          </div>

          {/* Footer with Actions */}
          <div
            style={{
              padding: '16px 20px',
              background: '#FAFAFA',
              borderTop: '1px solid #E6E6EC',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', gap: 8 }}>
              {/* Copy Button */}
              <button
                onClick={handleCopy}
                disabled={copyStatus.copied}
                style={{
                  padding: '8px 14px',
                  background: copyStatus.copied ? '#10B981' : 'white',
                  color: copyStatus.copied ? 'white' : '#181818',
                  border: copyStatus.copied ? '1px solid #10B981' : '1px solid #E6E6EC',
                  borderRadius: 10,
                  cursor: copyStatus.copied ? 'default' : 'pointer',
                  fontSize: 13,
                  fontWeight: '600',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  if (!copyStatus.copied) e.currentTarget.style.background = '#F5F5F5';
                }}
                onMouseLeave={(e) => {
                  if (!copyStatus.copied) e.currentTarget.style.background = 'white';
                }}
              >
                {copyStatus.copied ? (
                  <>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    {t('generatedDocument.copied')}
                  </>
                ) : (
                  <>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    {t('messageActions.copy')}
                  </>
                )}
              </button>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              {/* Download Buttons */}
              <button
                onClick={() => handleDownload('md')}
                disabled={isDownloading}
                style={{
                  padding: '8px 14px',
                  background: 'white',
                  color: '#181818',
                  border: '1px solid #E6E6EC',
                  borderRadius: 10,
                  cursor: isDownloading ? 'not-allowed' : 'pointer',
                  fontSize: 13,
                  fontWeight: '600',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'all 0.2s',
                  opacity: isDownloading ? 0.5 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!isDownloading) e.currentTarget.style.background = '#F5F5F5';
                }}
                onMouseLeave={(e) => {
                  if (!isDownloading) e.currentTarget.style.background = 'white';
                }}
                title={t('generatedDocument.downloadMarkdown')}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                MD
              </button>

              <button
                onClick={() => handleDownload('pdf')}
                disabled={isDownloading}
                style={{
                  padding: '8px 14px',
                  background: 'white',
                  color: '#181818',
                  border: '1px solid #E6E6EC',
                  borderRadius: 10,
                  cursor: isDownloading ? 'not-allowed' : 'pointer',
                  fontSize: 13,
                  fontWeight: '600',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'all 0.2s',
                  opacity: isDownloading ? 0.5 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!isDownloading) e.currentTarget.style.background = '#F5F5F5';
                }}
                onMouseLeave={(e) => {
                  if (!isDownloading) e.currentTarget.style.background = 'white';
                }}
                title={t('generatedDocument.downloadPdf')}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                PDF
              </button>

              <button
                onClick={() => handleDownload('docx')}
                disabled={isDownloading}
                style={{
                  padding: '8px 14px',
                  background: 'rgba(24, 24, 24, 0.90)',
                  color: 'white',
                  border: '1px solid #181818',
                  borderRadius: 10,
                  cursor: isDownloading ? 'not-allowed' : 'pointer',
                  fontSize: 13,
                  fontWeight: '600',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'all 0.2s',
                  opacity: isDownloading ? 0.5 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!isDownloading) e.currentTarget.style.background = '#323232';
                }}
                onMouseLeave={(e) => {
                  if (!isDownloading) e.currentTarget.style.background = 'rgba(24, 24, 24, 0.90)';
                }}
                title={t('generatedDocument.downloadDocx')}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                DOCX
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default GeneratedDocumentCard;
