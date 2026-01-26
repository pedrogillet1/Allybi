# GUARD TEST PLAN

**Purpose**: Regression tests to ensure fixes don't break and failures don't recur
**Generated**: 2026-01-16

---

## 1. FILE ACTION ROUTING TESTS

### 1.1 Pronoun Resolution Suite

```typescript
// Add to: backend/src/tests/file-actions.routing.test.ts

describe('Pronoun Resolution', () => {
  beforeEach(async () => {
    // Setup: "Open contract.pdf" to set lastReferencedFile
    await query('Open contract.pdf');
  });

  it('resolves "it" to lastReferencedFile', async () => {
    const result = await query('Where is it located?');
    expect(result.intent).toBe('file_actions');
    expect(result.answer).toContain('contract.pdf');
    expect(result.answer).toMatch(/located|folder|path/i);
  });

  it('resolves "show it" to lastReferencedFile', async () => {
    const result = await query('Show it again');
    expect(result.answer).toMatch(/\{\{DOC::/);
    expect(result.answer).toContain('contract.pdf');
  });

  it('resolves "open it" to lastReferencedFile', async () => {
    const result = await query('Open it');
    expect(result.answer).toMatch(/\{\{DOC::/);
  });

  it('does NOT resolve pronouns without context', async () => {
    // Fresh conversation, no lastReferencedFile
    const result = await queryFresh('Where is it?');
    expect(result.answer).toMatch(/which file|please specify/i);
  });
});
```

### 1.2 Location Query Suite

```typescript
describe('Location Queries', () => {
  it('returns folder path for "where is X"', async () => {
    const result = await query('Where is Rosewood Fund v3.xlsx?');
    expect(result.intent).toBe('file_actions');
    expect(result.answer).toMatch(/\{\{DOC::/); // Has button
    expect(result.answer).toMatch(/located|folder|path/i); // Has path
  });

  it('finds file with partial name', async () => {
    const result = await query('Where is rosewood fund?');
    expect(result.answer).toContain('Rosewood');
  });

  it('finds file case-insensitively', async () => {
    const result = await query('where is ROSEWOOD FUND');
    expect(result.answer).toMatch(/rosewood/i);
  });
});
```

---

## 2. FILE SEARCH TESTS

### 2.1 Status Filter Suite

```typescript
// Add to: backend/src/tests/fileSearch.service.test.ts

describe('Status Filtering', () => {
  it('finds documents with status "available"', async () => {
    const results = await fileSearchService.searchByName(userId, 'contract');
    const statuses = results.map(r => r.status);
    expect(statuses).not.toContain('deleted');
    expect(statuses.some(s => ['available', 'enriching', 'ready', 'completed'].includes(s))).toBe(true);
  });

  it('uses USABLE_STATUSES not just completed', async () => {
    // Create doc with status 'available'
    await createTestDoc({ status: 'available', filename: 'test-available.pdf' });
    const results = await fileSearchService.searchByName(userId, 'test-available');
    expect(results.length).toBeGreaterThan(0);
  });
});
```

### 2.2 Fuzzy Match Suite

```typescript
describe('Fuzzy Matching', () => {
  it('matches partial filename', async () => {
    const results = await fileSearchService.searchByName(userId, 'rosewood');
    expect(results.some(r => r.filename.toLowerCase().includes('rosewood'))).toBe(true);
  });

  it('matches without extension', async () => {
    const results = await fileSearchService.searchByName(userId, 'contract');
    expect(results.length).toBeGreaterThan(0);
  });

  it('handles special characters', async () => {
    const results = await fileSearchService.searchByName(userId, 'P&L 2024');
    expect(results.length).toBeGreaterThan(0);
  });
});
```

### 2.3 Extension Mapping Suite

```typescript
describe('Extension Mapping', () => {
  const cases = [
    { query: 'spreadsheets', expected: ['xlsx', 'xls', 'csv'] },
    { query: 'images', expected: ['jpg', 'jpeg', 'png', 'gif', 'webp'] },
    { query: 'excel', expected: ['xlsx', 'xls'] },
    { query: 'word', expected: ['doc', 'docx'] },
    { query: 'powerpoint', expected: ['ppt', 'pptx'] },
  ];

  cases.forEach(({ query, expected }) => {
    it(`maps "${query}" to ${expected.join(',')}`, () => {
      const parsed = fileSearchService.parseInventoryQuery(`show only ${query}`);
      expect(parsed.extensions).toEqual(expect.arrayContaining(expected));
    });
  });
});
```

---

## 3. INVENTORY QUERY TESTS

### 3.1 Filter Tests

```typescript
describe('Inventory Filters', () => {
  it('filters to only PDFs', async () => {
    const result = await query('Show only PDFs');
    expect(result.intent).toBe('file_actions');
    // All returned files should be PDFs
    const markers = result.answer.match(/\{\{DOC::[^}]+\}\}/g) || [];
    markers.forEach(m => {
      expect(m.toLowerCase()).toMatch(/\.pdf/);
    });
  });

  it('filters to only spreadsheets (xlsx AND xls)', async () => {
    const result = await query('Show only spreadsheets');
    const markers = result.answer.match(/\{\{DOC::[^}]+\}\}/g) || [];
    markers.forEach(m => {
      expect(m.toLowerCase()).toMatch(/\.(xlsx|xls|csv)/);
    });
  });

  it('filters to only images', async () => {
    const result = await query('Show only images');
    const markers = result.answer.match(/\{\{DOC::[^}]+\}\}/g) || [];
    markers.forEach(m => {
      expect(m.toLowerCase()).toMatch(/\.(jpg|jpeg|png|gif|webp|svg)/);
    });
  });
});
```

### 3.2 Count Tests

```typescript
describe('Inventory Counts', () => {
  it('returns total file count', async () => {
    const result = await query('How many files do I have?');
    expect(result.answer).toMatch(/\d+\s*(files?|documents?)/i);
  });

  it('returns breakdown by type', async () => {
    const result = await query('How many files and how many of each type?');
    expect(result.answer).toMatch(/pdf.*\d+|xlsx.*\d+/i);
  });
});
```

### 3.3 Folder Grouping Tests

```typescript
describe('Folder Grouping', () => {
  it('groups files by folder with clear headers', async () => {
    const result = await query('Group my files by folder');
    expect(result.answer).toMatch(/###|folder|📁/i); // Has folder headers
    expect(result.answer.split('\n\n').length).toBeGreaterThan(1); // Has sections
  });
});
```

---

## 4. DOC MARKER TESTS

### 4.1 Marker Generation

```typescript
describe('DOC Marker Generation', () => {
  it('includes DOC markers in file action responses', async () => {
    const result = await query('Open contract.pdf');
    expect(result.answer).toMatch(/\{\{DOC::id=[a-f0-9-]+::name="[^"]+\.pdf"::ctx=(list|text)\}\}/);
  });

  it('includes DOC markers in inventory responses', async () => {
    const result = await query('List my files');
    expect(result.answer).toMatch(/\{\{DOC::/);
  });

  it('adds LOAD_MORE when > 10 files', async () => {
    const result = await query('List all my files'); // Assuming > 10 files
    if (result.totalFiles > 10) {
      expect(result.answer).toMatch(/\{\{LOAD_MORE::/);
    }
  });
});
```

### 4.2 Marker Format

```typescript
describe('DOC Marker Format', () => {
  it('produces valid marker format', () => {
    const marker = createDocMarker({ id: 'abc123', name: 'test.pdf', ctx: 'list' });
    expect(marker).toBe('{{DOC::id=abc123::name="test.pdf"::ctx=list}}');
  });

  it('escapes special characters in filename', () => {
    const marker = createDocMarker({ id: 'abc123', name: 'file "with" quotes.pdf', ctx: 'list' });
    expect(parseDocMarker(marker)).not.toBeNull();
  });
});
```

---

## 5. PERFORMANCE TESTS

### 5.1 TTFT Limits

```typescript
describe('TTFT Performance', () => {
  const TTFT_LIMIT = 3000; // 3 seconds

  it('inventory query TTFT < 3s', async () => {
    const start = Date.now();
    const result = await queryWithFirstToken('List my files');
    const ttft = result.firstTokenTime - start;
    expect(ttft).toBeLessThan(TTFT_LIMIT);
  });

  it('filter query TTFT < 3s', async () => {
    const start = Date.now();
    const result = await queryWithFirstToken('Show only PDFs');
    const ttft = result.firstTokenTime - start;
    expect(ttft).toBeLessThan(TTFT_LIMIT);
  });

  it('location query TTFT < 3s', async () => {
    const start = Date.now();
    const result = await queryWithFirstToken('Where is contract.pdf?');
    const ttft = result.firstTokenTime - start;
    expect(ttft).toBeLessThan(TTFT_LIMIT);
  });
});
```

### 5.2 Total Time Limits

```typescript
describe('Total Time Performance', () => {
  const TOTAL_LIMIT = 10000; // 10 seconds

  it('complex query total < 10s', async () => {
    const start = Date.now();
    await query('Compare contract.pdf to agreement.pdf');
    const total = Date.now() - start;
    expect(total).toBeLessThan(TOTAL_LIMIT);
  });
});
```

---

## 6. CONTEXT MEMORY TESTS

### 6.1 Follow-up Resolution

```typescript
describe('Context Memory', () => {
  it('maintains lastReferencedFile across turns', async () => {
    await query('Open contract.pdf');
    const result = await query('What is in it?');
    expect(result.scopedDocuments).toContain('contract.pdf');
  });

  it('updates lastReferencedFile on new file reference', async () => {
    await query('Open contract.pdf');
    await query('Open agreement.pdf');
    const result = await query('What is in it?');
    expect(result.scopedDocuments).toContain('agreement.pdf');
  });
});
```

---

## 7. E2E GUARD TESTS

### 7.1 Phase A (Inventory) Guards

```typescript
describe('E2E Phase A Guards', () => {
  const cases = [
    { query: 'What files do I have uploaded?', checks: ['has_files'] },
    { query: 'List all my documents', checks: ['has_list'] },
    { query: 'Show only PDFs', checks: ['only_pdf_files'] },
    { query: 'Show only spreadsheets', checks: ['only_xlsx_files'] },
    { query: 'Show only images', checks: ['only_image_files'] },
    { query: 'Which is my newest PDF?', checks: ['has_file_button'] },
    { query: 'Which is the largest file?', checks: ['has_file_button'] },
    { query: 'Group my files by folder', checks: ['has_folder_sections'] },
    { query: 'How many files and how many of each type?', checks: ['has_counts'] },
    { query: "Where is 'Rosewood Fund v3.xlsx' located?", checks: ['has_folder_path', 'has_file_button'] },
  ];

  cases.forEach(({ query, checks }) => {
    it(`"${query.substring(0, 40)}..." passes ${checks.join(', ')}`, async () => {
      const result = await e2eQuery(query);
      checks.forEach(check => {
        expect(result.checks[check]).toBe(true);
      });
    });
  });
});
```

### 7.2 Phase B (File Actions) Guards

```typescript
describe('E2E Phase B Guards', () => {
  it('Open file shows button', async () => {
    const result = await e2eQuery("Open 'Rosewood Fund v3.xlsx'");
    expect(result.checks.has_file_button).toBe(true);
  });

  it('Location follow-up works', async () => {
    await e2eQuery("Open 'Rosewood Fund v3.xlsx'");
    const result = await e2eQuery('Where is it located?');
    expect(result.checks.has_folder_path).toBe(true);
  });

  it('Compare shows both files', async () => {
    await e2eQuery("Open 'Lone Mountain Ranch P&L 2024.xlsx'");
    const result = await e2eQuery("Compare it to 'Lone Mountain Ranch P&L 2025'");
    expect(result.checks.has_comparison_structure).toBe(true);
  });

  it('Move action confirms', async () => {
    const result = await e2eQuery("Move 'file.pdf' to Archive folder");
    expect(result.checks.confirms_action_or_explains).toBe(true);
  });
});
```

---

## 8. TEST EXECUTION

### Run All Guards

```bash
# Unit tests
npm run test:unit -- --grep "Guard"

# Integration tests
npm run test:integration -- --grep "File Action|Inventory|DOC Marker"

# E2E guards
PHASE=A npm run test:e2e -- e2e/chatgpt-grade.test.ts

# Performance tests
npm run test:perf -- --grep "TTFT|Performance"
```

### CI Integration

```yaml
# .github/workflows/guard-tests.yml
name: Guard Tests
on: [push, pull_request]

jobs:
  guards:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm ci
      - run: npm run test:guards
      - run: npm run test:e2e:guards
```

---

## 9. MONITORING

### Metrics to Track

| Metric | Threshold | Alert |
|--------|-----------|-------|
| Inventory TTFT P95 | < 3s | > 5s |
| Filter TTFT P95 | < 3s | > 5s |
| E2E Pass Rate | > 90% | < 80% |
| Fallback Rate | 0% | > 1% |
| DOC Marker Rate | > 95% | < 90% |

### Dashboards

1. **TTFT Distribution**: Histogram of first token times by query type
2. **Pass Rate Trend**: E2E pass rate over time
3. **Failure Breakdown**: Count by failure reason
4. **Intent Routing**: Sankey diagram of query → intent → outcome

