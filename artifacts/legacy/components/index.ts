/**
 * Presentation Components Library
 *
 * A collection of React components for generating professional presentations.
 * Each component supports multiple themes: light, dark, corporate, creative.
 */

export { TitleSlide, type TitleSlideProps } from './TitleSlide';
export { TextSlide, type TextSlideProps } from './TextSlide';
export { ImageSlide, type ImageSlideProps } from './ImageSlide';
export { ChartSlide, type ChartSlideProps, type ChartDataPoint } from './ChartSlide';
export { QuoteSlide, type QuoteSlideProps } from './QuoteSlide';
export { ComparisonSlide, type ComparisonSlideProps, type ComparisonItem } from './ComparisonSlide';
export { SummarySlide, type SummarySlideProps } from './SummarySlide';

// Component registry for dynamic rendering
export const componentRegistry = {
  TitleSlide: require('./TitleSlide').TitleSlide,
  TextSlide: require('./TextSlide').TextSlide,
  ImageSlide: require('./ImageSlide').ImageSlide,
  ChartSlide: require('./ChartSlide').ChartSlide,
  QuoteSlide: require('./QuoteSlide').QuoteSlide,
  ComparisonSlide: require('./ComparisonSlide').ComparisonSlide,
  SummarySlide: require('./SummarySlide').SummarySlide,
} as const;

export type ComponentName = keyof typeof componentRegistry;

// Theme types
export type ThemeType = 'light' | 'dark' | 'corporate' | 'creative';
