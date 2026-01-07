/**
 * PHASE 1: Inventory Routing Tests
 * Verifies metadata queries bypass RAG and use direct DB lookups
 */

import { fileSearchService } from '../services/fileSearch.service';

describe('Phase 1: Inventory Query Parsing', () => {
  // LIST ALL FILES
  describe('list_all type', () => {
    const listAllQueries = [
      'What files do I have?',
      'Show my files',
      'List all documents',
      'What documents do I have uploaded?',
      'list my files',
      'show all my documents',
      'What have I uploaded?',
      'my files',
      'what are my files',
    ];

    test.each(listAllQueries)('"%s" should route to list_all', (query) => {
      const result = fileSearchService.parseInventoryQuery(query);
      expect(result.type).toBe('list_all');
    });

    // Should NOT match list_all
    test('"Show only PDFs" should NOT route to list_all (it\'s a filter)', () => {
      const result = fileSearchService.parseInventoryQuery('Show only PDFs');
      expect(result.type).not.toBe('list_all');
    });
  });

  // FILTER BY EXTENSION
  describe('filter_extension type', () => {
    const filterQueries = [
      { query: 'Show only PPTX and PNG', expected: ['pptx', 'png'] },
      { query: 'list PDF files', expected: ['pdf'] },
      { query: 'show just the spreadsheets', expected: ['xlsx'] },
      { query: 'only show Excel files', expected: ['xlsx'] },
    ];

    test.each(filterQueries)('"%s" should route to filter_extension', ({ query, expected }) => {
      const result = fileSearchService.parseInventoryQuery(query);
      expect(result.type).toBe('filter_extension');
      expect(result.extensions).toEqual(expect.arrayContaining(expected));
    });
  });

  // NEWEST/MOST RECENT
  describe('most_recent type', () => {
    const recentQueries = [
      { query: 'Where is my newest PDF?', expectedExt: ['pdf'] },
      { query: 'my latest upload', expectedExt: undefined },
      { query: 'most recent document', expectedExt: undefined },
      { query: 'newest spreadsheet', expectedExt: ['xlsx'] },
    ];

    test.each(recentQueries)('"%s" should route to most_recent', ({ query, expectedExt }) => {
      const result = fileSearchService.parseInventoryQuery(query);
      expect(result.type).toBe('most_recent');
      if (expectedExt) {
        expect(result.extensions).toEqual(expect.arrayContaining(expectedExt));
      }
    });
  });

  // LARGEST FILE
  describe('largest type', () => {
    const largestQueries = [
      "What's my largest file?",
      'biggest document',
      'largest PDF',
    ];

    test.each(largestQueries)('"%s" should route to largest', (query) => {
      const result = fileSearchService.parseInventoryQuery(query);
      expect(result.type).toBe('largest');
    });
  });

  // COUNT
  describe('count type', () => {
    const countQueries = [
      'How many files do I have?',
      'count my documents',
      'number of PDFs',
    ];

    test.each(countQueries)('"%s" should route to count', (query) => {
      const result = fileSearchService.parseInventoryQuery(query);
      expect(result.type).toBe('count');
    });

    // Should NOT match count - this is a content query
    test('"What is the total revenue in that document?" should NOT route to count', () => {
      const result = fileSearchService.parseInventoryQuery('What is the total revenue in that document?');
      expect(result.type).not.toBe('count');
    });
  });

  // GROUP BY FOLDER
  describe('group_by_folder type', () => {
    const groupQueries = [
      'group files by folder',
      'organize by folder',
      'files in each folder',
    ];

    test.each(groupQueries)('"%s" should route to group_by_folder', (query) => {
      const result = fileSearchService.parseInventoryQuery(query);
      expect(result.type).toBe('group_by_folder');
    });
  });

  // NOT INVENTORY QUERIES (should return null)
  describe('non-inventory queries return null', () => {
    const ragQueries = [
      'What does the contract say about termination?',
      'Summarize the financial report',
      'What is the total revenue?',
      'Compare the two documents',
      'Tell me about the presentation',
    ];

    test.each(ragQueries)('"%s" should NOT be an inventory query (return null)', (query) => {
      const result = fileSearchService.parseInventoryQuery(query);
      expect(result.type).toBeNull();
    });
  });
});
