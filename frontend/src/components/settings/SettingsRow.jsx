import React, { useState } from 'react';
import chevronLeftIcon from '../../assets/chevron-left.svg';
import profileUserIcon from '../../assets/profile-user-icon.svg';

/**
 * SettingsRow - Reusable row component for Settings page
 *
 * @param {Object} props
 * @param {ReactNode} props.icon - Icon element (use SettingsIcon wrapper)
 * @param {string} props.title - Row title
 * @param {string} props.description - Row description
 * @param {ReactNode} props.rightElement - Right side element (button, dropdown, status pill)
 * @param {string} props.variant - "navigation" | "action" | "selector" | "info"
 * @param {function} props.onClick - Click handler (makes row clickable)
 * @param {string} props.href - Navigation href (alternative to onClick)
 * @param {boolean} props.showChevron - Force show/hide chevron (default: auto based on variant)
 * @param {string} props.hoverColor - Custom hover background color
 * @param {Object} props.style - Additional styles to merge
 */
const SettingsRow = ({
  icon,
  title,
  description,
  rightElement,
  variant = 'navigation',
  onClick,
  href,
  showChevron,
  hoverColor = '#F5F5F5',
  style = {}
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const isClickable = onClick || href;

  // Auto-determine if chevron should show
  const shouldShowChevron = showChevron !== undefined
    ? showChevron
    : (variant === 'navigation' && isClickable);

  const handleClick = () => {
    if (onClick) onClick();
    if (href) window.location.href = href;
  };

  const containerStyle = {
    alignSelf: 'stretch',
    minHeight: 74,
    padding: '18px',
    background: isHovered && isClickable ? hoverColor : 'white',
    borderRadius: 18,
    border: '1px solid #E6E6EC',
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.06)',
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    cursor: isClickable ? 'pointer' : 'default',
    transition: 'background 0.15s ease, box-shadow 0.15s ease',
    outline: 'none',
    ...style
  };

  const titleStyle = {
    color: '#1F1F1F',
    fontSize: 16,
    fontFamily: 'Plus Jakarta Sans, sans-serif',
    fontWeight: 600,
    lineHeight: '22px',
    margin: 0
  };

  const descriptionStyle = {
    color: '#6B7280',
    fontSize: 13,
    fontFamily: 'Plus Jakarta Sans, sans-serif',
    fontWeight: 500,
    lineHeight: '18px',
    margin: 0,
    marginTop: 2
  };

  const chevronStyle = {
    width: 20,
    height: 20,
    color: '#9CA3AF',
    flexShrink: 0,
    filter: 'brightness(0) invert(0.2)'
  };

  return (
    <div
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onClick={isClickable ? handleClick : undefined}
      onKeyDown={isClickable ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      } : undefined}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setIsHovered(true)}
      onBlur={() => setIsHovered(false)}
      style={containerStyle}
    >
      {/* Icon - pass hover state for color transition */}
      {icon && React.isValidElement(icon)
        ? React.cloneElement(icon, { isHovered })
        : icon}

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={titleStyle}>{title}</div>
        {description && <div style={descriptionStyle}>{description}</div>}
      </div>

      {/* Right element */}
      {rightElement && (
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
          {rightElement}
        </div>
      )}

      {/* Chevron */}
      {shouldShowChevron && (
        <img
          src={chevronLeftIcon}
          alt=""
          style={chevronStyle}
        />
      )}
    </div>
  );
};

/**
 * StatusPill - Status indicator pill
 */
export const StatusPill = ({ status, variant = 'default' }) => {
  const colors = {
    verified: { bg: '#ECFDF5', text: '#059669', border: '#A7F3D0' },
    'not-verified': { bg: '#FEF3C7', text: '#D97706', border: '#FDE68A' },
    pending: { bg: '#FEF9C3', text: '#CA8A04', border: '#FDE047' },
    error: { bg: '#FEF2F2', text: '#DC2626', border: '#FECACA' },
    default: { bg: '#F3F4F6', text: '#4B5563', border: '#E5E7EB' }
  };

  const color = colors[variant] || colors.default;

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '4px 10px',
      background: color.bg,
      color: color.text,
      border: `1px solid ${color.border}`,
      borderRadius: 999,
      fontSize: 12,
      fontFamily: 'Plus Jakarta Sans, sans-serif',
      fontWeight: 600,
      lineHeight: '16px',
      whiteSpace: 'nowrap'
    }}>
      {status}
    </span>
  );
};

/**
 * SettingsButton - Consistent button for Settings rows
 */
export const SettingsButton = ({
  children,
  onClick,
  variant = 'primary',
  disabled = false,
  size = 'medium'
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const baseStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: size === 'small' ? 32 : 36,
    padding: size === 'small' ? '0 12px' : '0 16px',
    borderRadius: 999,
    fontSize: size === 'small' ? 13 : 14,
    fontFamily: 'Plus Jakarta Sans, sans-serif',
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'all 0.15s ease',
    border: 'none',
    outline: 'none',
    whiteSpace: 'nowrap'
  };

  const variants = {
    primary: {
      background: isHovered && !disabled ? '#2D2D2D' : '#1F1F1F',
      color: 'white',
      opacity: disabled ? 0.5 : 1
    },
    secondary: {
      background: isHovered && !disabled ? '#F3F4F6' : 'white',
      color: '#1F1F1F',
      border: '1px solid #E5E7EB',
      opacity: disabled ? 0.5 : 1
    },
    danger: {
      background: isHovered && !disabled ? '#DC2626' : '#EF4444',
      color: 'white',
      opacity: disabled ? 0.5 : 1
    }
  };

  const variantStyle = variants[variant] || variants.primary;

  return (
    <button
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      disabled={disabled}
      style={{ ...baseStyle, ...variantStyle }}
    >
      {children}
    </button>
  );
};

/**
 * UserAvatar - Monochrome user icon for account row
 * Uses the same icon system as other Settings rows
 * Now with 56px container and 32px icon to match SettingsIcon
 */
export const UserAvatar = ({ name, image, size = 56, iconSize = 32, opticalScale = 1.12, isHovered = false }) => {
  // CSS filter for #4B5563 gray (base) and #374151 (hover)
  const baseFilter = 'brightness(0) saturate(100%) invert(32%) sepia(9%) saturate(759%) hue-rotate(182deg) brightness(96%) contrast(89%)';
  const hoverFilter = 'brightness(0) saturate(100%) invert(21%) sepia(10%) saturate(907%) hue-rotate(182deg) brightness(95%) contrast(92%)';

  // If there's a profile image, show it in a circle
  if (image) {
    return (
      <img
        src={image}
        alt={name || 'User'}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          flexShrink: 0
        }}
      />
    );
  }

  // Use monochrome administrator icon (same style as other Settings icons)
  return (
    <div style={{
      width: size,
      height: size,
      minWidth: size,
      display: 'grid',
      placeItems: 'center',
      flexShrink: 0
    }}>
      <img
        src={profileUserIcon}
        alt={name || 'User'}
        style={{
          width: iconSize,
          height: iconSize,
          filter: isHovered ? hoverFilter : baseFilter,
          transform: `scale(${opticalScale})`,
          transformOrigin: 'center',
          transition: 'filter 0.15s ease'
        }}
      />
    </div>
  );
};

export default SettingsRow;
