import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * StreamingWelcomeMessage - ChatGPT-style smooth character streaming
 *
 * Features:
 * - Character-by-character streaming with natural pauses (commas, periods)
 * - Uses requestAnimationFrame for 60fps smooth rendering
 * - Randomly selects from message variants (localized)
 * - Personalized with userName via {name} placeholder
 * - Skips animation on repeat visits (hasSeenWelcome)
 * - Instantly completes if user starts typing (onInterrupt)
 */
const StreamingWelcomeMessage = ({ userName, isFirstChat = false }) => {
  const { t, i18n } = useTranslation();
  const [displayedText, setDisplayedText] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const animationRef = useRef(null);
  const timeoutRef = useRef(null);
  const charIndexRef = useRef(0);
  const lastCharTimeRef = useRef(0);

  // Get message variants from translations
  const messageVariants = useMemo(() => {
    const messages = t('chat.welcomeMessages', { returnObjects: true });
    if (!Array.isArray(messages)) {
      return [
        "What do you want to find in your files?",
        "What can I pull up for you?",
        "Ask a question — I'll answer from your documents.",
        "Which document should we start with?",
        "What are you working on right now?",
        "What should we look up first?",
        "What's the key info you need?",
        "How can I help with your documents today?"
      ];
    }
    return messages;
  }, [t, i18n.language]);

  // Select a random message and replace {name} with userName
  const selectedMessage = useMemo(() => {
    const randomIndex = Math.floor(Math.random() * messageVariants.length);
    const message = messageVariants[randomIndex];
    return message.replace(/{name}/g, userName || 'there');
  }, [userName, messageVariants]);

  const fullMessage = selectedMessage;

  // Skip animation on repeat visits — parent passes isFirstChat=false after first greeting
  const shouldAnimate = isFirstChat;

  // Instantly finish the animation (called on user interaction)
  const finishInstantly = useCallback(() => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    animationRef.current = null;
    timeoutRef.current = null;
    setDisplayedText(fullMessage);
    setIsComplete(true);
    sessionStorage.setItem('hasShownGreeting', 'true');
  }, [fullMessage]);

  // Expose interrupt: finish instantly when user focuses input or types
  useEffect(() => {
    if (isComplete || !shouldAnimate) return;

    const handleInterrupt = () => {
      if (!isComplete) finishInstantly();
    };

    // Listen for typing in the chat input
    const input = document.querySelector('[data-chat-input]');
    if (input) {
      input.addEventListener('focus', handleInterrupt);
      input.addEventListener('input', handleInterrupt);
    }

    return () => {
      if (input) {
        input.removeEventListener('focus', handleInterrupt);
        input.removeEventListener('input', handleInterrupt);
      }
    };
  }, [isComplete, shouldAnimate, finishInstantly]);

  useEffect(() => {
    // If not first chat or already seen, show instantly
    if (!shouldAnimate) {
      setDisplayedText(fullMessage);
      setIsComplete(true);
      return;
    }

    // Reset state
    setDisplayedText('');
    setIsComplete(false);
    charIndexRef.current = 0;
    lastCharTimeRef.current = 0;

    // Natural pause durations (ms)
    const BASE_MS = 25; // ~40 chars/sec baseline
    const COMMA_PAUSE = 80;
    const PERIOD_PAUSE = 180;
    const NEWLINE_PAUSE = 200;
    const DASH_PAUSE = 60;

    const getCharDelay = (char) => {
      switch (char) {
        case ',': return BASE_MS + COMMA_PAUSE;
        case '.': case '!': case '?': return BASE_MS + PERIOD_PAUSE;
        case '\n': return BASE_MS + NEWLINE_PAUSE;
        case '—': case '–': case ':': return BASE_MS + DASH_PAUSE;
        default: return BASE_MS;
      }
    };

    const animate = (timestamp) => {
      if (!lastCharTimeRef.current) {
        lastCharTimeRef.current = timestamp;
      }

      const elapsed = timestamp - lastCharTimeRef.current;
      const idx = charIndexRef.current;

      if (idx >= fullMessage.length) {
        setDisplayedText(fullMessage);
        setIsComplete(true);
        sessionStorage.setItem('hasShownGreeting', 'true');
        return;
      }

      const currentChar = fullMessage[idx];
      const delay = getCharDelay(currentChar);

      if (elapsed >= delay) {
        charIndexRef.current = idx + 1;
        lastCharTimeRef.current = timestamp;
        setDisplayedText(fullMessage.slice(0, idx + 1));
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    // Small delay before starting the animation
    timeoutRef.current = setTimeout(() => {
      animationRef.current = requestAnimationFrame(animate);
    }, 150);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [fullMessage, shouldAnimate]);

  return (
    <div
      style={{
        fontSize: 26,
        fontWeight: '600',
        color: '#32302C',
        fontFamily: 'Plus Jakarta Sans, sans-serif',
        lineHeight: '1.4',
        minHeight: '42px',
        textShadow: '0 1px 2px rgba(0, 0, 0, 0.06)',
        display: 'inline-block'
      }}
    >
      {displayedText}
      {shouldAnimate && (
        <span
          style={{
            display: 'inline-block',
            width: '2px',
            height: '28px',
            backgroundColor: '#32302C',
            marginLeft: '1px',
            verticalAlign: 'text-bottom',
            opacity: isComplete ? 0 : 1,
            transition: 'opacity 0.3s ease-out'
          }}
        />
      )}
    </div>
  );
};

export default StreamingWelcomeMessage;
