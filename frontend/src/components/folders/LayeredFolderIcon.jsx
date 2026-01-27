import React from 'react';

const LayeredFolderIcon = ({ width = 300, height = 250 }) => {
  const uniqueId = React.useId();

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 300 250"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block' }}
    >
      <defs>
        {/* Folder gradient - dark at bottom, lighter at top */}
        <linearGradient id={`folder-gradient-${uniqueId}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style={{ stopColor: '#3A3A3A' }} />
          <stop offset="50%" style={{ stopColor: '#2A2A2A' }} />
          <stop offset="100%" style={{ stopColor: '#000000' }} />
        </linearGradient>

        {/* Gray overlay gradient */}
        <linearGradient id={`gray-gradient-${uniqueId}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style={{ stopColor: '#909090', stopOpacity: 0.7 }} />
          <stop offset="100%" style={{ stopColor: '#505050', stopOpacity: 0.8 }} />
        </linearGradient>

        {/* Shadow effect */}
        <filter id={`shadow-${uniqueId}`}>
          <feDropShadow dx="0" dy="4" stdDeviation="8" floodOpacity="0.3"/>
        </filter>
      </defs>

      {/* Layer 1 (Background - Largest): Union.svg - Full folder with tab */}
      <g filter={`url(#shadow-${uniqueId})`}>
        {/* Main folder body */}
        <path
          d="M 30 85
             L 160 85
             L 175 60
             L 290 60
             L 290 220
             Q 290 235 275 235
             L 45 235
             Q 30 235 30 220
             Z"
          fill={`url(#folder-gradient-${uniqueId})`}
        />
        {/* Folder tab */}
        <path
          d="M 160 85
             L 175 60
             L 290 60
             L 290 48
             Q 290 40 283 40
             L 180 40
             L 165 60
             Z"
          fill={`url(#folder-gradient-${uniqueId})`}
        />
      </g>

      {/* Layer 2 (Middle): Text/Document image */}
      <g>
        <rect
          x="90"
          y="70"
          width="140"
          height="50"
          rx="4"
          fill="#FFFFFF"
          filter="drop-shadow(0px 2px 2px rgba(68, 68, 68, 0.16))"
        />
        {/* Text lines on document */}
        <line
          x1="100"
          y1="85"
          x2="170"
          y2="85"
          stroke="#E2E2E0"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <line
          x1="100"
          y1="98"
          x2="220"
          y2="98"
          stroke="#E2E2E0"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </g>

      {/* Layer 3 (Top): Rectangle 4512 - Aligned with Union */}
      <rect
        x="35"
        y="130"
        width="250"
        height="95"
        rx="10"
        fill={`url(#gray-gradient-${uniqueId})`}
      />
    </svg>
  );
};

export default LayeredFolderIcon;
