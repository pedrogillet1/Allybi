import React, { useState } from 'react';
import { spacing, radius, colors, typography } from '../../design/tokens';

const Chip = ({
  label,
  icon,
  onDelete,
  onClick,
  selected = false,
  style = {},
  ...props
}) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: spacing.sm,
        padding: `${spacing.sm} ${spacing.md}`,
        borderRadius: radius.sm,
        background: selected
          ? colors.primary[100]
          : isHovered
            ? colors.neutral[100]
            : colors.neutral[50],
        border: `1px solid ${selected ? colors.primary[200] : colors.neutral[200]}`,
        cursor: 'pointer',
        transition: 'all 0.15s ease-out',
        fontSize: typography.label.size,
        fontWeight: typography.label.weight,
        fontFamily: typography.label.family,
        color: selected ? colors.primary[700] : colors.neutral[900],
        height: '40px',
        boxSizing: 'border-box',
        ...style
      }}
      {...props}
    >
      {icon && (
        <span style={{ display: 'flex', alignItems: 'center', fontSize: '16px' }}>
          {icon}
        </span>
      )}
      <span style={{
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        maxWidth: '200px'
      }}>
        {label}
      </span>
      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            color: colors.neutral[500],
            fontSize: '14px'
          }}
        >
          ✕
        </button>
      )}
    </div>
  );
};

export default Chip;
