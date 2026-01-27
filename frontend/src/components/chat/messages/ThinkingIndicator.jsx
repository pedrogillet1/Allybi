import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const ThinkingIndicator = ({ stage = 'processing', context = null, showTips = false }) => {
  const { t } = useTranslation();
  const [currentTipIndex, setCurrentTipIndex] = useState(0);

  const stages = {
    analyzing: {
      icon: '🔍',
      message: t('thinkingIndicator.analyzing.message'),
      submessage: t('thinkingIndicator.analyzing.submessage')
    },
    processing: {
      icon: '⚙️',
      message: t('thinkingIndicator.processing.message'),
      submessage: t('thinkingIndicator.processing.submessage')
    },
    generating: {
      icon: '✨',
      message: t('thinkingIndicator.generating.message'),
      submessage: t('thinkingIndicator.generating.submessage')
    },
    finalizing: {
      icon: '📝',
      message: t('thinkingIndicator.finalizing.message'),
      submessage: t('thinkingIndicator.finalizing.submessage')
    }
  };

  const tips = [
    t('thinkingIndicator.tips.uploadMultiple'),
    t('thinkingIndicator.tips.dragAndDrop'),
    t('thinkingIndicator.tips.useFolders'),
    t('thinkingIndicator.tips.multiLanguage'),
    t('thinkingIndicator.tips.createFolders'),
    t('thinkingIndicator.tips.searchDocs'),
    t('thinkingIndicator.tips.useTags'),
    t('thinkingIndicator.tips.customizeEmojis')
  ];

  const current = stages[stage] || stages.processing;

  useEffect(() => {
    if (showTips) {
      const interval = setInterval(() => {
        setCurrentTipIndex((prev) => (prev + 1) % tips.length);
      }, 3000); // Change tip every 3 seconds

      return () => clearInterval(interval);
    }
  }, [showTips, tips.length]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
      padding: '16px 0'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12
      }}>
        <div style={{
          fontSize: 24,
          animation: 'pulse 2s ease-in-out infinite'
        }}>
          {current.icon}
        </div>

        <div style={{ flex: 1 }}>
          <div style={{
            color: '#111827',
            fontSize: 14,
            fontFamily: 'Plus Jakarta Sans',
            fontWeight: '600',
            marginBottom: 4
          }}>
            {current.message}
          </div>
          <div style={{
            color: '#6B7280',
            fontSize: 12,
            fontFamily: 'Plus Jakarta Sans'
          }}>
            {current.submessage}
          </div>
        </div>

        <div style={{
          display: 'flex',
          gap: 4,
          alignItems: 'center'
        }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                width: 6,
                height: 6,
                background: '#3B82F6',
                borderRadius: '50%',
                animation: `bounce 1.4s infinite ease-in-out`,
                animationDelay: `${i * -0.16}s`
              }}
            />
          ))}
        </div>
      </div>

      {context && (
        <div style={{
          color: '#9CA3AF',
          fontSize: 12,
          fontFamily: 'Plus Jakarta Sans',
          fontStyle: 'italic',
          marginLeft: 36
        }}>
          {context}
        </div>
      )}

      {showTips && (
        <div style={{
          background: '#F9FAFB',
          border: '1px solid #E5E7EB',
          borderRadius: 8,
          padding: 12,
          marginTop: 8,
          animation: 'fadeIn 0.3s ease-in'
        }}>
          <div style={{
            color: '#374151',
            fontSize: 13,
            fontFamily: 'Plus Jakarta Sans',
            transition: 'opacity 0.3s ease-in-out'
          }}>
            {tips[currentTipIndex]}
          </div>
        </div>
      )}

      <style>
        {`
          @keyframes pulse {
            0%, 100% {
              transform: scale(1);
              opacity: 1;
            }
            50% {
              transform: scale(1.1);
              opacity: 0.8;
            }
          }

          @keyframes bounce {
            0%, 80%, 100% {
              transform: scale(0);
              opacity: 0.5;
            }
            40% {
              transform: scale(1);
              opacity: 1;
            }
          }

          @keyframes fadeIn {
            from {
              opacity: 0;
              transform: translateY(-5px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
        `}
      </style>
    </div>
  );
};

export default ThinkingIndicator;
