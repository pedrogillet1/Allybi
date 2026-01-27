import { useState, useEffect, useRef } from 'react';
import { playTypingSoundIfEnabled, playCompletionSound, areTypingSoundsEnabled } from '../utils/browser/typingSound';

/**
 * ✨ ENHANCED ChatGPT-Style Streaming Animation Hook WITH SOUND
 *
 * Same as useStreamingAnimation but with optional typing sound effects
 *
 * Features:
 * - All features from useStreamingAnimation
 * - Optional typing sound effects during animation
 * - Completion sound when animation finishes
 *
 * @param {string} fullText - Complete text to animate
 * @param {number} baseSpeed - Base characters per frame (default: 3)
 * @param {number} fps - Target frames per second (default: 60)
 * @param {boolean} isPaused - Whether animation is paused (default: false)
 * @param {function} onComplete - Callback when animation completes (optional)
 * @param {boolean} enableSound - Enable typing sounds (default: false)
 * @returns {string} - Currently displayed text
 */
export function useStreamingAnimationWithSound(
  fullText,
  baseSpeed = 3,
  fps = 60,
  isPaused = false,
  onComplete = null,
  enableSound = false
) {
  const [displayedText, setDisplayedText] = useState('');
  const animationFrameRef = useRef(null);
  const displayedLengthRef = useRef(0);
  const lastUpdateTimeRef = useRef(Date.now());
  const adaptiveSpeedRef = useRef(baseSpeed);
  const lastFrameTimeRef = useRef(Date.now());
  const lastSoundTimeRef = useRef(0); // Throttle sound playback
  const completionSoundPlayedRef = useRef(false);

  useEffect(() => {
    // Pause functionality
    if (isPaused) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      return;
    }

    // Reset animation
    if (fullText.length < displayedLengthRef.current) {
      displayedLengthRef.current = 0;
      setDisplayedText('');
      lastUpdateTimeRef.current = Date.now();
      lastFrameTimeRef.current = Date.now();
      completionSoundPlayedRef.current = false;
      return;
    }

    // Already fully displayed
    if (displayedLengthRef.current >= fullText.length) {
      // Play completion sound once
      if (enableSound && !completionSoundPlayedRef.current && fullText.length > 0 && areTypingSoundsEnabled()) {
        playCompletionSound(0.08);
        completionSoundPlayedRef.current = true;
      }

      // Call completion callback
      if (onComplete && fullText.length > 0) {
        onComplete();
      }
      return;
    }

    // Adaptive speed calculation
    const timeSinceUpdate = Date.now() - lastUpdateTimeRef.current;
    lastUpdateTimeRef.current = Date.now();

    if (timeSinceUpdate < 50) {
      adaptiveSpeedRef.current = Math.min(baseSpeed * 3, 10);
    } else if (timeSinceUpdate < 150) {
      adaptiveSpeedRef.current = Math.min(baseSpeed * 2, 6);
    } else if (timeSinceUpdate > 500) {
      adaptiveSpeedRef.current = Math.max(baseSpeed / 2, 1);
    } else {
      adaptiveSpeedRef.current = baseSpeed;
    }

    const frameDelay = 1000 / fps;

    function animate() {
      const now = Date.now();
      const elapsed = now - lastFrameTimeRef.current;

      if (elapsed < frameDelay) {
        animationFrameRef.current = requestAnimationFrame(animate);
        return;
      }

      lastFrameTimeRef.current = now;
      const currentLength = displayedLengthRef.current;
      const targetLength = fullText.length;

      if (currentLength < targetLength) {
        const remainingText = fullText.substring(currentLength);
        let newLength = currentLength;

        // Instant rendering for markdown blocks
        if (remainingText.startsWith('```')) {
          const codeBlockEnd = remainingText.indexOf('```', 3);
          if (codeBlockEnd !== -1) {
            newLength = currentLength + codeBlockEnd + 3;
          }
        } else if (remainingText.match(/^\|.*\|/)) {
          const lines = remainingText.split('\n');
          let tableEndIndex = 0;
          for (let i = 0; i < lines.length; i++) {
            if (!lines[i].trim().startsWith('|')) break;
            tableEndIndex += lines[i].length + 1;
          }
          if (tableEndIndex > 0) newLength = currentLength + tableEndIndex;
        } else {
          const headingMatch = remainingText.match(/^(#{1,6}\s+[^\n]+)/);
          const listItemMatch = remainingText.match(/^(\s*[-*+]\s+[^\n]+)/);
          const numberedListMatch = remainingText.match(/^(\s*\d+\.\s+[^\n]+)/);
          const boldMatch = remainingText.match(/^(\*\*[^*]+\*\*)/);
          const inlineCodeMatch = remainingText.match(/^(`[^`]+`)/);

          if (headingMatch) {
            newLength = currentLength + headingMatch[0].length;
          } else if (listItemMatch) {
            newLength = currentLength + listItemMatch[0].length;
          } else if (numberedListMatch) {
            newLength = currentLength + numberedListMatch[0].length;
          } else if (boldMatch) {
            newLength = currentLength + boldMatch[0].length;
          } else if (inlineCodeMatch) {
            newLength = currentLength + inlineCodeMatch[0].length;
          } else {
            // Character-by-character
            const charsToAdd = Math.min(
              Math.ceil(adaptiveSpeedRef.current),
              targetLength - currentLength
            );
            newLength = currentLength + charsToAdd;

            // Play typing sound (throttled to every 50ms to avoid spam)
            if (enableSound && now - lastSoundTimeRef.current > 50) {
              playTypingSoundIfEnabled();
              lastSoundTimeRef.current = now;
            }
          }
        }

        // Update if length changed
        if (newLength !== currentLength) {
          displayedLengthRef.current = newLength;
          setDisplayedText(fullText.substring(0, newLength));
        }

        animationFrameRef.current = requestAnimationFrame(animate);
      }
    }

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [fullText, baseSpeed, fps, isPaused, onComplete, enableSound]);

  return displayedText;
}

export default useStreamingAnimationWithSound;
