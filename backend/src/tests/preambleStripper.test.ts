/**
 * Preamble Stripper Regression Tests
 *
 * Ensures ChatGPT-style answer-first responses by verifying
 * preamble detection and stripping works correctly.
 */

import { PreambleStripperService, stripPreamble } from '../services/core/preambleStripper.service';

describe('PreambleStripperService', () => {
  let stripper: PreambleStripperService;

  beforeAll(() => {
    stripper = new PreambleStripperService();
  });

  describe('allowsPreamble', () => {
    it('should allow preambles for clarify operator', () => {
      expect(stripper.allowsPreamble('clarify')).toBe(true);
    });

    it('should allow preambles for disambiguate operator', () => {
      expect(stripper.allowsPreamble('disambiguate')).toBe(true);
    });

    it('should deny preambles for list operator', () => {
      expect(stripper.allowsPreamble('list')).toBe(false);
    });

    it('should deny preambles for summarize operator', () => {
      expect(stripper.allowsPreamble('summarize')).toBe(false);
    });

    it('should deny preambles for extract operator', () => {
      expect(stripper.allowsPreamble('extract')).toBe(false);
    });

    it('should deny preambles for locate_content operator', () => {
      expect(stripper.allowsPreamble('locate_content')).toBe(false);
    });
  });

  describe('detectPreamble - English', () => {
    it('should detect "Here are" preamble', () => {
      const result = stripper.detectPreamble('Here are the 5 PDF files:', 'en');
      expect(result.found).toBe(true);
    });

    it('should detect "I found" preamble', () => {
      const result = stripper.detectPreamble('I found the document you were looking for.', 'en');
      expect(result.found).toBe(true);
    });

    it('should detect "Based on" preamble', () => {
      const result = stripper.detectPreamble('Based on my search, the value is $1M.', 'en');
      expect(result.found).toBe(true);
    });

    it('should detect "Sure," preamble', () => {
      const result = stripper.detectPreamble('Sure, I can help with that.', 'en');
      expect(result.found).toBe(true);
    });

    it('should NOT detect normal content', () => {
      const result = stripper.detectPreamble('The EBITDA value is $2.5M.', 'en');
      expect(result.found).toBe(false);
    });

    it('should NOT detect mid-sentence "here"', () => {
      const result = stripper.detectPreamble('The data is stored here in the spreadsheet.', 'en');
      expect(result.found).toBe(false);
    });
  });

  describe('detectPreamble - Portuguese', () => {
    it('should detect "Aqui estão" preamble', () => {
      const result = stripper.detectPreamble('Aqui estão os 5 arquivos PDF:', 'pt');
      expect(result.found).toBe(true);
    });

    it('should detect "Encontrei" preamble', () => {
      const result = stripper.detectPreamble('Encontrei o documento que você procurava.', 'pt');
      expect(result.found).toBe(true);
    });

    it('should detect "Com base" preamble', () => {
      const result = stripper.detectPreamble('Com base na minha pesquisa, o valor é R$1M.', 'pt');
      expect(result.found).toBe(true);
    });

    it('should NOT detect normal Portuguese content', () => {
      const result = stripper.detectPreamble('O valor do EBITDA é R$2.5M.', 'pt');
      expect(result.found).toBe(false);
    });
  });

  describe('stripPreamble - English', () => {
    it('should strip "Here are the" preamble', () => {
      const input = 'Here are the 5 PDF files in your account:';
      const result = stripper.stripPreamble(input, 'en');
      // "The 5 PDF files" is valid answer-first (article preserved after stripping "Here are")
      expect(result).toBe('The 5 PDF files in your account:');
    });

    it('should strip "I found" preamble and capitalize', () => {
      const input = 'I found 3 documents matching your search.';
      const result = stripper.stripPreamble(input, 'en');
      expect(result).toBe('3 documents matching your search.');
    });

    it('should strip "Based on my search" preamble', () => {
      const input = 'Based on my search, the contract mentions termination in Section 4.';
      const result = stripper.stripPreamble(input, 'en');
      expect(result).toBe('The contract mentions termination in Section 4.');
    });

    it('should strip "Sure, " preamble', () => {
      const input = 'Sure, the total revenue is $1.2M.';
      const result = stripper.stripPreamble(input, 'en');
      expect(result).toBe('The total revenue is $1.2M.');
    });

    it('should strip multiple preambles', () => {
      const input = 'Sure, here are the results I found for your query.';
      const result = stripper.stripPreamble(input, 'en');
      expect(result.toLowerCase()).not.toContain('sure');
      expect(result.toLowerCase()).not.toContain('here are');
    });

    it('should preserve content without preamble', () => {
      const input = 'The EBITDA value for July 2024 is $2.5M.';
      const result = stripper.stripPreamble(input, 'en');
      expect(result).toBe(input);
    });
  });

  describe('stripPreamble - Portuguese', () => {
    it('should strip "Aqui estão" preamble', () => {
      const input = 'Aqui estão os 5 arquivos PDF na sua conta:';
      const result = stripper.stripPreamble(input, 'pt');
      expect(result).toBe('Os 5 arquivos PDF na sua conta:');
    });

    it('should strip "Encontrei" preamble', () => {
      const input = 'Encontrei 3 documentos correspondentes.';
      const result = stripper.stripPreamble(input, 'pt');
      expect(result).toBe('3 documentos correspondentes.');
    });

    it('should preserve Portuguese content without preamble', () => {
      const input = 'O valor do EBITDA para julho de 2024 é R$2.5M.';
      const result = stripper.stripPreamble(input, 'pt');
      expect(result).toBe(input);
    });
  });

  describe('strip with operator context', () => {
    it('should strip preamble for list operator', () => {
      const input = 'Here are your 5 PDF files:';
      const result = stripPreamble(input, 'list', 'en');
      expect(result).not.toContain('Here are');
    });

    it('should NOT strip preamble for clarify operator', () => {
      const input = 'I need more information. Are you asking about 2023 or 2024?';
      const result = stripPreamble(input, 'clarify', 'en');
      expect(result).toBe(input);
    });

    it('should NOT strip preamble for disambiguate operator', () => {
      const input = 'I found multiple files matching "contract". Which one did you mean?';
      const result = stripPreamble(input, 'disambiguate', 'en');
      expect(result).toBe(input);
    });

    it('should strip for extract operator', () => {
      const input = 'I found the EBITDA value. It is $2.5M for July 2024.';
      const result = stripPreamble(input, 'extract', 'en');
      expect(result.toLowerCase()).not.toContain('i found');
    });

    it('should strip for summarize operator', () => {
      const input = 'Here is a summary of the document. The main points are...';
      const result = stripPreamble(input, 'summarize', 'en');
      expect(result.toLowerCase()).not.toContain('here is');
    });
  });

  describe('strip with exception context', () => {
    it('should preserve preamble when hasError is true', () => {
      const input = 'I encountered an error while processing your request.';
      const result = stripPreamble(input, 'list', 'en', { hasError: true });
      expect(result).toBe(input);
    });

    it('should preserve preamble when resultCount is 0', () => {
      const input = 'I found no documents matching your search.';
      const result = stripPreamble(input, 'list', 'en', { resultCount: 0 });
      expect(result).toBe(input);
    });

    it('should preserve preamble when needsClarification is true', () => {
      const input = 'I need more details to answer your question.';
      const result = stripPreamble(input, 'extract', 'en', { needsClarification: true });
      expect(result).toBe(input);
    });
  });

  describe('edge cases', () => {
    it('should handle empty string', () => {
      expect(stripper.stripPreamble('', 'en')).toBe('');
    });

    it('should handle whitespace-only string', () => {
      expect(stripper.stripPreamble('   ', 'en')).toBe('');
    });

    it('should handle string that is ONLY preamble', () => {
      const result = stripper.stripPreamble('Here are the results.', 'en');
      // Should handle gracefully even if little content remains
      expect(result).toBeDefined();
    });

    it('should capitalize first letter after stripping', () => {
      const input = 'Here is the answer: the value is $100.';
      const result = stripper.stripPreamble(input, 'en');
      // First character should be uppercase
      expect(result.charAt(0)).toBe(result.charAt(0).toUpperCase());
    });
  });

  describe('getStats', () => {
    it('should return pattern counts', () => {
      const stats = stripper.getStats();
      expect(stats.patternsLoaded.en).toBeGreaterThan(0);
      expect(stats.patternsLoaded.pt).toBeGreaterThan(0);
      expect(stats.allowlistSize).toBeGreaterThan(0);
      expect(stats.denylistSize).toBeGreaterThan(0);
    });
  });
});
