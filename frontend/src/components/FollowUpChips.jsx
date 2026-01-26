/**
 * FollowUpChips Component
 *
 * Renders ChatGPT-style follow-up suggestion chips/buttons.
 * Max 3 suggestions, styled as clickable pills.
 */

import React from 'react';

/**
 * @typedef {Object} FollowUpSuggestion
 * @property {string} id - Unique ID
 * @property {string} action - Action type
 * @property {string} label - Display label
 * @property {number} priority - Priority (1 = highest)
 * @property {string} [prompt] - Prefilled prompt to send
 * @property {Object} [payload] - Direct action payload
 */

/**
 * FollowUpChips component
 *
 * @param {Object} props
 * @param {FollowUpSuggestion[]} props.suggestions - List of suggestions (max 3)
 * @param {(suggestion: FollowUpSuggestion) => void} props.onSelect - Called when user clicks a chip
 * @param {boolean} [props.disabled] - Whether chips are disabled
 * @param {'light' | 'dark'} [props.theme] - Color theme
 */
export default function FollowUpChips({
  suggestions = [],
  onSelect,
  disabled = false,
  theme = 'light',
}) {
  if (!suggestions || suggestions.length === 0) {
    return null;
  }

  // Only show max 3
  const displaySuggestions = suggestions.slice(0, 3);

  const handleClick = (suggestion) => {
    if (disabled) return;
    onSelect?.(suggestion);
  };

  const handleKeyDown = (e, suggestion) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick(suggestion);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.label}>
        {theme === 'light' ? '💡' : '✨'} Suggested:
      </div>
      <div style={styles.chipsRow}>
        {displaySuggestions.map((suggestion) => (
          <button
            key={suggestion.id}
            onClick={() => handleClick(suggestion)}
            onKeyDown={(e) => handleKeyDown(e, suggestion)}
            disabled={disabled}
            style={{
              ...styles.chip,
              ...(theme === 'dark' ? styles.chipDark : styles.chipLight),
              ...(disabled ? styles.chipDisabled : {}),
            }}
            aria-label={suggestion.label}
            tabIndex={0}
          >
            <span style={styles.chipIcon}>
              {getActionIcon(suggestion.action)}
            </span>
            <span style={styles.chipLabel}>
              {suggestion.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Get icon for action type
 */
function getActionIcon(action) {
  const icons = {
    // Document actions
    'summarize': '📝',
    'summarize_file': '📝',
    'extract': '📋',
    'extract_related': '📋',
    'extract_key_sections': '📋',
    'locate': '🔍',
    'find_mentions': '🔍',
    'compare': '⚖️',
    'compare_with_similar': '⚖️',

    // File actions
    'open': '📄',
    'open_section': '📄',
    'open_newest': '📄',
    'open_top_match': '📄',
    'preview': '👁️',
    'list_files': '📁',
    'filter_by_type': '🏷️',
    'group_by_folder': '📂',

    // Source actions
    'show_sources': '📎',
    'show_more_matches': '➕',

    // Excel/finance actions
    'compute': '🔢',
    'compare_periods': '📊',
    'show_table': '📊',
    'explain_outlier': '📈',
    'locate_definition': '🔍',

    // Format actions
    'format_bullets': '•',
    'format_table': '▤',

    // Clarification
    'clarify_file': '❓',
    'clarify_period': '📅',
    'clarify_metric': '📏',

    // Default
    'default': '→',
  };

  return icons[action] || icons.default;
}

const styles = {
  container: {
    marginTop: '12px',
    paddingTop: '12px',
    borderTop: '1px solid #E5E7EB',
  },
  label: {
    fontSize: '12px',
    color: '#6B7280',
    marginBottom: '8px',
    fontWeight: 500,
  },
  chipsRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 12px',
    borderRadius: '20px',
    border: '1px solid',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 500,
    transition: 'all 0.15s ease',
    outline: 'none',
  },
  chipLight: {
    backgroundColor: '#F9FAFB',
    borderColor: '#E5E7EB',
    color: '#374151',
    ':hover': {
      backgroundColor: '#F3F4F6',
      borderColor: '#D1D5DB',
    },
    ':focus': {
      borderColor: '#3B82F6',
      boxShadow: '0 0 0 2px rgba(59, 130, 246, 0.2)',
    },
  },
  chipDark: {
    backgroundColor: '#374151',
    borderColor: '#4B5563',
    color: '#F9FAFB',
  },
  chipDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  chipIcon: {
    fontSize: '14px',
  },
  chipLabel: {
    maxWidth: '200px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
};

/**
 * Hook to handle follow-up chip selection
 */
export function useFollowUpHandler(sendMessage, setPreviewDocument) {
  const handleFollowUpSelect = React.useCallback((suggestion) => {
    // If suggestion has a prompt, send it as a message
    if (suggestion.prompt) {
      sendMessage(suggestion.prompt);
      return;
    }

    // If suggestion has a payload with action
    if (suggestion.payload) {
      const { action, fileId, files } = suggestion.payload;

      // Open file directly
      if (action === 'open' && fileId) {
        setPreviewDocument?.({ id: fileId });
        return;
      }

      // Select file (show picker)
      if (action === 'select_file' && files) {
        // This would trigger a file picker UI
        // For now, just show the first file
        if (files[0]) {
          setPreviewDocument?.({ id: files[0].id });
        }
        return;
      }
    }

    // Default: use action as a prompt
    const defaultPrompts = {
      'show_sources': 'Show me the sources',
      'list_files': 'List my files',
      'filter_by_type': 'Filter files by type',
      'show_table': 'Show as a table',
      'compare_periods': 'Compare Q1 vs Q2',
    };

    const prompt = defaultPrompts[suggestion.action] || suggestion.label;
    sendMessage(prompt);
  }, [sendMessage, setPreviewDocument]);

  return handleFollowUpSelect;
}
