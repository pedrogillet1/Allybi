import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../services/api';

const SearchInDocumentModal = ({ documentId, document, onClose }) => {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [currentMatch, setCurrentMatch] = useState(0);
  const [totalMatches, setTotalMatches] = useState(0);
  const [searching, setSearching] = useState(false);
  const [highlightedElements, setHighlightedElements] = useState([]);
  const inputRef = useRef(null);

  // Focus input when modal opens
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'Enter') {
        if (e.shiftKey) {
          navigateToPrevious();
        } else if (searchQuery.trim() && totalMatches === 0) {
          handleSearch();
        } else if (totalMatches > 0) {
          navigateToNext();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [searchQuery, currentMatch, totalMatches]);

  // Cleanup highlights on unmount
  useEffect(() => {
    return () => {
      clearHighlights();
    };
  }, []);

  // Clear existing highlights
  const clearHighlights = () => {
    highlightedElements.forEach(el => {
      const parent = el.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(el.textContent), el);
        parent.normalize();
      }
    });
    setHighlightedElements([]);
  };

  // Perform search
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setSearching(true);
    clearHighlights();

    try {
      // Wait a bit for PDF text layer to render if needed
      await new Promise(resolve => setTimeout(resolve, 100));

      // Search directly in the DOM (works for PDFs with text layer)
      const textNodes = getTextNodes(document.body);
      const lowerQuery = searchQuery.toLowerCase();
      let matchCount = 0;


      textNodes.forEach((node) => {
        const text = node.textContent;
        const lowerText = text.toLowerCase();
        let index = lowerText.indexOf(lowerQuery);

        while (index !== -1) {
          matchCount++;
          index = lowerText.indexOf(lowerQuery, index + 1);
        }
      });

      if (matchCount > 0) {
        setTotalMatches(matchCount);
        setCurrentMatch(1);
        highlightMatches();
        scrollToMatch(0);
      } else {
        setTotalMatches(0);
        setCurrentMatch(0);
      }
    } catch (error) {

      setTotalMatches(0);
      setCurrentMatch(0);
    } finally {
      setSearching(false);
    }
  };

  // Highlight all matches in the document
  const highlightMatches = () => {
    try {
      const newHighlightedElements = [];
      const textNodes = getTextNodes(document.body);
      const lowerQuery = searchQuery.toLowerCase();

      textNodes.forEach((node) => {
        const text = node.textContent;
        const lowerText = text.toLowerCase();
        let index = lowerText.indexOf(lowerQuery);

        if (index !== -1) {
          const fragment = document.createDocumentFragment();
          let lastIndex = 0;

          while (index !== -1) {
            // Add text before match
            if (index > lastIndex) {
              fragment.appendChild(
                document.createTextNode(text.substring(lastIndex, index))
              );
            }

            // Add highlighted match
            const span = document.createElement('span');
            span.className = 'search-highlight';
            span.textContent = text.substring(index, index + searchQuery.length);
            span.style.backgroundColor = '#fef08a';
            span.style.padding = '2px 0';
            span.style.borderRadius = '2px';
            span.setAttribute('data-match-index', newHighlightedElements.length);
            fragment.appendChild(span);
            newHighlightedElements.push(span);

            lastIndex = index + searchQuery.length;
            index = lowerText.indexOf(lowerQuery, lastIndex);
          }

          // Add remaining text
          if (lastIndex < text.length) {
            fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
          }

          // Replace original text node with fragment
          node.parentNode.replaceChild(fragment, node);
        }
      });

      setHighlightedElements(newHighlightedElements);
      setTotalMatches(newHighlightedElements.length);
    } catch (error) {

    }
  };

  // Get all text nodes in the document
  const getTextNodes = (element) => {
    const textNodes = [];

    // Specifically target PDF text layer elements
    const pdfTextLayers = document.querySelectorAll('.react-pdf__Page__textContent');

    if (pdfTextLayers.length > 0) {
      // Search within PDF text layers
      pdfTextLayers.forEach((layer) => {
        const walker = document.createTreeWalker(
          layer,
          NodeFilter.SHOW_TEXT,
          {
            acceptNode: (node) => {
              // Skip empty text nodes
              if (!node.textContent.trim()) {
                return NodeFilter.FILTER_REJECT;
              }
              return NodeFilter.FILTER_ACCEPT;
            }
          }
        );

        let node;
        while ((node = walker.nextNode())) {
          textNodes.push(node);
        }
      });
    } else {
      // Fallback to searching entire document
      const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: (node) => {
            // Skip script, style, and already highlighted elements
            if (
              node.parentElement.tagName === 'SCRIPT' ||
              node.parentElement.tagName === 'STYLE' ||
              node.parentElement.classList?.contains('search-highlight')
            ) {
              return NodeFilter.FILTER_REJECT;
            }
            // Skip empty text nodes
            if (!node.textContent.trim()) {
              return NodeFilter.FILTER_REJECT;
            }
            return NodeFilter.FILTER_ACCEPT;
          }
        }
      );

      let node;
      while ((node = walker.nextNode())) {
        textNodes.push(node);
      }
    }

    if (textNodes.length > 0) {

    }

    return textNodes;
  };

  // Scroll to specific match
  const scrollToMatch = (matchIndex) => {
    try {
      if (matchIndex < 0 || matchIndex >= highlightedElements.length) return;

      // Remove active class from all highlights
      highlightedElements.forEach(el => {
        el.style.backgroundColor = '#fef08a';
        el.style.fontWeight = 'normal';
      });

      // Add active class to current match
      const currentHighlight = highlightedElements[matchIndex];
      if (currentHighlight) {
        currentHighlight.style.backgroundColor = '#fbbf24';
        currentHighlight.style.fontWeight = '600';
        currentHighlight.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
      }
    } catch (error) {

    }
  };

  // Navigate to next match
  const navigateToNext = () => {
    if (totalMatches === 0) return;

    const nextMatch = currentMatch >= totalMatches ? 1 : currentMatch + 1;
    setCurrentMatch(nextMatch);
    scrollToMatch(nextMatch - 1);
  };

  // Navigate to previous match
  const navigateToPrevious = () => {
    if (totalMatches === 0) return;

    const prevMatch = currentMatch <= 1 ? totalMatches : currentMatch - 1;
    setCurrentMatch(prevMatch);
    scrollToMatch(prevMatch - 1);
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: 100,
        zIndex: 2000,
        animation: 'fadeIn 0.2s ease'
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white',
          borderRadius: 12,
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
          width: '90%',
          maxWidth: 500,
          animation: 'slideDown 0.3s ease'
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '20px 24px',
            borderBottom: '1px solid #e5e7eb'
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: '600',
              color: '#1f2937',
              fontFamily: 'Plus Jakarta Sans'
            }}
          >
            {t('searchInDocument.title')}
          </h3>
          <button
            onClick={onClose}
            style={{
              padding: 4,
              background: 'none',
              border: 'none',
              color: '#6b7280',
              cursor: 'pointer',
              borderRadius: 4,
              transition: 'all 0.2s',
              fontSize: 20,
              lineHeight: 1,
              width: 28,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#f3f4f6';
              e.currentTarget.style.color = '#1f2937';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'none';
              e.currentTarget.style.color = '#6b7280';
            }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 24 }}>
          {/* Search Input */}
          <div style={{ position: 'relative', marginBottom: 16 }}>
            <input
              ref={inputRef}
              type="text"
              placeholder={t('searchInDocument.searchForText')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  if (totalMatches === 0) {
                    handleSearch();
                  } else {
                    navigateToNext();
                  }
                }
              }}
              style={{
                width: '100%',
                padding: '12px 16px',
                paddingRight: totalMatches > 0 ? 70 : 16,
                border: '2px solid #e5e7eb',
                borderRadius: 8,
                fontSize: 16,
                fontFamily: 'Plus Jakarta Sans',
                transition: 'all 0.2s',
                outline: 'none'
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#3b82f6';
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#e5e7eb';
                e.currentTarget.style.boxShadow = 'none';
              }}
            />

            {/* Match Counter */}
            {totalMatches > 0 && (
              <div
                style={{
                  position: 'absolute',
                  right: 16,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontSize: 14,
                  color: '#6b7280',
                  fontWeight: '500',
                  fontFamily: 'Plus Jakarta Sans'
                }}
              >
                {currentMatch}/{totalMatches}
              </div>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* Previous Button */}
            <button
              onClick={navigateToPrevious}
              disabled={totalMatches === 0}
              title={t('searchInDocument.previousMatch')}
              style={{
                padding: '8px 12px',
                background: '#f3f4f6',
                border: '1px solid #e5e7eb',
                borderRadius: 6,
                cursor: totalMatches === 0 ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: totalMatches === 0 ? 0.5 : 1
              }}
              onMouseEnter={(e) => {
                if (totalMatches > 0) e.currentTarget.style.background = '#e5e7eb';
              }}
              onMouseLeave={(e) => {
                if (totalMatches > 0) e.currentTarget.style.background = '#f3f4f6';
              }}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>

            {/* Next Button */}
            <button
              onClick={navigateToNext}
              disabled={totalMatches === 0}
              title={t('searchInDocument.nextMatch')}
              style={{
                padding: '8px 12px',
                background: '#f3f4f6',
                border: '1px solid #e5e7eb',
                borderRadius: 6,
                cursor: totalMatches === 0 ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: totalMatches === 0 ? 0.5 : 1
              }}
              onMouseEnter={(e) => {
                if (totalMatches > 0) e.currentTarget.style.background = '#e5e7eb';
              }}
              onMouseLeave={(e) => {
                if (totalMatches > 0) e.currentTarget.style.background = '#f3f4f6';
              }}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>

            {/* Cancel Button */}
            <button
              onClick={() => {
                clearHighlights();
                onClose();
              }}
              style={{
                padding: '10px 20px',
                background: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: '500',
                color: '#6b7280',
                cursor: 'pointer',
                transition: 'all 0.2s',
                marginLeft: 'auto',
                fontFamily: 'Plus Jakarta Sans'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#f9fafb';
                e.currentTarget.style.borderColor = '#d1d5db';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'white';
                e.currentTarget.style.borderColor = '#e5e7eb';
              }}
            >
              {t('common.cancel')}
            </button>

            {/* Search Button */}
            <button
              onClick={handleSearch}
              disabled={!searchQuery.trim() || searching}
              style={{
                padding: '10px 24px',
                background: !searchQuery.trim() || searching ? '#999' : '#1f2937',
                border: 'none',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: '500',
                color: 'white',
                cursor: !searchQuery.trim() || searching ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                fontFamily: 'Plus Jakarta Sans',
                opacity: !searchQuery.trim() || searching ? 0.5 : 1
              }}
              onMouseEnter={(e) => {
                if (searchQuery.trim() && !searching) {
                  e.currentTarget.style.background = '#111827';
                }
              }}
              onMouseLeave={(e) => {
                if (searchQuery.trim() && !searching) {
                  e.currentTarget.style.background = '#1f2937';
                }
              }}
            >
              {searching ? t('common.searching') : t('common.search')}
            </button>
          </div>

          {/* No Results Message */}
          {totalMatches === 0 && searchQuery && !searching && (
            <div
              style={{
                marginTop: 16,
                padding: 12,
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: 6,
                color: '#991b1b',
                fontSize: 14,
                textAlign: 'center',
                fontFamily: 'Plus Jakarta Sans'
              }}
            >
              {t('searchInDocument.noMatchesFound', { query: searchQuery })}
            </div>
          )}
        </div>
      </div>

      <style>
        {`
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }

          @keyframes slideDown {
            from {
              transform: translateY(-20px);
              opacity: 0;
            }
            to {
              transform: translateY(0);
              opacity: 1;
            }
          }
        `}
      </style>
    </div>
  );
};

export default SearchInDocumentModal;
