import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ReactComponent as ChevronRight } from '../assets/chevron-right-black.svg';
import pdfIcon from '../assets/pdf-icon.png';
import docIcon from '../assets/doc-icon.png';
import txtIcon from '../assets/txt-icon.png';
import xlsIcon from '../assets/xls.png';
import jpgIcon from '../assets/jpg-icon.png';
import pngIcon from '../assets/png-icon.png';
import pptxIcon from '../assets/pptx.png';
import movIcon from '../assets/mov.png';
import mp4Icon from '../assets/mp4.png';
import mp3Icon from '../assets/mp3.svg';
import folderIcon from '../assets/folder_icon.svg';

/**
 * FolderTreeView Component
 *
 * Displays files from a folder upload in a collapsible tree structure with:
 * - Progressive disclosure (collapsed by default)
 * - Breadcrumb navigation
 * - Item count badges on folders
 * - Alphabetical sorting
 */

// Get file icon based on extension
const getFileIcon = (filename) => {
  if (!filename) return docIcon;
  const ext = filename.split('.').pop()?.toLowerCase();

  const iconMap = {
    pdf: pdfIcon,
    doc: docIcon,
    docx: docIcon,
    txt: txtIcon,
    xls: xlsIcon,
    xlsx: xlsIcon,
    csv: xlsIcon,
    jpg: jpgIcon,
    jpeg: jpgIcon,
    png: pngIcon,
    gif: pngIcon,
    webp: pngIcon,
    ppt: pptxIcon,
    pptx: pptxIcon,
    mov: movIcon,
    mp4: mp4Icon,
    mp3: mp3Icon,
    wav: mp3Icon
  };

  return iconMap[ext] || docIcon;
};

// Format file size
const formatFileSize = (bytes) => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

// Build tree structure from flat file list with webkitRelativePath
const buildTreeFromFiles = (files, rootFolderName) => {
  const root = {
    name: rootFolderName,
    type: 'folder',
    children: {},
    fileCount: 0
  };

  files.forEach(file => {
    // Skip invalid files
    if (!file) return;

    // webkitRelativePath format: "FolderName/subfolder/file.txt"
    const relativePath = file.webkitRelativePath || file.name || '';

    // Skip if we don't have a valid path
    if (!relativePath) return;

    const parts = relativePath.split('/');

    // Skip the root folder name if it's the first part
    const startIndex = parts[0] === rootFolderName ? 1 : 0;

    let current = root;

    for (let i = startIndex; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;

      if (isFile) {
        // It's a file
        current.children[part] = {
          name: part,
          type: 'file',
          file: file,
          size: file.size
        };
        // Increment file count up the tree
        let parent = root;
        for (let j = startIndex; j < i; j++) {
          parent.fileCount++;
          parent = parent.children[parts[j]];
        }
        current.fileCount++;
      } else {
        // It's a folder
        if (!current.children[part]) {
          current.children[part] = {
            name: part,
            type: 'folder',
            children: {},
            fileCount: 0
          };
        }
        current = current.children[part];
      }
    }
  });

  // Calculate total file count for root
  const countFiles = (node) => {
    if (node.type === 'file') return 1;
    let count = 0;
    Object.values(node.children).forEach(child => {
      count += countFiles(child);
    });
    node.fileCount = count;
    return count;
  };
  countFiles(root);

  return root;
};

// Sort items: folders first, then alphabetically
const sortItems = (items) => {
  return [...items].sort((a, b) => {
    // Folders first
    if (a.type === 'folder' && b.type !== 'folder') return -1;
    if (a.type !== 'folder' && b.type === 'folder') return 1;
    // Then alphabetically
    return a.name.localeCompare(b.name);
  });
};

// TreeItem component for recursive rendering
const TreeItem = ({ item, depth = 0, onFileClick }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const isFolder = item.type === 'folder';
  const children = isFolder ? sortItems(Object.values(item.children)) : [];

  return (
    <div>
      <div
        onClick={() => {
          if (isFolder) {
            setIsExpanded(!isExpanded);
          } else if (onFileClick) {
            onFileClick(item.file);
          }
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          paddingLeft: 12 + (depth * 20),
          cursor: 'pointer',
          borderRadius: 6,
          transition: 'background 0.15s',
          background: 'transparent'
        }}
        onMouseEnter={(e) => e.currentTarget.style.background = '#F5F5F5'}
        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
      >
        {/* Chevron for folders */}
        {isFolder && (
          <div
            style={{
              width: 16,
              height: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'transform 0.2s',
              transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
              flexShrink: 0
            }}
          >
            <ChevronRight style={{ width: 14, height: 14 }} />
          </div>
        )}

        {/* Spacer for files to align with folder names */}
        {!isFolder && <div style={{ width: 16, flexShrink: 0 }} />}

        {/* Icon */}
        <img
          src={isFolder ? folderIcon : getFileIcon(item.name)}
          alt={isFolder ? 'Folder' : 'File'}
          style={{
            width: 20,
            height: 20,
            objectFit: 'contain',
            flexShrink: 0
          }}
        />

        {/* Name */}
        <span
          style={{
            fontSize: 13,
            fontWeight: isFolder ? '600' : '400',
            color: '#32302C',
            fontFamily: 'Plus Jakarta Sans',
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
        >
          {item.name}
        </span>

        {/* File count badge for folders */}
        {isFolder && item.fileCount > 0 && (
          <span
            style={{
              fontSize: 11,
              fontWeight: '600',
              color: '#6B7280',
              background: '#F3F4F6',
              padding: '2px 8px',
              borderRadius: 10,
              fontFamily: 'Plus Jakarta Sans',
              flexShrink: 0
            }}
          >
            {item.fileCount}
          </span>
        )}

        {/* File size for files */}
        {!isFolder && item.size && (
          <span
            style={{
              fontSize: 11,
              color: '#9CA3AF',
              fontFamily: 'Plus Jakarta Sans',
              flexShrink: 0
            }}
          >
            {formatFileSize(item.size)}
          </span>
        )}
      </div>

      {/* Children (expanded) */}
      {isFolder && isExpanded && children.length > 0 && (
        <div>
          {children.map((child, index) => (
            <TreeItem
              key={`${child.name}-${index}`}
              item={child}
              depth={depth + 1}
              onFileClick={onFileClick}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// Breadcrumb navigation component
const Breadcrumb = ({ path, onNavigate }) => {
  const parts = (path || '').split('/').filter(Boolean);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '8px 12px',
        borderBottom: '1px solid #E5E7EB',
        flexWrap: 'wrap'
      }}
    >
      {parts.map((part, index) => (
        <React.Fragment key={index}>
          {index > 0 && (
            <ChevronRight style={{ width: 12, height: 12, color: '#9CA3AF' }} />
          )}
          <span
            onClick={() => onNavigate(parts.slice(0, index + 1).join('/'))}
            style={{
              fontSize: 12,
              fontWeight: index === parts.length - 1 ? '600' : '400',
              color: index === parts.length - 1 ? '#32302C' : '#6B7280',
              fontFamily: 'Plus Jakarta Sans',
              cursor: index < parts.length - 1 ? 'pointer' : 'default',
              textDecoration: index < parts.length - 1 ? 'underline' : 'none'
            }}
          >
            {part}
          </span>
        </React.Fragment>
      ))}
    </div>
  );
};

// Main FolderTreeView component
const FolderTreeView = ({
  files,
  folderName,
  isExpanded: externalIsExpanded,
  onToggle,
  onFileClick,
  maxHeight = 300
}) => {
  const { t } = useTranslation();
  const [internalIsExpanded, setInternalIsExpanded] = useState(false);

  // Use external control if provided, otherwise internal state
  const isExpanded = externalIsExpanded !== undefined ? externalIsExpanded : internalIsExpanded;
  const toggleExpand = onToggle || (() => setInternalIsExpanded(!internalIsExpanded));

  // Build tree structure
  const tree = useMemo(() => {
    if (!files || !Array.isArray(files) || files.length === 0) return null;
    if (!folderName) return null;
    return buildTreeFromFiles(files, folderName);
  }, [files, folderName]);

  if (!tree) return null;

  const sortedChildren = sortItems(Object.values(tree.children));

  return (
    <div style={{ width: '100%' }}>
      {/* Toggle button */}
      <div
        onClick={toggleExpand}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 0',
          cursor: 'pointer',
          userSelect: 'none'
        }}
      >
        <div
          style={{
            width: 20,
            height: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'transform 0.2s',
            transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)'
          }}
        >
          <ChevronRight style={{ width: 16, height: 16 }} />
        </div>
        <span
          style={{
            fontSize: 13,
            fontWeight: '500',
            color: '#6B7280',
            fontFamily: 'Plus Jakarta Sans'
          }}
        >
          {isExpanded ? t('folder.hideContents') : t('folder.showContents')}
        </span>
        <span
          style={{
            fontSize: 12,
            color: '#9CA3AF',
            fontFamily: 'Plus Jakarta Sans'
          }}
        >
          ({t('folder.fileCount', { count: tree.fileCount })})
        </span>
      </div>

      {/* Tree content */}
      {isExpanded && (
        <div
          style={{
            border: '1px solid #E5E7EB',
            borderRadius: 8,
            background: '#FAFAFA',
            maxHeight: maxHeight,
            overflowY: 'auto',
            marginTop: 8
          }}
        >
          {/* Breadcrumb showing folder name */}
          <Breadcrumb path={folderName} onNavigate={() => {}} />

          {/* Tree items */}
          <div style={{ padding: '4px 0' }}>
            {sortedChildren.map((child, index) => (
              <TreeItem
                key={`${child.name}-${index}`}
                item={child}
                depth={0}
                onFileClick={onFileClick}
              />
            ))}
          </div>

          {sortedChildren.length === 0 && (
            <div
              style={{
                padding: 16,
                textAlign: 'center',
                color: '#9CA3AF',
                fontSize: 13,
                fontFamily: 'Plus Jakarta Sans'
              }}
            >
              No files in this folder
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FolderTreeView;
