import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * StreamingWelcomeMessage - ChatGPT-style smooth character streaming
 *
 * Features:
 * - Character-by-character streaming like ChatGPT
 * - Uses requestAnimationFrame for 60fps smooth rendering
 * - Randomly selects from message variants
 * - Some messages are personalized with userName
 * - Supports i18n translations
 */
const StreamingWelcomeMessage = ({ userName, isFirstChat = false }) => {
  const { t, i18n } = useTranslation();
  const [displayedText, setDisplayedText] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const animationRef = useRef(null);
  const startTimeRef = useRef(null);

  // Get message variants from translations - {name} will be replaced with userName
  const messageVariants = useMemo(() => {
    // Get the array of welcome messages from translations
    const messages = t('chat.welcomeMessages', { returnObjects: true });
    // Fallback to English defaults if translation returns a string (not an array)
    if (!Array.isArray(messages)) {
      return [
        "Hey {name}, what do you need?",
        "What are you looking for today?",
        "What do you need from Koda?",
        "What can I find for you?",
        "What's on your mind, {name}?",
        "What should we work on first?",
        "What do you want Koda to find?",
        "What's urgent for you right now?"
      ];
    }
    return messages;
  }, [t, i18n.language]);

  // Select a random message on component mount and replace {name} with userName
  const selectedMessage = useMemo(() => {
    const randomIndex = Math.floor(Math.random() * messageVariants.length);
    const message = messageVariants[randomIndex];
    return message.replace(/{name}/g, userName || 'there');
  }, [userName, messageVariants]);

  const fullMessage = selectedMessage;

  useEffect(() => {
    setDisplayedText('');
    setIsComplete(false);
    startTimeRef.current = null;

    // Characters per second - ChatGPT-like speed
    const charsPerSecond = 40;
    const msPerChar = 1000 / charsPerSecond;

    const animate = (timestamp) => {
      if (!startTimeRef.current) {
        startTimeRef.current = timestamp;
      }

      const elapsed = timestamp - startTimeRef.current;
      const targetChars = Math.floor(elapsed / msPerChar);
      const charsToShow = Math.min(targetChars, fullMessage.length);

      if (charsToShow <= fullMessage.length) {
        setDisplayedText(fullMessage.slice(0, charsToShow));
      }

      if (charsToShow < fullMessage.length) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        setIsComplete(true);
      }
    };

    // Small delay before starting
    const timeout = setTimeout(() => {
      animationRef.current = requestAnimationFrame(animate);
    }, 150);

    return () => {
      clearTimeout(timeout);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [fullMessage]);

  return (
    <div
      style={{
        fontSize: 30,
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
    </div>
  );
};

export default StreamingWelcomeMessage;
