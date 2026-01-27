import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Standardized Upload Progress Bar Component
 *
 * Features:
 * - Smooth continuous progress (250ms easing)
 * - Subtle shimmer effect (10-15% opacity, 2.5s cycle)
 * - Proper completion state (200ms hold, fade to 70%)
 * - Thin pill bar shape
 * - Status text transition: "Uploading to cloud..." → "✓ Uploaded"
 */

const UploadProgressBar = ({
  progress = 0,
  status = 'uploading', // 'uploading' | 'completed' | 'error'
  showStatus = true,
  variant = 'default' // 'default' | 'compact' | 'large'
}) => {
  const { t } = useTranslation();
  const [displayProgress, setDisplayProgress] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  const [showShimmer, setShowShimmer] = useState(true);
  const animationRef = useRef(null);
  const previousProgress = useRef(0);

  // Easing function: ease-out cubic
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

  // Smooth progress animation using requestAnimationFrame
  useEffect(() => {
    const targetProgress = Math.min(progress, 100);
    const startProgress = previousProgress.current;
    const progressDiff = targetProgress - startProgress;
    const duration = 250; // 250ms easing duration
    let startTime = null;

    const animate = (currentTime) => {
      if (!startTime) startTime = currentTime;
      const elapsed = currentTime - startTime;
      const t = Math.min(elapsed / duration, 1);
      const easedT = easeOutCubic(t);
      const newProgress = startProgress + (progressDiff * easedT);

      setDisplayProgress(newProgress);

      if (t < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        previousProgress.current = targetProgress;
      }
    };

    if (progressDiff !== 0) {
      animationRef.current = requestAnimationFrame(animate);
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [progress]);

  // Handle completion state
  useEffect(() => {
    if (status === 'completed' || progress >= 100) {
      // Hold at 100% for 200ms, then trigger completion
      const timer = setTimeout(() => {
        setIsCompleted(true);
        setShowShimmer(false);
      }, 200);
      return () => clearTimeout(timer);
    } else {
      setIsCompleted(false);
      setShowShimmer(true);
    }
  }, [status, progress]);

  // Variant dimensions
  const dimensions = {
    default: { height: 6, radius: 3 },
    compact: { height: 4, radius: 2 },
    large: { height: 8, radius: 4 }
  };

  const { height, radius } = dimensions[variant] || dimensions.default;

  // Status text
  const getStatusText = () => {
    if (status === 'error') return t('common.error');
    if (isCompleted || status === 'completed') return t('upload.uploaded');
    return t('upload.uploadingToCloud');
  };

  // Progress bar color - grey for uploading, green for completed
  const getBarColor = () => {
    if (status === 'error') return '#EF4444';
    if (isCompleted || status === 'completed') return '#10B981';
    return '#A0A0A0'; // Grey for uploading state
  };

  return (
    <div style={{ width: '100%' }}>
      {/* Progress Bar Container */}
      <div
        style={{
          width: '100%',
          height: height,
          background: '#E5E7EB',
          borderRadius: radius,
          overflow: 'hidden',
          position: 'relative'
        }}
      >
        {/* Progress Fill */}
        <div
          style={{
            height: '100%',
            width: `${displayProgress}%`,
            background: getBarColor(),
            borderRadius: radius,
            transition: isCompleted ? 'opacity 400ms ease-out' : 'none',
            opacity: isCompleted ? 0.7 : 1,
            position: 'relative',
            overflow: 'hidden'
          }}
        >
          {/* Shimmer Effect */}
          {showShimmer && !isCompleted && displayProgress > 0 && displayProgress < 100 && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.15) 50%, transparent 100%)',
                animation: 'shimmer 2.5s infinite',
              }}
            />
          )}
        </div>
      </div>

      {/* Status Text */}
      {showStatus && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 4,
            fontSize: 12,
            fontFamily: 'Plus Jakarta Sans, sans-serif'
          }}
        >
          <span
            style={{
              color: status === 'error' ? '#EF4444' : isCompleted ? '#10B981' : '#6B7280',
              transition: 'color 200ms ease'
            }}
          >
            {getStatusText()}
          </span>
          <span style={{ color: '#9CA3AF' }}>
            {Math.round(displayProgress)}%
          </span>
        </div>
      )}

      {/* Keyframes for shimmer animation */}
      <style>
        {`
          @keyframes shimmer {
            0% {
              transform: translateX(-100%);
            }
            100% {
              transform: translateX(200%);
            }
          }
        `}
      </style>
    </div>
  );
};

export default UploadProgressBar;
