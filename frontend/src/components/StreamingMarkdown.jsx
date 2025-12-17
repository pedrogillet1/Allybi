import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import './StreamingAnimation.css';
import './SpacingUtilities.css';
import './MarkdownStyles.css';
import { ClickableDocumentName, isDocumentName } from './ClickableDocumentName';
import {
  parseInlineDocuments,
  parseInlineFolders,
  parseLoadMoreMarkers,
  parseSimpleDocMarkers,
  parseSeeAllMarkers
} from '../utils/inlineDocumentParser';
// V3 Marker Parser - for new {{DOC::id=...::name="..."}} format
import {
  hasMarkers as hasV3Markers,
  parseDocumentMarkers as parseV3DocMarkers,
  parseLoadMoreMarkers as parseV3LoadMoreMarkers,
  hasIncompleteMarkers
} from '../utils/kodaMarkerParser';

/**
 * STREAMING HOLDBACK:
 * When streaming, markers like {{DOC::id=...}} may arrive split across chunks.
 * We need to hold back text from the last potential marker start ({{) until
 * either the marker completes (}}) or we confirm it's not a marker.
 *
 * @param {string} text - Content to process
 * @param {boolean} streaming - Whether we're currently streaming
 * @returns {{ safeContent: string, heldBack: string }}
 */
function applyStreamingHoldback(text, streaming) {
  if (!text) return { safeContent: '', heldBack: '' };
  if (!streaming) return { safeContent: text, heldBack: '' };
  if (!hasIncompleteMarkers(text)) return { safeContent: text, heldBack: '' };

  // Find the last potential incomplete marker start
  const lastOpenBrace = text.lastIndexOf('{{');
  if (lastOpenBrace === -1) return { safeContent: text, heldBack: '' };

  // Check if there's a closing }} after the last {{
  const closingAfterOpen = text.indexOf('}}', lastOpenBrace);
  if (closingAfterOpen !== -1) {
    // Marker is complete - check for another {{ after it
    const nextOpen = text.indexOf('{{', closingAfterOpen);
    if (nextOpen === -1) return { safeContent: text, heldBack: '' };
    return { safeContent: text.slice(0, nextOpen), heldBack: text.slice(nextOpen) };
  }

  // No closing after the last open - hold back from there
  return { safeContent: text.slice(0, lastOpenBrace), heldBack: text.slice(lastOpenBrace) };
}

/**
 * ✨ StreamingMarkdown Component (with Koda Markdown Contract)
 *
 * Renders markdown with ChatGPT-style streaming animation.
 * Implements the frontend side of the Koda Markdown Contract:
 * - Chat-sized headings (not huge H1s)
 * - Tight lists (no gaps between bullets)
 * - Clickable document names (matched by NAME, not ID)
 * - UTF-8 encoding fixes
 *
 * DOCUMENT NAME MATCHING:
 * - Backend outputs **DocumentName.pdf** (bold only, NO IDs)
 * - Frontend matches bold text to document IDs using documentMap
 * - IDs are NEVER visible to users
 *
 * Features:
 * - Real-time markdown parsing during streaming
 * - Smooth rendering of incomplete markdown
 * - Blinking cursor at the end of streamed text
 * - Custom component styling
 * - Uses .koda-markdown CSS class for contract compliance
 *
 * @param {string} content - The markdown content to render (can be incomplete during streaming)
 * @param {boolean} isStreaming - Whether content is currently being streamed
 * @param {object} customComponents - Custom ReactMarkdown components
 * @param {string} className - Additional CSS classes
 * @param {array} documents - Array of documents with {name, id} for name→ID matching
 * @param {function} onOpenPreview - Callback to open document preview
 */
const StreamingMarkdown = ({
  content,
  isStreaming = false,
  customComponents = {},
  className = '',
  documents = [],
  onOpenPreview
}) => {

  // Build document name → document ID map for clickable documents
  const documentMap = useMemo(() => {
    const map = new Map();
    documents.forEach(doc => {
      const name = doc.name || doc.filename || doc.documentName || '';
      const id = doc.id || doc.documentId || '';
      if (name && id) {
        const normalized = name.toLowerCase().replace(/[_-]/g, ' ');
        map.set(normalized, id);
        map.set(name.toLowerCase(), id);
      }
    });
    return map;
  }, [documents]);

  // Default custom components for better styling
  const defaultComponents = {
    // Links - regular external links only (NO #doc-* pattern - we use bold name matching)
    a: ({ node, children, href, ...props }) => {
      // All links are external links - document names are matched via **bold** text
      return (
        <a
          {...props}
          href={href}
          style={{
            color: '#303030',
            textDecoration: 'underline',
            fontWeight: 600,
            cursor: 'pointer'
          }}
          target="_blank"
          rel="noopener noreferrer"
        >
          {children}
        </a>
      );
    },

    // Tables
    table: ({ node, ...props }) => (
      <table className="markdown-table" {...props} />
    ),
    thead: ({ node, ...props }) => <thead {...props} />,
    tbody: ({ node, ...props }) => <tbody {...props} />,
    tr: ({ node, ...props }) => <tr {...props} />,
    th: ({ node, ...props }) => (
      <th
        style={{
          padding: '8px 12px',
          borderBottom: '2px solid #e5e7eb',
          textAlign: 'left',
          fontWeight: '600',
          backgroundColor: '#f9fafb'
        }}
        {...props}
      />
    ),
    td: ({ node, ...props }) => (
      <td
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid #e5e7eb'
        }}
        {...props}
      />
    ),

    // Headings - no inline margins, let CSS control spacing
    h1: ({ node, ...props }) => (
      <h1 className="markdown-h1" {...props} />
    ),
    h2: ({ node, ...props }) => (
      <h2 className="markdown-h2" {...props} />
    ),
    h3: ({ node, ...props }) => (
      <h3 className="markdown-h3" {...props} />
    ),
    h4: ({ node, ...props }) => <h4 className="markdown-h4" {...props} />,
    h5: ({ node, ...props}) => <h5 className="markdown-h5" {...props} />,
    h6: ({ node, ...props }) => <h6 className="markdown-h6" {...props} />,

    // Paragraphs - no inline margins, let CSS control spacing
    p: ({ node, ...props }) => (
      <p className="markdown-paragraph" {...props} />
    ),

    // Bold text - with clickable document name support
    strong: ({ node, children, ...props }) => {
      // Get text content from children
      const textContent = React.Children.toArray(children)
        .filter(child => typeof child === 'string')
        .join('');

      // Check if this is a document name or "See all" link
      if (isDocumentName(textContent) || textContent.toLowerCase().includes('see all')) {
        const normalizedName = textContent.toLowerCase().replace(/[_-]/g, ' ');
        const documentId = documentMap.get(normalizedName) || documentMap.get(textContent.toLowerCase());

        return (
          <ClickableDocumentName
            documentName={textContent}
            documentId={documentId}
            onOpenPreview={onOpenPreview}
          />
        );
      }

      // Default bold rendering
      return <strong style={{ fontWeight: 600 }} {...props}>{children}</strong>;
    },

    // Lists - no inline margins, let CSS control spacing
    ul: ({ node, ...props }) => (
      <ul className="markdown-ul" {...props} />
    ),
    ol: ({ node, ...props }) => (
      <ol className="markdown-ol" {...props} />
    ),
    li: ({ node, ...props }) => (
      <li className="markdown-li" {...props} />
    ),

    // Code - check if it contains a document name and render as clickable
    code: ({ node, inline, children, ...props }) => {
      // Get text content from children
      const textContent = React.Children.toArray(children)
        .filter(child => typeof child === 'string')
        .join('');

      // Check if the code contains a document filename pattern: **filename.ext** or filename.ext
      const docPattern = /^\*?\*?([^*]+\.(pdf|docx?|xlsx?|pptx?|txt|csv|png|jpg|jpeg|gif))\*?\*?$/i;
      const match = textContent.match(docPattern);

      if (match && inline) {
        // Extract the filename without the asterisks
        const filename = match[1];
        const normalizedName = filename.toLowerCase().replace(/[_-]/g, ' ');
        const documentId = documentMap.get(normalizedName) || documentMap.get(filename.toLowerCase());

        return (
          <ClickableDocumentName
            documentName={filename}
            documentId={documentId}
            onOpenPreview={onOpenPreview}
          />
        );
      }

      // Default code rendering
      return inline ? (
        <code className="markdown-inline-code" {...props}>{children}</code>
      ) : (
        <code className="markdown-code-block" {...props}>{children}</code>
      );
    },

    // Blockquotes
    blockquote: ({ node, ...props }) => (
      <blockquote className="markdown-blockquote" {...props} />
    ),

    // Horizontal rules
    hr: ({ node, ...props }) => (
      <hr className="markdown-hr" {...props} />
    ),

    // Images
    img: ({ node, ...props }) => (
      <img
        className="markdown-image"
        {...props}
        alt={props.alt || ''}
      />
    ),
  };

  // Merge custom components with defaults - memoized to include document context
  const components = useMemo(() => {
    return { ...defaultComponents, ...customComponents };
  }, [documentMap, onOpenPreview, customComponents]);

  // ============================================================
  // STREAMING HOLDBACK: Hold back incomplete markers during streaming
  // This prevents raw marker text from flashing on screen
  // ============================================================
  const { safeContent, heldBack } = useMemo(() => {
    return applyStreamingHoldback(content || '', isStreaming);
  }, [content, isStreaming]);

  // Clean content: normalize whitespace and fix UTF-8 encoding issues
  // Per Koda Markdown Contract: max 2 newlines, fix Portuguese character encoding
  const normalizedContent = useMemo(() => {
    if (!safeContent) return '';

    let cleaned = safeContent;

    // Fix UTF-8 encoding issues (VocÃª → Você) - common Portuguese character encoding
    cleaned = cleaned
      .replace(/Ã§/g, 'ç')
      .replace(/Ã£/g, 'ã')
      .replace(/Ã©/g, 'é')
      .replace(/Ã¡/g, 'á')
      .replace(/Ã³/g, 'ó')
      .replace(/Ãª/g, 'ê')
      .replace(/Ã­/g, 'í')
      .replace(/Ãº/g, 'ú')
      .replace(/Ã /g, 'à')
      .replace(/Ã´/g, 'ô')
      .replace(/Ã‚/g, 'Â')
      .replace(/Ã€/g, 'À')
      .replace(/Ã‰/g, 'É');

    // ============================================================
    // FIX: Convert document markers to bold text format
    // This allows the existing bold text handler to make them clickable
    // ============================================================

    // Parse legacy document markers: {{DOC:::id:::filename:::...}}
    const legacyDocs = parseInlineDocuments(cleaned);
    legacyDocs.forEach(doc => {
      cleaned = cleaned.replace(doc.marker, `**${doc.filename}**`);
    });

    // Parse simple document markers: [[DOC:id:name]]
    const simpleDocs = parseSimpleDocMarkers(cleaned);
    simpleDocs.forEach(doc => {
      cleaned = cleaned.replace(doc.marker, `**${doc.filename}**`);
    });

    // Parse folder markers: {{FOLDER:::id:::name:::count:::path}}
    const folders = parseInlineFolders(cleaned);
    folders.forEach(folder => {
      cleaned = cleaned.replace(folder.marker, `**${folder.folderName}/**`);
    });

    // Parse load more markers: {{LOADMORE:::remaining:::total:::loaded}}
    const loadMore = parseLoadMoreMarkers(cleaned);
    loadMore.forEach(marker => {
      cleaned = cleaned.replace(marker.marker, `**Ver todos os ${marker.totalCount} arquivos**`);
    });

    // Parse see all markers: [[SEE_ALL:text]]
    const seeAll = parseSeeAllMarkers(cleaned);
    seeAll.forEach(marker => {
      cleaned = cleaned.replace(marker.marker, `**${marker.linkText}**`);
    });

    // ============================================================
    // V3: Parse new {{DOC::id=...::name="..."}} marker format
    // ============================================================
    if (hasV3Markers(cleaned)) {
      const v3Docs = parseV3DocMarkers(cleaned);
      v3Docs.forEach(doc => {
        // Replace V3 marker with bold text format for existing handler
        const markerPattern = /\{\{DOC::[^}]+\}\}/g;
        cleaned = cleaned.replace(markerPattern, `**${doc.filename}**`);
      });

      const v3LoadMore = parseV3LoadMoreMarkers(cleaned);
      v3LoadMore.forEach(lm => {
        const pattern = /\{\{LOADMORE::[^}]+\}\}/g;
        cleaned = cleaned.replace(pattern, `**See all ${lm.totalCount} documents**`);
      });
    }

    // ============================================================
    // FIX: Convert backtick+bold document citations to just bold
    // LLM sometimes outputs: `**filename.pdf**` instead of **filename.pdf**
    // The backticks prevent markdown from rendering the bold as clickable
    // Pattern: `**document.ext**` → **document.ext**
    // ============================================================
    cleaned = cleaned.replace(/`\*\*([^*]+\.(pdf|docx?|xlsx?|pptx?|txt|csv|png|jpg|jpeg|gif))\*\*`/gi, '**$1**');

    // Also handle: (from `**filename**`) patterns
    cleaned = cleaned.replace(/\(from\s+`\*\*([^*]+)\*\*`\)/gi, '(from **$1**)');

    // Handle Source: `**filename**` patterns
    cleaned = cleaned.replace(/Source:\s*`\*\*([^*]+)\*\*`/gi, 'Source: **$1**');

    // Normalize whitespace per Koda Markdown Contract
    cleaned = cleaned
      .replace(/\n{3,}/g, '\n\n')  // 3+ newlines → 2 (max 2 per contract)
      .replace(/[ \t]+$/gm, '')    // Remove trailing whitespace
      .replace(/\r\n/g, '\n');     // Consistent line endings

    return cleaned.trim();
  }, [safeContent]);

  // Memoize the markdown rendering for performance
  const renderedMarkdown = useMemo(() => {
    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={components}
      >
        {normalizedContent}
      </ReactMarkdown>
    );
  }, [normalizedContent, components]);

  return (
    <div
      className={`koda-markdown markdown-preview-container ${isStreaming ? 'streaming' : ''} ${className}`}
      style={{
        color: '#171717',
        fontSize: '14px',
        fontFamily: 'Plus Jakarta Sans, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontWeight: '400',
        lineHeight: '1.6',
        width: '100%',
        wordWrap: 'break-word',
        overflowWrap: 'break-word'
      }}
    >
      {renderedMarkdown}
      {/* Show held-back content as plain text during streaming (pending marker completion) */}
      {isStreaming && heldBack && (
        <span className="held-back-text" style={{ opacity: 0.7 }}>{heldBack}</span>
      )}
      {isStreaming && (
        <span className="streaming-cursor" aria-hidden="true" />
      )}
    </div>
  );
};

export default StreamingMarkdown;
