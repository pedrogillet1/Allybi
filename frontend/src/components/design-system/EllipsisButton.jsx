import React, { useState } from 'react';
import { radius, colors } from '../../design/tokens';

const EllipsisButton = ({
  onClick,
  style = {},
  vertical = true,
  ...props
}) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick && onClick(e);
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        width: '32px',
        height: '32px',
        borderRadius: radius.md,
        border: 'none',
        background: isHovered ? colors.neutral[100] : 'transparent',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: colors.neutral[500],
        fontSize: '18px',
        transition: 'all 0.15s ease-out',
        padding: 0,
        flexShrink: 0,
        ...style
      }}
      {...props}
    >
      {vertical ? '⋮' : '⋯'}
    </button>
  );
};

export default EllipsisButton;
