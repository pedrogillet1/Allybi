import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import pdfIcon from '../../assets/pdf-icon.png';
import docIcon from '../../assets/doc-icon.png';
import xlsIcon from '../../assets/xls.png';
import pptIcon from '../../assets/pptx.png';
import fileIcon from '../../assets/txt-icon.png'; // Use txt-icon as generic file fallback

/**
 * DocumentCard Component
 * Displays a clickable card for a document with icon, name, and type
 * Used in chat responses when AI provides document access
 */
const DocumentCard = ({ document }) => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  if (!document) return null;

  // Get the appropriate icon based on document type
  const getDocumentIcon = (type) => {
    switch (type) {
      case 'pdf':
        return pdfIcon;
      case 'docx':
      case 'doc':
        return docIcon;
      case 'xlsx':
      case 'xls':
        return xlsIcon;
      case 'pptx':
      case 'ppt':
        return pptIcon;
      default:
        return fileIcon;
    }
  };

  // Get file type display name
  const getFileTypeDisplay = (type) => {
    switch (type) {
      case 'pdf':
        return t('fileTypes.pdfLabel');
      case 'docx':
      case 'doc':
        return t('fileTypes.word');
      case 'xlsx':
      case 'xls':
        return t('fileTypes.excel');
      case 'pptx':
      case 'ppt':
        return t('fileTypes.powerpoint');
      case 'image':
        return t('fileTypes.image');
      case 'text':
        return t('fileTypes.text');
      default:
        return t('fileTypes.file');
    }
  };

  // Handle card click - navigate to document preview
  const handleClick = () => {
    if (document.previewUrl) {
      // Navigate to document viewer
      navigate(`/documents/${document.id}`);
    } else if (document.downloadUrl) {
      // Fallback: open download URL
      window.open(document.downloadUrl, '_blank');
    }
  };

  const icon = getDocumentIcon(document.type);
  const typeDisplay = getFileTypeDisplay(document.type);

  return (
    <div
      onClick={handleClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 16px',
        background: 'white',
        border: '2px solid #E6E6EC',
        borderRadius: '20px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06)',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        marginTop: '8px',
        marginBottom: '8px',
        maxWidth: '400px',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = '#F9FAFB';
        e.currentTarget.style.borderColor = '#D1D5DB';
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.08)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'white';
        e.currentTarget.style.borderColor = '#E6E6EC';
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {/* Document Icon */}
      <div style={{
        width: '40px',
        height: '40px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}>
        <img
          src={icon}
          alt={typeDisplay}
          style={{
            width: '40px',
            height: '40px',
            objectFit: 'contain',
          }}
        />
      </div>

      {/* Document Info */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        minWidth: 0, // Allow text truncation
      }}>
        <div style={{
          fontSize: '14px',
          fontWeight: '600',
          color: '#32302C',
          fontFamily: 'Plus Jakarta Sans',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {document.filename || document.name}
        </div>
        <div style={{
          fontSize: '12px',
          fontWeight: '500',
          color: '#6C6B6E',
          fontFamily: 'Plus Jakarta Sans',
        }}>
          {typeDisplay}
        </div>
      </div>

      {/* Processing Status Badge - HIDDEN: Documents should display normally regardless of status */}
      {/* Users don't need to see processing status - it happens silently in the background */}

      {/* Arrow Icon */}
      <div style={{
        width: '20px',
        height: '20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}>
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M7.5 15L12.5 10L7.5 5"
            stroke="#6C6B6E"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
};

export default DocumentCard;
