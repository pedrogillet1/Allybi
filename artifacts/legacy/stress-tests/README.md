# Koda File Actions - Stress Test Suite

Comprehensive stress test for all Koda file actions with support for normal scenarios, edge cases, error handling, load testing, and multilanguage queries.

## Prerequisites

1. **Backend must be running** on `http://localhost:5000`
2. **Valid user credentials** are required for authentication

## Quick Start

```bash
# Navigate to stress-tests directory
cd backend/stress-tests

# Install dependencies (first time only)
npm install

# OPTION 1: Setup test user (recommended for first run)
npm run setup

# OPTION 2: Use existing credentials
export TEST_EMAIL="your-email@example.com"
export TEST_PASSWORD="your-password"

# Run full test suite
npm test
```

## From Backend Root

```bash
cd backend

# Setup test user first
npm run stress-test:setup

# Then run stress tests with credentials
TEST_EMAIL="stress-test@koda.local" TEST_PASSWORD="StressTest123!" npm run stress-test
```

## Test Modes

### Full Test Suite
Runs all 100+ tests across all categories:
```bash
npm test
```

### Quick Mode
Runs a subset of tests for faster feedback:
```bash
npm run test:quick
```

### Load Test Only
Tests concurrent request handling:
```bash
npm run test:load
```

### Specific Category
Test a specific category:
```bash
npx ts-node file-actions-stress-test.ts --category=file-management
npx ts-node file-actions-stress-test.ts --category=file-display
npx ts-node file-actions-stress-test.ts --category=list
npx ts-node file-actions-stress-test.ts --category=upload
npx ts-node file-actions-stress-test.ts --category=search
```

## Configuration

Set environment variables before running:

```bash
# API endpoint (default: http://localhost:5000)
export API_URL="http://localhost:5000"

# Authentication (one of these methods):
# Option 1: JWT token
export AUTH_TOKEN="your-jwt-token"

# Option 2: Test user credentials
export TEST_EMAIL="test@example.com"
export TEST_PASSWORD="testpassword123"
```

## Test Coverage

### Categories & Test Counts

| Category | Actions | Tests | Languages |
|----------|---------|-------|-----------|
| File Management | 4 | 42 | EN, PT, ES |
| File Display | 3 | 38 | EN, PT, ES |
| List Actions | 3 | 26 | EN, PT, ES |
| Upload Actions | 1 | 14 | EN, PT, ES |
| Document Search | 2 | 16 | EN, PT, ES |
| **Total** | **13** | **136** | **3** |

### Actions Tested

1. **File Management**
   - `createFolder` - Create new folders
   - `moveFile` - Move files between folders
   - `renameFile` - Rename files
   - `deleteFile` - Delete files

2. **File Display**
   - `showFile` - Open/display specific files
   - `showSingleDocument` - Semantic search (single result)
   - `showMultipleDocuments` - Semantic search (multiple results)

3. **List Actions**
   - `listFolders` - List all folders
   - `listDocuments` - List all documents
   - `listFolderContents` - List contents of specific folder

4. **Upload Actions**
   - `uploadRequest` - Request to upload files

5. **Document Search**
   - `findDocument` - Search for documents
   - `documentNotFound` - Handle no-match scenarios

## Output

### Console Output

Real-time progress with pass/fail indicators:
```
======================================================================
CATEGORY: File Management
======================================================================

  Action: createFolder (15 tests)
  ----------------------------------------
  Testing: "Create folder Reports"
    PASSED (342ms) - Action: create_folder
  Testing: "Criar pasta Vendas"
    PASSED (289ms) - Action: create_folder
```

### JSON Report

Detailed results saved to `stress-test-results-{timestamp}.json`:

```json
{
  "timestamp": "2025-01-15T10:30:45.123Z",
  "config": { ... },
  "summary": {
    "totalTests": 136,
    "passedTests": 130,
    "failedTests": 6,
    "passRate": "95.6%",
    "avgResponseTime": 456.2,
    "minResponseTime": 145,
    "maxResponseTime": 2341
  },
  "results": [ ... ]
}
```

## Success Criteria

| Grade | Pass Rate | Status |
|-------|-----------|--------|
| EXCELLENT | >= 95% | All systems working |
| GOOD | 80-94% | Minor issues |
| WARNING | 60-79% | Significant issues |
| CRITICAL | < 60% | Major failures |

## Troubleshooting

### Connection Refused
```
Error: connect ECONNREFUSED
```
**Solution**: Ensure backend is running on the configured port.

### Authentication Failed
```
Error: Unauthorized
```
**Solution**: Set `AUTH_TOKEN` or valid `TEST_EMAIL`/`TEST_PASSWORD`.

### Timeout Errors
```
Error: timeout of 60000ms exceeded
```
**Solution**: Check backend performance or increase timeout in config.

### Rate Limiting
```
Error: Too many requests
```
**Solution**: Increase `delayBetweenTests` in configuration.

## Integration with CI/CD

### GitHub Actions Example

```yaml
name: Stress Test

on:
  push:
    branches: [main]

jobs:
  stress-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: |
          cd backend
          npm install
          cd stress-tests
          npm install

      - name: Start backend
        run: |
          cd backend
          npm run dev &
          sleep 10

      - name: Run stress tests
        env:
          API_URL: http://localhost:5000
          AUTH_TOKEN: ${{ secrets.TEST_AUTH_TOKEN }}
        run: |
          cd backend/stress-tests
          npm test

      - name: Upload results
        uses: actions/upload-artifact@v3
        with:
          name: stress-test-results
          path: backend/stress-tests/stress-test-results-*.json
```
