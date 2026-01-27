import React from 'react';
import { spacing, radius, colors, shadows } from '../../design/tokens';

const Card = ({
  children,
  padding = 'lg',  // 'sm', 'md', 'lg', 'xl'
  elevated = true,
  style = {},
  className = '',
  onClick,
  ...props
}) => {
  const paddings = {
    none: '0',
    sm: spacing.sm,
    md: spacing.md,
    lg: spacing.lg,
    xl: spacing.xl
  };

  return (
    <div
      onClick={onClick}
      style={{
        background: colors.neutral[0],
        borderRadius: radius.lg,
        padding: paddings[padding],
        boxShadow: elevated ? shadows.md : shadows.none,
        border: `1px solid ${colors.neutral[200]}`,
        transition: 'box-shadow 0.15s ease-out',
        cursor: onClick ? 'pointer' : 'default',
        ...style
      }}
      className={className}
      {...props}
    >
      {children}
    </div>
  );
};

export default Card;
