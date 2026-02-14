import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { buildRoute } from '../../constants/routes';
import { useDocuments } from '../../context/DocumentsContext';
import { useConversations } from '../../hooks/useConversations';
import { useIsMobile } from '../../hooks/useIsMobile';
import cleanDocumentName from '../../utils/cleanDocumentName';
import { ReactComponent as ArrowIcon } from '../../assets/arrow-narrow-right.svg';
import pdfIcon from '../../assets/pdf-icon.png';
import docIcon from '../../assets/doc-icon.png';
import txtIcon from '../../assets/txt-icon.png';
import xlsIcon from '../../assets/xls.png';
import jpgIcon from '../../assets/jpg-icon.png';
import pngIcon from '../../assets/png-icon.png';
import pptxIcon from '../../assets/pptx.png';
import mp3Icon from '../../assets/mp3.svg';
import movIcon from '../../assets/mov.png';
import mp4Icon from '../../assets/mp4.png';
import { ReactComponent as ChatBubbleIcon } from '../../assets/Message circle.svg';

const FILE_TYPE_ICONS = {
  pdf: pdfIcon, doc: docIcon, docx: docIcon, rtf: docIcon, odt: docIcon,
  txt: txtIcon,
  xls: xlsIcon, xlsx: xlsIcon, csv: xlsIcon,
  jpg: jpgIcon, jpeg: jpgIcon,
  png: pngIcon, gif: pngIcon, bmp: pngIcon, webp: pngIcon, svg: pngIcon,
  pptx: pptxIcon, ppt: pptxIcon,
  mp3: mp3Icon, wav: mp3Icon,
  mov: movIcon, mp4: mp4Icon,
};

function getDocIcon(filename) {
  const ext = (filename || '').split('.').pop()?.toLowerCase() || '';
  return FILE_TYPE_ICONS[ext] || docIcon;
}

const FONT = 'Plus Jakarta Sans, sans-serif';

function formatTimeAgo(dateStr) {
  if (!dateStr) return '';
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function ContinueRow({ icon, iconSrc, label, subtitle, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        height: 52,
        padding: '0 12px',
        background: 'transparent',
        border: 'none',
        borderRadius: 12,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        cursor: 'pointer',
        transition: 'background 120ms ease',
        textAlign: 'left',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = '#F5F5F5'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    >
      <div style={{
        width: 36,
        height: 36,
        borderRadius: 10,
        background: '#F5F5F5',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 16,
        flexShrink: 0,
      }}>
        {iconSrc ? (
          <img src={iconSrc} alt="" style={{ width: 24, height: 24, objectFit: 'contain' }} />
        ) : icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14,
          fontWeight: 600,
          color: '#32302C',
          fontFamily: FONT,
          lineHeight: '20px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {label}
        </div>
      </div>
      <div style={{
        fontSize: 12,
        fontWeight: 500,
        color: '#6C6B6E',
        fontFamily: FONT,
        lineHeight: '18px',
        flexShrink: 0,
      }}>
        {subtitle}
      </div>
    </button>
  );
}

export default function ContinueCard({ onUpload }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { documents } = useDocuments();
  const { data: conversationsData } = useConversations();
  const isMobile = useIsMobile();

  const recentDocs = (documents || [])
    .slice()
    .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))
    .slice(0, 4);

  const recentChats = (conversationsData?.conversations || [])
    .slice()
    .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))
    .slice(0, 3);

  const hasContent = recentDocs.length > 0 || recentChats.length > 0;

  if (!hasContent) {
    return (
      <div style={{
        background: 'white',
        borderRadius: 16,
        border: '1px solid #E6E6EC',
        boxShadow: '0 1px 2px rgba(24,24,24,0.06), 0 12px 24px rgba(24,24,24,0.08)',
        padding: isMobile ? 24 : 32,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 30, lineHeight: 1, marginBottom: 4 }}>&#128196;</div>
        <div style={{
          fontSize: 16, fontWeight: 600, color: '#32302C', fontFamily: FONT,
        }}>
          Get started
        </div>
        <div style={{
          fontSize: 14, color: '#6C6B6E', maxWidth: 320, fontFamily: FONT, lineHeight: '20px',
        }}>
          Upload a document to get started. Ask questions and get grounded answers.
        </div>
        <button
          onClick={onUpload}
          style={{
            height: 40,
            padding: '0 20px',
            borderRadius: 9999,
            background: '#181818',
            border: 'none',
            color: 'white',
            cursor: 'pointer',
            fontFamily: FONT,
            fontWeight: 600,
            fontSize: 14,
            marginTop: 4,
            transition: 'background 120ms ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#0F0F0F'; }}
          onMouseLeave={e => { e.currentTarget.style.background = '#181818'; }}
        >
          Upload document
        </button>
      </div>
    );
  }

  return (
    <div style={{
      background: 'white',
      borderRadius: 16,
      border: '1px solid #E6E6EC',
      boxShadow: '0 1px 2px rgba(24,24,24,0.06), 0 12px 24px rgba(24,24,24,0.08)',
      padding: isMobile ? 16 : 24,
      display: 'flex',
      flexDirection: 'column',
    }}>
      <h3 style={{
        margin: 0,
        marginBottom: 8,
        fontSize: 16,
        fontWeight: 600,
        color: '#32302C',
        fontFamily: FONT,
        lineHeight: '24px',
      }}>
        Continue
      </h3>

      {/* Recent documents */}
      {recentDocs.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{
            fontSize: 12,
            fontWeight: 600,
            color: '#6C6B6E',
            fontFamily: FONT,
            lineHeight: '18px',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            padding: '8px 12px 4px',
          }}>
            Documents
          </div>
          {recentDocs.map(doc => (
            <ContinueRow
              key={doc.id}
              iconSrc={getDocIcon(doc.filename)}
              label={cleanDocumentName(doc.filename)}
              subtitle={formatTimeAgo(doc.updatedAt || doc.createdAt)}
              onClick={() => navigate(buildRoute.document(doc.id))}
            />
          ))}
        </div>
      )}

      {/* Recent chats */}
      {recentChats.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: recentDocs.length > 0 ? 8 : 0 }}>
          <div style={{
            fontSize: 12,
            fontWeight: 600,
            color: '#6C6B6E',
            fontFamily: FONT,
            lineHeight: '18px',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            padding: '8px 12px 4px',
          }}>
            Chats
          </div>
          {recentChats.map(chat => (
            <ContinueRow
              key={chat.id}
              icon={<ChatBubbleIcon style={{ width: 18, height: 18, filter: 'brightness(0) invert(0.35)' }} />}
              label={chat.title || 'Untitled chat'}
              subtitle={formatTimeAgo(chat.updatedAt || chat.createdAt)}
              onClick={() => navigate(buildRoute.document(chat.id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
