import React from 'react';

export interface ChartDataPoint {
  label: string;
  value: number;
  color?: string;
}

export interface ChartSlideProps {
  title: string;
  data: ChartDataPoint[];
  chartType?: 'bar' | 'horizontal-bar' | 'progress';
  subtitle?: string;
  showValues?: boolean;
  theme?: 'light' | 'dark' | 'corporate' | 'creative';
}

export const ChartSlide: React.FC<ChartSlideProps> = ({
  title,
  data,
  chartType = 'bar',
  subtitle,
  showValues = true,
  theme = 'light',
}) => {
  const themes = {
    light: {
      background: '#ffffff',
      titleColor: '#1a1a2e',
      subtitleColor: '#4a4a68',
      textColor: '#333',
      barColors: ['#0f4c75', '#3282b8', '#bbe1fa', '#1b262c', '#5c7a8a'],
      gridColor: '#e0e0e0',
    },
    dark: {
      background: '#1a1a2e',
      titleColor: '#ffffff',
      subtitleColor: '#a0a0c0',
      textColor: '#e0e0e0',
      barColors: ['#3282b8', '#bbe1fa', '#0f4c75', '#5c7a8a', '#1b262c'],
      gridColor: '#3a3a5e',
    },
    corporate: {
      background: '#f8f9fa',
      titleColor: '#0f4c75',
      subtitleColor: '#3282b8',
      textColor: '#333',
      barColors: ['#0f4c75', '#3282b8', '#bbe1fa', '#1b262c', '#5c7a8a'],
      gridColor: '#d0d0d0',
    },
    creative: {
      background: '#fafafa',
      titleColor: '#667eea',
      subtitleColor: '#764ba2',
      textColor: '#333',
      barColors: ['#667eea', '#764ba2', '#a855f7', '#ec4899', '#f43f5e'],
      gridColor: '#e0e0e0',
    },
  };

  const currentTheme = themes[theme];
  const maxValue = Math.max(...data.map((d) => d.value));

  const getBarColor = (index: number, customColor?: string) => {
    return customColor || currentTheme.barColors[index % currentTheme.barColors.length];
  };

  const renderVerticalBars = () => (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-around',
        gap: '20px',
        paddingTop: '40px',
        borderBottom: `2px solid ${currentTheme.gridColor}`,
      }}
    >
      {data.map((item, index) => {
        const height = (item.value / maxValue) * 100;
        const barColor = getBarColor(index, item.color);

        return (
          <div
            key={index}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              flex: 1,
              maxWidth: '120px',
            }}
          >
            {showValues && (
              <span
                style={{
                  fontSize: '1.1rem',
                  fontWeight: 600,
                  color: currentTheme.textColor,
                  marginBottom: '10px',
                }}
              >
                {item.value}
              </span>
            )}
            <div
              style={{
                width: '60%',
                height: `${Math.max(height, 5)}%`,
                minHeight: '20px',
                maxHeight: '300px',
                background: barColor,
                borderRadius: '4px 4px 0 0',
                transition: 'height 0.3s ease',
              }}
            />
            <span
              style={{
                fontSize: '0.9rem',
                color: currentTheme.textColor,
                marginTop: '10px',
                textAlign: 'center',
              }}
            >
              {item.label}
            </span>
          </div>
        );
      })}
    </div>
  );

  const renderHorizontalBars = () => (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-around',
        gap: '15px',
      }}
    >
      {data.map((item, index) => {
        const width = (item.value / maxValue) * 100;
        const barColor = getBarColor(index, item.color);

        return (
          <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <span
              style={{
                fontSize: '1rem',
                color: currentTheme.textColor,
                minWidth: '120px',
                textAlign: 'right',
              }}
            >
              {item.label}
            </span>
            <div
              style={{
                flex: 1,
                height: '30px',
                background: currentTheme.gridColor,
                borderRadius: '4px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${Math.max(width, 2)}%`,
                  height: '100%',
                  background: barColor,
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  paddingRight: '10px',
                }}
              >
                {showValues && (
                  <span style={{ color: '#fff', fontWeight: 600, fontSize: '0.9rem' }}>
                    {item.value}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderProgressBars = () => (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: '25px',
      }}
    >
      {data.map((item, index) => {
        const percentage = Math.min(item.value, 100);
        const barColor = getBarColor(index, item.color);

        return (
          <div key={index}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: '8px',
              }}
            >
              <span style={{ fontSize: '1rem', color: currentTheme.textColor }}>
                {item.label}
              </span>
              {showValues && (
                <span style={{ fontSize: '1rem', fontWeight: 600, color: currentTheme.textColor }}>
                  {item.value}%
                </span>
              )}
            </div>
            <div
              style={{
                width: '100%',
                height: '12px',
                background: currentTheme.gridColor,
                borderRadius: '6px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${percentage}%`,
                  height: '100%',
                  background: barColor,
                  borderRadius: '6px',
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div
      className="slide chart-slide"
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
      {chartType === 'bar' && renderVerticalBars()}
      {chartType === 'horizontal-bar' && renderHorizontalBars()}
      {chartType === 'progress' && renderProgressBars()}
    </div>
  );
};

export default ChartSlide;
