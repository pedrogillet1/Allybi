import React from 'react';

/**
 * SettingsIcon - Normalized icon container for Settings page
 * Ensures consistent sizing, alignment, and styling across all settings rows
 *
 * @param {Object} props
 * @param {ReactNode} props.children - Icon element (img or SVG component)
 * @param {string} props.src - Image source URL (alternative to children)
 * @param {string} props.alt - Alt text for image
 * @param {number} props.size - Icon size override (default 32)
 * @param {number} props.containerSize - Container size override (default 56)
 * @param {number} props.opticalScale - Scale transform to counter SVG viewBox padding (default 1.12)
 * @param {boolean} props.isHovered - Whether parent row is hovered (for color transition)
 */
const SettingsIcon = ({
  children,
  src,
  alt = '',
  size = 32,
  containerSize = 56,
  opticalScale = 1.12,
  isHovered = false
}) => {
  // Color transitions: #4B5563 (base) → #374151 (hover)
  const iconColor = isHovered ? '#374151' : '#4B5563';

  const containerStyle = {
    width: containerSize,
    height: containerSize,
    minWidth: containerSize,
    minHeight: containerSize,
    display: 'grid',
    placeItems: 'center',
    flexShrink: 0,
    color: iconColor,
    transition: 'color 0.15s ease'
  };

  // CSS filter for #4B5563 gray (base) and #374151 (hover)
  const baseFilter = 'brightness(0) saturate(100%) invert(32%) sepia(9%) saturate(759%) hue-rotate(182deg) brightness(96%) contrast(89%)';
  const hoverFilter = 'brightness(0) saturate(100%) invert(21%) sepia(10%) saturate(907%) hue-rotate(182deg) brightness(95%) contrast(92%)';

  // For img elements, use filter to achieve the gray color
  const imgStyle = {
    width: size,
    height: size,
    filter: isHovered ? hoverFilter : baseFilter,
    transform: `scale(${opticalScale})`,
    transformOrigin: 'center',
    transition: 'filter 0.15s ease'
  };

  // For SVG components, use currentColor
  const svgStyle = {
    width: size,
    height: size,
    color: iconColor,
    transform: `scale(${opticalScale})`,
    transformOrigin: 'center',
    transition: 'color 0.15s ease'
  };

  // If src is provided, render an img with filter
  if (src) {
    return (
      <div style={containerStyle}>
        <img src={src} alt={alt} style={imgStyle} />
      </div>
    );
  }

  // If children is provided, clone it with normalized styles
  if (children) {
    // Handle React elements (SVG components or img)
    if (React.isValidElement(children)) {
      return (
        <div style={containerStyle}>
          {React.cloneElement(children, {
            style: {
              ...svgStyle,
              ...children.props?.style
            }
          })}
        </div>
      );
    }
  }

  return <div style={containerStyle}>{children}</div>;
};

export default SettingsIcon;
