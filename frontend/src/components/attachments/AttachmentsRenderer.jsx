/**
 * AttachmentsRenderer - Renders different attachment types from normalized messages
 *
 * CHATGPT PARITY: Single component that switches on attachment.type to render:
 * - source_buttons: Clickable pill buttons for source documents
 * - file_list: List of files with "See All" chip
 * - file_action: File action cards (SHOW_FILE, SELECT_FILE, etc.)
 * - warning: Warning/info messages
 * - fallback: Generic attachment display
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { getFileIcon } from '../../utils/iconMapper';

/**
 * AttachmentsRenderer component
 *
 * @param {Object} props
 * @param {Array} props.attachments - Normalized attachments array from message
 * @param {Function} props.onFileClick - Handler for file click (opens preview)
 * @param {Function} props.onSeeAllClick - Handler for "See All" click
 * @param {Object} props.styles - Optional custom styles
 */
const AttachmentsRenderer = ({
  attachments = [],
  onFileClick,
  onSeeAllClick,
  styles = {},
}) => {
  if (!attachments || attachments.length === 0) {
    return null;
  }

  return (
    <div className="attachments-container" style={{ marginTop: '12px', ...styles.container }}>
      {attachments.map((attachment, index) => (
        <AttachmentSwitch
          key={`${attachment.type}-${index}`}
          attachment={attachment}
          onFileClick={onFileClick}
          onSeeAllClick={onSeeAllClick}
          styles={styles}
        />
      ))}
    </div>
  );
};

/**
 * AttachmentSwitch - Renders the appropriate component based on attachment type
 */
const AttachmentSwitch = ({ attachment, onFileClick, onSeeAllClick, styles }) => {
  switch (attachment.type) {
    case 'source_buttons':
      return (
        <SourceButtonsAttachment
          buttons={attachment.buttons}
          seeAll={attachment.seeAll}
          onFileClick={onFileClick}
          onSeeAllClick={onSeeAllClick}
          styles={styles}
        />
      );

    case 'file_list':
      return (
        <FileListAttachment
          files={attachment.files}
          totalCount={attachment.totalCount}
          hasMore={attachment.hasMore}
          onFileClick={onFileClick}
          onSeeAllClick={onSeeAllClick}
          styles={styles}
        />
      );

    case 'file_action':
      return (
        <FileActionAttachment
          action={attachment.action}
          files={attachment.files}
          onFileClick={onFileClick}
          styles={styles}
        />
      );

    case 'warning':
      return (
        <WarningAttachment
          message={attachment.message}
          severity={attachment.severity}
          styles={styles}
        />
      );

    case 'attached_file':
      // User's attached files (shown in user messages)
      return (
        <AttachedFileChip
          id={attachment.id}
          filename={attachment.filename}
          mimeType={attachment.mimeType}
          onFileClick={onFileClick}
          styles={styles}
        />
      );

    default:
      console.warn('[AttachmentsRenderer] Unknown attachment type:', attachment.type);
      return (
        <FallbackAttachment
          attachment={attachment}
          styles={styles}
        />
      );
  }
};

/**
 * SourceButtonsAttachment - Clickable pills for source documents (ChatGPT-like)
 */
const SourceButtonsAttachment = ({ buttons, seeAll, onFileClick, onSeeAllClick, styles }) => {
  const navigate = useNavigate();
  if (!buttons || buttons.length === 0) return null;

  // Show max 10 buttons, then "See All"
  const visibleButtons = buttons.slice(0, 10);
  const hasMore = buttons.length > 10 || seeAll?.remainingCount > 0;

  return (
    <div
      className="source-buttons-container"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '8px',
        marginTop: '8px',
        ...styles.sourceButtons,
      }}
    >
      {visibleButtons.map((btn, idx) => (
        <button
          key={btn.documentId || idx}
          onClick={() => onFileClick?.({
            id: btn.documentId,
            filename: btn.title,
            mimeType: btn.mimeType,
          })}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '16px',
            color: '#fff',
            fontSize: '13px',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            maxWidth: '220px',
            ...styles.sourceButton,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
          }}
        >
          <img
            src={getFileIcon(btn.title, btn.mimeType)}
            alt=""
            style={{ width: '16px', height: '16px', flexShrink: 0 }}
          />
          <span style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {btn.title}
          </span>
        </button>
      ))}

      {/* See All chip */}
      {hasMore && (
        <button
          onClick={() => {
            if (onSeeAllClick) {
              onSeeAllClick(seeAll);
            } else {
              // Default: SPA navigate to documents
              navigate('/documents', { state: { from: 'chat' } });
            }
          }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '6px 12px',
            backgroundColor: 'rgba(168, 85, 247, 0.15)',
            border: '1px solid rgba(168, 85, 247, 0.3)',
            borderRadius: '16px',
            color: '#a855f7',
            fontSize: '13px',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            ...styles.seeAllButton,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(168, 85, 247, 0.25)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(168, 85, 247, 0.15)';
          }}
        >
          See all {seeAll?.totalCount || buttons.length}
        </button>
      )}
    </div>
  );
};

/**
 * FileListAttachment - List of files with optional "See All" chip
 */
const FileListAttachment = ({ files, totalCount, hasMore, onFileClick, onSeeAllClick, styles }) => {
  if (!files || files.length === 0) return null;

  // Show max 10 files
  const visibleFiles = files.slice(0, 10);

  return (
    <div
      className="file-list-container"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        marginTop: '8px',
        ...styles.fileList,
      }}
    >
      {visibleFiles.map((file, idx) => (
        <button
          key={file.id || idx}
          onClick={() => onFileClick?.(file)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 12px',
            backgroundColor: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '8px',
            color: '#fff',
            fontSize: '14px',
            textAlign: 'left',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            width: '100%',
            ...styles.fileListItem,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.06)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.03)';
          }}
        >
          <img
            src={getFileIcon(file.filename, file.mimeType)}
            alt=""
            style={{ width: '18px', height: '18px', flexShrink: 0 }}
          />
          <span style={{
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {file.filename}
          </span>
          {file.folderPath && (
            <span style={{
              fontSize: '12px',
              color: 'rgba(255, 255, 255, 0.5)',
              marginLeft: 'auto',
            }}>
              {file.folderPath}
            </span>
          )}
        </button>
      ))}

      {/* See All chip when there are more files */}
      {(hasMore || files.length > 10) && (
        <button
          onClick={() => onSeeAllClick?.({ totalCount })}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
            padding: '8px 16px',
            backgroundColor: 'rgba(168, 85, 247, 0.1)',
            border: '1px solid rgba(168, 85, 247, 0.2)',
            borderRadius: '8px',
            color: '#a855f7',
            fontSize: '13px',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            marginTop: '4px',
            ...styles.seeAllButton,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(168, 85, 247, 0.2)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(168, 85, 247, 0.1)';
          }}
        >
          See all {totalCount || files.length} files
        </button>
      )}
    </div>
  );
};

/**
 * FileActionAttachment - Cards for file actions (SHOW_FILE, SELECT_FILE, etc.)
 */
const FileActionAttachment = ({ action, files, onFileClick, styles }) => {
  if (!files || files.length === 0) return null;

  return (
    <div
      className="file-action-container"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        marginTop: '8px',
        ...styles.fileAction,
      }}
    >
      {files.map((file, idx) => (
        <button
          key={file.id || idx}
          onClick={() => onFileClick?.(file)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '12px 16px',
            backgroundColor: 'rgba(168, 85, 247, 0.08)',
            border: '1px solid rgba(168, 85, 247, 0.2)',
            borderRadius: '12px',
            color: '#fff',
            fontSize: '14px',
            textAlign: 'left',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            width: '100%',
            ...styles.fileActionCard,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(168, 85, 247, 0.15)';
            e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.3)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(168, 85, 247, 0.08)';
            e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.2)';
          }}
        >
          <img
            src={getFileIcon(file.filename, file.mimeType)}
            alt=""
            style={{ width: '24px', height: '24px', flexShrink: 0 }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontWeight: 500,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {file.filename}
            </div>
            {file.folderPath && (
              <div style={{
                fontSize: '12px',
                color: 'rgba(255, 255, 255, 0.5)',
                marginTop: '2px',
              }}>
                📁 {file.folderPath}
              </div>
            )}
          </div>
          <span style={{
            padding: '4px 8px',
            backgroundColor: 'rgba(168, 85, 247, 0.2)',
            borderRadius: '4px',
            fontSize: '12px',
            color: '#a855f7',
          }}>
            {action === 'OPEN_FILE' ? 'Open' : 'Preview'}
          </span>
        </button>
      ))}

      {/* Show disambiguation message for SELECT_FILE */}
      {action === 'SELECT_FILE' && files.length > 1 && (
        <div style={{
          fontSize: '13px',
          color: 'rgba(255, 255, 255, 0.6)',
          textAlign: 'center',
          marginTop: '4px',
        }}>
          Multiple files found. Click to preview.
        </div>
      )}
    </div>
  );
};

/**
 * WarningAttachment - Warning or info message
 */
const WarningAttachment = ({ message, severity = 'info', styles }) => {
  const colors = {
    info: { bg: 'rgba(59, 130, 246, 0.1)', border: 'rgba(59, 130, 246, 0.3)', text: '#3b82f6' },
    warning: { bg: 'rgba(234, 179, 8, 0.1)', border: 'rgba(234, 179, 8, 0.3)', text: '#eab308' },
    error: { bg: 'rgba(239, 68, 68, 0.1)', border: 'rgba(239, 68, 68, 0.3)', text: '#ef4444' },
  };

  const color = colors[severity] || colors.info;

  return (
    <div
      className="warning-attachment"
      style={{
        padding: '12px 16px',
        backgroundColor: color.bg,
        border: `1px solid ${color.border}`,
        borderRadius: '8px',
        color: color.text,
        fontSize: '14px',
        marginTop: '8px',
        ...styles.warning,
      }}
    >
      {message}
    </div>
  );
};

/**
 * AttachedFileChip - Small chip for user's attached files
 */
const AttachedFileChip = ({ id, filename, mimeType, onFileClick, styles }) => {
  return (
    <button
      onClick={() => onFileClick?.({ id, filename, mimeType })}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '4px 8px',
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        borderRadius: '12px',
        color: '#fff',
        fontSize: '12px',
        cursor: 'pointer',
        ...styles.attachedFileChip,
      }}
    >
      <img
        src={getFileIcon(filename, mimeType)}
        alt=""
        style={{ width: '14px', height: '14px' }}
      />
      <span style={{
        maxWidth: '150px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {filename}
      </span>
    </button>
  );
};

/**
 * FallbackAttachment - Generic display for unknown attachment types
 */
const FallbackAttachment = ({ attachment, styles }) => {
  return (
    <div
      className="fallback-attachment"
      style={{
        padding: '8px 12px',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '8px',
        color: 'rgba(255, 255, 255, 0.7)',
        fontSize: '13px',
        marginTop: '8px',
        ...styles.fallback,
      }}
    >
      <code style={{ fontSize: '11px' }}>
        {JSON.stringify(attachment, null, 2)}
      </code>
    </div>
  );
};

export default AttachmentsRenderer;
