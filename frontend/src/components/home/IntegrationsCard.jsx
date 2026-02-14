import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../../constants/routes';
import { useIntegrationStatus } from '../../hooks/useIntegrationStatus';
import gmailSvg from '../../assets/Gmail.svg';
import outlookSvg from '../../assets/outlook.svg';
import slackSvg from '../../assets/slack.svg';

const PROVIDER_META = {
  gmail:   { label: 'Gmail',   icon: gmailSvg },
  outlook: { label: 'Outlook', icon: outlookSvg },
  slack:   { label: 'Slack',   icon: slackSvg },
};

function formatSyncTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diff = now - d;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return d.toLocaleDateString();
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

function ProviderRow({ provider, status, onConnect, onDisconnect, onSync }) {
  const meta = PROVIDER_META[provider];
  if (!meta) return null;

  const { connected, expired, connecting, syncing, error, lastSyncAt } = status;

  // Determine UI state
  let state = 'disconnected';
  if (connecting) state = 'connecting';
  else if (expired) state = 'revoked';
  else if (connected && error) state = 'error';
  else if (connected) state = 'connected';

  const statusText = {
    disconnected: 'Not connected',
    connecting: 'Connecting...',
    connected: `Connected${lastSyncAt ? ` · ${formatSyncTime(lastSyncAt)}` : ''}`,
    error: 'Sync failed. Retry.',
    revoked: 'Permission revoked',
  }[state];

  const statusColor = {
    disconnected: '#6C6B6E',
    connecting: '#6C6B6E',
    connected: '#34A853',
    error: '#D92D20',
    revoked: '#D92D20',
  }[state];

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 0',
        borderBottom: '1px solid #F5F5F5',
      }}
    >
      <img
        src={meta.icon}
        alt=""
        style={{ width: 28, height: 28, objectFit: 'contain', flexShrink: 0 }}
      />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14,
          fontWeight: 600,
          color: '#32302C',
          fontFamily: 'Plus Jakarta Sans, sans-serif',
          lineHeight: '20px',
        }}>
          {meta.label}
        </div>
        <div
          aria-live={state === 'connecting' ? 'polite' : undefined}
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: statusColor,
            fontFamily: 'Plus Jakarta Sans, sans-serif',
            lineHeight: '18px',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          {state === 'connected' && (
            <span style={{ color: '#34A853', fontSize: 14 }} aria-hidden="true">&#10003;</span>
          )}
          {statusText}
        </div>
      </div>

      <div style={{ flexShrink: 0 }}>
        {state === 'connecting' && <Spinner />}

        {state === 'disconnected' && (
          <button
            onClick={() => onConnect(provider)}
            aria-label={`Connect ${meta.label}`}
            style={{
              height: 32,
              padding: '0 14px',
              borderRadius: 9999,
              border: '1px solid #E6E6EC',
              background: '#F5F5F5',
              cursor: 'pointer',
              fontFamily: 'Plus Jakarta Sans, sans-serif',
              fontWeight: 600,
              fontSize: 12,
              color: '#32302C',
              transition: 'background 120ms ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#ECECEC'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#F5F5F5'; }}
          >
            Connect
          </button>
        )}

        {state === 'connected' && (
          <button
            onClick={() => syncing ? null : onSync(provider)}
            disabled={syncing}
            aria-label={`Sync ${meta.label} now`}
            style={{
              height: 32,
              padding: '0 12px',
              borderRadius: 9999,
              border: 'none',
              background: 'transparent',
              cursor: syncing ? 'not-allowed' : 'pointer',
              fontFamily: 'Plus Jakarta Sans, sans-serif',
              fontWeight: 600,
              fontSize: 12,
              color: syncing ? '#6C6B6E' : '#55534E',
              opacity: syncing ? 0.6 : 1,
              transition: 'color 120ms ease',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
            onMouseEnter={e => { if (!syncing) e.currentTarget.style.color = '#181818'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#55534E'; }}
          >
            {syncing ? <Spinner size={14} /> : null}
            {syncing ? 'Syncing' : 'Sync now'}
          </button>
        )}

        {state === 'error' && (
          <button
            onClick={() => onSync(provider)}
            aria-label={`Retry sync for ${meta.label}`}
            style={{
              height: 32,
              padding: '0 14px',
              borderRadius: 9999,
              border: '1px solid #D92D20',
              background: 'white',
              cursor: 'pointer',
              fontFamily: 'Plus Jakarta Sans, sans-serif',
              fontWeight: 600,
              fontSize: 12,
              color: '#D92D20',
              transition: 'background 120ms ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#FEF3F2'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'white'; }}
          >
            Retry
          </button>
        )}

        {state === 'revoked' && (
          <button
            onClick={() => onConnect(provider)}
            aria-label={`Reconnect ${meta.label}`}
            style={{
              height: 32,
              padding: '0 14px',
              borderRadius: 9999,
              border: '1px solid #E6E6EC',
              background: '#F5F5F5',
              cursor: 'pointer',
              fontFamily: 'Plus Jakarta Sans, sans-serif',
              fontWeight: 600,
              fontSize: 12,
              color: '#32302C',
              transition: 'background 120ms ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#ECECEC'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#F5F5F5'; }}
          >
            Reconnect
          </button>
        )}
      </div>
    </div>
  );
}

export default function IntegrationsCard() {
  const navigate = useNavigate();
  const { providers, loading, connectProvider, disconnectProvider, syncNow } = useIntegrationStatus();

  return (
    <div
      style={{
        background: 'white',
        borderRadius: 16,
        border: '1px solid #E6E6EC',
        boxShadow: '0 1px 2px rgba(24,24,24,0.06), 0 12px 24px rgba(24,24,24,0.08)',
        padding: '24px 24px 16px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
      }}>
        <h3 style={{
          margin: 0,
          fontSize: 16,
          fontWeight: 600,
          color: '#32302C',
          fontFamily: 'Plus Jakarta Sans, sans-serif',
          lineHeight: '24px',
        }}>
          Integrations
        </h3>

        <button
          onClick={() => navigate(ROUTES.INTEGRATIONS)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 600,
            color: '#55534E',
            fontFamily: 'Plus Jakarta Sans, sans-serif',
            padding: '4px 0',
            transition: 'color 120ms ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = '#181818'; }}
          onMouseLeave={e => { e.currentTarget.style.color = '#55534E'; }}
        >
          Manage
        </button>
      </div>

      {/* Provider rows */}
      {loading ? (
        <div style={{ padding: '16px 0', textAlign: 'center' }}>
          <Spinner size={20} />
        </div>
      ) : (
        ['gmail', 'outlook', 'slack'].map(provider => (
          <ProviderRow
            key={provider}
            provider={provider}
            status={providers[provider]}
            onConnect={connectProvider}
            onDisconnect={disconnectProvider}
            onSync={syncNow}
          />
        ))
      )}
    </div>
  );
}
