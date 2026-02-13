import React from 'react';
import closeIcon from '../../assets/x-close.svg';
import { colors, spacing, radius, typography, transitions } from '../../constants/designTokens';

/**
 * Canonical Button Component
 * Replaces all 50+ button implementations with consistent styling
 *
 * @param {string} variant - Button style: 'primary' | 'secondary' | 'danger' | 'ghost' | 'close' | 'link'
 * @param {string} size - Button size: 'sm' | 'md' | 'lg'
 * @param {boolean} disabled - Whether button is disabled
 * @param {React.ReactNode} icon - Icon element to display
 * @param {string} iconPosition - Icon position: 'left' | 'right'
 * @param {React.ReactNode} children - Button text content
 * @param {function} onClick - Click handler
 * @param {boolean} fullWidth - Whether button takes full width
 * @param {string} type - Button type: 'button' | 'submit' | 'reset'
 */
export default function Button({
  variant = 'primary',
  size = 'md',
  disabled = false,
  icon,
  iconPosition = 'left',
  children,
  onClick,
  fullWidth = false,
  type = 'button',
  className = '',
  style: customStyle = {},
  ...props
}) {
  const variants = {
    primary: {
      background: colors.primary,
      color: colors.white,
      hover: colors.primaryDark,
      border: 'none',
    },
    secondary: {
      background: colors.gray[400],
      color: colors.gray[900],
      hover: colors.gray[200],
      border: `1px solid ${colors.gray[300]}`,
    },
    danger: {
      background: colors.error,
      color: colors.white,
      hover: '#B82415',
      border: 'none',
    },
    ghost: {
      background: 'transparent',
      color: colors.gray[900],
      hover: colors.gray[100],
      border: `1px solid ${colors.gray[300]}`,
    },
    close: {
      background: 'transparent',
      color: colors.gray[600],
      hover: colors.gray[100],
      border: 'none',
    },
    link: {
      background: 'transparent',
      color: colors.primary,
      hover: 'transparent',
      border: 'none',
    },
  };

  const sizes = {
    sm: {
      padding: `${spacing.sm}px ${spacing.md}px`,
      fontSize: typography.sizes.xs,
      height: 32,
    },
    md: {
      padding: `${spacing.md}px ${spacing.lg}px`,
      fontSize: typography.sizes.sm,
      height: 40,
    },
    lg: {
      padding: `${spacing.lg}px ${spacing.xl}px`,
      fontSize: typography.sizes.md,
      height: 48,
    },
  };

  const variantStyle = variants[variant] || variants.primary;
  const sizeStyle = sizes[size] || sizes.md;

  const isCloseButton = variant === 'close';
  const isLinkButton = variant === 'link';

  const baseStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: isCloseButton ? spacing.sm : sizeStyle.padding,
    width: isCloseButton ? 30 : fullWidth ? '100%' : undefined,
    height: isCloseButton ? 30 : sizeStyle.height,
    background: variantStyle.background,
    color: variantStyle.color,
    border: variantStyle.border,
    borderRadius: isCloseButton ? radius.md : radius.md,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: isCloseButton ? 20 : sizeStyle.fontSize,
    fontFamily: typography.fontFamily,
    fontWeight: isLinkButton ? typography.weights.medium : typography.weights.semibold,
    transition: transitions.normal,
    opacity: disabled ? 0.5 : 1,
    textDecoration: isLinkButton ? 'underline' : 'none',
    lineHeight: 1,
    ...customStyle,
  };

  const handleMouseEnter = (e) => {
    if (!disabled) {
      e.currentTarget.style.background = variantStyle.hover;
      if (isLinkButton) {
        e.currentTarget.style.textDecoration = 'none';
      }
    }
  };

  const handleMouseLeave = (e) => {
    e.currentTarget.style.background = variantStyle.background;
    if (isLinkButton) {
      e.currentTarget.style.textDecoration = 'underline';
    }
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={className}
      style={baseStyle}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      {...props}
    >
      {icon && iconPosition === 'left' && <span style={{ display: 'flex', alignItems: 'center' }}>{icon}</span>}
      {children && !isCloseButton && <span>{children}</span>}
      {isCloseButton && !children && (
        <img
          src={closeIcon}
          alt=""
          style={{ width: 14, height: 14 }}
        />
      )}
      {icon && iconPosition === 'right' && <span style={{ display: 'flex', alignItems: 'center' }}>{icon}</span>}
    </button>
  );
}

// Convenience exports for common button types
export const ButtonPrimary = (props) => <Button variant="primary" {...props} />;
export const ButtonSecondary = (props) => <Button variant="secondary" {...props} />;
export const ButtonDanger = (props) => <Button variant="danger" {...props} />;
export const ButtonGhost = (props) => <Button variant="ghost" {...props} />;
export const ButtonClose = (props) => <Button variant="close" {...props} />;
export const ButtonLink = (props) => <Button variant="link" {...props} />;
