import React from 'react';

export interface SummarySlideProps {
  title: string;
  keyPoints: string[];
  conclusion?: string;
  callToAction?: string;
  theme?: 'light' | 'dark' | 'corporate' | 'creative';
}

export const SummarySlide: React.FC<SummarySlideProps> = ({
  title,
  keyPoints,
  conclusion,
  callToAction,
  theme = 'corporate',
}) => {
  const themes = {
    light: {
      background: 'linear-gradient(135deg, #f5f7fa 0%, #e4e8ec 100%)',
      titleColor: '#1a1a2e',
      textColor: '#333',
      pointBg: '#ffffff',
      pointBorder: '#e0e0e0',
      numberColor: '#0f4c75',
      conclusionColor: '#4a4a68',
      ctaColor: '#0f4c75',
    },
    dark: {
      background: 'linear-gradient(135deg, #1a1a2e 0%, #2a2a4e 100%)',
      titleColor: '#ffffff',
      textColor: '#e0e0e0',
      pointBg: '#2a2a4e',
      pointBorder: '#4a4a6e',
      numberColor: '#3282b8',
      conclusionColor: '#a0a0c0',
      ctaColor: '#bbe1fa',
    },
    corporate: {
      background: 'linear-gradient(135deg, #0f4c75 0%, #1b6ca8 100%)',
      titleColor: '#ffffff',
      textColor: '#ffffff',
      pointBg: 'rgba(255, 255, 255, 0.1)',
      pointBorder: 'rgba(255, 255, 255, 0.2)',
      numberColor: '#bbe1fa',
      conclusionColor: '#e0f0ff',
      ctaColor: '#ffffff',
    },
    creative: {
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      titleColor: '#ffffff',
      textColor: '#ffffff',
      pointBg: 'rgba(255, 255, 255, 0.1)',
      pointBorder: 'rgba(255, 255, 255, 0.2)',
      numberColor: '#e0e0ff',
      conclusionColor: '#e0e0ff',
      ctaColor: '#ffffff',
    },
  };

  const currentTheme = themes[theme];

  return (
    <div
      className="slide summary-slide"
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
          marginBottom: '40px',
          textAlign: 'center',
        }}
      >
        {title}
      </h2>

      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
          justifyContent: 'center',
        }}
      >
        {keyPoints.map((point, index) => (
          <div
            key={index}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '20px',
              background: currentTheme.pointBg,
              border: `1px solid ${currentTheme.pointBorder}`,
              borderRadius: '12px',
              padding: '20px 30px',
            }}
          >
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                background: currentTheme.numberColor,
                color: theme === 'light' ? '#fff' : '#1a1a2e',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '1.2rem',
                flexShrink: 0,
              }}
            >
              {index + 1}
            </div>
            <p
              style={{
                fontSize: '1.2rem',
                color: currentTheme.textColor,
                margin: 0,
                lineHeight: 1.5,
              }}
            >
              {point}
            </p>
          </div>
        ))}
      </div>

      {(conclusion || callToAction) && (
        <div style={{ marginTop: '40px', textAlign: 'center' }}>
          {conclusion && (
            <p
              style={{
                fontSize: '1.2rem',
                color: currentTheme.conclusionColor,
                marginBottom: callToAction ? '20px' : 0,
                fontStyle: 'italic',
              }}
            >
              {conclusion}
            </p>
          )}
          {callToAction && (
            <p
              style={{
                fontSize: '1.4rem',
                fontWeight: 600,
                color: currentTheme.ctaColor,
              }}
            >
              {callToAction}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default SummarySlide;
