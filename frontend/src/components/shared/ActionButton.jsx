import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Folder,
  FileText,
  Download,
  Search,
  List,
  ExternalLink
} from 'lucide-react';

const ActionButton = ({ action }) => {
  const navigate = useNavigate();

  if (!action) return null;

  const handleClick = () => {
    const { action: actionType, documentId, folderId, categoryId } = action;

    switch (actionType) {
      case 'open_document':
        if (documentId) {
          navigate(`/documents/${documentId}`);
        }
        break;

      case 'open_folder':
        if (folderId === 'root') {
          navigate(`/documents`);
        } else if (folderId) {
          navigate(`/documents/folders/${folderId}`);
        }
        break;

      case 'open_category':
        if (categoryId) {
          navigate(`/documents?category=${categoryId}`);
        }
        break;

      case 'download_document':
        if (documentId) {
          window.location.href = `/api/documents/${documentId}/download`;
        }
        break;

      case 'search_in_folder':
        if (folderId) {
          navigate(`/documents/folders/${folderId}?search=true`);
        }
        break;

      case 'list_documents':
        navigate('/documents');
        break;

      default:
        console.warn('Unknown action type:', actionType);
    }
  };

  const getIcon = () => {
    const iconClass = 'w-4 h-4';

    switch (action.action) {
      case 'open_document':
        return <FileText className={iconClass} />;
      case 'open_folder':
        return <Folder className={iconClass} />;
      case 'open_category':
        return <Folder className={iconClass} />;
      case 'download_document':
        return <Download className={iconClass} />;
      case 'search_in_folder':
        return <Search className={iconClass} />;
      case 'list_documents':
        return <List className={iconClass} />;
      default:
        return <ExternalLink className={iconClass} />;
    }
  };

  const getVariantClasses = () => {
    const variant = action.variant || 'primary';

    const variants = {
      primary: 'bg-blue-600 text-white hover:bg-blue-700 border-blue-600',
      secondary: 'bg-gray-600 text-white hover:bg-gray-700 border-gray-600',
      outline: 'bg-white text-gray-700 hover:bg-gray-50 border-gray-300',
      success: 'bg-green-600 text-white hover:bg-green-700 border-green-600',
      danger: 'bg-red-600 text-white hover:bg-red-700 border-red-600'
    };

    return variants[variant] || variants.primary;
  };

  return (
    <button
      onClick={handleClick}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-md border font-medium text-sm transition-colors ${getVariantClasses()}`}
    >
      {action.icon && <span>{action.icon}</span>}
      {!action.icon && getIcon()}
      <span>{action.label}</span>
    </button>
  );
};

// ActionButtonGroup component for multiple buttons
export const ActionButtonGroup = ({ actions = [] }) => {
  if (!actions || actions.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2 mt-4">
      {actions.map((action, index) => (
        <ActionButton key={index} action={action} />
      ))}
    </div>
  );
};

export default ActionButton;
