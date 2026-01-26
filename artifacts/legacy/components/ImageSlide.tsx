import React from 'react';

export interface ImageSlideProps {
  title: string;
  imageUrl?: string;
  imagePlaceholder?: string;
  caption?: string;
  layout?: 'full' | 'left' | 'right';
  description?: string;
  theme?: 'light' | 'dark' | 'corporate' | 'creative';
}

export const ImageSlide: React.FC<ImageSlideProps> = ({
  title,
  imageUrl,
  imagePlaceholder = 'Image Placeholder',
  caption,
  layout = 'full',
  description,
  theme = 'light',
}) => {
  const themes = {
    light: {
      background: '#ffffff',
      titleColor: '#1a1a2e',
      textColor: '#333',
      captionColor: '#666',
      placeholderBg: '#e0e0e0',
    },
    dark: {
      background: '#1a1a2e',
      titleColor: '#ffffff',
      textColor: '#e0e0e0',
      captionColor: '#a0a0a0',
      placeholderBg: '#2a2a4e',
    },
    corporate: {
      background: '#f8f9fa',
      titleColor: '#0f4c75',
      textColor: '#333',
      captionColor: '#666',
      placeholderBg: '#d0e0f0',
    },
    creative: {
      background: '#fafafa',
      titleColor: '#667eea',
      textColor: '#333',
      captionColor: '#666',
      placeholderBg: '#e0e0ff',
    },
  };

  const currentTheme = themes[theme];

  const renderImage = () => {
    if (imageUrl) {
      return (
        <img
          src={imageUrl}
          alt={title}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            borderRadius: '8px',
          }}
        />
      );
    }
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: currentTheme.placeholderBg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '8px',
          fontSize: '1.2rem',
          color: currentTheme.captionColor,
        }}
      >
        {imagePlaceholder}
      </div>
    );
  };

  if (layout === 'full') {
    return (
      <div
        className="slide image-slide"
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
            marginBottom: '30px',
          }}
        >
          {title}
        </h2>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, minHeight: '300px' }}>{renderImage()}</div>
          {caption && (
            <p
              style={{
                fontSize: '1rem',
                color: currentTheme.captionColor,
                textAlign: 'center',
                marginTop: '15px',
                fontStyle: 'italic',
              }}
            >
              {caption}
            </p>
          )}
        </div>
      </div>
    );
  }

  // Left or Right layout
  const isLeft = layout === 'left';

  return (
    <div
      className="slide image-slide"
      style={{
        width: '100%',
        height: '100vh',
        minHeight: '600px',
        display: 'flex',
        flexDirection: isLeft ? 'row' : 'row-reverse',
        background: currentTheme.background,
        padding: '60px',
        boxSizing: 'border-box',
        gap: '40px',
      }}
    >
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {renderImage()}
        {caption && (
          <p
            style={{
              fontSize: '0.9rem',
              color: currentTheme.captionColor,
              textAlign: 'center',
              marginTop: '10px',
              fontStyle: 'italic',
            }}
          >
            {caption}
          </p>
        )}
      </div>
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}
      >
        <h2
          style={{
            fontSize: '2rem',
            fontWeight: 600,
            color: currentTheme.titleColor,
            marginBottom: '20px',
          }}
        >
          {title}
        </h2>
        {description && (
          <p
            style={{
              fontSize: '1.1rem',
              lineHeight: 1.7,
              color: currentTheme.textColor,
            }}
          >
            {description}
          </p>
        )}
      </div>
    </div>
  );
};

export default ImageSlide;
