import React from 'react';

/**
 * AppIcon - Recolorable icon component for Icons8 Liquid Glass icons.
 *
 * Supports tone="light" (for dark surfaces) and tone="dark" (for light surfaces).
 * Works with SVG imports (applies className filter) and PNG icons (CSS filter recolor).
 *
 * @param {string}  src       - Image src (imported SVG url or PNG path)
 * @param {ReactComponent} SvgComponent - Direct SVG React component (preferred)
 * @param {number}  size      - Icon width/height in px (default 24)
 * @param {string}  tone      - "light" | "dark" (default "dark")
 * @param {string}  alt       - Alt text for accessibility
 * @param {string}  ariaLabel - ARIA label override (falls back to alt)
 * @param {string}  tooltip   - Tooltip text shown on hover
 * @param {object}  style     - Additional inline styles
 */
const AppIcon = ({
  src,
  SvgComponent,
  size = 24,
  tone = 'dark',
  alt = '',
  ariaLabel,
  tooltip,
  style = {},
  className = '',
  ...rest
}) => {
  // Filter for dark tone: results in ~#32302C on white backgrounds
  // Filter for light tone: keeps icon readable on dark surfaces (white/near-white)
  const toneFilter = tone === 'light'
    ? 'brightness(0) invert(1)' // White icons for dark surfaces
    : 'brightness(0) invert(0.15) sepia(0.1) saturate(0.2)'; // ~#32302C for light surfaces

  const commonStyle = {
    width: size,
    height: size,
    flexShrink: 0,
    filter: toneFilter,
    transition: 'filter 0.15s ease, opacity 0.15s ease',
    ...style,
  };

  const label = ariaLabel || alt;

  if (SvgComponent) {
    return (
      <span
        role="img"
        aria-label={label}
        title={tooltip}
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <SvgComponent
          style={commonStyle}
          className={className}
          aria-hidden="true"
          {...rest}
        />
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      aria-label={label}
      title={tooltip}
      style={commonStyle}
      className={className}
      {...rest}
    />
  );
};

export default AppIcon;
