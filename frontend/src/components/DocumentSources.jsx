import React, { useState } from 'react';
import InlineDocumentButton from './InlineDocumentButton';
import { ChevronDown, ChevronUp } from 'lucide-react';

/**
 * ============================================================================
 * DOCUMENT SOURCES - FIXED VERSION
 * ============================================================================
 * 
 * FIXES APPLIED:
 * 1. Source deduplication - each source appears ONLY ONCE
 * 2. Proper "See all X files" button styling
 * 3. Folder display support
 * 4. Uses 'listing' variant for all buttons (large size)
 * 
 * ============================================================================
 */

const DocumentSources = ({ sources, onDocumentClick, folders = [] }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!sources || sources.length === 0) {
    return null;
  }

  // ============================================================================
  // DEDUPLICATION: Remove duplicate sources by documentId
  // ============================================================================
  const uniqueSources = Array.from(
    new Map(
      sources.map(source => [
        source.documentId || source.id || source.filename,
        source
      ])
    ).values()
  );

  console.log(`[DocumentSources] Total sources: ${sources.length}, Unique: ${uniqueSources.length}`);

  // ============================================================================
  // FOLDER DEDUPLICATION
  // ============================================================================
  const uniqueFolders = Array.from(
    new Set(folders.map(f => f.path || f.name))
  ).map(path => folders.find(f => (f.path || f.name) === path));

  const totalItems = uniqueSources.length + uniqueFolders.length;

  // Show first 3 items by default
  const displayLimit = 3;
  const shouldShowSeeAll = totalItems > displayLimit;
  const displayedSources = isExpanded ? uniqueSources : uniqueSources.slice(0, displayLimit);
  const displayedFolders = isExpanded ? uniqueFolders : uniqueFolders.slice(0, Math.max(0, displayLimit - uniqueSources.length));

  return (
    <div className="document-sources-container" style={{
      marginTop: '12px',
      borderTop: '1px solid #E5E7EB',
      paddingTop: '12px'
    }}>
      {/* Sources List */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '8px',
        marginBottom: shouldShowSeeAll ? '8px' : '0'
      }}>
        {/* Folders */}
        {displayedFolders.map((folder, index) => (
          <button
            key={`folder-${index}`}
            onClick={() => {
              if (folder.onClick) folder.onClick();
            }}
            className="folder-button"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '10px',
              padding: '8px 16px',
              margin: '4px 8px 4px 0',
              backgroundColor: '#FEF3C7',
              border: '1px solid #FCD34D',
              borderRadius: '24px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              fontFamily: 'Plus Jakarta Sans, sans-serif',
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#FDE68A';
              e.currentTarget.style.borderColor = '#FBBF24';
              e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#FEF3C7';
              e.currentTarget.style.borderColor = '#FCD34D';
              e.currentTarget.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.05)';
            }}
          >
            {/* Folder Icon */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            
            {/* Folder Name */}
            <span style={{
              fontSize: '15px',
              fontWeight: '600',
              color: '#92400E',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: '220px'
            }}>
              {folder.name || folder.path}
            </span>
          </button>
        ))}

        {/* Documents */}
        {displayedSources.map((source, index) => (
          <InlineDocumentButton
            key={`source-${source.documentId || source.id || index}`}
            document={{
              documentId: source.documentId || source.id,
              documentName: source.documentName || source.filename || source.title,
              filename: source.filename || source.title,
              mimeType: source.mimeType || source.type,
              fileSize: source.fileSize || source.size,
              folderPath: source.folderPath
            }}
            onClick={onDocumentClick}
            variant="listing"
          />
        ))}
      </div>

      {/* See All Button */}
      {shouldShowSeeAll && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="document-sources-button"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 14px',
            backgroundColor: '#FAFAFA',
            border: '1px solid #E5E7EB',
            borderRadius: '20px',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            fontFamily: 'Plus Jakarta Sans, sans-serif',
            fontSize: '14px',
            fontWeight: '500',
            color: '#6B7280'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#F3F4F6';
            e.currentTarget.style.borderColor = '#D1D5DB';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#FAFAFA';
            e.currentTarget.style.borderColor = '#E5E7EB';
          }}
        >
          <span>
            {isExpanded ? 'Show less' : `See all ${totalItems} files`}
          </span>
          {isExpanded ? (
            <ChevronUp size={16} />
          ) : (
            <ChevronDown size={16} />
          )}
        </button>
      )}
    </div>
  );
};

export default DocumentSources;
