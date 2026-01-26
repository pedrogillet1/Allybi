import React from 'react';

export interface TextSlideProps {
  title: string;
  content: string | string[];
  subtitle?: string;
  theme?: 'light' | 'dark' | 'corporate' | 'creative';
}

export const TextSlide: React.FC<TextSlideProps> = ({
  title,
  content,
  subtitle,
  theme = 'light',
}) => {
  const themes = {
    light: {
      background: '#ffffff',
      titleColor: '#1a1a2e',
      subtitleColor: '#4a4a68',
      textColor: '#333',
      bulletColor: '#0f4c75',
    },
    dark: {
      background: '#1a1a2e',
      titleColor: '#ffffff',
      subtitleColor: '#a0a0c0',
      textColor: '#e0e0e0',
      bulletColor: '#3282b8',
    },
    corporate: {
      background: '#f8f9fa',
      titleColor: '#0f4c75',
      subtitleColor: '#3282b8',
      textColor: '#333',
      bulletColor: '#0f4c75',
    },
    creative: {
      background: '#fafafa',
      titleColor: '#667eea',
      subtitleColor: '#764ba2',
      textColor: '#333',
      bulletColor: '#667eea',
    },
  };

  const currentTheme = themes[theme];
  const contentArray = Array.isArray(content) ? content : [content];

  return (
    <div
      className="slide text-slide"
      style={{
        width: '100%',
        height: '100vh',
        minHeight: '600px',
        display: 'flex',
        flexDirection: 'column',
        background: currentTheme.background,
        padding: '60px 80px',
        boxSizing: 'border-box',
      }}
    >
      <h2
        style={{
          fontSize: '2.5rem',
          fontWeight: 600,
          color: currentTheme.titleColor,
          marginBottom: subtitle ? '10px' : '30px',
          borderBottom: `3px solid ${currentTheme.bulletColor}`,
          paddingBottom: '15px',
        }}
      >
        {title}
      </h2>
      {subtitle && (
        <p
          style={{
            fontSize: '1.2rem',
            color: currentTheme.subtitleColor,
            marginBottom: '30px',
          }}
        >
          {subtitle}
        </p>
      )}
      <div style={{ flex: 1 }}>
        {contentArray.length === 1 ? (
          <p
            style={{
              fontSize: '1.3rem',
              lineHeight: 1.8,
              color: currentTheme.textColor,
            }}
          >
            {contentArray[0]}
          </p>
        ) : (
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
            }}
          >
            {contentArray.map((item, index) => (
              <li
                key={index}
                style={{
                  fontSize: '1.2rem',
                  lineHeight: 1.6,
                  color: currentTheme.textColor,
                  marginBottom: '20px',
                  paddingLeft: '30px',
                  position: 'relative',
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    left: 0,
                    color: currentTheme.bulletColor,
                    fontWeight: 'bold',
                  }}
                >
                  •
                </span>
                {item}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default TextSlide;
