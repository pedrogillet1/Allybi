import React from 'react';

/**
 * Loading skeleton for Documents screen
 * Shows immediate visual feedback while data loads
 */
const DocumentsLoadingSkeleton = () => {
  return (
    <div style={{padding: '24px', minHeight: '100vh', background: '#F5F5F5'}}>
      {/* Header skeleton */}
      <div style={{marginBottom: '32px'}}>
        <div style={{
          width: '200px',
          height: '32px',
          background: '#E0E0E0',
          borderRadius: '8px',
          animation: 'pulse 1.5s ease-in-out infinite'
        }} />
      </div>

      {/* Categories section skeleton */}
      <div style={{marginBottom: '40px'}}>
        <div style={{
          width: '120px',
          height: '24px',
          background: '#E0E0E0',
          borderRadius: '4px',
          marginBottom: '16px',
          animation: 'pulse 1.5s ease-in-out infinite'
        }} />
        <div style={{display: 'flex', gap: '16px', flexWrap: 'wrap'}}>
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} style={{
              width: 'calc(16.666% - 14px)',
              minWidth: '150px',
              height: '72px',
              background: 'white',
              border: '1px solid #E0E0E0',
              borderRadius: '14px',
              animation: 'pulse 1.5s ease-in-out infinite',
              animationDelay: `${i * 0.1}s`
            }} />
          ))}
        </div>
      </div>

      {/* Recently Added section skeleton */}
      <div>
        <div style={{
          width: '150px',
          height: '24px',
          background: '#E0E0E0',
          borderRadius: '4px',
          marginBottom: '16px',
          animation: 'pulse 1.5s ease-in-out infinite'
        }} />
        <div style={{display: 'flex', flexDirection: 'column', gap: '12px'}}>
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} style={{
              width: '100%',
              height: '60px',
              background: 'white',
              border: '1px solid #E0E0E0',
              borderRadius: '8px',
              animation: 'pulse 1.5s ease-in-out infinite',
              animationDelay: `${i * 0.1}s`
            }} />
          ))}
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
};

export default DocumentsLoadingSkeleton;
