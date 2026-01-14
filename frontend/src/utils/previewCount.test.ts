/**
 * Unit tests for Canonical Preview Count System
 *
 * Tests cover all file types, edge cases, and formatting rules.
 * These tests lock the logic - any unintentional changes will fail.
 */

import {
  determineCountUnit,
  getPreviewCountForFile,
  formatDuration,
  getFileExtension,
  PreviewMetadata
} from './previewCount';

// Mock translation function
const mockT = (key: string, params?: any): string => {
  // Simplified English translations for testing
  const translations: Record<string, string> = {
    'previewCount.pageOf': `Page ${params?.current} of ${params?.total}`,
    'previewCount.slideOf': `Slide ${params?.current} of ${params?.total}`,
    'previewCount.sheetOf': `Sheet ${params?.current} of ${params?.total}`,
    'previewCount.pages': `${params?.count} page${params?.count > 1 ? 's' : ''}`,
    'previewCount.pagesShort': `${params?.count}p`,
    'previewCount.slides': `${params?.count} slide${params?.count > 1 ? 's' : ''}`,
    'previewCount.slidesShort': `${params?.count} slides`,
    'previewCount.sheets': `${params?.count} sheet${params?.count > 1 ? 's' : ''}`,
    'previewCount.sheetsShort': `${params?.count} sheets`,
    'previewCount.imageSingle': '1 image',
    'previewCount.image': 'Image',
    'previewCount.duration': `Duration ${params?.time}`,
    'previewCount.durationUnknown': 'Duration unknown',
    'previewCount.pageNumber': `Page ${params?.page}`,
    'previewCount.slideNumber': `Slide ${params?.slide}`,
    'previewCount.sheetNumber': `Sheet ${params?.sheet}`,
    'previewCount.pagesUnknown': 'Pages unknown',
    'previewCount.slidesUnknown': 'Slides unknown',
    'previewCount.sheetsUnknown': 'Sheets unknown',
    'previewCount.preview': 'Preview',
    'common.loading': 'Loading...'
  };

  return translations[key] || key;
};

describe('formatDuration', () => {
  test('formats seconds to MM:SS', () => {
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(125)).toBe('2:05');
    expect(formatDuration(0)).toBe('0:00');
  });

  test('formats hours to HH:MM:SS', () => {
    expect(formatDuration(3665)).toBe('1:01:05');
    expect(formatDuration(7200)).toBe('2:00:00');
  });

  test('handles edge cases', () => {
    expect(formatDuration(null)).toBe('0:00');
    expect(formatDuration(undefined)).toBe('0:00');
    expect(formatDuration(Infinity)).toBe('0:00');
  });
});

describe('getFileExtension', () => {
  test('extracts file extension', () => {
    expect(getFileExtension('document.pdf')).toBe('pdf');
    expect(getFileExtension('presentation.pptx')).toBe('pptx');
    expect(getFileExtension('file.tar.gz')).toBe('gz');
  });

  test('handles no extension', () => {
    expect(getFileExtension('README')).toBe('');
    expect(getFileExtension('')).toBe('');
  });
});

describe('determineCountUnit', () => {
  test('PDF files use pages', () => {
    expect(determineCountUnit({ mimeType: 'application/pdf' })).toBe('pages');
    expect(determineCountUnit({ fileExt: 'pdf' })).toBe('pages');
  });

  test('PPTX files use slides', () => {
    expect(determineCountUnit({
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    })).toBe('slides');
    expect(determineCountUnit({ fileExt: 'pptx' })).toBe('slides');
  });

  test('PPTX PDF mode still uses slides', () => {
    expect(determineCountUnit({
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      previewType: 'slides'
    })).toBe('slides');
  });

  test('Excel files use sheets', () => {
    expect(determineCountUnit({
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    })).toBe('sheets');
    expect(determineCountUnit({ fileExt: 'xlsx' })).toBe('sheets');
  });

  test('Images use items', () => {
    expect(determineCountUnit({ mimeType: 'image/png' })).toBe('items');
    expect(determineCountUnit({ fileExt: 'jpg' })).toBe('items');
  });

  test('Videos use duration', () => {
    expect(determineCountUnit({ mimeType: 'video/mp4' })).toBe('duration');
    expect(determineCountUnit({ fileExt: 'mov' })).toBe('duration');
  });

  test('Audio uses duration', () => {
    expect(determineCountUnit({ mimeType: 'audio/mpeg' })).toBe('duration');
    expect(determineCountUnit({ fileExt: 'mp3' })).toBe('duration');
  });

  test('Word docs with page count use pages', () => {
    expect(determineCountUnit({
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      numPages: 10
    })).toBe('pages');
  });

  test('Word docs without page count use unknown', () => {
    expect(determineCountUnit({
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    })).toBe('unknown');
  });

  test('Text files use unknown', () => {
    expect(determineCountUnit({ mimeType: 'text/plain' })).toBe('unknown');
    expect(determineCountUnit({ fileExt: 'txt' })).toBe('unknown');
  });
});

describe('getPreviewCountForFile - PDF', () => {
  test('PDF with current page', () => {
    const result = getPreviewCountForFile({
      mimeType: 'application/pdf',
      numPages: 10,
      currentPage: 3
    }, mockT);

    expect(result.unit).toBe('pages');
    expect(result.total).toBe(10);
    expect(result.current).toBe(3);
    expect(result.label).toBe('Page 3 of 10');
    expect(result.shortLabel).toBe('3/10');
  });

  test('PDF without current page', () => {
    const result = getPreviewCountForFile({
      mimeType: 'application/pdf',
      numPages: 25
    }, mockT);

    expect(result.unit).toBe('pages');
    expect(result.total).toBe(25);
    expect(result.label).toBe('25 pages');
  });

  test('PDF loading state', () => {
    const result = getPreviewCountForFile({
      mimeType: 'application/pdf',
      isLoading: true
    }, mockT);

    expect(result.label).toBe('Loading...');
  });
});

describe('getPreviewCountForFile - PPTX', () => {
  test('PPTX slides mode with current slide', () => {
    const result = getPreviewCountForFile({
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      totalSlides: 15,
      currentSlide: 7,
      previewType: 'slides'
    }, mockT);

    expect(result.unit).toBe('slides');
    expect(result.total).toBe(15);
    expect(result.current).toBe(7);
    expect(result.label).toBe('Slide 7 of 15');
  });

  test('PPTX PDF mode (still labeled as slides)', () => {
    const result = getPreviewCountForFile({
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      numPages: 20,
      currentPage: 5,
      previewType: 'slides'
    }, mockT);

    expect(result.unit).toBe('slides');
    expect(result.total).toBe(20); // Falls back to numPages
    expect(result.current).toBe(5);
    expect(result.label).toBe('Slide 5 of 20');
  });
});

describe('getPreviewCountForFile - Excel', () => {
  test('Excel with sheet tabs', () => {
    const result = getPreviewCountForFile({
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      totalSheets: 3,
      currentSheet: 2
    }, mockT);

    expect(result.unit).toBe('sheets');
    expect(result.total).toBe(3);
    expect(result.current).toBe(2);
    expect(result.label).toBe('Sheet 2 of 3');
  });

  test('Excel PDF mode', () => {
    const result = getPreviewCountForFile({
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      totalSheets: 5,
      currentSheet: 1,
      previewType: 'sheets'
    }, mockT);

    expect(result.unit).toBe('sheets');
    expect(result.label).toBe('Sheet 1 of 5');
  });
});

describe('getPreviewCountForFile - Images', () => {
  test('Single image', () => {
    const result = getPreviewCountForFile({
      mimeType: 'image/png'
    }, mockT);

    expect(result.unit).toBe('items');
    expect(result.total).toBe(1);
    expect(result.label).toBe('1 image');
    expect(result.shortLabel).toBe('Image');
  });
});

describe('getPreviewCountForFile - Video/Audio', () => {
  test('Video with duration', () => {
    const result = getPreviewCountForFile({
      mimeType: 'video/mp4',
      durationSec: 125
    }, mockT);

    expect(result.unit).toBe('duration');
    expect(result.durationSec).toBe(125);
    expect(result.label).toBe('Duration 2:05');
    expect(result.shortLabel).toBe('2:05');
  });

  test('Video without duration', () => {
    const result = getPreviewCountForFile({
      mimeType: 'video/mp4'
    }, mockT);

    expect(result.unit).toBe('duration');
    expect(result.label).toBe('Duration unknown');
  });

  test('Audio with duration', () => {
    const result = getPreviewCountForFile({
      mimeType: 'audio/mpeg',
      durationSec: 180
    }, mockT);

    expect(result.unit).toBe('duration');
    expect(result.label).toBe('Duration 3:00');
  });
});

describe('getPreviewCountForFile - Word Documents', () => {
  test('DOCX with known page count', () => {
    const result = getPreviewCountForFile({
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      numPages: 5,
      currentPage: 2
    }, mockT);

    expect(result.unit).toBe('pages');
    expect(result.label).toBe('Page 2 of 5');
  });

  test('DOCX without page count (HTML preview)', () => {
    const result = getPreviewCountForFile({
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    }, mockT);

    expect(result.unit).toBe('unknown');
    expect(result.label).toBe('Preview');
  });
});

describe('getPreviewCountForFile - Edge Cases', () => {
  test('Unknown file type', () => {
    const result = getPreviewCountForFile({
      mimeType: 'application/octet-stream'
    }, mockT);

    expect(result.unit).toBe('unknown');
    expect(result.label).toBe('Preview');
  });

  test('PDF with unknown total (corrupt file)', () => {
    const result = getPreviewCountForFile({
      mimeType: 'application/pdf',
      numPages: null,
      currentPage: 1
    }, mockT);

    expect(result.unit).toBe('pages');
    expect(result.total).toBeNull();
    expect(result.label).toBe('Page 1');
  });

  test('Never shows "Page 1 of ?" during loading', () => {
    const result = getPreviewCountForFile({
      mimeType: 'application/pdf',
      numPages: null,
      isLoading: true
    }, mockT);

    expect(result.label).toBe('Loading...');
    expect(result.label).not.toContain('?');
  });
});

describe('Formatting consistency', () => {
  test('All page labels use same format', () => {
    const pdf = getPreviewCountForFile({
      mimeType: 'application/pdf',
      numPages: 10,
      currentPage: 5
    }, mockT);

    const word = getPreviewCountForFile({
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      numPages: 10,
      currentPage: 5
    }, mockT);

    expect(pdf.label).toBe(word.label);
    expect(pdf.label).toBe('Page 5 of 10');
  });

  test('Short labels are consistent', () => {
    const result = getPreviewCountForFile({
      mimeType: 'application/pdf',
      numPages: 100,
      currentPage: 42
    }, mockT);

    expect(result.shortLabel).toBe('42/100');
    expect(result.shortLabel).not.toContain(' ');
  });
});
