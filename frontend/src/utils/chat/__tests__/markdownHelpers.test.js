import {
  balanceMarkdownDelimiters,
  stripSourceColumnsFromMarkdownTables,
  stripInlineCitationArtifacts,
  sanitizeAndBalanceMarkdownForRender,
} from '../markdownHelpers';

describe('balanceMarkdownDelimiters', () => {
  it('closes unclosed code fence during streaming', () => {
    const result = balanceMarkdownDelimiters('```js\nconst x = 1;', true);
    expect(result).toContain('```js\nconst x = 1;\n```');
  });

  it('does not modify when not streaming', () => {
    const input = '```js\nconst x = 1;';
    expect(balanceMarkdownDelimiters(input, false)).toBe(input);
  });

  it('closes unclosed inline backtick during streaming', () => {
    const result = balanceMarkdownDelimiters('some `code', true);
    expect(result).toBe('some `code`');
  });

  it('leaves balanced fences alone', () => {
    const input = '```js\ncode\n```';
    expect(balanceMarkdownDelimiters(input, true)).toBe(input);
  });

  it('leaves balanced inline backticks alone', () => {
    const input = 'some `code` here';
    expect(balanceMarkdownDelimiters(input, true)).toBe(input);
  });
});

describe('stripSourceColumnsFromMarkdownTables', () => {
  it('strips a Source column from a 3-column table', () => {
    const input = [
      '| Name | Value | Source |',
      '| --- | --- | --- |',
      '| A | 1 | doc.pdf |',
      '| B | 2 | other.pdf |',
    ].join('\n');
    const result = stripSourceColumnsFromMarkdownTables(input);
    expect(result).not.toContain('Source');
    expect(result).toContain('Name');
    expect(result).toContain('Value');
  });

  it('strips a Fonte column (Portuguese)', () => {
    const input = [
      '| Nome | Valor | Fonte |',
      '| --- | --- | --- |',
      '| A | 1 | doc.pdf |',
    ].join('\n');
    const result = stripSourceColumnsFromMarkdownTables(input);
    expect(result).not.toContain('Fonte');
    expect(result).toContain('Nome');
  });

  it('does not strip non-source columns', () => {
    const input = [
      '| Name | Value |',
      '| --- | --- |',
      '| A | 1 |',
    ].join('\n');
    const result = stripSourceColumnsFromMarkdownTables(input);
    expect(result).toContain('Name');
    expect(result).toContain('Value');
  });

  it('handles 5-column table with multiple source columns', () => {
    const input = [
      '| Name | Sources | Value | Evidence | Score |',
      '| --- | --- | --- | --- | --- |',
      '| A | doc.pdf | 1 | para 2 | 5 |',
    ].join('\n');
    const result = stripSourceColumnsFromMarkdownTables(input);
    expect(result).not.toContain('Sources');
    expect(result).not.toContain('Evidence');
    expect(result).toContain('Name');
  });

  it('handles empty input', () => {
    expect(stripSourceColumnsFromMarkdownTables('')).toBe('');
    expect(stripSourceColumnsFromMarkdownTables(null)).toBe('');
  });
});

describe('stripInlineCitationArtifacts', () => {
  it('strips UUID-based citation markers', () => {
    const marker = 'd:12345678-1234-1234-1234-123456789abc|p:5|c:1';
    const input = `Some text (${marker}) more text.`;
    const result = stripInlineCitationArtifacts(input);
    expect(result).toBe('Some text more text.');
  });

  it('strips multiple citation markers', () => {
    const m1 = 'd:12345678-1234-1234-1234-123456789abc|p:5|c:1';
    const m2 = 'd:abcdefab-cdef-abcd-efab-cdefabcdefab|p:-1|c:0';
    const input = `Start (${m1}) middle (${m2}) end.`;
    const result = stripInlineCitationArtifacts(input);
    expect(result).toBe('Start middle end.');
  });

  it('strips markers not wrapped in parens', () => {
    const marker = 'd:12345678-1234-1234-1234-123456789abc|p:5|c:1';
    const input = `Text ${marker} more`;
    const result = stripInlineCitationArtifacts(input);
    expect(result).toBe('Text more');
  });

  it('cleans up leftover empty parens', () => {
    expect(stripInlineCitationArtifacts('Text () more')).toBe('Text more');
    expect(stripInlineCitationArtifacts('Text (,;) more')).toBe('Text more');
  });

  it('handles empty input', () => {
    expect(stripInlineCitationArtifacts('')).toBe('');
    expect(stripInlineCitationArtifacts(null)).toBe('');
  });
});

describe('sanitizeAndBalanceMarkdownForRender', () => {
  it('calls stripInlineCitationArtifacts', () => {
    const marker = 'd:12345678-1234-1234-1234-123456789abc|p:5|c:1';
    const result = sanitizeAndBalanceMarkdownForRender(`Text (${marker})`, false);
    expect(result).toBe('Text');
  });

  it('balances delimiters when streaming', () => {
    const result = sanitizeAndBalanceMarkdownForRender('```js\ncode', true);
    expect(result).toContain('\n```');
  });

  it('strips source columns when preserveTableSourceColumns is false', () => {
    const input = '| Name | Source |\n| --- | --- |\n| A | doc.pdf |';
    const result = sanitizeAndBalanceMarkdownForRender(input, false, false);
    expect(result).not.toContain('Source');
  });

  it('preserves source columns when preserveTableSourceColumns is true', () => {
    const input = '| Name | Source |\n| --- | --- |\n| A | doc.pdf |';
    const result = sanitizeAndBalanceMarkdownForRender(input, false, true);
    expect(result).toContain('Source');
  });
});
