# EXPANDED TODO LIST

**Generated**: 2026-01-16
**Source**: Super Scan + E2E Test Failures + 50-Query Evaluation

---

## P0 - CRITICAL (Must Fix for Launch)

### P0-1: Pronoun Resolution Order [NEW DETAILS]
- **File**: `kodaOrchestratorV3.service.ts`
- **Lines**: 5688-5880
- **Issue**: Pattern at line 5827 (`/\b(where|find|show)\s+(is|are)\s+/`) matches "it located" BEFORE the followup pattern at line 5754 (`/\b(open|show|preview)\s+it\b/`) is checked
- **E2E Failures**: Q012 "Where is it located?", Q013 "Show it again"
- **Fix**:
  1. Add pronoun exclusion to location pattern: `/\b(where|find|show)\s+(is|are)\s+(?!it\b)/`
  2. OR move followup patterns to higher priority (before location patterns)

### P0-2: Status Filter Bug in File Search [NEW DETAILS]
- **File**: `fileSearch.service.ts`
- **Lines**: 141
- **Issue**: Uses `status: 'completed'` instead of `USABLE_STATUSES`
- **Evidence**: `USABLE_STATUSES = ['available', 'enriching', 'ready', 'completed']` defined at `document.service.ts:24` and `orchestrator:73`
- **E2E Failures**: Q010 "Where is 'Rosewood Fund v3.xlsx' located?"
- **Fix**:
  ```typescript
  // Line 141
  where: {
    userId,
    status: { in: USABLE_STATUSES }, // was: 'completed'
  }
  ```

### P0-3: Fuzzy Match Threshold [EXPANDED]
- **File**: `fileSearch.service.ts`
- **Lines**: 127-171
- **Issue**: Fuzzy matching requires close exact match. "rosewood fund" doesn't match "Rosewood Fund v3.xlsx"
- **Evidence**: `fuzzyMatchFiles()` scores based on word overlap but threshold not tuned
- **Fix**:
  1. Lower match threshold from ~0.6 to ~0.3
  2. Add token normalization (strip extensions, special chars)
  3. Add trigram matching for partial matches

### P0-4: No DOC Markers in RAG Answers [CONFIRMED]
- **File**: `kodaAnswerEngineV3.service.ts`
- **Lines**: 877 (generation), needs post-processing
- **Issue**: File action responses get DOC markers (orchestrator:3248-3276) but documents/RAG answers don't
- **Evidence**: E2E Q010, Q012 fail "has_file_button" for location queries
- **Fix**:
  1. Add `injectDocMarkers()` in answer post-processing
  2. OR inject in formattingPipeline after generation
  3. Use source document IDs from retrieval to create markers

### P0-5: Extension Mapping Incomplete [CONFIRMED]
- **File**: `fileSearch.service.ts`
- **Lines**: 1008
- **Issue**: `'spreadsheet': 'xlsx'` only maps to xlsx, not xls or csv
- **E2E Failures**: Q004 "Show only spreadsheets" - "Contains non-Excel files"
- **Fix**:
  ```typescript
  const extensionMap: Record<string, string[]> = {
    'spreadsheet': ['xlsx', 'xls', 'csv'],
    'spreadsheets': ['xlsx', 'xls', 'csv'],
    'excel': ['xlsx', 'xls'],
    'image': ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'],
    'images': ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'],
    // ...
  };
  ```

### P0-6: Missing "See All" Button [CONFIRMED]
- **File**: `kodaOrchestratorV3.service.ts`
- **Lines**: 3278-3288
- **Issue**: Truncates to 8 markers but doesn't add LOAD_MORE marker
- **Evidence**: `markerUtils.ts` has `createLoadMoreMarker()` but not used
- **Fix**:
  ```typescript
  // After truncation at line 3288
  if (allMarkers.length > 8) {
    const loadMoreMarker = createLoadMoreMarker({
      total: allMarkers.length,
      shown: 8,
      remaining: allMarkers.length - 8
    });
    answer += `\n\n${loadMoreMarker}`;
  }
  ```

### P0-7: Metadata Leaks in Output [CONFIRMED]
- **File**: `fileSearch.service.ts`
- **Lines**: 1326-1400 (`formatResultsAsMarkdown`)
- **Issue**: Output includes "(419.9 KB | trabalhos/stress test/pdf)"
- **E2E Evidence**: Multiple failures show metadata in responses
- **Fix**:
  1. Add `hideMetadata: boolean` option to formatResultsAsMarkdown
  2. Default to true for user-facing output
  3. Only show metadata for debug/admin views

### P0-8: Folder Path Not Shown [NEW]
- **File**: `kodaOrchestratorV3.service.ts`
- **Lines**: Need to add after file search result
- **Issue**: "Where is X?" doesn't include folder path in response
- **E2E Failures**: Q010, Q012 fail "has_folder_path"
- **Fix**:
  1. After finding file, fetch folder path via `buildFolderPath()`
  2. Include in response: "Located in: {folderPath}"
  3. Format: `**📁 Location**: {folderPath}`

### P0-9: Slow TTFT on Filters [NEW]
- **File**: Multiple
- **Issue**: Q004, Q005 have TTFT > 10s (limit 8s)
- **E2E Failures**: "ttft_acceptable: TTFT too slow: 10332ms > 8000ms"
- **Fix**:
  1. Profile filter path
  2. Add document cache
  3. Remove unnecessary LLM calls for simple filters

### P0-10: Follow-up Context Not Passed to RAG [NEW]
- **File**: `kodaOrchestratorV3.service.ts`
- **Lines**: 2025-2042
- **Issue**: lastReferencedFile exists but scoped document ID not consistently passed to retrieval
- **Evidence**: Q012 "Where is it located?" fails to resolve "it"
- **Fix**:
  1. Check lastReferencedFile BEFORE detectFileActionQuery
  2. If pronoun detected AND lastReferencedFile exists, use scoped search
  3. Return location of lastReferencedFile

### P0-11: Compare Doesn't Work [NEW]
- **File**: `kodaOrchestratorV3.service.ts`
- **Lines**: 2894, 6078
- **Issue**: "Compare it to X" doesn't resolve lastReferencedFile first
- **E2E Failures**: Q015 "Compare it to 'Lone Mountain Ranch P&L 2025'" fails
- **Fix**:
  1. Detect compare pattern: `/compare\s+(it|this|that)\s+to\s+/`
  2. Resolve pronoun to lastReferencedFile
  3. Search for second file
  4. Generate comparison with both file buttons

### P0-12: Move Action No Confirmation [NEW]
- **File**: `kodaOrchestratorV3.service.ts`
- **Lines**: 4281-4320
- **Issue**: Move/create folder actions don't confirm completion
- **E2E Failures**: Q016 fails "confirms_action_or_explains"
- **Fix**:
  1. After successful move, return: "✓ Moved {filename} to {folderPath}"
  2. After create folder: "✓ Created folder '{name}'"

---

## P1 - HIGH PRIORITY

### P1-1: Virtual Folders [UPDATED - ALREADY EXISTS]
- **File**: `kodaOrchestratorV3.service.ts`
- **Lines**: 4281-4292 (createFolder patterns exist)
- **Status**: CREATE folder exists, but may not be triggered correctly
- **Fix**: Verify pattern matching for "create folder" queries

### P1-2: In-Memory Context Loss
- **File**: `kodaOrchestratorV3.service.ts`
- **Lines**: 275-295
- **Issue**: `conversationFileContextCache` is in-memory Map, lost on restart
- **Fix**:
  1. Add Redis persistence OR
  2. Store in database with conversation record

### P1-3: Count Query Routing
- **File**: `kodaOrchestratorV3.service.ts`
- **Lines**: 5584-5610
- **Issue**: "How many files and how many of each type?" may misroute
- **Evidence**: E2E Q009 fails "has_counts"
- **Fix**: Add explicit pattern for type breakdown queries

### P1-4: Folder Grouping Format
- **File**: `kodaOrchestratorV3.service.ts`
- **Lines**: 4087-4130 (group_by_folder case)
- **Issue**: Jumbled output without clear headers
- **E2E Failures**: Q008 fails "has_folder_sections"
- **Fix**:
  ```typescript
  // Add proper formatting
  lines.push(`\n### 📁 ${folderPath}\n`);
  for (const file of files) {
    lines.push(`- ${createDocMarker({id: file.id, name: file.filename, ctx: 'list'})}`);
  }
  lines.push(''); // Blank line between folders
  ```

### P1-5: Image Filter Incomplete
- **File**: `fileSearch.service.ts`
- **Lines**: 1008 extension map
- **Issue**: "Show only images" may miss some formats
- **E2E Failures**: Q005 shows PDF files instead of images
- **Fix**: Verify all image extensions mapped correctly

### P1-6: Single Source Numbered List
- **File**: `kodaFormattingPipelineV3.service.ts`
- **Issue**: Adds numbered list even for single source
- **Fix**: Check source count before applying list format

---

## P2 - MEDIUM PRIORITY

### P2-1: EBITDA Retrieval
- **File**: `kodaRetrievalEngineV3.service.ts`
- **Issue**: Finance queries may not boost relevant docs
- **Evidence**: 50-query test q16, q36 fail (EBITDA chain)
- **Fix**: Check lastDocumentIds boost is applied consistently

### P2-2: Answer Token Limit
- **File**: `kodaAnswerEngineV3.service.ts`
- **Lines**: 877
- **Issue**: maxTokens: 2000 may be too low for complex answers
- **Fix**: Increase to 3000 or make dynamic based on query type

### P2-3: TTFT Performance
- **Issue**: Multiple slow paths identified
- **Hot paths**:
  1. Full DB scan in getUserDocuments
  2. Triple LLM calls (intent → answer → format)
  3. O(n) fuzzy search
- **Fix**: Profile and optimize each path

### P2-4: Language Consistency
- **Issue**: May mix languages in response
- **Fix**: Detect query language and enforce in prompts

### P2-5: Citation Page Numbers
- **File**: `markerUtils.ts`
- **Issue**: CITE markers support page but not populated
- **Fix**: Track page numbers from chunk metadata

---

## P3 - LOW PRIORITY

### P3-1: Streaming Buffer Tune
- **File**: `StreamingMarkdownEnhanced.jsx`
- **Lines**: 32
- **Issue**: 50 char holdback may cause stutter
- **Fix**: Tune based on marker length patterns

### P3-2: Rate Limit Handling
- **File**: `kodaAnswerEngineV3.service.ts`
- **Issue**: No explicit rate limit retry
- **Fix**: Add exponential backoff

### P3-3: Malformed Marker Recovery
- **File**: `markerUtils.ts`
- **Issue**: Edge cases in streaming may break markers
- **Fix**: Add more recovery logic

---

## SUMMARY

| Priority | Count | Status |
|----------|-------|--------|
| P0 | 12 | All pending |
| P1 | 6 | All pending |
| P2 | 5 | All pending |
| P3 | 3 | All pending |
| **TOTAL** | **26** | **Pending** |

### Critical Path for E2E Pass

Must fix in order:
1. **P0-2**: Status filter bug (fixes file not found)
2. **P0-1**: Pronoun resolution (fixes "it" resolution)
3. **P0-5**: Extension mapping (fixes filter queries)
4. **P0-8**: Folder path shown (fixes location queries)
5. **P0-7**: Metadata leaks (fixes output cleanliness)
6. **P0-9**: TTFT performance (fixes slow queries)

