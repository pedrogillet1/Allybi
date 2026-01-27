import React from 'react';

/**
 * DocumentPreviewButton Component
 * Manus-style compact document preview button that opens preview modal
 * Appears at the START of generated document content
 */
const DocumentPreviewButton = ({ chatDocument, onPreview }) => {
  const {
    title,
    documentType,
    wordCount,
    createdAt,
  } = chatDocument;

  // Get document type icon and color (matching GeneratedDocumentCard)
  const getDocumentTypeInfo = (type) => {
    const types = {
      summary: { icon: '📋', label: 'SUMMARY', color: '#3B82F6' },
      analysis: { icon: '📊', label: 'ANALYSIS', color: '#8B5CF6' },
      deep_dive: { icon: '📖', label: 'DEEP DIVE', color: '#EF4444' },
      report: { icon: '📑', label: 'REPORT', color: '#10B981' },
      presentation: { icon: '🎨', label: 'PRESENTATION', color: '#F59E0B' },
      general: { icon: '📄', label: 'DOCUMENT', color: '#6B7280' },
    };
    return types[type] || types.general;
  };

  const typeInfo = getDocumentTypeInfo(documentType);

  return (
    <div
      onClick={onPreview}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 16px',
        marginTop: 12,
        marginBottom: 16,
        background: 'white',
        border: '2px solid #E6E6EC',
        borderRadius: 12,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        maxWidth: 'fit-content',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = '#FAFAFA';
        e.currentTarget.style.borderColor = '#6366F1';
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(99,102,241,0.15)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'white';
        e.currentTarget.style.borderColor = '#E6E6EC';
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)';
      }}
    >
      {/* Document Icon */}
      <div
        style={{
          width: 40,
          height: 40,
          background: typeInfo.color,
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 18,
          flexShrink: 0,
        }}
      >
        {typeInfo.icon}
      </div>

      {/* Document Info */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        <div
          style={{
            fontSize: 15,
            fontWeight: '700',
            color: '#181818',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: 400,
          }}
        >
          {title}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
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
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            {typeInfo.label}
          </span>
          <span>{wordCount?.toLocaleString()} words</span>
          <span>•</span>
          <span>Generated {new Date(createdAt).toLocaleDateString()}</span>
        </div>
      </div>

      {/* Arrow Icon */}
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#6366F1"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ flexShrink: 0, marginLeft: 8 }}
      >
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </div>
  );
};

export default DocumentPreviewButton;
