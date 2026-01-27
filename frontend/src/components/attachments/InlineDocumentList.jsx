import React, { useState, useMemo } from 'react';
import InlineDocumentButton from './InlineDocumentButton';

/**
 * InlineDocumentList Component
 *
 * Displays inline documents with:
 * - Organization by file type (format)
 * - Limit to 10 visible documents
 * - Expandable dropdown to show more
 */

const VISIBLE_LIMIT = 10;

// Get file extension category for grouping
const getFileCategory = (filename, mimeType) => {
  const ext = filename?.split('.').pop()?.toLowerCase() || '';

  // Categorize by extension or mimeType
  if (['pdf'].includes(ext) || mimeType?.includes('pdf')) return { category: 'PDF', order: 1 };
  if (['doc', 'docx'].includes(ext) || mimeType?.includes('word')) return { category: 'Word', order: 2 };
  if (['xls', 'xlsx'].includes(ext) || mimeType?.includes('spreadsheet') || mimeType?.includes('excel')) return { category: 'Excel', order: 3 };
  if (['ppt', 'pptx'].includes(ext) || mimeType?.includes('presentation')) return { category: 'PowerPoint', order: 4 };
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext) || mimeType?.startsWith('image/')) return { category: 'Image', order: 5 };
  if (['txt', 'md', 'rtf'].includes(ext) || mimeType?.includes('text')) return { category: 'Text', order: 6 };
  return { category: 'Other', order: 99 };
};

const InlineDocumentList = ({ documents, onDocumentClick }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Organize documents by file type, then alphabetically by name
  const organizedDocuments = useMemo(() => {
    if (!documents || documents.length === 0) return [];

    // Add category info and sort
    const docsWithCategory = documents.map(doc => ({
      ...doc,
      ...getFileCategory(doc.filename, doc.mimeType)
    }));

    // Sort by category order, then alphabetically by filename
    return docsWithCategory.sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return (a.filename || '').localeCompare(b.filename || '');
    });
  }, [documents]);

  const visibleDocs = isExpanded
    ? organizedDocuments
    : organizedDocuments.slice(0, VISIBLE_LIMIT);

  const hiddenCount = organizedDocuments.length - VISIBLE_LIMIT;
  const hasMore = hiddenCount > 0;

  if (organizedDocuments.length === 0) return null;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      marginTop: '8px',
      marginBottom: '8px'
    }}>
      {/* Document buttons - flex wrap for multiple per row */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '4px',
        alignItems: 'flex-start'
      }}>
        {visibleDocs.map((doc, idx) => (
          <InlineDocumentButton
            key={`doc-${idx}-${doc.documentId}`}
            document={doc}
            onClick={onDocumentClick}
          />
        ))}
      </div>

      {/* Expand/Collapse button */}
      {hasMore && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            backgroundColor: 'transparent',
            border: '1px solid #E5E7EB',
            borderRadius: '16px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '500',
            color: '#6B7280',
            transition: 'all 0.2s ease',
            alignSelf: 'flex-start',
            fontFamily: 'inherit'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#F3F4F6';
            e.currentTarget.style.color = '#374151';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = '#6B7280';
          }}
        >
          {isExpanded ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="18 15 12 9 6 15"></polyline>
              </svg>
              Show less
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
              Show {hiddenCount} more document{hiddenCount !== 1 ? 's' : ''}
            </>
          )}
        </button>
      )}
    </div>
  );
};

export default InlineDocumentList;
