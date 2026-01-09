// FILE: frontend/src/components/ClickableDocumentName.jsx
// PURPOSE: Make document names clickable to open preview modal
//
// IMPORTANT: Document IDs are NEVER displayed to users
// - The ID is only used internally to open the correct preview
// - User only sees the clean document name

import React from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Clickable Document Name Component
 *
 * Renders a document name that:
 * 1. Opens preview modal when clicked (if documentId provided)
 * 2. Navigates to /documents if "See all" is clicked
 * 3. Shows hover effect with underline styling
 *
 * INLINE STYLE: Documents mentioned in text appear with underline (not as button)
 * This distinguishes inline citations from document list items which use full buttons
 *
 * NOTE: The documentId is used internally ONLY - never displayed to user
 */
export const ClickableDocumentName = ({
  documentName,
  documentId,
  pageNumber,  // Optional: page to jump to
  onOpenPreview
}) => {
  const navigate = useNavigate();

  const handleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();

    // Handle "See all" link
    if (documentName.toLowerCase().includes('see all')) {
      navigate('/documents');
      return;
    }

    // Handle document preview - pass pageNumber for jump-to-page
    if (documentId && onOpenPreview) {
      onOpenPreview(documentId, documentName, pageNumber);
    }
  };

  const isClickable = documentId || documentName.toLowerCase().includes('see all');

  // Build display text and tooltip
  const displayText = pageNumber ? `${documentName} (Page ${pageNumber})` : documentName;
  const tooltipText = isClickable
    ? pageNumber
      ? `Click to jump to page ${pageNumber} in ${documentName}`
      : `Click to preview: ${documentName}`
    : documentName;

  // Style: Underlined text (like a link) - not a button
  // This is the expected inline citation style per user request
  return (
    <span
      onClick={isClickable ? handleClick : undefined}
      className={isClickable ? 'clickable-document-name' : ''}
      style={{
        fontWeight: 600,
        color: '#303030',
        textDecoration: 'underline',
        textDecorationColor: '#6B7280',
        textUnderlineOffset: '2px',
        cursor: isClickable ? 'pointer' : 'inherit',
        transition: 'all 0.2s ease',
        borderRadius: '2px',
        padding: '0 2px',
      }}
      onMouseEnter={(e) => {
        if (isClickable) {
          e.target.style.backgroundColor = '#F3F4F6';
          e.target.style.textDecorationColor = '#303030';
        }
      }}
      onMouseLeave={(e) => {
        e.target.style.backgroundColor = 'transparent';
        e.target.style.textDecorationColor = '#6B7280';
      }}
      title={tooltipText}
    >
      {displayText}
    </span>
  );
};

// ============================================================================
// DOCUMENT NAME DETECTION UTILITIES
// ============================================================================

// Pattern to detect document file extensions
const DOCUMENT_EXTENSIONS = /\.(pdf|docx?|xlsx?|pptx?|txt|csv|png|jpg|jpeg)$/i;

/**
 * Normalize document name for matching
 * Handles accented characters and encoding variations:
 * - "Contrato de Locação.pdf" matches "contrato de locacao.pdf"
 * - "relatório_financeiro.pdf" matches "relatorio financeiro.pdf"
 *
 * Uses Unicode NFD normalization to decompose accented characters,
 * then removes diacritical marks.
 */
export function normalizeDocumentName(name) {
  if (!name || typeof name !== 'string') return '';

  return name
    .toLowerCase()
    // NFD normalization: decompose accented characters (é → e + ́)
    .normalize('NFD')
    // Remove diacritical marks (the combining characters after decomposition)
    .replace(/[\u0300-\u036f]/g, '')
    // Replace underscores and hyphens with spaces
    .replace(/[_-]/g, ' ')
    // Collapse multiple whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if text content is a document name
 */
export function isDocumentName(text) {
  if (!text || typeof text !== 'string') return false;
  return DOCUMENT_EXTENSIONS.test(text.trim());
}

/**
 * Parse markdown text and extract document names
 *
 * Converts: "In **contrato.pdf**, the cost is..."
 * To: [
 *   { type: 'text', content: 'In ' },
 *   { type: 'document', content: 'contrato.pdf', documentId: '...' },
 *   { type: 'text', content: ', the cost is...' }
 * ]
 */
export function parseDocumentNames(text, documentMap) {
  const parts = [];

  // Pattern to match **document.pdf**
  const pattern = /\*\*([^*]+\.(pdf|docx?|xlsx?|pptx?|txt|csv|png|jpg|jpeg|See all))\*\*/gi;

  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      parts.push({
        type: 'text',
        content: text.substring(lastIndex, match.index)
      });
    }

    // Add the document name - use NFD normalization for accent-insensitive matching
    const documentName = match[1];
    const normalizedName = normalizeDocumentName(documentName);
    const documentId = documentMap.get(normalizedName) || documentMap.get(documentName.toLowerCase());

    parts.push({
      type: 'document',
      content: documentName,
      documentId
    });

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push({
      type: 'text',
      content: text.substring(lastIndex)
    });
  }

  return parts;
}

// ============================================================================
// CHAT MESSAGE COMPONENT WITH CLICKABLE DOCUMENTS
// ============================================================================

/**
 * Chat Message Component
 *
 * Renders a chat message with clickable document names
 */
export const ChatMessage = ({
  message,
  documents = [],
  onOpenPreview
}) => {
  // Build document name → document ID map with NFD normalization
  const documentMap = new Map();
  documents.forEach(doc => {
    // Normalize document name (accents, underscores/hyphens removed)
    const normalized = normalizeDocumentName(doc.name);
    documentMap.set(normalized, doc.id);

    // Also store original name (lowercase only) for exact matches
    documentMap.set(doc.name.toLowerCase(), doc.id);
  });

  // Parse message into parts
  const parts = parseDocumentNames(message, documentMap);

  return (
    <div className="chat-message">
      {parts.map((part, index) => {
        if (part.type === 'document') {
          return (
            <ClickableDocumentName
              key={index}
              documentName={part.content}
              documentId={part.documentId}
              onOpenPreview={onOpenPreview}
            />
          );
        }
        return <span key={index}>{part.content}</span>;
      })}
    </div>
  );
};

// ============================================================================
// CUSTOM STRONG COMPONENT FOR REACT-MARKDOWN
// ============================================================================

/**
 * Custom strong component that makes document names clickable
 * Use this with react-markdown's components prop
 *
 * Example:
 * <ReactMarkdown
 *   components={{
 *     strong: createClickableStrongComponent(documents, onOpenPreview)
 *   }}
 * >
 *   {content}
 * </ReactMarkdown>
 */
export function createClickableStrongComponent(documents = [], onOpenPreview) {
  // Build document map with NFD normalization for accent-insensitive matching
  const documentMap = new Map();
  documents.forEach(doc => {
    const name = doc.name || doc.filename || doc.documentName || '';
    const id = doc.id || doc.documentId || '';
    if (name && id) {
      const normalized = normalizeDocumentName(name);
      documentMap.set(normalized, id);
      documentMap.set(name.toLowerCase(), id);
    }
  });

  return function ClickableStrong({ node, children, ...props }) {
    // Get text content from children
    const textContent = React.Children.toArray(children)
      .filter(child => typeof child === 'string')
      .join('');

    // Check if this is a document name
    if (isDocumentName(textContent) || textContent.toLowerCase().includes('see all')) {
      const normalizedName = normalizeDocumentName(textContent);
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
  };
}

export default ClickableDocumentName;
