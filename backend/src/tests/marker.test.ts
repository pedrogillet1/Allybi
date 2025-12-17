/**
 * Marker Utilities Tests - Production V3
 * 
 * Run with: npm test marker.test.ts
 */

import {
  createDocMarker,
  parseDocMarker,
  createLoadMoreMarker,
  parseLoadMoreMarker,
  isValidMarker,
  hasIncompleteMarkers,
  extractMarkers,
  stripMarkers,
  validateMarkerLocations,
} from '../services/utils/markerUtils';

describe('Marker Utilities', () => {
  describe('Document Markers', () => {
    it('should create valid document marker', () => {
      const marker = createDocMarker({
        id: 'doc123',
        name: 'report.pdf',
        ctx: 'text',
      });
      
      expect(marker).toBe('{{DOC::id=doc123::name="report.pdf"::ctx=text}}');
    });

    it('should handle special characters in filename', () => {
      const marker = createDocMarker({
        id: 'doc456',
        name: 'Report: Q4 2024.pdf',
        ctx: 'list',
      });
      
      // Should be URL encoded
      expect(marker).toContain('Report%3A%20Q4%202024.pdf');
    });

    it('should parse valid document marker', () => {
      const marker = '{{DOC::id=doc123::name="report.pdf"::ctx=text}}';
      const parsed = parseDocMarker(marker);
      
      expect(parsed).toEqual({
        id: 'doc123',
        name: 'report.pdf',
        ctx: 'text',
      });
    });

    it('should return null for invalid marker', () => {
      const invalid = '{{DOC::invalid}}';
      const parsed = parseDocMarker(invalid);
      
      expect(parsed).toBeNull();
    });

    it('should roundtrip encode/decode', () => {
      const original = {
        id: 'doc789',
        name: 'Complex: File (2024).pdf',
        ctx: 'text' as const,
      };
      
      const marker = createDocMarker(original);
      const parsed = parseDocMarker(marker);
      
      expect(parsed?.name).toBe(original.name);
    });
  });

  describe('Load More Markers', () => {
    it('should create valid load more marker', () => {
      const marker = createLoadMoreMarker({
        total: 50,
        shown: 10,
        remaining: 40,
      });
      
      expect(marker).toBe('{{LOAD_MORE::total=50::shown=10::remaining=40}}');
    });

    it('should parse valid load more marker', () => {
      const marker = '{{LOAD_MORE::total=50::shown=10::remaining=40}}';
      const parsed = parseLoadMoreMarker(marker);
      
      expect(parsed).toEqual({
        total: 50,
        shown: 10,
        remaining: 40,
      });
    });
  });

  describe('Marker Validation', () => {
    it('should detect incomplete markers', () => {
      const incomplete = 'Some text {{DOC::id=doc123::name="file';
      expect(hasIncompleteMarkers(incomplete)).toBe(true);
    });

    it('should not flag complete markers', () => {
      const complete = 'Some text {{DOC::id=doc123::name="file.pdf"::ctx=text}}';
      expect(hasIncompleteMarkers(complete)).toBe(false);
    });

    it('should validate marker format', () => {
      const valid = '{{DOC::id=doc123::name="file.pdf"::ctx=text}}';
      const invalid = '{{DOC::invalid}}';
      
      expect(isValidMarker(valid)).toBe(true);
      expect(isValidMarker(invalid)).toBe(false);
    });
  });

  describe('Marker Extraction', () => {
    it('should extract all markers from text', () => {
      const text = `
        Here is {{DOC::id=doc1::name="file1.pdf"::ctx=text}} and
        {{DOC::id=doc2::name="file2.pdf"::ctx=list}}.
        {{LOAD_MORE::total=50::shown=10::remaining=40}}
      `;
      
      const markers = extractMarkers(text);
      expect(markers).toHaveLength(3);
    });

    it('should strip markers from text', () => {
      const text = 'See {{DOC::id=doc1::name="report.pdf"::ctx=text}} for details.';
      const stripped = stripMarkers(text);
      
      expect(stripped).toBe('See report.pdf for details.');
    });
  });

  describe('Safe Location Validation', () => {
    it('should detect markers inside code blocks', () => {
      const text = `
        Some text
        \`\`\`
        {{DOC::id=doc1::name="file.pdf"::ctx=text}}
        \`\`\`
      `;
      
      const issues = validateMarkerLocations(text);
      expect(issues).toContain('Marker found inside code block');
    });

    it('should detect markers inside inline code', () => {
      const text = 'Use `{{DOC::id=doc1::name="file.pdf"::ctx=text}}` here.';
      
      const issues = validateMarkerLocations(text);
      expect(issues).toContain('Marker found inside inline code');
    });

    it('should allow markers in safe locations', () => {
      const text = 'See {{DOC::id=doc1::name="file.pdf"::ctx=text}} for details.';
      
      const issues = validateMarkerLocations(text);
      expect(issues).toHaveLength(0);
    });
  });
});
