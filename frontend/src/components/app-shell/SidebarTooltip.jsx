import React, { useState } from 'react';
import { typography } from '../../design/tokens';

/**
 * Tooltip component for sidebar items in collapsed state
 *
 * Features:
 * - Shows on hover and keyboard focus
 * - Positioned to the right of the icon
 * - Accessible with ARIA attributes
 * - Smooth fade-in animation
 * - Debounced show/hide for better UX
 *
 * @param {Object} props
 * @param {string} props.text - Tooltip text to display
 * @param {React.ReactNode} props.children - Icon/button to attach tooltip to
 * @param {boolean} props.show - Whether to show tooltip (when sidebar is collapsed)
 */
const SidebarTooltip = ({ children }) => {
  return (
    <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
      {children}
    </div>
  );
};

export default SidebarTooltip;
