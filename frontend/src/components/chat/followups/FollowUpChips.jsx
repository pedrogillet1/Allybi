import React from 'react';

export default function FollowUpChips({ chips, onSelect }) {
  if (!Array.isArray(chips) || chips.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {chips.map((chip, i) => {
        const label = typeof chip === 'string' ? chip : chip?.label || chip?.query || '';
        if (!label) return null;
        return (
          <button
            key={i}
            type="button"
            onClick={() => onSelect?.(chip)}
            style={{
              padding: '6px 14px',
              borderRadius: 9999,
              border: '1px solid #E6E6EC',
              background: '#F5F5F5',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              fontFamily: 'Plus Jakarta Sans, sans-serif',
              color: '#32302C',
              transition: 'background 0.12s ease, border-color 0.12s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#ECECEC'; e.currentTarget.style.borderColor = '#D4D4D8'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#F5F5F5'; e.currentTarget.style.borderColor = '#E6E6EC'; }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
