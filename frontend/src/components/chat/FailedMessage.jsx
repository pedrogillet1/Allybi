import React from 'react';
import { useTranslation } from 'react-i18next';
import './FailedMessage.css';

export default function FailedMessage({ message, onRetry, onDelete }) {
  const { t } = useTranslation();
  return (
    <div className="failed-message">
      <div className="failed-icon">⚠️</div>
      <div className="failed-content">
        <div className="failed-text">{message.content}</div>
        <div className="failed-error">
          {message.error?.message || t('chat.failedToSend')}
        </div>
      </div>
      <div className="failed-actions">
        <button className="failed-retry-button" onClick={() => onRetry(message)}>
          {t('common.retry')}
        </button>
        <button className="failed-delete-button" onClick={() => onDelete(message.id)}>
          {t('common.delete')}
        </button>
      </div>
    </div>
  );
}
