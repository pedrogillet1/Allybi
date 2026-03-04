import React from 'react';

function SheetTabs({ sheetNames = [], activeIndex = 0, onSelectSheet }) {
  if (sheetNames.length <= 1) return null;

  return (
    <div
      role="tablist"
      aria-label="Worksheet tabs"
      style={{
        display: 'flex',
        alignItems: 'center',
        background: '#FAFAFA',
        borderTop: '1px solid #E6E6EC',
        padding: '0 8px',
        flexShrink: 0,
        height: 32,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: 0,
          overflowX: 'auto',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          padding: '0 2px',
        }}
      >
        {sheetNames.map((name, index) => {
          const isActive = index === activeIndex;
          return (
            <button
              key={index}
              role="tab"
              aria-selected={isActive}
              aria-label={`Sheet: ${name}`}
              type="button"
              onClick={() => onSelectSheet?.(index)}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.background = '#EEEEEE';
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.background = 'transparent';
              }}
              style={{
                padding: '0 14px',
                height: 32,
                background: isActive ? '#FFFFFF' : 'transparent',
                border: 'none',
                borderBottom: isActive ? '2px solid #181818' : '2px solid transparent',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: isActive ? 700 : 400,
                color: isActive ? '#181818' : '#6C6B6E',
                whiteSpace: 'nowrap',
                fontFamily: 'Plus Jakarta Sans, sans-serif',
                transition: 'background 120ms ease',
              }}
            >
              {name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default SheetTabs;
