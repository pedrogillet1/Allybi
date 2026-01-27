import React from 'react';
import i18n from '../i18n';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    // Update state so next render shows fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Log error details
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      // Fallback UI
      return (
        <div style={{
          padding: 40,
          background: 'white',
          borderRadius: 12,
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: 64, marginBottom: 20 }}>⚠️</div>
          <div style={{
            fontSize: 18,
            fontWeight: '600',
            color: '#32302C',
            fontFamily: 'Plus Jakarta Sans',
            marginBottom: 12
          }}>
            {i18n.t('errorBoundary.unableToDisplayPreview')}
          </div>
          <div style={{
            fontSize: 14,
            color: '#6C6B6E',
            fontFamily: 'Plus Jakarta Sans',
            marginBottom: 24
          }}>
            {i18n.t('errorBoundary.errorRenderingMarkdown')}
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              padding: '12px 24px',
              background: 'rgba(24, 24, 24, 0.90)',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: '600',
              fontFamily: 'Plus Jakarta Sans'
            }}
          >
            {i18n.t('errorBoundary.tryAgain')}
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
