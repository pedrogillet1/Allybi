/**
 * Marker Safety Test
 *
 * Tests that markers are:
 * 1. Not placed inside code blocks, inline code, or URLs
 * 2. Correctly handle chunk boundary streaming
 * 3. Properly encode/decode special characters
 * 4. Parse and create CITE:: and DOC:: markers correctly
 */

import {
  createDocMarker,
  createCiteMarker,
  createLoadMoreMarker,
  parseDocMarker,
  parseCiteMarker,
  parseLoadMoreMarker,
  encodeMarkerValue,
  decodeMarkerValue,
  containsMarkers,
  hasIncompleteMarkers,
  validateMarkerLocations,
  getSafeInsertionPoints,
  StreamingMarkerBuffer,
  countMarkers,
  stripMarkers,
} from '../services/utils/markerUtils';

// ============================================================================
// MARKER FORMAT TESTS
// ============================================================================

describe('Marker Format - DOC::', () => {
  test('creates DOC marker with correct format', () => {
    const marker = createDocMarker({
      id: 'doc-123',
      name: 'report.pdf',
      ctx: 'text',
    });

    expect(marker).toBe('{{DOC::id=doc-123::name="report.pdf"::ctx=text}}');
  });

  test('encodes special characters in DOC marker name', () => {
    const marker = createDocMarker({
      id: 'doc-456',
      name: 'report & analysis (2024).pdf',
      ctx: 'list',
    });

    // URL encoding encodes & and spaces, but leaves () intact (they're safe)
    expect(marker).toContain('%20'); // spaces encoded
    expect(marker).toContain('%26'); // & encoded
    expect(marker).not.toContain(' & '); // original ampersand with spaces not present
  });

  test('parses DOC marker correctly', () => {
    const marker = '{{DOC::id=doc-789::name="test%20file.pdf"::ctx=list}}';
    const parsed = parseDocMarker(marker);

    expect(parsed).not.toBeNull();
    expect(parsed?.id).toBe('doc-789');
    expect(parsed?.name).toBe('test file.pdf'); // decoded
    expect(parsed?.ctx).toBe('list');
  });

  test('returns null for invalid DOC marker', () => {
    expect(parseDocMarker('{{DOC::invalid}}')).toBeNull();
    expect(parseDocMarker('{{DOC::id=123}}')).toBeNull(); // missing name and ctx
    expect(parseDocMarker('not a marker')).toBeNull();
  });
});

describe('Marker Format - CITE::', () => {
  test('creates basic CITE marker', () => {
    const marker = createCiteMarker({
      id: 'doc-123',
      doc: 'source.pdf',
    });

    expect(marker).toBe('{{CITE::id=doc-123::doc="source.pdf"}}');
  });

  test('creates CITE marker with page number', () => {
    const marker = createCiteMarker({
      id: 'doc-123',
      doc: 'source.pdf',
      page: 5,
    });

    expect(marker).toBe('{{CITE::id=doc-123::doc="source.pdf"::page=5}}');
  });

  test('creates CITE marker with chunk ID', () => {
    const marker = createCiteMarker({
      id: 'doc-123',
      doc: 'source.pdf',
      page: 5,
      chunk: 'chunk-abc',
    });

    expect(marker).toBe('{{CITE::id=doc-123::doc="source.pdf"::page=5::chunk=chunk-abc}}');
  });

  test('parses CITE marker correctly', () => {
    const marker = '{{CITE::id=doc-456::doc="research%20paper.pdf"::page=10::chunk=chunk-xyz}}';
    const parsed = parseCiteMarker(marker);

    expect(parsed).not.toBeNull();
    expect(parsed?.id).toBe('doc-456');
    expect(parsed?.doc).toBe('research paper.pdf');
    expect(parsed?.page).toBe(10);
    expect(parsed?.chunk).toBe('chunk-xyz');
  });

  test('parses CITE marker without optional fields', () => {
    const marker = '{{CITE::id=doc-789::doc="simple.pdf"}}';
    const parsed = parseCiteMarker(marker);

    expect(parsed).not.toBeNull();
    expect(parsed?.id).toBe('doc-789');
    expect(parsed?.doc).toBe('simple.pdf');
    expect(parsed?.page).toBeUndefined();
    expect(parsed?.chunk).toBeUndefined();
  });
});

describe('Marker Format - LOAD_MORE::', () => {
  test('creates LOAD_MORE marker', () => {
    const marker = createLoadMoreMarker({
      total: 50,
      shown: 10,
      remaining: 40,
    });

    expect(marker).toBe('{{LOAD_MORE::total=50::shown=10::remaining=40}}');
  });

  test('parses LOAD_MORE marker', () => {
    const marker = '{{LOAD_MORE::total=100::shown=20::remaining=80}}';
    const parsed = parseLoadMoreMarker(marker);

    expect(parsed).not.toBeNull();
    expect(parsed?.total).toBe(100);
    expect(parsed?.shown).toBe(20);
    expect(parsed?.remaining).toBe(80);
  });
});

// ============================================================================
// ENCODING TESTS
// ============================================================================

describe('Marker Encoding', () => {
  test('encodes and decodes special characters', () => {
    const special = 'test & value "quoted" with spaces';
    const encoded = encodeMarkerValue(special);
    const decoded = decodeMarkerValue(encoded);

    expect(decoded).toBe(special);
    expect(encoded).not.toContain('&');
    expect(encoded).not.toContain('"');
    expect(encoded).not.toContain(' ');
  });

  test('handles unicode characters', () => {
    const unicode = 'relatório técnico 2024.pdf';
    const encoded = encodeMarkerValue(unicode);
    const decoded = decodeMarkerValue(encoded);

    expect(decoded).toBe(unicode);
  });

  test('decodeMarkerValue handles invalid encoding gracefully', () => {
    const invalid = '%ZZ invalid';
    const decoded = decodeMarkerValue(invalid);

    expect(decoded).toBe(invalid); // Falls back to original
  });
});

// ============================================================================
// MARKER DETECTION TESTS
// ============================================================================

describe('Marker Detection', () => {
  test('containsMarkers detects DOC markers', () => {
    expect(containsMarkers('Text with {{DOC::id=1::name="f.pdf"::ctx=text}} marker')).toBe(true);
  });

  test('containsMarkers detects CITE markers', () => {
    expect(containsMarkers('Text with {{CITE::id=1::doc="f.pdf"}} citation')).toBe(true);
  });

  test('containsMarkers detects LOAD_MORE markers', () => {
    expect(containsMarkers('{{LOAD_MORE::total=10::shown=5::remaining=5}}')).toBe(true);
  });

  test('containsMarkers returns false for plain text', () => {
    expect(containsMarkers('Just plain text without markers')).toBe(false);
  });

  test('hasIncompleteMarkers detects partial markers', () => {
    expect(hasIncompleteMarkers('Text with {{DOC::id=123')).toBe(true);
    expect(hasIncompleteMarkers('{{')).toBe(true);
    expect(hasIncompleteMarkers('{{CITE::')).toBe(true);
  });

  test('hasIncompleteMarkers returns false for complete markers', () => {
    expect(hasIncompleteMarkers('{{DOC::id=1::name="f.pdf"::ctx=text}}')).toBe(false);
  });

  test('countMarkers counts all marker types', () => {
    const text = 'Doc: {{DOC::id=1::name="a.pdf"::ctx=text}}, ' +
                 'Cite: {{CITE::id=2::doc="b.pdf"}}, ' +
                 'More: {{LOAD_MORE::total=10::shown=5::remaining=5}}';
    const counts = countMarkers(text);

    expect(counts.doc).toBe(1);
    expect(counts.cite).toBe(1);
    expect(counts.loadMore).toBe(1);
    expect(counts.total).toBe(3);
  });
});

// ============================================================================
// MARKER SAFETY TESTS
// ============================================================================

describe('Marker Location Safety', () => {
  test('detects markers inside code blocks', () => {
    const text = '```javascript\nconst x = "{{DOC::id=1::name="f.pdf"::ctx=text}}";\n```';
    const issues = validateMarkerLocations(text);

    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]).toContain('code block');
  });

  test('detects markers inside inline code', () => {
    const text = 'Use `{{DOC::id=1::name="f.pdf"::ctx=text}}` in your code';
    const issues = validateMarkerLocations(text);

    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]).toContain('inline code');
  });

  test('detects markers inside markdown links', () => {
    const text = '[Click {{DOC::id=1::name="f.pdf"::ctx=text}}](http://example.com)';
    const issues = validateMarkerLocations(text);

    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]).toContain('markdown link');
  });

  test('returns empty array for safe marker locations', () => {
    const text = 'Here is a document: {{DOC::id=1::name="file.pdf"::ctx=text}}';
    const issues = validateMarkerLocations(text);

    expect(issues.length).toBe(0);
  });

  test('getSafeInsertionPoints excludes code blocks', () => {
    const text = 'Safe ```code block``` safe';
    const safePoints = getSafeInsertionPoints(text);

    // Points inside code block should be excluded
    const codeStart = text.indexOf('```');
    const codeEnd = text.indexOf('```', codeStart + 3) + 3;

    for (let i = codeStart; i < codeEnd; i++) {
      expect(safePoints).not.toContain(i);
    }
  });
});

// ============================================================================
// STREAMING BUFFER TESTS
// ============================================================================

describe('StreamingMarkerBuffer', () => {
  test('holds back incomplete markers', () => {
    const buffer = new StreamingMarkerBuffer();

    const chunk1 = 'Some text before {{DOC::id=1';
    const result1 = buffer.append(chunk1);

    expect(result1).toBe('Some text before '); // marker prefix held back
    expect(buffer.hasPending()).toBe(true);
  });

  test('emits complete markers', () => {
    const buffer = new StreamingMarkerBuffer();

    const chunk1 = 'Text {{DOC::id=1';
    const chunk2 = '::name="test.pdf"::ctx=text}} more';

    buffer.append(chunk1);
    const result2 = buffer.append(chunk2);

    expect(result2).toContain('{{DOC::id=1::name="test.pdf"::ctx=text}}');
  });

  test('flush returns remaining content when marker is incomplete', () => {
    const buffer = new StreamingMarkerBuffer();

    // Content with potential incomplete marker is held back
    buffer.append('Text before {{DOC::id=incomplete');
    const flushed = buffer.flush();

    // Flush should return the held back incomplete marker content
    expect(flushed).toContain('{{DOC::id=incomplete');
    expect(buffer.hasPending()).toBe(false);
  });

  test('append emits all content when no marker prefix', () => {
    const buffer = new StreamingMarkerBuffer();

    // Content without marker prefix is emitted immediately
    const result = buffer.append('Some text without markers');

    expect(result).toBe('Some text without markers');
    expect(buffer.hasPending()).toBe(false);
  });

  test('handles multiple chunks with marker split', () => {
    const buffer = new StreamingMarkerBuffer();

    buffer.append('Start ');
    buffer.append('{{');
    buffer.append('CITE::');
    buffer.append('id=doc1');
    buffer.append('::doc="');
    buffer.append('file.pdf');
    const result = buffer.append('"}}');

    expect(result).toContain('{{CITE::id=doc1::doc="file.pdf"}}');
  });

  test('reset clears the buffer', () => {
    const buffer = new StreamingMarkerBuffer();

    buffer.append('Some {{incomplete');
    buffer.reset();

    expect(buffer.hasPending()).toBe(false);
    expect(buffer.flush()).toBe('');
  });
});

// ============================================================================
// STRIP MARKERS TEST
// ============================================================================

describe('stripMarkers', () => {
  test('strips DOC markers replacing with filename', () => {
    const text = 'See {{DOC::id=1::name="report.pdf"::ctx=text}} for details';
    const stripped = stripMarkers(text);

    expect(stripped).toBe('See report.pdf for details');
  });

  test('strips CITE markers replacing with doc name', () => {
    const text = 'Reference: {{CITE::id=2::doc="source.pdf"::page=5}}';
    const stripped = stripMarkers(text);

    expect(stripped).toBe('Reference: source.pdf');
  });

  test('strips LOAD_MORE markers with empty string', () => {
    const text = 'Documents {{LOAD_MORE::total=10::shown=5::remaining=5}}';
    const stripped = stripMarkers(text);

    expect(stripped).toBe('Documents ');
  });
});

console.log('Marker safety tests loaded');
