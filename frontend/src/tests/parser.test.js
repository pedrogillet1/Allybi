/**
 * Frontend Parser Tests - Production V3
 * 
 * Run with: npm test parser.test.js
 */

import {
  parseDocMarker,
  parseLoadMoreMarker,
  parseTextWithMarkers,
  parseWithHoldback,
  isCompleteMarker,
  stripMarkers,
} from '../utils/kodaMarkerParserV3';

describe('Frontend Marker Parser', () => {
  describe('Complete Marker Detection', () => {
    it('should detect complete markers', () => {
      const complete = '{{DOC::id=doc123::name="file.pdf"::ctx=text}}';
      expect(isCompleteMarker(complete)).toBe(true);
    });

    it('should detect incomplete markers', () => {
      const incomplete = '{{DOC::id=doc123::name="file';
      expect(isCompleteMarker(incomplete)).toBe(false);
    });
  });

  describe('Text Parsing', () => {
    it('should parse text with single marker', () => {
      const text = 'See {{DOC::id=doc1::name="file.pdf"::ctx=text}} for details.';
      const parts = parseTextWithMarkers(text);
      
      expect(parts).toHaveLength(3);
      expect(parts[0]).toEqual({ type: 'text', value: 'See ' });
      expect(parts[1]).toMatchObject({ type: 'doc', id: 'doc1', name: 'file.pdf' });
      expect(parts[2]).toEqual({ type: 'text', value: ' for details.' });
    });

    it('should parse text with multiple markers', () => {
      const text = 'See {{DOC::id=doc1::name="file1.pdf"::ctx=text}} and {{DOC::id=doc2::name="file2.pdf"::ctx=list}}.';
      const parts = parseTextWithMarkers(text);
      
      expect(parts).toHaveLength(5);
      expect(parts[1].type).toBe('doc');
      expect(parts[3].type).toBe('doc');
    });

    it('should handle text with no markers', () => {
      const text = 'Just plain text here.';
      const parts = parseTextWithMarkers(text);
      
      expect(parts).toHaveLength(1);
      expect(parts[0]).toEqual({ type: 'text', value: text });
    });
  });

  describe('Streaming Holdback', () => {
    it('should hold back incomplete markers during streaming', () => {
      const text = 'Some text {{DOC::id=doc1::name="file';
      const result = parseWithHoldback(text, 50);
      
      // Should hold back the incomplete marker
      expect(result.heldBack).toContain('{{DOC::');
      expect(result.parts.length).toBeGreaterThan(0);
    });

    it('should not hold back when marker is complete', () => {
      const text = 'Some text {{DOC::id=doc1::name="file.pdf"::ctx=text}}';
      const result = parseWithHoldback(text, 50);
      
      expect(result.heldBack).toBe('');
      expect(result.parts.some(p => p.type === 'doc')).toBe(true);
    });

    it('should parse everything when not streaming', () => {
      const text = 'See {{DOC::id=doc1::name="file.pdf"::ctx=text}} here.';
      const result = parseWithHoldback(text, 0);
      
      expect(result.heldBack).toBe('');
      expect(result.parts).toHaveLength(3);
    });
  });

  describe('Streaming Chunk Boundaries', () => {
    it('should handle marker split across chunks', () => {
      // Simulate streaming chunks
      const chunk1 = 'Some text {{DOC::id=doc1::';
      const chunk2 = 'name="file.pdf"::ctx=text}} more text';
      
      // First chunk should hold back
      const result1 = parseWithHoldback(chunk1, 50);
      expect(result1.heldBack).toContain('{{DOC::');
      
      // Combined chunks should parse correctly
      const combined = chunk1 + chunk2;
      const result2 = parseWithHoldback(combined, 0);
      expect(result2.parts.some(p => p.type === 'doc')).toBe(true);
    });

    it('should not render partial markers as buttons', () => {
      const partial = 'Text {{DOC::id=doc1::name="file.p';
      const result = parseWithHoldback(partial, 50);
      
      // Should not have any doc parts
      const docParts = result.parts.filter(p => p.type === 'doc');
      expect(docParts).toHaveLength(0);
    });
  });

  describe('Strip Markers', () => {
    it('should strip markers and keep filenames', () => {
      const text = 'See {{DOC::id=doc1::name="report.pdf"::ctx=text}} for details.';
      const stripped = stripMarkers(text);
      
      expect(stripped).toBe('See report.pdf for details.');
    });

    it('should remove load more markers completely', () => {
      const text = 'Documents:\n{{LOAD_MORE::total=50::shown=10::remaining=40}}';
      const stripped = stripMarkers(text);
      
      expect(stripped).toBe('Documents:\n');
    });
  });
});
