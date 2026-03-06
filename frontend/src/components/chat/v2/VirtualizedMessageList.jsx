import React, { useRef, useEffect, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

/**
 * VirtualizedMessageList — renders chat messages using virtualization
 * for performance with large message lists (200+).
 *
 * Props:
 * - messages: Array of message objects
 * - renderMessage: (message, index) => React.ReactNode
 * - containerRef: ref to the scroll container (for scroll-to-bottom)
 * - onScroll: callback when scroll happens
 * - className: optional CSS class
 * - style: optional inline styles
 */
export default function VirtualizedMessageList({
  messages,
  renderMessage,
  containerRef: externalContainerRef,
  onScroll,
  className,
  style,
}) {
  const parentRef = useRef(null);
  const scrollRef = externalContainerRef || parentRef;

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 120,
    overscan: 5,
  });

  // Scroll to bottom when new messages arrive
  const prevCountRef = useRef(messages.length);
  useEffect(() => {
    if (messages.length > prevCountRef.current) {
      // New message added — scroll to end
      virtualizer.scrollToIndex(messages.length - 1, { align: 'end', behavior: 'smooth' });
    }
    prevCountRef.current = messages.length;
  }, [messages.length, virtualizer]);

  const handleScroll = useCallback(
    (e) => {
      if (onScroll) onScroll(e);
    },
    [onScroll]
  );

  const items = virtualizer.getVirtualItems();

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className={className}
      style={{
        overflow: 'auto',
        ...style,
      }}
    >
      <div
        style={{
          height: virtualizer.getTotalSize(),
          width: '100%',
          position: 'relative',
        }}
      >
        {items.map((virtualRow) => (
          <div
            key={virtualRow.key}
            data-index={virtualRow.index}
            ref={virtualizer.measureElement}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualRow.start}px)`,
            }}
          >
            {renderMessage(messages[virtualRow.index], virtualRow.index)}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * scrollToBottom helper for virtualized lists.
 */
export function scrollVirtualizedToBottom(virtualizer, messageCount) {
  if (messageCount > 0) {
    virtualizer.scrollToIndex(messageCount - 1, { align: 'end' });
  }
}
