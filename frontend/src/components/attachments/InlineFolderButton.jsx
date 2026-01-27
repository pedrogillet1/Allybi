import React from 'react';

/**
 * InlineFolderButton Component
 *
 * Compact folder citation button - shows folder icon and bold name
 * Yellow/amber color scheme to differentiate from document buttons
 *
 * Supports two variants:
 * - 'default': Standard size for standalone display
 * - 'inline': Smaller size for inline display within text
 */

const InlineFolderButton = ({ folder, onClick, variant = 'default', style = {} }) => {
  const {
    folderId,
    folderName,
    fileCount,
    folderPath,
  } = folder;

  const displayName = folderName || 'Folder';
  const isInline = variant === 'inline';

  const handleClick = () => {
    if (onClick) {
      onClick({
        id: folderId,
        folderId,
        folderName: displayName,
        fileCount,
        folderPath
      });
    }
  };

  // Folder SVG icon (embedded to avoid asset dependencies)
  const FolderIcon = () => (
    <svg
      width={isInline ? "14" : "24"}
      height={isInline ? "14" : "24"}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0 }}
    >
      <path
        d="M3 6C3 4.89543 3.89543 4 5 4H9L11 6H19C20.1046 6 21 6.89543 21 8V18C21 19.1046 20.1046 20 19 20H5C3.89543 20 3 19.1046 3 18V6Z"
        fill="#F59E0B"
        stroke="#D97706"
        strokeWidth="1.5"
      />
    </svg>
  );

  return (
    <button
      onClick={handleClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: isInline ? '6px' : '10px',
        padding: isInline ? '2px 8px' : '8px 16px',
        marginTop: isInline ? '0' : '4px',
        marginBottom: isInline ? '0' : '4px',
        marginRight: isInline ? '4px' : '8px',
        marginLeft: isInline ? '2px' : '0',
        backgroundColor: '#FEF3C7',  // Light amber/yellow background
        border: '1px solid #FCD34D',
        borderRadius: isInline ? '12px' : '24px',
        verticalAlign: isInline ? 'middle' : 'baseline',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        fontFamily: 'inherit',
        textAlign: 'left',
        boxSizing: 'border-box',
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
        ...style
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
      <FolderIcon />

      {/* Folder Name - Bold, dark amber text */}
      <span style={{
        fontSize: isInline ? '13px' : '15px',
        fontWeight: '600',
        color: '#92400E',  // Dark amber text
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        maxWidth: isInline ? '150px' : '220px',
        lineHeight: isInline ? '1.5' : 'normal'
      }}>
        {displayName}
      </span>

      {/* Optional file count badge */}
      {fileCount > 0 && !isInline && (
        <span style={{
          fontSize: '12px',
          fontWeight: '500',
          color: '#B45309',
          backgroundColor: '#FDE68A',
          padding: '2px 6px',
          borderRadius: '10px',
          marginLeft: '4px'
        }}>
          {fileCount}
        </span>
      )}
    </button>
  );
};

export default InlineFolderButton;
