import React from 'react';

export interface QuoteSlideProps {
  quote: string;
  author?: string;
  source?: string;
  theme?: 'light' | 'dark' | 'corporate' | 'creative';
}

export const QuoteSlide: React.FC<QuoteSlideProps> = ({
  quote,
  author,
  source,
  theme = 'corporate',
}) => {
  const themes = {
    light: {
      background: 'linear-gradient(135deg, #f5f7fa 0%, #e4e8ec 100%)',
      quoteColor: '#1a1a2e',
      authorColor: '#4a4a68',
      sourceColor: '#888',
      accentColor: '#0f4c75',
    },
    dark: {
      background: 'linear-gradient(135deg, #1a1a2e 0%, #2a2a4e 100%)',
      quoteColor: '#ffffff',
      authorColor: '#a0a0c0',
      sourceColor: '#888',
      accentColor: '#3282b8',
    },
    corporate: {
      background: 'linear-gradient(135deg, #0f4c75 0%, #1b6ca8 100%)',
      quoteColor: '#ffffff',
      authorColor: '#bbe1fa',
      sourceColor: '#a0c8e8',
      accentColor: '#ffffff',
    },
    creative: {
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      quoteColor: '#ffffff',
      authorColor: '#e0e0ff',
      sourceColor: '#c0c0e0',
      accentColor: '#ffffff',
    },
  };

  const currentTheme = themes[theme];

  return (
    <div
      className="slide quote-slide"
      style={{
        width: '100%',
        height: '100vh',
        minHeight: '600px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        background: currentTheme.background,
        padding: '80px 100px',
        boxSizing: 'border-box',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          fontSize: '5rem',
          color: currentTheme.accentColor,
          opacity: 0.3,
          marginBottom: '-30px',
          fontFamily: 'Georgia, serif',
        }}
      >
        "
      </div>
      <blockquote
        style={{
          fontSize: '2rem',
          fontStyle: 'italic',
          color: currentTheme.quoteColor,
          lineHeight: 1.6,
          maxWidth: '900px',
          margin: 0,
        }}
      >
        {quote}
      </blockquote>
      <div
        style={{
          fontSize: '5rem',
          color: currentTheme.accentColor,
          opacity: 0.3,
          marginTop: '-30px',
          fontFamily: 'Georgia, serif',
        }}
      >
        "
      </div>
      <div style={{ marginTop: '40px' }}>
        {author && (
          <p
            style={{
              fontSize: '1.3rem',
              fontWeight: 600,
              color: currentTheme.authorColor,
              marginBottom: '8px',
            }}
          >
            — {author}
          </p>
        )}
        {source && (
          <p
            style={{
              fontSize: '1rem',
              color: currentTheme.sourceColor,
            }}
          >
            {source}
          </p>
        )}
      </div>
    </div>
  );
};

export default QuoteSlide;
