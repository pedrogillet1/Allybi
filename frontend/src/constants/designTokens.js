// Design Tokens for Koda UI System
// Single source of truth for all design values

export const colors = {
  // Primary
  primary: '#181818',
  primaryDark: '#0F0F0F',

  // Neutrals
  white: '#FFFFFF',
  black: '#000000',

  // Grays
  gray: {
    900: '#32302C',
    600: '#55534E',
    500: '#6C6B6E',
    400: '#F5F5F5',
    300: '#E6E6EC',
    200: '#F0F0F0',
    100: '#F1F0EF',
  },

  // Semantic
  success: '#34A853',
  error: '#D92D20',
  warning: '#FBBC04',

  // Special
  overlay: 'rgba(0, 0, 0, 0.5)',
  overlayDark: 'rgba(0, 0, 0, 0.6)',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const radius = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 14,
  full: 9999,
  circle: 100,
};

export const typography = {
  fontFamily: 'Plus Jakarta Sans, sans-serif',
  sizes: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 20,
    xxl: 24,
    xxxl: 30,
  },
  weights: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  lineHeights: {
    xs: '18px',
    sm: '20px',
    md: '24px',
    lg: '26px',
    xl: '30px',
  },
};

export const shadows = {
  sm: '0 1px 2px rgba(0, 0, 0, 0.05)',
  md: '0 2px 8px rgba(0, 0, 0, 0.1)',
  lg: '0 4px 6px -2px rgba(16, 24, 40, 0.03)',
  xl: '0 8px 16px rgba(0, 0, 0, 0.15)',
  cardSpec: '0 1px 2px rgba(24,24,24,0.06), 0 12px 24px rgba(24,24,24,0.08)',
  cardSpecHover: '0 2px 4px rgba(24,24,24,0.08), 0 16px 28px rgba(24,24,24,0.10)',
};

export const zIndex = {
  dropdown: 99999,
  modal: 10000,
  toast: 99999,
  popover: 8000,
  tooltip: 7000,
};

export const transitions = {
  fast: '0.15s ease',
  normal: '0.2s ease',
  slow: '0.3s ease',
};
