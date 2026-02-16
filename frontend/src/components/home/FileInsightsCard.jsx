import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { buildRoute } from '../../constants/routes';
import { useDocuments } from '../../context/DocumentsContext';
import { useFileBreakdown } from '../../hooks/useFileBreakdown';
import { useIsMobile } from '../../hooks/useIsMobile';

export default function FileInsightsCard() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { documents } = useDocuments();
  const { breakdown, total } = useFileBreakdown(documents);
  const isMobile = useIsMobile();
  const [hoveredType, setHoveredType] = useState(null);

  const scrollRef = useRef(null);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, []);

  useEffect(() => {
    checkScroll();
  }, [breakdown, checkScroll]);

  const needsCarousel = breakdown.length > 3;
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
          {t('home.fileInsights.title')}
        </div>
        <div style={{
          fontSize: 13, color: '#6C6B6E',
          fontFamily: 'Plus Jakarta Sans, sans-serif',
        }}>
          {t('home.fileInsights.emptyMessage')}
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
      padding: isMobile ? 16 : 24,
      flex: isMobile ? 'none' : 1,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      minWidth: 0,
      maxWidth: '100%',
      width: '100%',
      boxSizing: 'border-box',
    }}>
      {/* Hide scrollbar */}
      {needsCarousel && (
        <style>{`.fi-carousel::-webkit-scrollbar { display: none; }`}</style>
      )}

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
        {t('home.fileInsights.title')}
      </h3>

      {/* File type icons — scrollable carousel when > 3 types */}
      <div style={{
        position: 'relative',
        marginBottom: isMobile ? 16 : 24,
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        /* bleed into card padding so fade reaches card edge */
        marginLeft: needsCarousel && !isMobile ? -24 : 0,
        marginRight: needsCarousel && !isMobile ? -24 : 0,
      }}>
        {/* Right fade — peek effect */}
        {needsCarousel && !isMobile && canScrollRight && (
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              width: 72,
              background: 'linear-gradient(to right, rgba(255,255,255,0) 0%, rgba(255,255,255,0.7) 50%, rgba(255,255,255,1) 100%)',
              zIndex: 2,
              pointerEvents: 'none',
            }}
          />
        )}
        {/* Left fade removed — first icon must always be fully visible */}

        <div
          ref={scrollRef}
          onScroll={checkScroll}
          className={needsCarousel ? 'fi-carousel' : undefined}
          style={{
            display: 'flex',
            gap: isMobile ? 24 : 36,
            justifyContent: needsCarousel ? 'flex-start' : 'space-evenly',
            overflowX: needsCarousel ? 'auto' : 'visible',
            scrollSnapType: needsCarousel ? 'x mandatory' : undefined,
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            paddingLeft: needsCarousel ? 24 : 0,
            paddingRight: needsCarousel ? 24 : 0,
            boxSizing: 'border-box',
          }}
        >
          {breakdown.map(item => (
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
                flexShrink: 0,
                minWidth: isMobile ? 64 : 72,
                scrollSnapAlign: needsCarousel ? 'start' : undefined,
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
                    width: isMobile ? 48 : 56,
                    height: isMobile ? 44 : 52,
                    objectFit: 'contain',
                    filter: 'drop-shadow(0 8px 12px rgba(0,0,0,0.18))',
                  }}
                />
              ) : (
                <div style={{
                  width: isMobile ? 48 : 56,
                  height: isMobile ? 44 : 52,
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
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#32302C',
                  fontFamily: 'Plus Jakarta Sans, sans-serif',
                  lineHeight: '18px',
                }}>
                  {item.label}
                </div>
                <div style={{
                  fontSize: 11,
                  fontWeight: 500,
                  color: '#6C6B6E',
                  fontFamily: 'Plus Jakarta Sans, sans-serif',
                  lineHeight: '16px',
                }}>
                  {item.count} · {item.percent}%
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Distribution bar */}
      <div style={{ marginBottom: 12 }}>
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
          {total} {total === 1 ? t('home.fileInsights.file') : t('home.fileInsights.files')}
        </span>
      </div>
    </div>
  );
}
