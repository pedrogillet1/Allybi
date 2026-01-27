// TODO: Implement FollowUpChips component
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
              borderRadius: 999,
              border: '1px solid #E5E7EB',
              background: '#F9FAFB',
              cursor: 'pointer',
              fontSize: 14,
              fontFamily: 'inherit',
              color: '#374151',
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
