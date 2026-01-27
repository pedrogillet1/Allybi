import React from 'react';
import { useTranslation } from 'react-i18next';
import { useStorage } from '../hooks/useStorage';
import { spacing, radius, typography } from '../design/tokens';

/**
 * StorageIndicator Component
 * Shows user's storage usage as a progress bar with text
 * Designed for the sidebar/left nav
 */
const StorageIndicator = ({ isExpanded = true, style = {} }) => {
  const { t } = useTranslation();
  const { usedFormatted, limitFormatted, usedPercentage, loading, error } = useStorage();

  // Don't render if loading or error
  if (loading) {
    return (
      <div style={{
        padding: isExpanded ? `${spacing.sm} ${spacing.md}` : spacing.sm,
        ...style
      }}>
        {isExpanded ? (
          <span style={{
            color: 'rgba(255, 255, 255, 0.5)',
            fontSize: 12,
            fontFamily: typography.body.family
          }}>{t('storage.loading')}</span>
        ) : null}
      </div>
    );
  }

  if (error) {
    return null; // Silently fail - don't show anything if we can't get storage info
  }

  // Determine color based on usage percentage
  const getProgressColor = () => {
    if (usedPercentage >= 90) return '#D92D20'; // Red - critical
    if (usedPercentage >= 75) return '#F79009'; // Orange - warning
    return '#17B26A'; // Green - healthy
  };

  const progressColor = getProgressColor();

  // Collapsed view - just show a small indicator
  if (!isExpanded) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        padding: spacing.sm,
        ...style
      }}>
        {/* Circular progress indicator */}
        <div style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          background: `conic-gradient(${progressColor} ${usedPercentage * 3.6}deg, rgba(255, 255, 255, 0.1) 0deg)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div style={{
            width: 24,
            height: 24,
            borderRadius: '50%',
            background: '#181818',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <span style={{
              color: 'white',
              fontSize: 9,
              fontWeight: 600,
              fontFamily: typography.body.family
            }}>{usedPercentage}%</span>
          </div>
        </div>
      </div>
    );
  }

  // Expanded view - full progress bar with text
  return (
    <div style={{
      padding: `${spacing.sm} ${spacing.md}`,
      width: '100%',
      boxSizing: 'border-box',
      ...style
    }}>
      {/* Label */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6
      }}>
        <span style={{
          color: 'rgba(255, 255, 255, 0.7)',
          fontSize: 11,
          fontWeight: 500,
          fontFamily: typography.body.family
        }}>{t('storage.storage')}</span>
        <span style={{
          color: 'rgba(255, 255, 255, 0.5)',
          fontSize: 11,
          fontFamily: typography.body.family
        }}>{usedPercentage}%</span>
      </div>

      {/* Progress bar container */}
      <div style={{
        width: '100%',
        height: 6,
        background: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 3,
        overflow: 'hidden'
      }}>
        {/* Progress bar fill */}
        <div style={{
          width: `${usedPercentage}%`,
          height: '100%',
          background: progressColor,
          borderRadius: 3,
          transition: 'width 0.3s ease'
        }} />
      </div>

      {/* Usage text */}
      <div style={{
        marginTop: 6,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <span style={{
          color: 'rgba(255, 255, 255, 0.5)',
          fontSize: 10,
          fontFamily: typography.body.family
        }}>{usedFormatted} / {limitFormatted}</span>
        {usedPercentage >= 90 && (
          <span style={{
            color: '#D92D20',
            fontSize: 10,
            fontWeight: 600,
            fontFamily: typography.body.family
          }}>{t('storage.almostFull')}</span>
        )}
      </div>
    </div>
  );
};

export default StorageIndicator;
