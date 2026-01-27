import React, { useState } from 'react';
import { spacing, radius, colors, typography } from '../../design/tokens';
import { ReactComponent as DotsIcon } from '../../assets/dots.svg';
import CategoryIcon from '../CategoryIcon';

/**
 * CategoryCard - Unified card component for folder/category display
 * Specs:
 * - Min height: 72px
 * - Padding: 10px (inner), 14px (Add New variant)
 * - Border radius: 14px
 * - Icon container: 40x40px with 50% border-radius
 * - Consistent typography and spacing
 */
const CategoryCard = ({
  category,
  onClick,
  onMenuClick,
  onDragOver,
  onDragLeave,
  onDrop,
  isMenuOpen = false,
  menuContent,
  isAddNew = false,
  addIcon,
  style = {},
  ...props
}) => {
  const [isHovered, setIsHovered] = useState(false);

  if (isAddNew) {
    return (
      <div
        onClick={onClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          padding: '14px',
          background: isHovered ? colors.neutral[100] : 'white',
          borderRadius: 14,
          border: `1px solid ${colors.neutral[200]}`,
          display: 'flex',
          alignItems: 'center',
          gap: spacing.sm,
          cursor: 'pointer',
          minHeight: '72px',
          width: '100%',
          boxSizing: 'border-box',
          transition: 'all 0.15s ease-out',
          ...style
        }}
        {...props}
      >
        <div style={{
          width: '40px',
          height: '40px',
          background: colors.neutral[100],
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}>
          {addIcon}
        </div>
        <span style={{
          color: colors.neutral[900],
          fontSize: typography.body.size,
          fontFamily: typography.body.family,
          fontWeight: typography.bodyStrong.weight,
          lineHeight: 1
        }}>
          Add New Smart Category
        </span>
      </div>
    );
  }

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        padding: '10px',
        background: isHovered ? colors.neutral[50] : 'white',
        borderRadius: 14,
        border: `1px solid ${colors.neutral[200]}`,
        display: 'flex',
        alignItems: 'center',
        gap: spacing.sm,
        transition: 'transform 0.2s ease, box-shadow 0.2s ease, background 0.15s ease-out',
        position: 'relative',
        minHeight: '72px',
        width: '100%',
        boxSizing: 'border-box',
        zIndex: isMenuOpen ? 99999 : 1,
        transform: isHovered ? 'translateY(-2px)' : 'translateY(0)',
        ...style
      }}
      {...props}
    >
      {/* Clickable area for navigation */}
      <div
        onClick={onClick}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: spacing.sm,
          flex: 1,
          cursor: 'pointer'
        }}
      >
        {/* Icon Container - Fixed 40x40 */}
        <div style={{
          width: '40px',
          height: '40px',
          background: colors.neutral[100],
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '20px',
          flexShrink: 0
        }}>
          <CategoryIcon emoji={category?.emoji} />
        </div>

        {/* Text content */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          flex: 1,
          overflow: 'hidden'
        }}>
          <div style={{
            color: colors.neutral[900],
            fontSize: typography.body.size,
            fontFamily: typography.body.family,
            fontWeight: typography.bodyStrong.weight,
            lineHeight: '19.60px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}>
            {category?.name}
          </div>
          <div style={{
            color: colors.neutral[500],
            fontSize: typography.body.size,
            fontFamily: typography.body.family,
            fontWeight: typography.body.weight,
            lineHeight: '15.40px'
          }}>
            {category?.fileCount || 0} {category?.fileCount === 1 ? 'File' : 'Files'}
          </div>
        </div>
      </div>

      {/* Menu button */}
      <div style={{ position: 'relative' }} data-category-menu>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onMenuClick?.(e);
          }}
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
            flexShrink: 0,
            transition: 'transform 0.2s ease'
          }}
          onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
        >
          <DotsIcon style={{ width: '24px', height: '24px' }} />
        </button>
        {isMenuOpen && menuContent}
      </div>
    </div>
  );
};

export default CategoryCard;
