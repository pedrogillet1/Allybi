# FAILURE MODE CATALOG

**Scan Date**: 2026-01-16
**Total Failure Modes**: 42

---

## CATEGORY A: ROUTING FAILURES (8)

### A1. Pronoun Pattern Order Bug
- **Query**: "Where is it located?"
- **Expected**: Resolve "it" to lastReferencedFile, return location
- **Actual**: Pattern at line 5827 catches "it located" BEFORE followup patterns at 5754
- **Evidence**: `orchestrator:5827` → `/\b(where|find|show)\s+(is|are)\s+/` matches first
- **Fix**: Reorder patterns or add exclusion for pronouns

### A2. Content Guard False Positive
- **Query**: "Show me the contract summary"
- **Expected**: File action to show contract
- **Actual**: Content guard at 5746 blocks because "summary" suggests content question
- **Evidence**: `orchestrator:5746` → `/summarize|explain|what.*in/`
- **Fix**: Narrow content guard or check for explicit file references

### A3. Math vs Count Routing Collision
- **Query**: "How many files and how many of each type?"
- **Expected**: Inventory count response
- **Actual**: Sometimes routes to help_product or documents
- **Evidence**: `orchestrator:5586` isCountQuery check comes AFTER math patterns
- **Fix**: Move count detection earlier in chain

### A4. Multi-Intent Splitting Bug
- **Query**: "Show PDFs and group by folder"
- **Expected**: Single unified response
- **Actual**: May split into two separate intents
- **Evidence**: `multiIntent.service.ts:149` has guard but not comprehensive
- **Fix**: Add compound inventory patterns to exclusion list

### A5. Help Product Overreach
- **Query**: "What files do I have?"
- **Expected**: File inventory
- **Actual**: Sometimes routes to help_product
- **Evidence**: `decisionTree.service.ts:102` analytics pattern catches "what"
- **Fix**: Boost file_actions when file/document keywords present

### A6. Language Detection Failure
- **Query**: "Quais documentos eu tenho?" (Portuguese)
- **Expected**: Portuguese inventory response
- **Actual**: Sometimes mixes languages
- **Evidence**: `fileSearch.service.ts:1300` has PT patterns but not complete
- **Fix**: Ensure consistent language in response generation

### A7. Extraction vs Documents Confusion
- **Query**: "Get the EBITDA from the financial report"
- **Expected**: Document extraction with specific value
- **Actual**: Sometimes returns full document summary
- **Evidence**: `decisionTree.service.ts:102` extraction patterns overlap with documents
- **Fix**: Add explicit extraction keywords to boost extraction intent

### A8. Follow-up Context Loss
- **Query**: [After "Open contract.pdf"] "What's in it?"
- **Expected**: Content question about contract.pdf
- **Actual**: "I couldn't find a file named 'it'"
- **Evidence**: `orchestrator:2025-2028` checks lastReferencedFile but not passed to RAG
- **Fix**: Pass scoped document ID to retrieval engine

---

## CATEGORY B: SEARCH FAILURES (7)

### B1. Status Filter Bug
- **Query**: "Where is Rosewood Fund v3.xlsx?"
- **Expected**: Find the file
- **Actual**: "I couldn't find a file"
- **Evidence**: `fileSearch.service.ts:141` uses `status: 'completed'` not USABLE_STATUSES
- **Fix**: Change to `status: { in: USABLE_STATUSES }`

### B2. Fuzzy Match Threshold
- **Query**: "Open rosewood fund" (no extension)
- **Expected**: Match "Rosewood Fund v3.xlsx"
- **Actual**: No match (requires close exact match)
- **Evidence**: `fileSearch.service.ts:127-171` fuzzy score threshold too high
- **Fix**: Lower threshold or add token-based matching

### B3. Extension Mapping Incomplete
- **Query**: "Show only spreadsheets"
- **Expected**: xlsx AND xls files
- **Actual**: Only xlsx files
- **Evidence**: `fileSearch.service.ts:1008` → `'spreadsheet': 'xlsx'` (no xls)
- **Fix**: Map to `['xlsx', 'xls', 'csv']`

### B4. Case Sensitivity
- **Query**: "Find CONTRACT.PDF"
- **Expected**: Match "contract.pdf"
- **Actual**: May not match
- **Evidence**: `fileSearch.service.ts:151` scoring doesn't normalize case consistently
- **Fix**: Normalize both query and filenames to lowercase

### B5. Special Characters in Filename
- **Query**: "Open Lone Mountain P&L 2024.xlsx"
- **Expected**: Find the file
- **Actual**: "&" may cause regex issues
- **Evidence**: No explicit escaping in search patterns
- **Fix**: Escape special regex characters in search term

### B6. Partial Filename Match
- **Query**: "Open the P&L file"
- **Expected**: Match "Lone Mountain Ranch P&L 2024.xlsx"
- **Actual**: No match
- **Evidence**: `extractFilenameFromQuery` requires more complete match
- **Fix**: Add token-based partial matching

### B7. Image Extension Mapping
- **Query**: "Show only images"
- **Expected**: jpg, jpeg, png, gif, webp, svg
- **Actual**: May miss some formats
- **Evidence**: `fileSearch.service.ts:1008` extension map may be incomplete
- **Fix**: Verify all image extensions are mapped

---

## CATEGORY C: MEMORY FAILURES (5)

### C1. In-Memory Cache Loss
- **Trigger**: Server restart
- **Expected**: Context preserved
- **Actual**: All conversation context lost
- **Evidence**: `orchestrator:275` → `new Map<string, ConversationFileContext>()`
- **Fix**: Persist to Redis or database

### C2. Cache Expiry Undefined
- **Trigger**: Long conversation
- **Expected**: Context maintained
- **Actual**: No TTL, memory grows unbounded
- **Evidence**: No expiry logic in `conversationFileContextCache`
- **Fix**: Add TTL-based eviction

### C3. lastDocumentIds Not Used in RAG
- **Trigger**: Follow-up question about same document
- **Expected**: Boost previous documents
- **Actual**: Boost not consistently applied
- **Evidence**: `orchestrator:2042` passes `lastDocumentIds` but retrieval may ignore
- **Fix**: Ensure retrieval engine applies boost

### C4. Cross-Conversation Leakage
- **Trigger**: User has multiple conversations
- **Expected**: Context isolated per conversation
- **Actual**: Uses `${userId}-${conversationId}` key (should be safe but verify)
- **Evidence**: `orchestrator:275` cache key pattern
- **Fix**: Add explicit isolation checks

### C5. Previous File Not Tracked
- **Trigger**: "Compare it to the previous file"
- **Expected**: Knows previous and current file
- **Actual**: Only tracks lastReferencedFile
- **Evidence**: `orchestrator:285-288` stores previousReferencedFile but not used
- **Fix**: Implement comparison with previous file

---

## CATEGORY D: FORMATTING FAILURES (6)

### D1. No DOC Markers in RAG Answers
- **Query**: "Summarize the contract"
- **Expected**: Clickable document source
- **Actual**: Plain text with no clickable button
- **Evidence**: `answerEngine:877` generates plain text, no marker injection
- **Fix**: Inject DOC markers in post-processing

### D2. Metadata Leaks in Output
- **Query**: "List my files"
- **Expected**: Clean list of filenames
- **Actual**: Shows "(419.9 KB | trabalhos/stress test/pdf)"
- **Evidence**: `fileSearch.service.ts:1326` → `formatResultsAsMarkdown` includes metadata
- **Fix**: Remove size/folder from user-facing output

### D3. Single Source Gets Numbered List
- **Query**: [Single document answer]
- **Expected**: No numbered list for single source
- **Actual**: "1. Answer from document..."
- **Evidence**: `formattingPipeline` applies list format unconditionally
- **Fix**: Skip numbering for single-source answers

### D4. Missing "See All" Button
- **Query**: "List my files" (50+ files)
- **Expected**: "Show 10 of 50 — See all"
- **Actual**: Truncates to 8 with no "See all" option
- **Evidence**: `orchestrator:3278-3288` truncates but no LOAD_MORE marker
- **Fix**: Add `createLoadMoreMarker()` after truncation

### D5. Folder Grouping Format
- **Query**: "Group my files by folder"
- **Expected**: Clear folder headers with file lists
- **Actual**: Jumbled format without clear separation
- **Evidence**: `orchestrator:4087-4130` group_by_folder case
- **Fix**: Add blank lines and proper headers

### D6. Table Rendering Issues
- **Query**: "Show files as table"
- **Expected**: Proper markdown table
- **Actual**: Table may not render in all contexts
- **Evidence**: ChatInterface uses ReactMarkdown with remarkGfm
- **Fix**: Verify table syntax is GFM-compliant

---

## CATEGORY E: CITATION FAILURES (4)

### E1. No Citations in Non-File Actions
- **Query**: "What does the contract say about liability?"
- **Expected**: Answer with clickable source citation
- **Actual**: Answer with no source link
- **Evidence**: `answerEngine` doesn't inject CITE markers
- **Fix**: Add citation injection in answer generation

### E2. Citation Page Number Missing
- **Query**: [Multi-page PDF answer]
- **Expected**: "Source: contract.pdf (page 3)"
- **Actual**: Just filename, no page
- **Evidence**: `createCiteMarker` supports page but not used
- **Fix**: Track and inject page numbers from chunks

### E3. Multiple Sources Not Grouped
- **Query**: [Answer from 3 documents]
- **Expected**: Sources grouped at end
- **Actual**: No source section
- **Evidence**: Done event has sources but frontend may not display
- **Fix**: Render DocumentSources component

### E4. Streaming Citation Timing
- **Query**: [Long streaming answer]
- **Expected**: Citations appear at end
- **Actual**: May appear mid-stream incorrectly
- **Evidence**: SSE citation events at `rag.controller:405`
- **Fix**: Buffer citations until done event

---

## CATEGORY F: PERFORMANCE FAILURES (5)

### F1. Full DB Scan for Inventory
- **Query**: "List my files"
- **Expected**: Fast response
- **Actual**: 10+ seconds for users with many files
- **Evidence**: `getUserDocuments()` fetches all with no pagination
- **Fix**: Add pagination and lazy loading

### F2. Triple LLM Calls
- **Query**: Standard question
- **Expected**: Single LLM call
- **Actual**: Intent → Answer → Format = 3 calls
- **Evidence**: Call chain through orchestrator
- **Fix**: Combine calls where possible

### F3. Fuzzy Search O(n)
- **Query**: "Find contract"
- **Expected**: Fast search
- **Actual**: Linear scan of all documents
- **Evidence**: `fileSearch.service.ts:127-171` loops all docs
- **Fix**: Use indexed search or pre-computed trigrams

### F4. Slow TTFT on Filters
- **Query**: "Show only spreadsheets"
- **Expected**: TTFT < 2s
- **Actual**: TTFT > 10s (from E2E tests)
- **Evidence**: E2E report shows Q004/Q005 at 10+ seconds TTFT
- **Fix**: Profile and optimize filter path

### F5. Streaming Buffer Overhead
- **Query**: Long answers
- **Expected**: Smooth streaming
- **Actual**: May stutter with holdback
- **Evidence**: `StreamingMarkdownEnhanced:32` holds 50 chars
- **Fix**: Tune holdback or use smarter boundary detection

---

## CATEGORY G: UI/UX FAILURES (4)

### G1. No File Preview on "Open"
- **Query**: "Open contract.pdf"
- **Expected**: File preview modal opens automatically
- **Actual**: Just shows button, requires click
- **Evidence**: Frontend doesn't auto-open on OPEN_FILE action
- **Fix**: Add auto-open for single file OPEN_FILE

### G2. Compare Doesn't Show Both Files
- **Query**: "Compare it to budget.xlsx"
- **Expected**: Side-by-side or both files shown
- **Actual**: May only reference one file
- **Evidence**: `orchestrator:2894, 6078` compare patterns exist but incomplete
- **Fix**: Ensure both files displayed with buttons

### G3. Folder Path Not Shown
- **Query**: "Where is contract.pdf?"
- **Expected**: "Located in: Legal/Contracts"
- **Actual**: No folder path in response
- **Evidence**: E2E Q010, Q012 fail "has_folder_path"
- **Fix**: Include folder path in file action response

### G4. Move Action No Confirmation
- **Query**: "Move file to Archive folder"
- **Expected**: "Moved file.pdf to Archive"
- **Actual**: No clear confirmation
- **Evidence**: E2E Q016 fails "confirms_action_or_explains"
- **Fix**: Add explicit confirmation message

---

## CATEGORY H: ERROR HANDLING (3)

### H1. No Graceful Degradation
- **Trigger**: Vector DB timeout
- **Expected**: Fallback to BM25 search
- **Actual**: May return error
- **Evidence**: `retrievalEngine` has hybrid but error paths unclear
- **Fix**: Add explicit fallback chain

### H2. Rate Limit Handling
- **Trigger**: Claude API rate limit
- **Expected**: Queue and retry
- **Actual**: May fail request
- **Evidence**: No explicit rate limit handling in answer engine
- **Fix**: Add retry with exponential backoff

### H3. Malformed Marker Recovery
- **Trigger**: Streaming interruption mid-marker
- **Expected**: Recover gracefully
- **Actual**: `StreamingMarkerBuffer` handles but edge cases exist
- **Evidence**: `markerUtils.ts:374-463` buffer implementation
- **Fix**: Add more comprehensive marker recovery

---

## SUMMARY BY SEVERITY

| Severity | Count | IDs |
|----------|-------|-----|
| P0 (Critical) | 12 | A1, A3, B1, B2, B3, C1, D1, D2, D4, F1, F4, G3 |
| P1 (High) | 15 | A2, A4, A8, B4, B5, B6, C2, C3, D3, D5, E1, E2, G1, G2, G4 |
| P2 (Medium) | 10 | A5, A6, A7, B7, C4, C5, D6, E3, E4, F2 |
| P3 (Low) | 5 | F3, F5, H1, H2, H3 |

