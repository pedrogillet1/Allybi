import React from 'react';

export interface ComparisonItem {
  title: string;
  points: string[];
  highlight?: boolean;
}

export interface ComparisonSlideProps {
  title: string;
  items: ComparisonItem[];
  subtitle?: string;
  theme?: 'light' | 'dark' | 'corporate' | 'creative';
}

export const ComparisonSlide: React.FC<ComparisonSlideProps> = ({
  title,
  items,
  subtitle,
  theme = 'light',
}) => {
  const themes = {
    light: {
      background: '#ffffff',
      titleColor: '#1a1a2e',
      subtitleColor: '#4a4a68',
      cardBg: '#f8f9fa',
      cardBgHighlight: '#e8f4fc',
      cardBorder: '#e0e0e0',
      cardBorderHighlight: '#3282b8',
      itemTitleColor: '#1a1a2e',
      textColor: '#333',
      bulletColor: '#0f4c75',
    },
    dark: {
      background: '#1a1a2e',
      titleColor: '#ffffff',
      subtitleColor: '#a0a0c0',
      cardBg: '#2a2a4e',
      cardBgHighlight: '#3a3a6e',
      cardBorder: '#4a4a6e',
      cardBorderHighlight: '#3282b8',
      itemTitleColor: '#ffffff',
      textColor: '#e0e0e0',
      bulletColor: '#3282b8',
    },
    corporate: {
      background: '#f8f9fa',
      titleColor: '#0f4c75',
      subtitleColor: '#3282b8',
      cardBg: '#ffffff',
      cardBgHighlight: '#e8f4fc',
      cardBorder: '#d0d0d0',
      cardBorderHighlight: '#0f4c75',
      itemTitleColor: '#0f4c75',
      textColor: '#333',
      bulletColor: '#0f4c75',
    },
    creative: {
      background: '#fafafa',
      titleColor: '#667eea',
      subtitleColor: '#764ba2',
      cardBg: '#ffffff',
      cardBgHighlight: '#f0e8ff',
      cardBorder: '#e0e0e0',
      cardBorderHighlight: '#667eea',
      itemTitleColor: '#667eea',
      textColor: '#333',
      bulletColor: '#667eea',
    },
  };

  const currentTheme = themes[theme];

  return (
    <div
      className="slide comparison-slide"
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
          fontSize: '2rem',
          fontWeight: 600,
          color: currentTheme.titleColor,
          marginBottom: subtitle ? '10px' : '30px',
        }}
      >
        {title}
      </h2>
      {subtitle && (
        <p
          style={{
            fontSize: '1.1rem',
            color: currentTheme.subtitleColor,
            marginBottom: '30px',
          }}
        >
          {subtitle}
        </p>
      )}
      <div
        style={{
          flex: 1,
          display: 'flex',
          gap: '30px',
          alignItems: 'stretch',
        }}
      >
        {items.map((item, index) => (
          <div
            key={index}
            style={{
              flex: 1,
              background: item.highlight ? currentTheme.cardBgHighlight : currentTheme.cardBg,
              border: `2px solid ${item.highlight ? currentTheme.cardBorderHighlight : currentTheme.cardBorder}`,
              borderRadius: '12px',
              padding: '30px',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <h3
              style={{
                fontSize: '1.4rem',
                fontWeight: 600,
                color: currentTheme.itemTitleColor,
                marginBottom: '20px',
                paddingBottom: '15px',
                borderBottom: `2px solid ${item.highlight ? currentTheme.cardBorderHighlight : currentTheme.cardBorder}`,
              }}
            >
              {item.title}
            </h3>
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
                flex: 1,
              }}
            >
              {item.points.map((point, pointIndex) => (
                <li
                  key={pointIndex}
                  style={{
                    fontSize: '1rem',
                    lineHeight: 1.5,
                    color: currentTheme.textColor,
                    marginBottom: '12px',
                    paddingLeft: '20px',
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
                    ✓
                  </span>
                  {point}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ComparisonSlide;
