/**
 * Format Constraint Parser Tests
 *
 * Tests for parsing format constraints from user queries and enforcing them.
 * Covers English, Portuguese, and Spanish patterns.
 */

import {
  parseFormatConstraints,
  enforceBulletCount,
  enforceTableFormat,
  isValidMarkdownTable,
  countBullets,
  extractBulletLines,
} from '../services/core/formatConstraintParser.service';

describe('parseFormatConstraints', () => {
  describe('bullet count extraction', () => {
    it('should extract count from "list 5 key points"', () => {
      const result = parseFormatConstraints('List 5 key points about the project', 'en');
      expect(result.bulletCount).toBe(5);
      expect(result.wantsBullets).toBe(true);
    });

    it('should extract count from "top 10 items"', () => {
      const result = parseFormatConstraints('What are the top 10 items?', 'en');
      expect(result.bulletCount).toBe(10);
    });

    it('should extract count from "give me 3 reasons"', () => {
      const result = parseFormatConstraints('Give me 3 reasons to use this', 'en');
      expect(result.bulletCount).toBe(3);
    });

    it('should extract count from "exactly 4 bullets"', () => {
      const result = parseFormatConstraints('Summarize in exactly 4 bullets', 'en');
      expect(result.bulletCount).toBe(4);
    });

    it('should extract count from Portuguese "em 5 tópicos"', () => {
      const result = parseFormatConstraints('Resuma em 5 tópicos', 'pt');
      expect(result.bulletCount).toBe(5);
      expect(result.wantsBullets).toBe(true);
    });

    it('should extract count from Portuguese "liste 3 pontos"', () => {
      const result = parseFormatConstraints('Liste 3 pontos principais', 'pt');
      expect(result.bulletCount).toBe(3);
    });

    it('should extract count from Spanish "en 5 puntos"', () => {
      const result = parseFormatConstraints('Explica en 5 puntos', 'es');
      expect(result.bulletCount).toBe(5);
    });

    it('should not extract count when no number present', () => {
      const result = parseFormatConstraints('List the main points', 'en');
      expect(result.bulletCount).toBeUndefined();
      expect(result.wantsBullets).toBe(true);
    });

    it('should reject unreasonable counts (> 50)', () => {
      const result = parseFormatConstraints('List 100 points', 'en');
      expect(result.bulletCount).toBeUndefined();
    });
  });

  describe('table detection', () => {
    it('should detect "create a table"', () => {
      const result = parseFormatConstraints('Create a table comparing A and B', 'en');
      expect(result.wantsTable).toBe(true);
    });

    it('should detect "comparison table"', () => {
      const result = parseFormatConstraints('Show a comparison table', 'en');
      expect(result.wantsTable).toBe(true);
    });

    it('should detect "side-by-side"', () => {
      const result = parseFormatConstraints('Show them side-by-side', 'en');
      expect(result.wantsTable).toBe(true);
      expect(result.compareTable).toBe(true);
    });

    it('should detect Portuguese "em tabela"', () => {
      const result = parseFormatConstraints('Mostre em tabela', 'pt');
      expect(result.wantsTable).toBe(true);
    });

    it('should detect Portuguese "tabela de comparação"', () => {
      const result = parseFormatConstraints('Faça uma tabela de comparação', 'pt');
      expect(result.wantsTable).toBe(true);
    });

    it('should detect Spanish "crear una tabla"', () => {
      const result = parseFormatConstraints('Crea una tabla con los datos', 'es');
      expect(result.wantsTable).toBe(true);
    });

    it('should not detect table when not requested', () => {
      const result = parseFormatConstraints('What are the main points?', 'en');
      expect(result.wantsTable).toBe(false);
    });
  });

  describe('line count extraction', () => {
    it('should extract "in 6 lines"', () => {
      const result = parseFormatConstraints('Summarize in 6 lines', 'en');
      expect(result.lineCount).toBe(6);
    });

    it('should extract Portuguese "em 3 linhas"', () => {
      const result = parseFormatConstraints('Resuma em 3 linhas', 'pt');
      expect(result.lineCount).toBe(3);
    });
  });

  describe('list detection without count', () => {
    it('should detect "as a list"', () => {
      const result = parseFormatConstraints('Give it to me as a list', 'en');
      expect(result.wantsBullets).toBe(true);
    });

    it('should detect "bullet points"', () => {
      const result = parseFormatConstraints('Use bullet points', 'en');
      expect(result.wantsBullets).toBe(true);
    });

    it('should detect Portuguese "em tópicos"', () => {
      const result = parseFormatConstraints('Coloque em tópicos', 'pt');
      expect(result.wantsBullets).toBe(true);
    });
  });

  describe('numbered list detection', () => {
    it('should detect "numbered list"', () => {
      const result = parseFormatConstraints('Give me a numbered list', 'en');
      expect(result.wantsNumbered).toBe(true);
      expect(result.wantsBullets).toBe(true);
    });

    it('should detect Portuguese "lista numerada"', () => {
      const result = parseFormatConstraints('Faça uma lista numerada', 'pt');
      expect(result.wantsNumbered).toBe(true);
    });
  });

  describe('heading detection', () => {
    it('should detect "with headings"', () => {
      const result = parseFormatConstraints('Organize with section headings', 'en');
      expect(result.headings).toBe(true);
    });

    it('should detect Portuguese "com títulos"', () => {
      const result = parseFormatConstraints('Organize com títulos', 'pt');
      expect(result.headings).toBe(true);
    });
  });
});

describe('enforceBulletCount', () => {
  it('should truncate when too many bullets', () => {
    const text = `- Point 1
- Point 2
- Point 3
- Point 4
- Point 5`;

    const result = enforceBulletCount(text, 3, 'en');
    expect(result.modified).toBe(true);
    expect(result.originalCount).toBe(5);
    expect(countBullets(result.text)).toBe(3);
  });

  it('should preserve preamble when truncating', () => {
    const text = `Here are the main points:

- Point 1
- Point 2
- Point 3
- Point 4
- Point 5`;

    const result = enforceBulletCount(text, 2, 'en');
    expect(result.text).toContain('Here are the main points:');
    expect(countBullets(result.text)).toBe(2);
  });

  it('should preserve postamble (citations) when truncating', () => {
    const text = `- Point 1
- Point 2
- Point 3
- Point 4

Source: document.pdf`;

    const result = enforceBulletCount(text, 2, 'en');
    expect(result.text).toContain('Source: document.pdf');
    expect(countBullets(result.text)).toBe(2);
  });

  it('should add note when fewer bullets than requested', () => {
    const text = `- Point 1
- Point 2`;

    const result = enforceBulletCount(text, 5, 'en');
    expect(result.modified).toBe(true);
    expect(result.text).toContain('Only 2 items were found');
    expect(result.text).toContain('5 were requested');
  });

  it('should not modify when count matches', () => {
    const text = `- Point 1
- Point 2
- Point 3`;

    const result = enforceBulletCount(text, 3, 'en');
    expect(result.modified).toBe(false);
    expect(result.text).toBe(text);
  });

  it('should handle Portuguese note', () => {
    const text = `- Ponto 1`;
    const result = enforceBulletCount(text, 3, 'pt');
    expect(result.text).toContain('Apenas 1 itens foram encontrados');
  });
});

describe('isValidMarkdownTable', () => {
  it('should validate a proper markdown table', () => {
    const table = `| Header1 | Header2 |
|---------|---------|
| Cell1   | Cell2   |`;

    expect(isValidMarkdownTable(table)).toBe(true);
  });

  it('should reject text without table structure', () => {
    const text = `This is just some text.
It has no table structure.`;

    expect(isValidMarkdownTable(text)).toBe(false);
  });

  it('should reject partial table (no separator)', () => {
    const text = `| Header1 | Header2 |
| Cell1   | Cell2   |`;

    expect(isValidMarkdownTable(text)).toBe(false);
  });

  it('should validate table with multiple rows', () => {
    const table = `| Name | Age | City |
|------|-----|------|
| John | 30  | NYC  |
| Jane | 25  | LA   |
| Bob  | 35  | SF   |`;

    expect(isValidMarkdownTable(table)).toBe(true);
  });
});

describe('enforceTableFormat', () => {
  it('should not modify valid table', () => {
    const table = `| Header1 | Header2 |
|---------|---------|
| Cell1   | Cell2   |`;

    const result = enforceTableFormat(table, 'en');
    expect(result.modified).toBe(false);
    expect(result.hasTable).toBe(true);
  });

  it('should convert key-value pairs to table', () => {
    const text = `- Revenue: $100k
- Profit: $50k
- Costs: $50k`;

    const result = enforceTableFormat(text, 'en');
    expect(result.modified).toBe(true);
    expect(result.hasTable).toBe(true);
    expect(result.text).toContain('|');
    expect(result.text).toContain('Revenue');
    expect(result.text).toContain('$100k');
  });

  it('should add note when conversion fails', () => {
    const text = `This is just some prose that cannot be converted to a table.`;

    const result = enforceTableFormat(text, 'en');
    expect(result.modified).toBe(true);
    expect(result.hasTable).toBe(false);
    expect(result.text).toContain('could not be formatted as a table');
  });

  it('should use Portuguese note when language is pt', () => {
    const text = `Texto que não pode ser convertido.`;

    const result = enforceTableFormat(text, 'pt');
    expect(result.text).toContain('não puderam ser formatadas como tabela');
  });
});

describe('extractBulletLines', () => {
  it('should extract lines with - bullets', () => {
    const text = `Some intro
- Bullet 1
- Bullet 2
Some outro`;

    const bullets = extractBulletLines(text);
    expect(bullets).toHaveLength(2);
    expect(bullets[0]).toContain('Bullet 1');
    expect(bullets[1]).toContain('Bullet 2');
  });

  it('should extract lines with * bullets', () => {
    const text = `* Item 1
* Item 2`;

    const bullets = extractBulletLines(text);
    expect(bullets).toHaveLength(2);
  });

  it('should extract numbered lists', () => {
    const text = `1. First
2. Second
3. Third`;

    const bullets = extractBulletLines(text);
    expect(bullets).toHaveLength(3);
  });

  it('should handle indented bullets', () => {
    const text = `  - Indented bullet
    - More indented`;

    const bullets = extractBulletLines(text);
    expect(bullets).toHaveLength(2);
  });
});

describe('countBullets', () => {
  it('should count mixed bullet types', () => {
    const text = `- Dash bullet
* Star bullet
1. Numbered`;

    expect(countBullets(text)).toBe(3);
  });

  it('should return 0 for no bullets', () => {
    const text = `This is just prose.
No bullets here.`;

    expect(countBullets(text)).toBe(0);
  });
});
