# Content Guard Bank Plan

## Objective
Create a bank-driven content guard system that behaves "exactly like ChatGPT" - correctly routing content questions to RAG/documents while allowing true file actions to proceed.

## Problem Statement
Queries like "What topics does the Project Management Presentation cover?" were incorrectly routing to `file_actions` because:
1. "presentation" matched as `.pptx` extension filter
2. Multiple interception paths had inconsistent regex patterns
3. No central source of truth for content question detection

## Solution: Two-Signal Rule
Content Guard triggers ONLY when query has BOTH:
- **(A) Content Intent Signal**: topics, summary, main points, argue, claims, what does it say, mentions
- **(B) Document Object Signal**: document, file, presentation, deck, report, guide, spreadsheet, slides, OR anchor nouns (page, slide, tab, sheet, cell, section)

## Bank Files

### Triggers (content_guard)
| File | Target Count | Purpose |
|------|--------------|---------|
| `content_guard.en.json` | 450 | EN patterns that trigger content guard |
| `content_guard.pt.json` | 600 | PT patterns (more variants due to conjugation) |

### Negatives (not_content_guard)
| File | Target Count | Purpose |
|------|--------------|---------|
| `not_content_guard.en.json` | 220 | EN patterns that BLOCK content guard (file actions) |
| `not_content_guard.pt.json` | 280 | PT patterns that BLOCK content guard |

## Content Guard Families

### CG-1: Topics/Themes/Coverage (Weight: 2.2)
- "What topics does X cover?"
- "What is discussed in X?"
- Target: EN 120, PT 160

### CG-2: Main Points/Takeaways (Weight: 2.0)
- "main points", "key takeaways", "key findings"
- Target: EN 80, PT 110

### CG-3: Argument/Claims/Thesis (Weight: 1.8)
- "What does X argue?"
- "What is the thesis?"
- Target: EN 60, PT 90

### CG-4: Summarize/Explain/Describe (Weight: 1.7)
- "summarize the document"
- "what does it say about..."
- Target: EN 90, PT 120

### CG-5: Inside-Document Location (Weight: 1.9)
- "where does it mention..."
- "which page contains..."
- Target: EN 70, PT 120

### CG-6: "What's in this file?" (Weight: 1.6)
- "what is in the spreadsheet?"
- Target: EN 30, PT 40

## Negative Guard Families

### NG-1: Explicit Inventory Verbs
- show/list/display + files/documents/pdfs

### NG-2: File Open/Preview
- open/preview/view

### NG-3: Sorting/Grouping
- newest/largest/sorted by

### NG-4: "Show only..."
- show only PDFs, only spreadsheets

## Implementation Architecture

```
contentGuard.service.ts
├── loadBanks() - loads from dataBankRegistry
├── isContentQuery(query, lang) - main check function
├── matchedPatternIds[] - for debugging
└── reasonCodes[] - for logging

Call Sites (all use shared guard):
├── parseInventoryQuery() - if isContentQuery => NOT inventory
├── detectFileActionQuery() - if isContentQuery => return null
└── decision tree - if isContentQuery => force documents operator
```

## Success Criteria
- Probe suite accuracy ≥ 98%
- Zero content questions routing to file_actions
- Zero file actions blocked by content guard
- Q42 "What topics does the Project Management Presentation cover?" → documents intent
