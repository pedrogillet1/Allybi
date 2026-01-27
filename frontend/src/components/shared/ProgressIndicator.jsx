import React, { useState, useEffect } from 'react';

const ProgressIndicator = ({ estimatedTime = 5000, onCancel }) => {
  const [progress, setProgress] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(estimatedTime);

  useEffect(() => {
    const startTime = Date.now();

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progressPercent = Math.min((elapsed / estimatedTime) * 100, 95);
      const remaining = Math.max(estimatedTime - elapsed, 0);

      setProgress(progressPercent);
      setTimeRemaining(remaining);

      if (progressPercent >= 95) {
        clearInterval(interval);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [estimatedTime]);

  const formatTime = (ms) => {
    const seconds = Math.ceil(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      padding: '16px 0'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}>
          <span style={{ fontSize: 16 }}>⚡</span>
          <div>
            <div style={{
              color: '#111827',
              fontSize: 14,
              fontFamily: 'Plus Jakarta Sans',
              fontWeight: '600'
            }}>
              Generating response...
            </div>
            <div style={{
              color: '#6B7280',
              fontSize: 12,
              fontFamily: 'Plus Jakarta Sans',
              marginTop: 2
            }}>
              About {formatTime(timeRemaining)} remaining
            </div>
          </div>
        </div>

        {onCancel && (
          <button
            onClick={onCancel}
            style={{
              padding: '6px 12px',
              fontSize: 12,
              fontFamily: 'Plus Jakarta Sans',
              fontWeight: '500',
              color: '#6B7280',
              background: 'transparent',
              border: '1px solid #E5E7EB',
              borderRadius: 6,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#F9FAFB';
              e.currentTarget.style.borderColor = '#D1D5DB';
              e.currentTarget.style.color = '#374151';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.borderColor = '#E5E7EB';
              e.currentTarget.style.color = '#6B7280';
            }}
          >
            Cancel
          </button>
        )}
      </div>

      <div style={{
        position: 'relative',
        height: 8,
        background: '#F3F4F6',
        borderRadius: 4,
        overflow: 'hidden'
      }}>
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          height: '100%',
          width: `${progress}%`,
          background: 'linear-gradient(90deg, #3B82F6 0%, #2563EB 100%)',
          borderRadius: 4,
          transition: 'width 0.3s ease-out',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          paddingRight: 8
        }}>
          {progress > 20 && (
            <span style={{
              color: 'white',
              fontSize: 10,
              fontFamily: 'Plus Jakarta Sans',
              fontWeight: '600'
            }}>
              {Math.round(progress)}%
            </span>
          )}
        </div>
      </div>

      <style>
        {`
          @keyframes shimmer {
            0% {
              background-position: -1000px 0;
            }
            100% {
              background-position: 1000px 0;
            }
          }
        `}
      </style>
    </div>
  );
};

export default ProgressIndicator;
