import React from 'react';
import './TypingIndicator.css';
import kodaIcon from '../../../assets/new-icon.svg';

export default function TypingIndicator({ label }) {
  return (
    <div className="typing-indicator-container">
      <div className="typing-indicator-avatar">
        <img src={kodaIcon} alt="Koda" className="sphere-breathing" />
      </div>
      <div className="typing-indicator-content">
        <div className="typing-indicator-text">
          {label || 'Working on it...'}
        </div>
      </div>
    </div>
  );
}
