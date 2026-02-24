import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ROUTES } from '../../constants/routes';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useIntegrationStatus } from '../../hooks/useIntegrationStatus';
import LeftNav from '../app-shell/LeftNav';
import { ReactComponent as ArrowLeft } from '../../assets/arrow-narrow-left.svg';
import { ReactComponent as SearchIcon } from '../../assets/Search.svg';
import gmailSvg from '../../assets/Gmail.svg';
import api from '../../services/api';

const FONT = 'Plus Jakarta Sans, sans-serif';

function Spinner({ size = 16 }) {
  return (
    <div
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        border: '2px solid #E6E6EC',
        borderTopColor: '#181818',
        borderRadius: '50%',
        animation: 'spin 800ms linear infinite',
        flexShrink: 0,
      }}
    />
  );
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Inbox list panel (left column)
function InboxPanel({ emails, selectedId, onSelect, loading, searchQuery, onSearchChange }) {
  return (
    <div style={{
      width: 340,
      minWidth: 280,
      maxWidth: 380,
      height: '100%',
      background: 'white',
      borderRight: '1px solid #E6E6EC',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
    }}>
      {/* Search bar */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #F5F5F5' }}>
        <div style={{ position: 'relative', height: 40 }}>
          <SearchIcon style={{ position: 'absolute', left: 12, top: 10, width: 18, height: 18, filter: 'brightness(0) invert(0.4)' }} aria-hidden="true" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Search emails..."
            style={{
              width: '100%',
              height: '100%',
              paddingLeft: 38,
              paddingRight: 12,
              background: '#F5F5F5',
              borderRadius: 10,
              border: '1px solid #E6E6EC',
              outline: 'none',
              fontSize: 14,
              fontFamily: FONT,
              fontWeight: 500,
              color: '#32302C',
              boxSizing: 'border-box',
            }}
            onFocus={e => { e.target.style.borderColor = '#A2A2A7'; }}
            onBlur={e => { e.target.style.borderColor = '#E6E6EC'; }}
          />
        </div>
      </div>

      {/* Email list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
            <Spinner size={20} />
          </div>
        ) : emails.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#6C6B6E', fontSize: 14, fontFamily: FONT }}>
            No emails found
          </div>
        ) : (
          emails.map(email => (
            <button
              key={email.id}
              onClick={() => onSelect(email.id)}
              style={{
                width: '100%',
                padding: '14px 16px',
                background: selectedId === email.id ? '#F5F5F5' : 'transparent',
                border: 'none',
                borderBottom: '1px solid #F5F5F5',
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                transition: 'background 80ms ease',
              }}
              onMouseEnter={e => { if (selectedId !== email.id) e.currentTarget.style.background = '#FAFAFA'; }}
              onMouseLeave={e => { if (selectedId !== email.id) e.currentTarget.style.background = 'transparent'; }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <div style={{
                  fontSize: 14,
                  fontWeight: email.read ? 500 : 700,
                  color: '#32302C',
                  fontFamily: FONT,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                }}>
                  {email.from}
                </div>
                <div style={{ fontSize: 12, fontWeight: 500, color: '#A2A2A7', fontFamily: FONT, flexShrink: 0 }}>
                  {formatDate(email.date)}
                </div>
              </div>
              <div style={{
                fontSize: 13,
                fontWeight: email.read ? 500 : 600,
                color: '#32302C',
                fontFamily: FONT,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {email.subject}
              </div>
              <div style={{
                fontSize: 12,
                fontWeight: 400,
                color: '#6C6B6E',
                fontFamily: FONT,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {email.snippet}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

// Email preview + composer (center column)
function EmailPreviewPanel({ email, showComposer, onToggleComposer, composerData, onComposerChange, onSend, sending }) {
  if (!email) {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#FAFAFA',
        flexDirection: 'column',
        gap: 12,
      }}>
        <img src={gmailSvg} alt="" style={{ width: 48, height: 48, opacity: 0.4 }} />
        <div style={{ fontSize: 16, fontWeight: 500, color: '#6C6B6E', fontFamily: FONT }}>
          Select an email to view
        </div>
      </div>
    );
  }

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      background: 'white',
      minWidth: 0,
    }}>
      {/* Email header */}
      <div style={{ padding: '20px 24px', borderBottom: '1px solid #F5F5F5' }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#32302C', fontFamily: FONT, lineHeight: '26px' }}>
          {email.subject}
        </h2>
        <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#32302C', fontFamily: FONT }}>
              {email.from}
            </div>
            <div style={{ fontSize: 12, color: '#6C6B6E', fontFamily: FONT, marginTop: 2 }}>
              To: {email.to || 'me'}
            </div>
          </div>
          <div style={{ fontSize: 12, color: '#A2A2A7', fontFamily: FONT }}>
            {email.date ? new Date(email.date).toLocaleString() : ''}
          </div>
        </div>
      </div>

      {/* Email body */}
      <div style={{ flex: 1, padding: '20px 24px', overflowY: 'auto' }}>
        <div
          style={{
            fontSize: 14,
            lineHeight: '22px',
            color: '#32302C',
            fontFamily: FONT,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {email.body || email.snippet || 'No content'}
        </div>
      </div>

      {/* Reply/Compose toggle */}
      <div style={{ padding: '12px 24px', borderTop: '1px solid #F5F5F5' }}>
        {!showComposer ? (
          <button
            onClick={onToggleComposer}
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
              transition: 'background 120ms ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#0F0F0F'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#181818'; }}
          >
            Reply
          </button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input
              type="text"
              value={composerData.to}
              onChange={e => onComposerChange({ ...composerData, to: e.target.value })}
              placeholder="To"
              style={{
                height: 36,
                padding: '0 12px',
                borderRadius: 8,
                border: '1px solid #E6E6EC',
                outline: 'none',
                fontSize: 14,
                fontFamily: FONT,
                color: '#32302C',
              }}
              onFocus={e => { e.target.style.borderColor = '#A2A2A7'; }}
              onBlur={e => { e.target.style.borderColor = '#E6E6EC'; }}
            />
            <input
              type="text"
              value={composerData.subject}
              onChange={e => onComposerChange({ ...composerData, subject: e.target.value })}
              placeholder="Subject"
              style={{
                height: 36,
                padding: '0 12px',
                borderRadius: 8,
                border: '1px solid #E6E6EC',
                outline: 'none',
                fontSize: 14,
                fontFamily: FONT,
                color: '#32302C',
              }}
              onFocus={e => { e.target.style.borderColor = '#A2A2A7'; }}
              onBlur={e => { e.target.style.borderColor = '#E6E6EC'; }}
            />
            <textarea
              value={composerData.body}
              onChange={e => onComposerChange({ ...composerData, body: e.target.value })}
              placeholder="Write your reply..."
              rows={4}
              style={{
                padding: 12,
                borderRadius: 8,
                border: '1px solid #E6E6EC',
                outline: 'none',
                fontSize: 14,
                fontFamily: FONT,
                color: '#32302C',
                resize: 'vertical',
                lineHeight: '20px',
              }}
              onFocus={e => { e.target.style.borderColor = '#A2A2A7'; }}
              onBlur={e => { e.target.style.borderColor = '#E6E6EC'; }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={onSend}
                disabled={sending}
                style={{
                  height: 36,
                  padding: '0 18px',
                  borderRadius: 9999,
                  background: '#181818',
                  border: 'none',
                  color: 'white',
                  cursor: sending ? 'not-allowed' : 'pointer',
                  fontFamily: FONT,
                  fontWeight: 600,
                  fontSize: 13,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  opacity: sending ? 0.7 : 1,
                  transition: 'background 120ms ease',
                }}
                onMouseEnter={e => { if (!sending) e.currentTarget.style.background = '#0F0F0F'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#181818'; }}
              >
                {sending && <Spinner size={12} />}
                {sending ? 'Sending...' : 'Send'}
              </button>
              <button
                onClick={onToggleComposer}
                style={{
                  height: 36,
                  padding: '0 18px',
                  borderRadius: 9999,
                  background: 'white',
                  border: '1px solid #E6E6EC',
                  color: '#32302C',
                  cursor: 'pointer',
                  fontFamily: FONT,
                  fontWeight: 600,
                  fontSize: 13,
                  transition: 'background 120ms ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#F5F5F5'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'white'; }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Allybi AI panel (right column)
function AllybiPanel({ email, onInsertDraft }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleAsk = async () => {
    if (!query.trim()) return;
    const userMsg = { role: 'user', text: query };
    setMessages(prev => [...prev, userMsg]);
    setQuery('');
    setLoading(true);

    try {
      const response = await api.post('/api/chat/ask', {
        question: query,
        context: email ? `Email from ${email.from}: "${email.subject}"\n\n${email.body || email.snippet}` : undefined,
      });
      const assistantMsg = { role: 'assistant', text: response.data?.answer || response.data?.message || 'No response' };
      setMessages(prev => [...prev, assistantMsg]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Sorry, I couldn\'t process that request.' }]);
    } finally {
      setLoading(false);
    }
  };

  const suggestedPrompts = email ? [
    'Summarize this email',
    'Draft a professional reply',
    'Extract action items',
    'Translate to Spanish',
  ] : [
    'How can I help you today?',
  ];

  return (
    <div style={{
      width: 320,
      minWidth: 280,
      maxWidth: 360,
      height: '100%',
      background: '#FAFAFA',
      borderLeft: '1px solid #E6E6EC',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 16px',
        borderBottom: '1px solid #E6E6EC',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}>
        <div style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          background: '#181818',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontSize: 12,
          fontWeight: 700,
          fontFamily: FONT,
        }}>
          A
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#32302C', fontFamily: FONT }}>
          Allybi AI
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {messages.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            <div style={{ fontSize: 13, color: '#6C6B6E', fontFamily: FONT, marginBottom: 8 }}>
              {email ? 'Ask about this email:' : 'Select an email to get started'}
            </div>
            {email && suggestedPrompts.map((prompt, i) => (
              <button
                key={i}
                onClick={() => { setQuery(prompt); }}
                style={{
                  padding: '10px 14px',
                  background: 'white',
                  borderRadius: 10,
                  border: '1px solid #E6E6EC',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontFamily: FONT,
                  fontWeight: 500,
                  color: '#32302C',
                  textAlign: 'left',
                  transition: 'background 80ms ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#F5F5F5'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'white'; }}
              >
                {prompt}
              </button>
            ))}
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} style={{
            padding: '10px 14px',
            background: msg.role === 'user' ? '#181818' : 'white',
            color: msg.role === 'user' ? 'white' : '#32302C',
            borderRadius: 12,
            fontSize: 13,
            fontFamily: FONT,
            lineHeight: '20px',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            border: msg.role === 'assistant' ? '1px solid #E6E6EC' : 'none',
            alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
            maxWidth: '90%',
          }}>
            {msg.text}
            {msg.role === 'assistant' && onInsertDraft && (
              <button
                onClick={() => onInsertDraft(msg.text)}
                style={{
                  display: 'block',
                  marginTop: 8,
                  padding: '4px 10px',
                  borderRadius: 6,
                  border: '1px solid #E6E6EC',
                  background: '#F5F5F5',
                  cursor: 'pointer',
                  fontSize: 11,
                  fontFamily: FONT,
                  fontWeight: 600,
                  color: '#55534E',
                  transition: 'background 80ms ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#ECECEC'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#F5F5F5'; }}
              >
                Insert as draft
              </button>
            )}
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' }}>
            <Spinner size={14} />
            <span style={{ fontSize: 12, color: '#6C6B6E', fontFamily: FONT }}>Thinking...</span>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid #E6E6EC', display: 'flex', gap: 8 }}>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAsk(); } }}
          placeholder={t('chat.inputPlaceholder')}
          style={{
            flex: 1,
            height: 36,
            padding: '0 12px',
            borderRadius: 9999,
            border: '1px solid #E6E6EC',
            outline: 'none',
            fontSize: 13,
            fontFamily: FONT,
            color: '#32302C',
            background: 'white',
          }}
          onFocus={e => { e.target.style.borderColor = '#A2A2A7'; }}
          onBlur={e => { e.target.style.borderColor = '#E6E6EC'; }}
        />
        <button
          onClick={handleAsk}
          disabled={!query.trim() || loading}
          style={{
            width: 36,
            height: 36,
            borderRadius: 9999,
            background: query.trim() ? '#181818' : '#E6E6EC',
            border: 'none',
            color: 'white',
            cursor: query.trim() ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            transition: 'background 120ms ease',
          }}
          aria-label="Send"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M14 2L7 9M14 2L9.5 14L7 9M14 2L2 6.5L7 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

// Placeholder emails for demo (until real Gmail API integration)
const DEMO_EMAILS = [
  { id: '1', from: 'Sarah Johnson', to: 'me', subject: 'Q4 Report Review', snippet: 'Hi, I\'ve attached the Q4 report for your review. Please let me know if you have any questions...', body: 'Hi,\n\nI\'ve attached the Q4 report for your review. The key highlights include:\n\n- Revenue increased 12% YoY\n- Customer retention improved to 94%\n- New product launches contributed $2.3M\n\nPlease let me know if you have any questions or if you\'d like to schedule a call to discuss.\n\nBest,\nSarah', date: new Date(Date.now() - 1000 * 60 * 30).toISOString(), read: false },
  { id: '2', from: 'David Chen', to: 'me', subject: 'Meeting Notes - Product Sync', snippet: 'Here are the notes from today\'s product sync meeting. Action items listed below...', body: 'Hi team,\n\nHere are the notes from today\'s product sync:\n\nDiscussion Points:\n1. Feature prioritization for Q1\n2. Bug triage process improvement\n3. Design system updates\n\nAction Items:\n- @Alex: Update the roadmap by Friday\n- @Maria: Schedule design review\n- @David: Share API docs with frontend team\n\nNext meeting: Thursday 2pm\n\nBest,\nDavid', date: new Date(Date.now() - 1000 * 60 * 120).toISOString(), read: true },
  { id: '3', from: 'Marketing Team', to: 'team@company.com', subject: 'Campaign Results - January', snippet: 'The January marketing campaign delivered strong results across all channels...', body: 'Hi everyone,\n\nGreat news! The January campaign exceeded targets:\n\n- Email open rate: 34% (+8%)\n- Click-through rate: 4.2%\n- Conversions: 847 new signups\n- Total reach: 125K impressions\n\nTop performing channels:\n1. LinkedIn Ads\n2. Google Search\n3. Email Newsletter\n\nFull report attached.\n\nCheers,\nMarketing Team', date: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(), read: true },
  { id: '4', from: 'IT Support', to: 'me', subject: 'System Maintenance - Feb 15', snippet: 'Scheduled maintenance will occur on Feb 15 from 2-4am EST...', body: 'Dear team,\n\nPlease be advised that scheduled system maintenance will take place:\n\nDate: February 15, 2026\nTime: 2:00 AM - 4:00 AM EST\nAffected Systems: Email, Cloud Storage, SSO\n\nDuring this window, you may experience brief service interruptions. No action is required on your part.\n\nIf you have urgent needs during this window, please contact the on-call team.\n\nThank you,\nIT Support', date: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), read: true },
  { id: '5', from: 'Alex Rivera', to: 'me', subject: 'Quick question about the API', snippet: 'Hey, I was looking at the new API endpoints and had a quick question about auth...', body: 'Hey,\n\nI was looking at the new API endpoints and had a quick question:\n\nFor the /api/documents/search endpoint, should we use Bearer token auth or API key auth? The docs mention both but I want to make sure we\'re using the recommended approach.\n\nAlso, is there a rate limit we should be aware of?\n\nThanks!\nAlex', date: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(), read: false },
];

export default function GmailDetailPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { providers } = useIntegrationStatus();
  const gmailStatus = providers?.gmail;

  const [emails, setEmails] = useState(DEMO_EMAILS);
  const [emailsLoading, setEmailsLoading] = useState(false);
  const [selectedEmailId, setSelectedEmailId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showComposer, setShowComposer] = useState(false);
  const [composerData, setComposerData] = useState({ to: '', subject: '', body: '' });
  const [sending, setSending] = useState(false);

  // Try to fetch real emails if connected
  useEffect(() => {
    if (gmailStatus?.connected) {
      setEmailsLoading(true);
      api.get('/api/integrations/gmail/emails')
        .then(res => {
          if (res.data?.emails?.length > 0) {
            setEmails(res.data.emails);
          }
        })
        .catch(() => {
          // Fall back to demo emails
        })
        .finally(() => setEmailsLoading(false));
    }
  }, [gmailStatus?.connected]);

  const selectedEmail = emails.find(e => e.id === selectedEmailId);

  const filteredEmails = searchQuery
    ? emails.filter(e =>
        e.from?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.subject?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.snippet?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : emails;

  const handleSelectEmail = (id) => {
    setSelectedEmailId(id);
    setShowComposer(false);
    setComposerData({ to: '', subject: '', body: '' });
  };

  const handleToggleComposer = () => {
    if (!showComposer && selectedEmail) {
      setComposerData({
        to: selectedEmail.from,
        subject: `Re: ${selectedEmail.subject}`,
        body: '',
      });
    }
    setShowComposer(!showComposer);
  };

  const handleSend = async () => {
    if (!composerData.to || !composerData.body) return;
    setSending(true);
    try {
      await api.post('/api/integrations/gmail/send', composerData);
      setShowComposer(false);
      setComposerData({ to: '', subject: '', body: '' });
    } catch {
      // Silently handle - composer stays open for retry
    } finally {
      setSending(false);
    }
  };

  const handleInsertDraft = (text) => {
    setComposerData(prev => ({ ...prev, body: prev.body ? prev.body + '\n\n' + text : text }));
    setShowComposer(true);
    if (selectedEmail && !composerData.to) {
      setComposerData(prev => ({
        ...prev,
        to: selectedEmail.from,
        subject: `Re: ${selectedEmail.subject}`,
      }));
    }
  };

  // Mobile: show only one panel at a time
  if (isMobile) {
    return (
      <div style={{ width: '100%', height: '100vh', background: '#F1F0EF', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{
          minHeight: 56,
          paddingLeft: 16,
          paddingRight: 16,
          background: 'white',
          borderBottom: '1px solid #E6E6EC',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexShrink: 0,
        }}>
          <button
            onClick={() => selectedEmailId ? setSelectedEmailId(null) : navigate(ROUTES.INTEGRATIONS)}
            aria-label="Back"
            style={{
              width: 36, height: 36, borderRadius: 10, border: '1px solid #E6E6EC',
              background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center',
              justifyContent: 'center', padding: 0, flexShrink: 0,
            }}
          >
            <ArrowLeft style={{ width: 18, height: 18, filter: 'brightness(0) invert(0.2)' }} />
          </button>
          <img src={gmailSvg} alt="" style={{ width: 24, height: 24 }} />
          <span style={{ fontSize: 16, fontWeight: 600, color: '#32302C', fontFamily: FONT }}>
            {selectedEmailId ? selectedEmail?.subject || 'Email' : 'Gmail'}
          </span>
        </div>

        {!selectedEmailId ? (
          <InboxPanel
            emails={filteredEmails}
            selectedId={selectedEmailId}
            onSelect={handleSelectEmail}
            loading={emailsLoading}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
          />
        ) : (
          <EmailPreviewPanel
            email={selectedEmail}
            showComposer={showComposer}
            onToggleComposer={handleToggleComposer}
            composerData={composerData}
            onComposerChange={setComposerData}
            onSend={handleSend}
            sending={sending}
          />
        )}
      </div>
    );
  }

  return (
    <div style={{
      width: '100%',
      height: '100vh',
      background: '#F1F0EF',
      display: 'flex',
      flexDirection: 'row',
    }}>
      <LeftNav />

      <div style={{
        flex: 1,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          minHeight: 72,
          paddingLeft: 48,
          paddingRight: 48,
          background: 'white',
          borderBottom: '1px solid #E6E6EC',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          flexShrink: 0,
        }}>
          <button
            onClick={() => navigate(ROUTES.INTEGRATIONS)}
            aria-label="Back to Integrations"
            style={{
              width: 36, height: 36, borderRadius: 10, border: '1px solid #E6E6EC',
              background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center',
              justifyContent: 'center', padding: 0, flexShrink: 0,
              transition: 'background 120ms ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#F5F5F5'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'white'; }}
          >
            <ArrowLeft style={{ width: 18, height: 18, filter: 'brightness(0) invert(0.2)' }} />
          </button>
          <img src={gmailSvg} alt="" style={{ width: 28, height: 28 }} />
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: '#32302C', fontFamily: FONT, lineHeight: '30px' }}>
            Gmail
          </h1>
          {gmailStatus?.connected && (
            <span style={{
              fontSize: 12, fontWeight: 600, color: '#34A853', fontFamily: FONT,
              background: '#ECFDF5', padding: '2px 10px', borderRadius: 9999,
            }}>
              Connected
            </span>
          )}
        </div>

        {/* 3-column layout */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'row', overflow: 'hidden' }}>
          <InboxPanel
            emails={filteredEmails}
            selectedId={selectedEmailId}
            onSelect={handleSelectEmail}
            loading={emailsLoading}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
          />
          <EmailPreviewPanel
            email={selectedEmail}
            showComposer={showComposer}
            onToggleComposer={handleToggleComposer}
            composerData={composerData}
            onComposerChange={setComposerData}
            onSend={handleSend}
            sending={sending}
          />
          <AllybiPanel
            email={selectedEmail}
            onInsertDraft={handleInsertDraft}
          />
        </div>
      </div>
    </div>
  );
}
