import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../../constants/routes';
import { useIntegrationStatus } from '../../hooks/useIntegrationStatus';
import { useIsMobile } from '../../hooks/useIsMobile';
import LeftNav from '../app-shell/LeftNav';
import { ReactComponent as ArrowLeft } from '../../assets/arrow-narrow-left.svg';
import gmailSvg from '../../assets/Gmail.svg';
import outlookSvg from '../../assets/outlook.svg';
import slackSvg from '../../assets/slack.svg';

const FONT = 'Plus Jakarta Sans, sans-serif';

const PROVIDER_META = {
  gmail: {
    label: 'Gmail',
    icon: gmailSvg,
    description: 'Connect your Gmail account to search and manage emails directly from Koda.',
    detailRoute: ROUTES.INTEGRATIONS_GMAIL,
  },
  outlook: {
    label: 'Outlook',
    icon: outlookSvg,
    description: 'Connect your Outlook account to access emails and calendar events.',
    detailRoute: null,
  },
  slack: {
    label: 'Slack',
    icon: slackSvg,
    description: 'Connect Slack to search messages and share documents with your team.',
    detailRoute: null,
  },
};

function formatSyncTime(iso) {
  if (!iso) return 'Never';
  const d = new Date(iso);
  const now = new Date();
  const diff = now - d;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

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

function ProviderCard({ provider, status, onConnect, onDisconnect, onSync, onViewDetail }) {
  const [hovered, setHovered] = useState(false);
  const meta = PROVIDER_META[provider];
  if (!meta) return null;

  const { connected, expired, connecting, syncing, error, lastSyncAt, indexedDocuments } = status;

  let state = 'disconnected';
  if (connecting) state = 'connecting';
  else if (expired) state = 'revoked';
  else if (connected && error) state = 'error';
  else if (connected) state = 'connected';

  const statusColor = {
    disconnected: '#6C6B6E',
    connecting: '#6C6B6E',
    connected: '#34A853',
    error: '#D92D20',
    revoked: '#D92D20',
  }[state];

  const statusText = {
    disconnected: 'Not connected',
    connecting: 'Connecting...',
    connected: 'Connected',
    error: 'Sync failed',
    revoked: 'Permission revoked',
  }[state];

  return (
    <div
      style={{
        background: 'white',
        borderRadius: 16,
        border: '1px solid #E6E6EC',
        boxShadow: hovered
          ? '0 2px 4px rgba(24,24,24,0.08), 0 16px 28px rgba(24,24,24,0.10)'
          : '0 1px 2px rgba(24,24,24,0.06), 0 12px 24px rgba(24,24,24,0.08)',
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        transition: 'box-shadow 160ms ease, transform 160ms cubic-bezier(0.2,0.8,0.2,1)',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Top row: icon + name + status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <img src={meta.icon} alt="" style={{ width: 40, height: 40, objectFit: 'contain', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#32302C', fontFamily: FONT, lineHeight: '24px' }}>
            {meta.label}
          </div>
          <div style={{ fontSize: 13, fontWeight: 500, color: statusColor, fontFamily: FONT, lineHeight: '20px', display: 'flex', alignItems: 'center', gap: 4 }}>
            {state === 'connected' && <span style={{ color: '#34A853', fontSize: 14 }} aria-hidden="true">&#10003;</span>}
            {state === 'connecting' && <Spinner size={12} />}
            {statusText}
          </div>
        </div>
      </div>

      {/* Description */}
      <div style={{ fontSize: 14, color: '#6C6B6E', fontFamily: FONT, lineHeight: '20px' }}>
        {meta.description}
      </div>

      {/* Stats (when connected) */}
      {connected && !expired && (
        <div style={{ display: 'flex', gap: 24, padding: '8px 0', borderTop: '1px solid #F5F5F5' }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#6C6B6E', fontFamily: FONT }}>Last sync</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#32302C', fontFamily: FONT }}>{formatSyncTime(lastSyncAt)}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#6C6B6E', fontFamily: FONT }}>Indexed</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#32302C', fontFamily: FONT }}>{indexedDocuments || 0} items</div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10, marginTop: 'auto' }}>
        {state === 'disconnected' && (
          <button
            onClick={() => onConnect(provider)}
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
            Connect
          </button>
        )}

        {state === 'connecting' && (
          <button
            disabled
            style={{
              height: 40,
              padding: '0 20px',
              borderRadius: 9999,
              background: '#F5F5F5',
              border: '1px solid #E6E6EC',
              color: '#6C6B6E',
              cursor: 'not-allowed',
              fontFamily: FONT,
              fontWeight: 600,
              fontSize: 14,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Spinner size={14} />
            Connecting...
          </button>
        )}

        {state === 'connected' && (
          <>
            {meta.detailRoute && (
              <button
                onClick={() => onViewDetail(meta.detailRoute)}
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
                Open
              </button>
            )}
            <button
              onClick={() => syncing ? null : onSync(provider)}
              disabled={syncing}
              style={{
                height: 40,
                padding: '0 20px',
                borderRadius: 9999,
                background: 'white',
                border: '1px solid #E6E6EC',
                color: syncing ? '#6C6B6E' : '#32302C',
                cursor: syncing ? 'not-allowed' : 'pointer',
                fontFamily: FONT,
                fontWeight: 600,
                fontSize: 14,
                transition: 'background 120ms ease',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
              onMouseEnter={e => { if (!syncing) e.currentTarget.style.background = '#F5F5F5'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'white'; }}
            >
              {syncing && <Spinner size={14} />}
              {syncing ? 'Syncing...' : 'Sync now'}
            </button>
            <button
              onClick={() => onDisconnect(provider)}
              style={{
                height: 40,
                padding: '0 20px',
                borderRadius: 9999,
                background: 'white',
                border: '1px solid #E6E6EC',
                color: '#D92D20',
                cursor: 'pointer',
                fontFamily: FONT,
                fontWeight: 600,
                fontSize: 14,
                transition: 'background 120ms ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#FEF3F2'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'white'; }}
            >
              Disconnect
            </button>
          </>
        )}

        {state === 'error' && (
          <>
            <button
              onClick={() => onSync(provider)}
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
              Retry sync
            </button>
            <button
              onClick={() => onDisconnect(provider)}
              style={{
                height: 40,
                padding: '0 20px',
                borderRadius: 9999,
                background: 'white',
                border: '1px solid #E6E6EC',
                color: '#D92D20',
                cursor: 'pointer',
                fontFamily: FONT,
                fontWeight: 600,
                fontSize: 14,
                transition: 'background 120ms ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#FEF3F2'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'white'; }}
            >
              Disconnect
            </button>
          </>
        )}

        {state === 'revoked' && (
          <button
            onClick={() => onConnect(provider)}
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
            Reconnect
          </button>
        )}
      </div>
    </div>
  );
}

export default function IntegrationsPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { providers, loading, connectProvider, disconnectProvider, syncNow } = useIntegrationStatus();

  return (
    <div style={{
      width: '100%',
      height: '100%',
      minHeight: '100vh',
      background: '#F1F0EF',
      display: 'flex',
      flexDirection: isMobile ? 'column' : 'row',
    }}>
      <LeftNav />

      <div style={{
        flex: 1,
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
        overflowX: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          minHeight: isMobile ? 56 : 72,
          paddingLeft: isMobile ? 16 : 48,
          paddingRight: isMobile ? 16 : 48,
          background: 'white',
          borderBottom: '1px solid #E6E6EC',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          flexShrink: 0,
        }}>
          <button
            onClick={() => navigate(ROUTES.HOME)}
            aria-label="Back to Home"
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              border: '1px solid #E6E6EC',
              background: 'white',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              flexShrink: 0,
              transition: 'background 120ms ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#F5F5F5'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'white'; }}
          >
            <ArrowLeft style={{ width: 18, height: 18, filter: 'brightness(0) invert(0.2)' }} />
          </button>
          <h1 style={{
            margin: 0,
            fontSize: isMobile ? 18 : 20,
            fontWeight: 600,
            color: '#32302C',
            fontFamily: FONT,
            lineHeight: '30px',
          }}>
            Integrations
          </h1>
        </div>

        {/* Content */}
        <div style={{
          padding: isMobile ? 16 : 48,
          maxWidth: 1200,
          margin: '0 auto',
          width: '100%',
          boxSizing: 'border-box',
        }}>
          <p style={{
            fontSize: 14,
            color: '#6C6B6E',
            fontFamily: FONT,
            lineHeight: '20px',
            margin: '0 0 24px',
          }}>
            Connect your tools to search, manage, and interact with your data from one place.
          </p>

          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
              <Spinner size={24} />
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(340px, 1fr))',
              gap: 20,
            }}>
              {['gmail', 'outlook', 'slack'].map(provider => (
                <ProviderCard
                  key={provider}
                  provider={provider}
                  status={providers[provider]}
                  onConnect={connectProvider}
                  onDisconnect={disconnectProvider}
                  onSync={syncNow}
                  onViewDetail={(route) => navigate(route)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
