import React, { useState } from 'react';
import { spacing, radius, colors, typography } from '../../design/tokens';
import { ReactComponent as DotsIcon } from '../../assets/dots.svg';

/**
 * FileRow - Unified file row component for document lists
 * Specs:
 * - Padding: 12px
 * - Border radius: 12px
 * - Gap: 12px between elements
 * - Icon size: 40x40px
 * - Ellipsis button: 32x32px
 * - Consistent typography
 */
const FileRow = ({
  document,
  icon,
  onClick,
  onMenuClick,
  isMenuOpen = false,
  menuContent,
  isSelected = false,
  isSelectMode = false,
  draggable = true,
  onDragStart,
  onDragEnd,
  style = {},
  ...props
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString();
  };

  // Determine background color based on state
  const getBackgroundColor = () => {
    if (isSelectMode && isSelected) {
      return isHovered ? '#E8E8EC' : '#F3F3F5';
    }
    if (isHovered) {
      return '#F7F7F9';
    }
    return 'white';
  };

  // Determine text color based on state (always dark for light backgrounds)
  const getTextColor = () => {
    return colors.neutral[900];
  };

  const getSubTextColor = () => {
    return colors.neutral[500];
  };

  return (
    <div
      draggable={draggable && !isSelectMode}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: spacing.md,
        padding: spacing.md,
        borderRadius: 100,
        background: getBackgroundColor(),
        cursor: isSelectMode ? 'pointer' : 'grab',
        transition: 'background 0.15s ease-out',
        ...style
      }}
      {...props}
    >
      {/* File icon - Fixed 40x40 */}
      <img
        src={icon}
        alt="File icon"
        style={{
          width: '40px',
          height: '40px',
          aspectRatio: '1/1',
          imageRendering: '-webkit-optimize-contrast',
          objectFit: 'contain',
          shapeRendering: 'geometricPrecision',
          flexShrink: 0,
          filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1))'
        }}
      />

      {/* File info */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <div style={{
          color: getTextColor(),
          fontSize: typography.body.size,
          fontFamily: typography.body.family,
          fontWeight: typography.bodyStrong.weight,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}>
          {document?.filename}
        </div>
        <div style={{
          color: getSubTextColor(),
          fontSize: typography.caption.size,
          fontFamily: typography.caption.family,
          fontWeight: typography.body.weight,
          marginTop: '4px'
        }}>
          {formatBytes(document?.fileSize)} • {formatDate(document?.createdAt)}
        </div>
      </div>

      {/* Ellipsis menu button - only show when not in select mode */}
      {!isSelectMode && (
        <div style={{ position: 'relative' }} data-dropdown>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMenuClick?.(e);
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
            style={{
              width: '32px',
              height: '32px',
              background: 'transparent',
              borderRadius: '50%',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'transform 0.2s ease',
              flexShrink: 0
            }}
          >
            <DotsIcon style={{width: 24, height: 24}} />
          </button>
          {isMenuOpen && menuContent}
        </div>
      )}
    </div>
  );
};

export default FileRow;
