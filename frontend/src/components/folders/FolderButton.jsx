import React from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * FolderButton Component
 *
 * Displays a clickable folder button that navigates to folder view
 * Similar styling to InlineDocumentButton but with folder icon and blue theme
 */

const FolderButton = ({ folder, onClick, style = {} }) => {
  const navigate = useNavigate();

  const {
    folderId,
    folderName,
    fileCount,
    folderPath
  } = folder;

  const handleClick = () => {
    if (onClick) {
      // Custom onClick handler
      onClick(folder);
    } else {
      // Default: Navigate to folder view
      navigate(`/folders/${folderId}`);
    }
  };

  return (
    <button
      onClick={handleClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '10px',
        padding: '8px 16px',
        marginTop: '4px',
        marginBottom: '4px',
        marginRight: '8px',
        backgroundColor: '#EFF6FF',  // Light blue background
        border: '1px solid #DBEAFE',  // Light blue border
        borderRadius: '24px',  // Pill-shaped
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        fontFamily: 'inherit',
        textAlign: 'left',
        boxSizing: 'border-box',
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
        ...style
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = '#DBEAFE';
        e.currentTarget.style.borderColor = '#BFDBFE';
        e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = '#EFF6FF';
        e.currentTarget.style.borderColor = '#DBEAFE';
        e.currentTarget.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.05)';
      }}
    >
      {/* Folder Icon (inline SVG) */}
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          flexShrink: 0
        }}
      >
        <path
          d="M3 8V18C3 19.1046 3.89543 20 5 20H19C20.1046 20 21 19.1046 21 18V8C21 6.89543 20.1046 6 19 6H11L9 4H5C3.89543 4 3 4.89543 3 6V8Z"
          fill="#3B82F6"
          stroke="#2563EB"
          strokeWidth="1.5"
        />
      </svg>

      {/* Folder Name - Bold */}
      <span style={{
        fontSize: '14px',
        fontWeight: '600',
        color: '#1E40AF',  // Blue text
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        maxWidth: '220px'
      }}>
        {folderName}
      </span>

      {/* File Count Badge (Optional) */}
      {fileCount !== undefined && fileCount > 0 && (
        <span style={{
          fontSize: '12px',
          fontWeight: '500',
          color: '#6B7280',
          backgroundColor: '#F3F4F6',
          padding: '2px 8px',
          borderRadius: '12px',
          marginLeft: 'auto'
        }}>
          {fileCount}
        </span>
      )}
    </button>
  );
};

export default FolderButton;
