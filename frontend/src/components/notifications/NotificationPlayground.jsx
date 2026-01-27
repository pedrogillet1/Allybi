import React, { useState } from 'react';
import { useNotifications } from '../context/NotificationsStore';
import { useTranslation } from 'react-i18next';

/**
 * Notification Playground - Dev-only component for testing notification system
 *
 * Features:
 * - Test all notification types (success, error, warning, info)
 * - Test file-type intelligence notifications
 * - Test deduplication (same notification fired multiple times)
 * - Test language switching (verify existing toasts re-render translated)
 * - Test inbox persistence
 * - Test sticky notifications (duration=0)
 */
export default function NotificationPlayground() {
  const { t, i18n } = useTranslation();
  const {
    addNotification,
    showSuccess,
    showError,
    showWarning,
    showInfo,
    showFileTypeDetected,
    showUnsupportedFiles,
    showLimitedSupportFiles,
    showNoTextDetected,
    clearAllNotifications,
    notifications,
  } = useNotifications();

  const [spamCount, setSpamCount] = useState(0);

  const handleLanguageSwitch = (lang) => {
    i18n.changeLanguage(lang);
  };

  const handleSpamTest = () => {
    // Fire the same notification 10 times rapidly - should dedupe to 1
    for (let i = 0; i < 10; i++) {
      showSuccess('Test notification');
    }
    setSpamCount(prev => prev + 1);
  };

  const handleFileTypeDetected = () => {
    showFileTypeDetected({
      totalCount: 15,
      typeGroups: [
        { type: 'document', count: 5, extensions: ['pdf', 'docx'] },
        { type: 'image', count: 8, extensions: ['jpg', 'png'] },
        { type: 'spreadsheet', count: 2, extensions: ['xlsx'] },
      ],
    });
  };

  const handleUnsupportedFiles = () => {
    showUnsupportedFiles([
      { name: 'test.exe', extension: 'exe' },
      { name: 'video.mkv', extension: 'mkv' },
      { name: 'audio.mp3', extension: 'mp3' },
    ]);
  };

  const handleLimitedSupportFiles = () => {
    showLimitedSupportFiles([
      { name: 'scan.jpg', extension: 'jpg', reason: 'ocr_required' },
      { name: 'photo.png', extension: 'png', reason: 'ocr_required' },
    ]);
  };

  const handleNoTextDetected = () => {
    showNoTextDetected([
      { name: 'scan1.pdf', extension: 'pdf' },
      { name: 'scan2.pdf', extension: 'pdf' },
    ]);
  };

  const handleStickyError = () => {
    addNotification({
      type: 'error',
      title: 'Critical error - sticky notification',
      message: 'This notification will not auto-dismiss (duration=0)',
      duration: 0, // Sticky
      action: {
        label: 'Retry',
        onClick: () => console.log('Retry clicked'),
      },
    });
  };

  const handleMixedUpload = () => {
    // Simulate a mixed batch upload
    handleFileTypeDetected();
    setTimeout(() => handleLimitedSupportFiles(), 500);
    setTimeout(() => showSuccess('5 files uploaded successfully'), 1000);
  };

  return (
    <div style={{
      maxWidth: 1200,
      margin: '0 auto',
      padding: '40px 20px',
      fontFamily: 'Plus Jakarta Sans, sans-serif',
    }}>
      <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>
        Notification Playground
      </h1>
      <p style={{ color: '#666', marginBottom: 32 }}>
        Test and verify the unified notification system. Check dedupe, language switching, and inbox behavior.
      </p>

      {/* Language Switcher */}
      <div style={{ marginBottom: 32, padding: 20, background: '#F5F5F5', borderRadius: 12 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Language Switching Test</h3>
        <p style={{ fontSize: 14, color: '#666', marginBottom: 12 }}>
          Switch language while notifications are visible. Existing toasts and inbox should update.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => handleLanguageSwitch('en')} style={buttonStyle}>
            English
          </button>
          <button onClick={() => handleLanguageSwitch('pt-BR')} style={buttonStyle}>
            Português
          </button>
          <button onClick={() => handleLanguageSwitch('es-ES')} style={buttonStyle}>
            Español
          </button>
        </div>
      </div>

      {/* Basic Notifications */}
      <div style={{ marginBottom: 32, padding: 20, background: '#F5F5F5', borderRadius: 12 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Basic Notifications</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button onClick={() => showSuccess('Operation successful!')} style={buttonStyle}>
            Success
          </button>
          <button onClick={() => showError('Something went wrong')} style={buttonStyle}>
            Error
          </button>
          <button onClick={() => showWarning('Please review this')} style={buttonStyle}>
            Warning
          </button>
          <button onClick={() => showInfo('Helpful information')} style={buttonStyle}>
            Info
          </button>
          <button onClick={handleStickyError} style={buttonStyle}>
            Sticky Error
          </button>
        </div>
      </div>

      {/* File-Type Intelligence */}
      <div style={{ marginBottom: 32, padding: 20, background: '#F5F5F5', borderRadius: 12 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>File-Type Intelligence</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button onClick={handleFileTypeDetected} style={buttonStyle}>
            File Types Detected
          </button>
          <button onClick={handleUnsupportedFiles} style={buttonStyle}>
            Unsupported Files
          </button>
          <button onClick={handleLimitedSupportFiles} style={buttonStyle}>
            Limited Support Files
          </button>
          <button onClick={handleNoTextDetected} style={buttonStyle}>
            No Text Detected
          </button>
          <button onClick={handleMixedUpload} style={buttonStyle}>
            Mixed Upload Batch
          </button>
        </div>
      </div>

      {/* Deduplication Test */}
      <div style={{ marginBottom: 32, padding: 20, background: '#F5F5F5', borderRadius: 12 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Deduplication Test</h3>
        <p style={{ fontSize: 14, color: '#666', marginBottom: 12 }}>
          Fires the same notification 10 times rapidly. Should dedupe to 1 toast. Spam count: {spamCount}
        </p>
        <button onClick={handleSpamTest} style={buttonStyle}>
          Spam Test (10x)
        </button>
      </div>

      {/* Inbox Stats */}
      <div style={{ marginBottom: 32, padding: 20, background: '#F5F5F5', borderRadius: 12 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Inbox Stats</h3>
        <div style={{ fontSize: 14, color: '#666', lineHeight: 1.6 }}>
          <div>Total notifications: {notifications.length}</div>
          <div>Unread: {notifications.filter(n => !n.isRead).length}</div>
          <div>Read: {notifications.filter(n => n.isRead).length}</div>
          <div>
            Storage key: koda_notifications_{localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')).id : 'anonymous'}
          </div>
          <button onClick={clearAllNotifications} style={{ ...buttonStyle, marginTop: 12, background: '#D92D20' }}>
            Clear All Notifications
          </button>
        </div>
      </div>

      {/* QA Checklist */}
      <div style={{ padding: 20, background: '#F5F5F5', borderRadius: 12 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>QA Checklist</h3>
        <ol style={{ fontSize: 14, color: '#666', lineHeight: 2, paddingLeft: 20 }}>
          <li>✓ Fire 10 identical notifications → only 1 toast appears (dedupe works)</li>
          <li>✓ Switch language → existing toasts re-render with new language</li>
          <li>✓ Switch language → inbox rows re-render with new language</li>
          <li>✓ Open inbox → all notifications persist across page reloads</li>
          <li>✓ Inbox capped at 200 entries (check localStorage)</li>
          <li>✓ Escape key closes top toast</li>
          <li>✓ Close button has aria-label</li>
          <li>✓ Action button is keyboard accessible</li>
          <li>✓ Mixed upload batch shows correct file-type notifications</li>
          <li>✓ Unsupported files block upload (test in real upload flow)</li>
        </ol>
      </div>
    </div>
  );
}

const buttonStyle = {
  padding: '8px 16px',
  background: '#181818',
  color: '#FFFFFF',
  border: 'none',
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 600,
  fontFamily: 'Plus Jakarta Sans, sans-serif',
  cursor: 'pointer',
  transition: 'background 0.2s',
};
