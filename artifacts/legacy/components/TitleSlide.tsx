import React from 'react';

export interface TitleSlideProps {
  title: string;
  subtitle?: string;
  author?: string;
  date?: string;
  theme?: 'light' | 'dark' | 'corporate' | 'creative';
}

export const TitleSlide: React.FC<TitleSlideProps> = ({
  title,
  subtitle,
  author,
  date,
  theme = 'corporate',
}) => {
  const themes = {
    light: {
      background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
      titleColor: '#1a1a2e',
      subtitleColor: '#4a4a68',
      textColor: '#666',
    },
    dark: {
      background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
      titleColor: '#ffffff',
      subtitleColor: '#a0a0c0',
      textColor: '#888',
    },
    corporate: {
      background: 'linear-gradient(135deg, #0f4c75 0%, #3282b8 100%)',
      titleColor: '#ffffff',
      subtitleColor: '#bbe1fa',
      textColor: '#ddd',
    },
    creative: {
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      titleColor: '#ffffff',
      subtitleColor: '#e0e0ff',
      textColor: '#ddd',
    },
  };

  const currentTheme = themes[theme];

  return (
    <div
      className="slide title-slide"
      style={{
        width: '100%',
        height: '100vh',
        minHeight: '600px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        background: currentTheme.background,
        padding: '60px',
        boxSizing: 'border-box',
        textAlign: 'center',
      }}
    >
      <h1
        style={{
          fontSize: '3.5rem',
          fontWeight: 700,
          color: currentTheme.titleColor,
          marginBottom: '20px',
          lineHeight: 1.2,
        }}
      >
        {title}
      </h1>
      {subtitle && (
        <p
          style={{
            fontSize: '1.5rem',
            color: currentTheme.subtitleColor,
            marginBottom: '40px',
            maxWidth: '800px',
          }}
        >
          {subtitle}
        </p>
      )}
      <div style={{ marginTop: 'auto' }}>
        {author && (
          <p style={{ fontSize: '1.1rem', color: currentTheme.textColor, marginBottom: '8px' }}>
            {author}
          </p>
        )}
        {date && (
          <p style={{ fontSize: '0.9rem', color: currentTheme.textColor }}>
            {date}
          </p>
        )}
      </div>
    </div>
  );
};

export default TitleSlide;
