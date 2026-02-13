import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import SettingsIcon from './SettingsIcon';
import chevronLeftIcon from '../../assets/chevron-left.svg';
import storageIcon from '../../assets/storage-icon.svg';

/**
 * StorageCard - Compact storage display for Settings page
 *
 * @param {number} usedBytes - Used storage in bytes
 * @param {number} totalBytes - Total storage limit in bytes
 * @param {function} onManage - Handler for Manage/navigate action
 */
const StorageCard = ({ usedBytes = 0, totalBytes = 5 * 1024 * 1024 * 1024, onManage }) => {
  const { t } = useTranslation();
  const [isHovered, setIsHovered] = useState(false);

  const percentage = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;

  // Format bytes to human readable
  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Progress bar color based on usage
  const getProgressColor = () => {
    if (percentage > 90) return '#DC2626'; // Red
    if (percentage > 70) return '#F59E0B'; // Amber
    return '#1F1F1F'; // Dark
  };

  const isClickable = !!onManage;

  return (
    <div
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onClick={isClickable ? onManage : undefined}
      onKeyDown={isClickable ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onManage();
        }
      } : undefined}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        alignSelf: 'stretch',
        minHeight: 74,
        padding: '18px',
        background: isHovered && isClickable ? '#F5F5F5' : 'white',
        borderRadius: 18,
        border: '1px solid #E6E6EC',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.06)',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        cursor: isClickable ? 'pointer' : 'default',
        transition: 'background 0.15s ease',
        outline: 'none'
      }}
    >
      {/* Icon - 56px container, 32px icon with hover state */}
      <SettingsIcon src={storageIcon} alt="Storage" isHovered={isHovered && isClickable} />

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
          <span style={{
            color: '#1F1F1F',
            fontSize: 16,
            fontFamily: 'Plus Jakarta Sans, sans-serif',
            fontWeight: 600,
            lineHeight: '22px'
          }}>
            {t('settingsPage.storage', 'Storage')}
          </span>
        </div>

        {/* Storage amount */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 10 }}>
          <span style={{
            color: '#1F1F1F',
            fontSize: 24,
            fontFamily: 'Plus Jakarta Sans, sans-serif',
            fontWeight: 700,
            lineHeight: '1'
          }}>
            {formatBytes(usedBytes)}
          </span>
          <span style={{
            color: '#9CA3AF',
            fontSize: 14,
            fontFamily: 'Plus Jakarta Sans, sans-serif',
            fontWeight: 500
          }}>
            {t('settingsPage.of', 'of')} {formatBytes(totalBytes)}
          </span>
        </div>

        {/* Progress bar */}
        <div style={{
          width: '100%',
          height: 6,
          background: '#E5E7EB',
          borderRadius: 999,
          overflow: 'hidden'
        }}>
          <div style={{
            width: `${Math.min(percentage, 100)}%`,
            height: '100%',
            background: getProgressColor(),
            borderRadius: 999,
            transition: 'width 0.3s ease'
          }} />
        </div>
      </div>

      {/* Right side - Chevron if clickable */}
      {isClickable && (
        <img
          src={chevronLeftIcon}
          alt=""
          style={{
            width: 20,
            height: 20,
            flexShrink: 0,
            filter: 'brightness(0) invert(0.2)'
          }}
        />
      )}
    </div>
  );
};

export default StorageCard;
