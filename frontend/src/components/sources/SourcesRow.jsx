/**
 * ============================================================================
 * SOURCES ROW - CHATGPT-PARITY SOURCE PILLS
 * ============================================================================
 *
 * Single rendering path for ALL source pills.
 * Renders a "Sources:" label followed by clickable document pills.
 *
 * NAV_PILL MODE: When answerMode === 'nav_pill' (for open/locate commands),
 * hides the "Sources:" label and divider for cleaner UX.
 * ============================================================================
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { getFileIcon } from '../../utils/iconMapper';

// Max visible pills before showing "See all"
const MAX_VISIBLE_PILLS = 5;

/**
 * SourcesRow Component - Renders source pills after answer
 */
const SourcesRow = ({
  sourceButtons,
  attachments,
  onSourceClick,
  language = 'en',
  inline = false,
}) => {
  const navigate = useNavigate();

  // Get buttons and answerMode from sourceButtons or attachments
  let rawButtons = [];
  let answerMode = null;

  // Priority 1: sourceButtons (new format)
  if (sourceButtons?.buttons?.length > 0) {
    rawButtons = sourceButtons.buttons;
    answerMode = sourceButtons.answerMode || null;
  }
  // Priority 2: source_buttons attachment
  else if (attachments?.length > 0) {
    const sourceAttachment = attachments.find(a => a.type === 'source_buttons');
    if (sourceAttachment?.buttons?.length > 0) {
      rawButtons = sourceAttachment.buttons;
      answerMode = sourceAttachment.answerMode || null;
    }
  }

  // NAV_PILLS mode: hide label and divider for open/locate commands
  // Supports both 'nav_pill' (legacy) and 'nav_pills' (current) for compatibility
  const isNavPill = answerMode === 'nav_pill' || answerMode === 'nav_pills';

  // Get seeAll data
  const seeAllData = sourceButtons?.seeAll || null;

  // Dedupe by documentId (simple, no useMemo to avoid hot reload issues)
  const seenIds = new Set();
  const uniqueButtons = [];
  for (const btn of rawButtons) {
    const docId = btn.documentId || btn.id;
    if (docId && !seenIds.has(docId)) {
      seenIds.add(docId);
      uniqueButtons.push(btn);
    }
  }

  // Limit visible buttons
  const visibleButtons = uniqueButtons.slice(0, MAX_VISIBLE_PILLS);
  const remainingCount = seeAllData?.remainingCount ||
    (uniqueButtons.length > MAX_VISIBLE_PILLS ? uniqueButtons.length - MAX_VISIBLE_PILLS : 0);
  const hasMore = remainingCount > 0;

  // Don't render if no sources
  if (visibleButtons.length === 0) {
    return null;
  }

  // Labels by language
  const labels = {
    en: { sources: 'Sources:', seeAll: 'See all' },
    pt: { sources: 'Fontes:', seeAll: 'Ver todos' },
    es: { sources: 'Fuentes:', seeAll: 'Ver todos' },
  };
  const l = labels[language] || labels.en;

  const handleSourceClick = (btn) => {
    console.log('📂 [SourcesRow] Button clicked:', {
      documentId: btn.documentId,
      title: btn.title,
      mimeType: btn.mimeType,
    });
    if (onSourceClick) {
      onSourceClick({
        id: btn.documentId,
        filename: btn.title,
        mimeType: btn.mimeType,
      });
    }
  };

  const handleSeeAllClick = () => {
    if (seeAllData?.filterExtensions) {
      navigate('/documents', { state: { from: 'chat', filterExtensions: seeAllData.filterExtensions } });
    } else {
      navigate('/documents', { state: { from: 'chat' } });
    }
  };

  // Inline mode: no margins, borders, padding
  const inlineStyle = inline ? { marginTop: 0, paddingTop: 0, borderTop: 'none' } : {};

  return (
    <div
      className={isNavPill ? 'koda-sources-row koda-sources-row--nav-pill' : 'koda-sources-row'}
      data-testid="sources-row"
      data-answer-mode={answerMode || 'default'}
      style={inlineStyle}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        {/* Hide label for nav_pill mode (open/locate commands) */}
        {!isNavPill && <span className="koda-sources-label" style={{ marginBottom: 0 }}>{l.sources}</span>}
        {visibleButtons.map((btn, idx) => (
          <button
            key={btn.documentId || idx}
            className="koda-source-pill"
            onClick={() => handleSourceClick(btn)}
            title={btn.title}
            type="button"
          >
            <img
              src={getFileIcon(btn.title, btn.mimeType)}
              alt=""
              className="koda-source-pill-icon"
            />
            <span className="koda-source-pill-text">{btn.title}</span>
          </button>
        ))}

        {/* See All pill */}
        {hasMore && (
          <button
            className="koda-source-pill koda-source-pill--see-all"
            onClick={handleSeeAllClick}
            type="button"
          >
            {seeAllData?.label || l.seeAll} (+{remainingCount})
          </button>
        )}
      </div>
    </div>
  );
};

export default SourcesRow;
