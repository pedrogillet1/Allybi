import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { buildRoute } from '../../constants/routes';
import { useDocuments } from '../../context/DocumentsContext';
import { useFileBreakdown } from '../../hooks/useFileBreakdown';
import { useIsMobile } from '../../hooks/useIsMobile';

export default function FileInsightsCard() {
  const navigate = useNavigate();
  const { documents } = useDocuments();
  const { breakdown, total } = useFileBreakdown(documents);
  const isMobile = useIsMobile();
  const [hoveredType, setHoveredType] = useState(null);

  // Take top 3 file types for prominent display
  const topThree = breakdown.slice(0, 3);
  // All types for the distribution bar
  const allTypes = breakdown;

  if (total === 0) {
    return (
      <div style={{
        background: 'white',
        borderRadius: 16,
        border: '1px solid #E6E6EC',
        boxShadow: '0 1px 2px rgba(24,24,24,0.06), 0 12px 24px rgba(24,24,24,0.08)',
        padding: 24,
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 8,
      }}>
        <div style={{
          fontSize: 16, fontWeight: 600, color: '#32302C',
          fontFamily: 'Plus Jakarta Sans, sans-serif',
        }}>
          File insights
        </div>
        <div style={{
          fontSize: 13, color: '#6C6B6E',
          fontFamily: 'Plus Jakarta Sans, sans-serif',
        }}>
          Upload files to see insights
        </div>
      </div>
    );
  }

  return (
    <div style={{
      background: 'white',
      borderRadius: 16,
      border: '1px solid #E6E6EC',
      boxShadow: '0 1px 2px rgba(24,24,24,0.06), 0 12px 24px rgba(24,24,24,0.08)',
      padding: 24,
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Title */}
      <h3 style={{
        margin: 0,
        marginBottom: 16,
        fontSize: 16,
        fontWeight: 600,
        color: '#32302C',
        fontFamily: 'Plus Jakarta Sans, sans-serif',
        lineHeight: '24px',
      }}>
        File insights
      </h3>

      {/* Top 3 file type icons — large, directly on card surface */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-evenly',
        gap: isMobile ? 24 : 32,
        marginBottom: 20,
      }}>
        {topThree.map(item => (
          <button
            key={item.type}
            data-testid="file-insight-icon"
            onClick={() => navigate(buildRoute.fileType(item.type))}
            aria-label={`View ${item.label} files`}
            style={{
              background: 'transparent',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
              transition: 'transform 160ms cubic-bezier(0.2,0.8,0.2,1)',
              transform: hoveredType === item.type ? 'translateY(-2px)' : 'translateY(0)',
            }}
            onMouseEnter={() => setHoveredType(item.type)}
            onMouseLeave={() => setHoveredType(null)}
          >
            {item.icon ? (
              <img
                src={item.icon}
                alt=""
                style={{
                  width: isMobile ? 52 : 64,
                  height: isMobile ? 48 : 60,
                  objectFit: 'contain',
                  filter: 'drop-shadow(0 8px 12px rgba(0,0,0,0.18))',
                }}
              />
            ) : (
              <div style={{
                width: isMobile ? 52 : 64,
                height: isMobile ? 48 : 60,
                background: item.color,
                borderRadius: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontSize: 11,
                fontWeight: 700,
                fontFamily: 'Plus Jakarta Sans, sans-serif',
              }}>
                {item.label}
              </div>
            )}
            <div style={{ textAlign: 'center' }}>
              <div style={{
                fontSize: 14,
                fontWeight: 600,
                color: '#32302C',
                fontFamily: 'Plus Jakarta Sans, sans-serif',
                lineHeight: '20px',
              }}>
                {item.label}
              </div>
              <div style={{
                fontSize: 12,
                fontWeight: 500,
                color: '#6C6B6E',
                fontFamily: 'Plus Jakarta Sans, sans-serif',
                lineHeight: '18px',
              }}>
                {item.count} · {item.percent}%
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Distribution bar */}
      <div style={{ marginBottom: 10 }}>
        <div
          style={{
            height: 12,
            borderRadius: 9999,
            overflow: 'hidden',
            display: 'flex',
            background: '#F5F5F5',
          }}
          role="img"
          aria-label={`File distribution: ${allTypes.map(t => `${t.label} ${t.percent}%`).join(', ')}`}
        >
          {allTypes.map((item, i) => (
            <div
              key={item.type}
              title={`${item.label}: ${item.count} files (${item.percent}%)`}
              style={{
                width: `${item.percent}%`,
                minWidth: item.percent > 0 ? 4 : 0,
                background: item.color,
                transition: 'transform 160ms ease',
                transform: hoveredType === item.type ? 'scaleY(1.3)' : 'scaleY(1)',
                transformOrigin: 'center',
                borderRadius: i === 0 ? '9999px 0 0 9999px' : i === allTypes.length - 1 ? '0 9999px 9999px 0' : 0,
              }}
              onMouseEnter={() => setHoveredType(item.type)}
              onMouseLeave={() => setHoveredType(null)}
            />
          ))}
        </div>
      </div>

      {/* Legend + total */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '6px 14px',
        }}>
          {allTypes.map(item => (
            <div
              key={item.type}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 12,
                fontWeight: 500,
                color: '#6C6B6E',
                fontFamily: 'Plus Jakarta Sans, sans-serif',
                lineHeight: '18px',
              }}
            >
              <span style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: item.color,
                flexShrink: 0,
              }} />
              {item.label}
            </div>
          ))}
        </div>
        <span style={{
          fontSize: 12,
          fontWeight: 600,
          color: '#6C6B6E',
          fontFamily: 'Plus Jakarta Sans, sans-serif',
          lineHeight: '18px',
          whiteSpace: 'nowrap',
        }}>
          {total} {total === 1 ? 'file' : 'files'}
        </span>
      </div>
    </div>
  );
}
