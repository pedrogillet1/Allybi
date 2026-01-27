import React from 'react';
import { spacing, radius, colors, typography } from '../../design/tokens';

const Button = ({
  children,
  variant = 'primary',  // 'primary', 'secondary', 'tertiary', 'danger'
  size = 'md',          // 'sm', 'md', 'lg'
  disabled = false,
  onClick,
  style = {},
  className = '',
  type = 'button',
  ...props
}) => {
  const variants = {
    primary: {
      background: colors.primary[600],
      color: colors.neutral[0],
      border: 'none',
      hover: { background: colors.primary[700] }
    },
    secondary: {
      background: colors.neutral[0],
      color: colors.neutral[900],
      border: `1px solid ${colors.neutral[200]}`,
      hover: { background: colors.neutral[50] }
    },
    tertiary: {
      background: 'transparent',
      color: colors.primary[600],
      border: 'none',
      hover: { background: colors.neutral[50] }
    },
    danger: {
      background: colors.error[600],
      color: colors.neutral[0],
      border: 'none',
      hover: { background: colors.error[700] }
    }
  };

  const sizes = {
    sm: {
      padding: `${spacing.sm} ${spacing.md}`,
      fontSize: typography.label.size,
      fontWeight: typography.label.weight,
      height: '32px'
    },
    md: {
      padding: `${spacing.sm} ${spacing.lg}`,
      fontSize: typography.body.size,
      fontWeight: typography.bodyStrong.weight,
      height: '40px'
    },
    lg: {
      padding: `${spacing.md} ${spacing.xl}`,
      fontSize: typography.body.size,
      fontWeight: typography.bodyStrong.weight,
      height: '48px'
    }
  };

  const variant_ = variants[variant];
  const size_ = sizes[size];

  const [isHovered, setIsHovered] = React.useState(false);

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        ...size_,
        background: isHovered && !disabled ? variant_.hover.background : variant_.background,
        color: variant_.color,
        border: variant_.border,
        borderRadius: radius.sm,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'all 0.15s ease-out',
        fontFamily: typography.body.family,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        ...style
      }}
      className={className}
      {...props}
    >
      {children}
    </button>
  );
};

export default Button;
