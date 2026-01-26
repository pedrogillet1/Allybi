# Extended TODO List - Organized by Section

**Generated**: 2026-01-16 17:53
**Source**: FAILURE_MODE_CATALOG.md, EXPANDED_TODO.md, ERROR_SECTION_MAP.md, PROPOSED_PATCH_PLAN.md
**Total Failure Modes**: 42

---

## SECTION 1: ROUTING & INTENT SCORING

### Failure Modes Covered: A1-A8
- A1: Pronoun Pattern Order Bug
- A2: Content Guard False Positive
- A3: Math vs Count Routing Collision
- A4: Multi-Intent Splitting Bug
- A5: Help Product Overreach
- A6: Language Detection Failure
- A7: Extraction vs Documents Confusion
- A8: Follow-up Context Loss

### Status
| Fix ID | Description | Status | Location |
|--------|-------------|--------|----------|
| P0-1 | Pronoun resolution order | COMPLETED | orchestrator:5827 |
| P0-10 | Follow-up context fallback | COMPLETED | resolveImplicitReference |
| P1-2 | Count query routing | COMPLETED | isTypeBreakdownQuery |
| SEC-1a | Pronoun check in INVENTORY INTERCEPT | JUST FIXED | orchestrator:1697-1703 |
| SEC-1b | Pronoun patterns before location | PENDING VERIFICATION | detectFileActionQuery |

### Central Fix Applied
Added pronoun check (`/\b(it|this|that|them|these|those)\b/i`) to:
1. Early fast path (line 1152) - DONE
2. INVENTORY INTERCEPT (line 1697) - JUST FIXED

---

## SECTION 2: FILE ACTION INTERCEPT ORDERING

### Failure Modes Covered: A1, A2, G3
- A1: "Where is it located?" matches location pattern before pronoun resolution
- A2: Content guard blocks legitimate file actions
- G3: Folder path not shown in response

### Status
| Fix ID | Description | Status | Location |
|--------|-------------|--------|----------|
| P0-8 | Folder path in response | COMPLETED | fileLocation messages |
| SEC-2a | tryFileActionQuery resolves lastRef | PENDING VERIFICATION | orchestrator:tryFileActionQuery |
| SEC-2b | Skip inventory for pronouns | JUST FIXED | orchestrator:1697-1703 |

### Central Fix
Queries with pronouns now skip INVENTORY INTERCEPT and fall through to FILE ACTION INTERCEPT which has proper pronoun resolution via `resolveImplicitReference()` and `getLastReferencedFile()`.

---

## SECTION 3: FILENAME RESOLUTION & FUZZY SEARCH

### Failure Modes Covered: B1-B7, F3
- B1: Status Filter Bug (uses 'completed' not USABLE_STATUSES)
- B2: Fuzzy Match Threshold too high
- B3: Extension Mapping Incomplete
- B4: Case Sensitivity issues
- B5: Special Characters in Filename
- B6: Partial Filename Match
- B7: Image Extension Mapping

### Status
| Fix ID | Description | Status | Location |
|--------|-------------|--------|----------|
| P0-2 | Status filter uses USABLE_STATUSES | COMPLETED | fileSearch:141 |
| P0-3 | Fuzzy match with normalizeForMatch | COMPLETED | fileSearch:127-171 |
| P0-5 | Extension mapping expanded | COMPLETED | fileSearch:1008 |
| P1-3 | Image extensions complete | COMPLETED | fileSearch extension map |
| SEC-3a | Verify status filter | PENDING VERIFICATION | searchByName |
| SEC-3b | Test partial match "Rosewood Fund" | PENDING VERIFICATION | fuzzyMatchFiles |

### Central Fix
- `searchByName()` now uses `status: { in: USABLE_STATUSES }`
- `normalizeForMatch()` strips extensions, version numbers, special chars
- Extension map expanded: `spreadsheet → ['xlsx','xls','csv']`, `images → full set`

---

## SECTION 4: FILE FILTERING BY TYPE

### Failure Modes Covered: B3, B5, B7, F4
- Filter queries like "Show only spreadsheets" must return correct file types
- TTFT for filter queries should be < 3s (metadata-only path)

### Status
| Fix ID | Description | Status | Location |
|--------|-------------|--------|----------|
| P0-5 | Extension mapping complete | COMPLETED | fileSearch:1008 |
| P0-9 | TTFT optimization (fast path) | COMPLETED | orchestrator:1147-1186 |
| SEC-4a | Verify spreadsheet filter | PENDING VERIFICATION | parseInventoryQuery |
| SEC-4b | Verify image filter includes all | PENDING VERIFICATION | parseInventoryQuery |

### Central Fix
- Extension map now multi-value arrays: `'spreadsheet': ['xlsx', 'xls', 'csv']`
- Early inventory fast path bypasses LLM intent classification for TTFT < 2s

---

## SECTION 5: INVENTORY LISTING UX

### Failure Modes Covered: D2, D4, D5
- D2: Metadata leaks (shows KB/path)
- D4: Missing "See All" button
- D5: Folder grouping format jumbled

### Status
| Fix ID | Description | Status | Location |
|--------|-------------|--------|----------|
| P0-6 | LOAD_MORE marker added | COMPLETED | postGenGate truncation |
| P0-7 | Metadata leaks removed | COMPLETED | formatResultsAsMarkdown |
| P1-1 | Folder grouping format | COMPLETED | group_by_folder case |
| SEC-5a | Verify DOC markers in output | PENDING VERIFICATION | formatResultsAsMarkdown |
| SEC-5b | Verify LOAD_MORE for >8 files | PENDING VERIFICATION | postGenGate |
| SEC-5c | Verify no metadata in chat | PENDING VERIFICATION | output inspection |

### Central Fix
- `formatResultsAsMarkdown()` now has `withDocMarkers: true` by default
- `createLoadMoreMarker()` called after truncation to 8 items
- Metadata (size/folder) hidden unless explicitly requested

---

## SECTION 6: CONVERSATION MEMORY & FOLLOW-UP RESOLUTION

### Failure Modes Covered: C1-C5, A8
- C1: In-Memory Cache Loss (server restart)
- C2: Cache Expiry Undefined
- C3: lastDocumentIds Not Used in RAG
- C4: Cross-Conversation Leakage
- C5: Previous File Not Tracked

### Status
| Fix ID | Description | Status | Location |
|--------|-------------|--------|----------|
| P0-10 | simpleLastRef fallback | COMPLETED | resolveImplicitReference |
| P1-5 | Redis persistence | DEFERRED | Infrastructure work |
| SEC-6a | Verify lastReferencedFile stored | PENDING VERIFICATION | memory cache |
| SEC-6b | Test follow-up "what's in it" | PENDING VERIFICATION | RAG integration |

### Central Fix
- `resolveImplicitReference()` has fallback to `getLastReferencedFile()` when pronoun detected
- Memory persists in Map for session (Redis deferred)

---

## SECTION 7: FINANCE RETRIEVAL BOOSTING

### Failure Modes Covered: Indirect (B1, B3, D1, E1)
- Finance queries should boost xlsx documents
- lastDocumentIds should boost follow-up retrieval

### Status
| Fix ID | Description | Status | Location |
|--------|-------------|--------|----------|
| P0-11 | Compare behavior with both files | COMPLETED | compare handler |
| SEC-7a | EBITDA retrieval boost | PENDING VERIFICATION | retrievalEngine |
| SEC-7b | xlsx priority for finance | PENDING VERIFICATION | retrievalEngine |

---

## SECTION 8: CITATIONS / DOC MARKER INJECTION

### Failure Modes Covered: D1, D3, E1-E4
- D1: No DOC Markers in RAG Answers
- E1: No Citations in Non-File Actions
- E2: Citation Page Number Missing
- E3: Multiple Sources Not Grouped
- E4: Streaming Citation Timing

### Status
| Fix ID | Description | Status | Location |
|--------|-------------|--------|----------|
| P0-4 | DOC markers in RAG answers | COMPLETED | GATE 2B in postGenGate |
| SEC-8a | Verify RAG DOC markers | PENDING VERIFICATION | done event |
| SEC-8b | Verify sources array in done | PENDING VERIFICATION | SSE contract |

### Central Fix
- GATE 2B in `postGenGate()` injects DOC markers for documents intent using sources[]
- `createDocMarker()` from markerUtils used consistently

---

## SECTION 9: FORMATTING PIPELINE ENFORCEMENT

### Failure Modes Covered: D3, D6, G2
- D3: Single Source Gets Numbered List
- D6: Table Rendering Issues
- G2: Compare Doesn't Show Both Files

### Status
| Fix ID | Description | Status | Location |
|--------|-------------|--------|----------|
| P1-4 | Single source no numbering | COMPLETED | formatting check |
| P0-11 | Compare shows both files | COMPLETED | compare handler |
| SEC-9a | Verify single source format | PENDING VERIFICATION | output inspection |

---

## SECTION 10: SSE CONTRACT + FRONTEND RENDERING

### Failure Modes Covered: E4, G1, G2, H3
- E4: Streaming Citation Timing (mid-stream)
- G1: No File Preview on "Open"
- H3: Malformed Marker Recovery

### Status
| Fix ID | Description | Status | Location |
|--------|-------------|--------|----------|
| SEC-10a | Verify done.fullAnswer has markers | PENDING VERIFICATION | SSE stream |
| SEC-10b | Verify frontend maps done.fullAnswer | PENDING VERIFICATION | ChatInterface |

### SSE Event Contract
```
content: { type: 'content', content: string }
done: {
  type: 'done',
  fullAnswer: string,    // Complete answer with markers
  sources: Source[],     // For sources panel
  citations: Citation[], // For inline refs
  ...
}
```

---

## SECTION 11: FOLDER OPS & CONFIRMATIONS

### Failure Modes Covered: G4, P0-12
- G4: Move Action No Confirmation

### Status
| Fix ID | Description | Status | Location |
|--------|-------------|--------|----------|
| P0-12 | Move confirmation exists | VERIFIED | orchestrator:4327, 4595 |
| SEC-11a | Verify move returns confirmation | PENDING VERIFICATION | move handler |

---

## SECTION 12: PERFORMANCE & TTFT

### Failure Modes Covered: F1-F5
- F1: Full DB Scan for Inventory
- F2: Triple LLM Calls
- F3: Fuzzy Search O(n)
- F4: Slow TTFT on Filters
- F5: Streaming Buffer Overhead

### Status
| Fix ID | Description | Status | Location |
|--------|-------------|--------|----------|
| P0-9 | Early inventory fast path | COMPLETED | orchestrator:1147-1186 |
| SEC-12a | Verify TTFT < 3s for inventory | PENDING VERIFICATION | timing check |

---

## VALIDATION CHECKLIST

### Phase A: Inventory Queries
- [ ] "Show only PDFs" → returns DOC markers, TTFT < 3s
- [ ] "Show only spreadsheets" → includes xlsx, xls, csv
- [ ] "What files do I have?" → clean numbered list, no metadata
- [ ] "Group by folder" → proper folder headers

### Phase B: File Actions
- [ ] "Where is Rosewood Fund located?" → folder path, DOC marker
- [ ] [Open file then] "Where is it located?" → resolves pronoun, shows location
- [ ] "Open it" → opens lastReferencedFile
- [ ] "Compare it to X" → shows both files with DOC markers

### Phase C: RAG / Documents
- [ ] "Summarize Rosewood Fund" → DOC marker in answer
- [ ] "What's the EBITDA?" → retrieves xlsx, includes citation
- [ ] Follow-up "What else?" → uses lastDocumentIds boost

---

## SUMMARY BY PRIORITY

| Priority | Total | Completed | Pending |
|----------|-------|-----------|---------|
| P0 | 12 | 12 | 0 |
| P1 | 6 | 5 | 1 (deferred) |
| SEC | 20 | 1 | 19 (verification) |

### Just Fixed This Session
- SEC-1a: Added pronoun check to INVENTORY INTERCEPT (orchestrator:1697-1703)

### Deferred
- P1-5: Context memory persistence (requires Redis infrastructure)

---

## NEXT STEPS

1. Restart backend to pick up pronoun intercept fix
2. Run validation test: "Where is it located?" after opening a file
3. Verify all SEC-* items with single conversation test
4. Run E2E Phase A, B, then 50-query test
