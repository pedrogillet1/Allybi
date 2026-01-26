# Root Cause Map - Strict Certification Failures

## Summary
- **Total Queries**: 50
- **Passed**: 21 (42%)
- **Failed**: 29 (58%)

---

## Failure Category: LANGUAGE_MISMATCH (15 failures)

### Root Cause
The Portuguese queries are being answered in English. The language detection in the answer engine does not properly lock language output based on query language.

### Evidence
- q07: "Liste todos os meus documentos" → Response in English
- q08, q09, q10, q15, q16, q17, q20, q21, q26, q35, q37, q42, q43, q46, q47

### Code Locations to Fix
| File | Function | Issue |
|------|----------|-------|
| `backend/src/services/core/kodaAnswerEngineV3.service.ts` | `generateAnswer()` | Language lock not enforced in LLM prompt |
| `backend/src/services/core/kodaFormattingPipelineV3.service.ts` | `formatResponse()` | No post-generation language validation |

### Fix Strategy
1. In `generateAnswer()`, add explicit language instruction: "You MUST respond in {detectedLanguage}"
2. Add language validation post-generation that detects language mismatch and regenerates if needed
3. Consider language prefix in system prompt based on detected query language

---

## Failure Category: ROUTING_WRONG_INTENT (13 failures)

### Root Cause
Several query patterns are being routed to incorrect intents. Key issues:
1. PT file action queries (e.g., "Onde está", "Mostre") route to `documents` instead of `file_actions`
2. Document content queries with file names route to `file_actions` instead of `documents`
3. "Find documents about X" routes to `file_actions` (listing) instead of `documents` (search)

### Evidence
| Query | Expected | Got |
|-------|----------|-----|
| q07 "Liste todos os meus documentos" | file_actions | documents |
| q08 "Onde está o arquivo..." | file_actions | documents |
| q14 "Summarize the Koda Integration Guide in a table" | documents | file_actions |
| q23 "What is the guarda bens..." | documents | file_actions |
| q28 "Find all documents about finance" | documents | file_actions |
| q49 "What interviews are in my documents?" | documents | file_actions |
| q50 "Summarize Interview 1" | documents | engineering |

### Code Locations to Fix
| File | Function | Issue |
|------|----------|-------|
| `backend/src/data/intent_patterns.runtime.json` | `file_actions.keywords.pt` | Missing PT keywords: "liste", "onde está", "mostre", "abra" |
| `backend/src/services/core/routingPriority.service.ts` | `adjustScores()` | "Summarize X" with explicit filename routes to file_actions |
| `backend/src/services/core/kodaIntentEngineV3.service.ts` | `detectIntent()` | Content verbs ("summarize", "explain", "what is") not boosting documents |

### Fix Strategy
1. Add PT file action keywords to intent_patterns.runtime.json
2. In routingPriority: when query contains content verb ("summarize", "explain", "what") + filename → boost documents
3. Add negative pattern to file_actions: queries starting with "What is", "Summarize", "Explain"

---

## Failure Category: COMPLETENESS_TRUNCATION (5 failures)

### Root Cause
Answers are being truncated mid-generation, ending with "...". This indicates either:
1. Token limit hit during generation
2. LLM prematurely ending with ellipsis
3. Missing truncation repair in formatting pipeline

### Evidence
- q07: Answer ends with "..."
- q15, q16, q30, q33: All end with "..."

### Code Locations to Fix
| File | Function | Issue |
|------|----------|-------|
| `backend/src/services/core/kodaAnswerEngineV3.service.ts` | `generateAnswer()` | maxTokens may be too low for complex queries |
| `backend/src/services/core/kodaFormattingPipelineV3.service.ts` | `repairTruncation()` | Truncation repair not detecting "..." ending |

### Fix Strategy
1. In answer engine: Check if response ends with "..." and regenerate with higher token limit
2. In formatting pipeline: Add truncation detection for ellipsis and attempt completion
3. Consider setting maxTokens = 8000 for complex queries

---

## Failure Category: COMPLETENESS_PARAGRAPH_COUNT / NUMBERED_COUNT / BULLET_COUNT (5 failures)

### Root Cause
Formatting constraints (exact N bullets, N paragraphs, N numbered items) are not being enforced. The LLM is not following the explicit count requirements.

### Evidence
- q10: Expected 3 paragraphs, got 1
- q12: Expected 4 numbered items, got 1
- q34: Expected 2 paragraphs, got 1
- q37: Expected 5 numbered items, got 1
- q45: Expected 10 bullets, got 4

### Code Locations to Fix
| File | Function | Issue |
|------|----------|-------|
| `backend/src/services/core/kodaAnswerEngineV3.service.ts` | `buildPrompt()` | Formatting constraints not emphasized strongly enough |
| `backend/src/services/core/kodaFormattingPipelineV3.service.ts` | `validateFormat()` | No post-generation validation of count constraints |

### Fix Strategy
1. Add explicit count validation in formatting pipeline
2. If count mismatch detected, add to prompt: "WARNING: You gave N items but I asked for M. Please provide exactly M."
3. Consider retry with stronger constraint emphasis

---

## Failure Category: COMPLETENESS_MISSING_TABLE (2 failures)

### Root Cause
"table format" constraint not producing markdown tables. LLM may be generating prose instead.

### Evidence
- q24: "Compare the topics... in a table" → No table
- q41: "Summarize it as a table with Topic and Details" → No table

### Code Locations to Fix
| File | Function | Issue |
|------|----------|-------|
| `backend/src/services/core/kodaAnswerEngineV3.service.ts` | `detectFormatConstraints()` | "table" keyword detection may be missing |
| `backend/src/data/answer_styles.json` | table_format style | May not have explicit markdown table template |

### Fix Strategy
1. When "table" detected in query, add explicit template: "Format as markdown table: |Col1|Col2|\n|---|---|"
2. Add post-validation that checks for table markers (|---|)

---

## Failure Category: COMPLETENESS_BUTTON_ONLY (1 failure)

### Root Cause
File action responses should be button-only (minimal content) but q09 "Abra ele" returned content.

### Code Locations to Fix
| File | Function | Issue |
|------|----------|-------|
| `backend/src/services/core/kodaOrchestratorV3.service.ts` | `handleFileActions()` | Not enforcing empty content for "open" commands |

---

## Failure Category: DRIFT_NO_SOURCES (1 failure)

### Root Cause
q41 answered without any sourceButtons or sources, despite being a document query.

### Code Locations to Fix
| File | Function | Issue |
|------|----------|-------|
| `backend/src/services/core/kodaOrchestratorV3.service.ts` | `buildResponse()` | Should require sources for documents intent |

---

## Failure Category: UI_NO_SEE_ALL (1 failure)

### Root Cause
q07 inventory query did not include seeAll chip when totalCount > 10.

### Code Locations to Fix
| File | Function | Issue |
|------|----------|-------|
| `backend/src/services/core/kodaOrchestratorV3.service.ts` | `buildSourceButtons()` | seeAll logic may have edge case |
