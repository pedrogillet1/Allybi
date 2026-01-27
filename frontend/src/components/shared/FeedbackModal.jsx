import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import crownIcon from '../assets/crown.png';

/**
 * Feedback Modal
 * Shows a form for users to send feedback
 * Redesigned to match the phone verification modal style
 */
const FeedbackModal = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const [feedback, setFeedback] = useState('');

  if (!isOpen) return null;

  const handleSubmit = () => {
    // TODO: Implement feedback submission
    console.log('Feedback submitted:', feedback);
    setFeedback('');
    onClose();
  };

  return (
    <>
      {/* Dark Overlay */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'rgba(0, 0, 0, 0.5)',
          zIndex: 9998
        }}
        onClick={onClose}
      />

      {/* Modal */}
      <div style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '420px',
        maxWidth: '90vw',
        background: 'white',
        borderRadius: 16,
        padding: 32,
        zIndex: 9999,
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)'
      }}>
        {/* Header with Crown and Title - Centered */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
          marginBottom: 8
        }}>
          <img
            src={crownIcon}
            alt="Crown"
            style={{
              width: 80,
              height: 80,
              objectFit: 'contain'
            }}
          />
          <h2 style={{
            fontSize: 22,
            fontWeight: '700',
            fontFamily: 'Plus Jakarta Sans',
            color: '#32302C',
            margin: 0,
            textAlign: 'center'
          }}>
            {t('feedback.betaAccess')}
          </h2>
        </div>

        {/* Subtitle */}
        <p style={{
          fontSize: 14,
          color: '#6C6B6E',
          fontFamily: 'Plus Jakarta Sans',
          fontWeight: '500',
          marginBottom: 8,
          marginTop: 0,
          textAlign: 'center'
        }}>
          {t('feedback.earlyAccess')}
        </p>

        {/* Description */}
        <p style={{
          fontSize: 14,
          color: '#6C6B6E',
          fontFamily: 'Plus Jakarta Sans',
          fontWeight: '400',
          lineHeight: '20px',
          marginBottom: 20,
          marginTop: 0,
          textAlign: 'center'
        }}>
          {t('feedback.earlyAccessDescription')}
        </p>

        {/* Divider */}
        <div style={{
          height: 1,
          background: '#E6E6EC',
          marginBottom: 20
        }} />

        {/* Feedback Label */}
        <label style={{
          display: 'block',
          color: '#32302C',
          fontSize: 14,
          fontFamily: 'Plus Jakarta Sans',
          fontWeight: '600',
          marginBottom: 10
        }}>
          {t('feedback.shareYourFeedback')}
        </label>

        {/* Textarea */}
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder={t('placeholders.tellUsWhatYouThink')}
          style={{
            width: '100%',
            minHeight: 100,
            padding: 14,
            background: '#F5F5F5',
            border: '1px solid #E6E6EC',
            borderRadius: 10,
            color: '#32302C',
            fontSize: 14,
            fontFamily: 'Plus Jakarta Sans',
            fontWeight: '400',
            lineHeight: '20px',
            resize: 'vertical',
            outline: 'none',
            boxSizing: 'border-box',
            marginBottom: 20
          }}
          onFocus={(e) => {
            e.target.style.borderColor = '#181818';
            e.target.style.background = '#FFF';
          }}
          onBlur={(e) => {
            e.target.style.borderColor = '#E6E6EC';
            e.target.style.background = '#F5F5F5';
          }}
        />

        {/* Action Buttons - Pill shaped, centered */}
        <div style={{
          display: 'flex',
          gap: 12,
          justifyContent: 'center'
        }}>
          {/* Cancel Button */}
          <button
            onClick={onClose}
            style={{
              height: 44,
              width: 140,
              background: '#F5F5F5',
              border: '1px solid #E6E6EC',
              borderRadius: 100,
              fontSize: 14,
              fontFamily: 'Plus Jakarta Sans',
              fontWeight: '600',
              color: '#32302C',
              cursor: 'pointer',
              transition: 'background 0.2s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#E6E6EC'}
            onMouseLeave={(e) => e.currentTarget.style.background = '#F5F5F5'}
          >
            {t('common.cancel')}
          </button>

          {/* Submit Button */}
          <button
            onClick={handleSubmit}
            disabled={!feedback.trim()}
            style={{
              height: 44,
              width: 140,
              background: feedback.trim() ? '#181818' : '#E6E6EC',
              border: 'none',
              borderRadius: 100,
              fontSize: 14,
              fontFamily: 'Plus Jakarta Sans',
              fontWeight: '600',
              color: feedback.trim() ? '#FFF' : '#B9B9B9',
              cursor: feedback.trim() ? 'pointer' : 'not-allowed',
              transition: 'background 0.2s ease'
            }}
            onMouseEnter={(e) => {
              if (feedback.trim()) {
                e.currentTarget.style.background = '#323232';
              }
            }}
            onMouseLeave={(e) => {
              if (feedback.trim()) {
                e.currentTarget.style.background = '#181818';
              }
            }}
          >
            {t('feedback.sendFeedback')}
          </button>
        </div>
      </div>
    </>
  );
};

export default FeedbackModal;
