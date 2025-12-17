/**
 * Streaming Markdown Enhanced - Production V3
 * 
 * Features:
 * - Streaming-safe marker parsing (holdback mechanism)
 * - CSS-only styling (no <u> tags, no rehypeRaw)
 * - Inline document buttons with proper spacing
 * - Load more buttons
 */

import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { parseWithHoldback } from '../utils/kodaMarkerParserV3';
import InlineDocumentButton from './InlineDocumentButton';
import LoadMoreButton from './LoadMoreButton';

/**
 * Main streaming markdown component
 */
export default function StreamingMarkdownEnhanced({
  content,
  isStreaming = false,
  onDocumentClick,
  onLoadMore,
  className = '',
}) {
  // Parse content with streaming holdback
  const { parts, heldBack } = useMemo(() => {
    if (isStreaming) {
      // Use holdback during streaming to avoid rendering incomplete markers
      return parseWithHoldback(content, 50);
    } else {
      // No holdback when streaming is complete
      return parseWithHoldback(content, 0);
    }
  }, [content, isStreaming]);

  return (
    <div className={`streaming-markdown ${className}`}>
      {parts.map((part, index) => {
        // Render text parts as markdown
        if (part.type === 'text') {
          return (
            <ReactMarkdown
              key={index}
              remarkPlugins={[remarkGfm]}
              components={{
                // Ensure inline elements don't break spacing
                p: ({ node, ...props }) => <p style={{ display: 'inline' }} {...props} />,
              }}
            >
              {part.value}
            </ReactMarkdown>
          );
        }

        // Render document markers as inline buttons
        if (part.type === 'doc') {
          return (
            <InlineDocumentButton
              key={index}
              docId={part.id}
              docName={part.name}
              context={part.ctx}
              onClick={() => onDocumentClick?.(part.id, part.name)}
            />
          );
        }

        // Render load more markers as buttons
        if (part.type === 'load_more') {
          return (
            <LoadMoreButton
              key={index}
              total={part.total}
              shown={part.shown}
              remaining={part.remaining}
              onClick={() => onLoadMore?.(part.shown, part.remaining)}
            />
          );
        }

        return null;
      })}

      {/* Show held back text as plain text (no markers) */}
      {isStreaming && heldBack && (
        <span className="held-back-text">{heldBack}</span>
      )}

      {/* Streaming cursor */}
      {isStreaming && (
        <span className="streaming-cursor" aria-label="Generating...">
          ▊
        </span>
      )}
    </div>
  );
}

/**
 * CSS for the component (add to your global styles or CSS module)
 * 
 * .streaming-markdown {
 *   line-height: 1.6;
 *   font-size: 16px;
 * }
 * 
 * .streaming-markdown p {
 *   margin: 0;
 *   display: inline;
 * }
 * 
 * .streaming-markdown .held-back-text {
 *   opacity: 0.7;
 * }
 * 
 * .streaming-cursor {
 *   display: inline-block;
 *   width: 2px;
 *   height: 1.2em;
 *   background-color: currentColor;
 *   animation: blink 1s step-end infinite;
 *   margin-left: 2px;
 *   vertical-align: text-bottom;
 * }
 * 
 * @keyframes blink {
 *   50% { opacity: 0; }
 * }
 */
