# Koda Frontend Launch-Blocker Validation - Implementation Plan

## Overview

Build a 100-question E2E stress test that validates Koda behaves like ChatGPT for uploaded docs.

---

## Test Data (User: test@koda.com)

### Folder Structure
```
Koda test/
├── test 1/
│   ├── Rosewood Fund v3.xlsx
│   ├── Lone Mountain Ranch P&L 2024.xlsx
│   └── Lone Mountain Ranch P&L 2025 (Budget).xlsx
├── test 2/
│   ├── LMR Improvement Plan 202503 ($63m PIP).xlsx
│   ├── OBA_marketing_servicos (1).pdf
│   ├── Trabalho projeto .pdf
│   └── analise_mezanino_guarda_moveis.pdf
└── test 3/
    ├── Real-Estate-Empreendimento-Parque-Global.pptx
    ├── TRABALHO FINAL (1).PNG
    ├── Capítulo 8 (Framework Scrum).pdf
    └── Anotações Aula 2 (1).pdf
```

---

## Phase 0: Architecture

### Output Folder Structure (per run)
```
e2e/runs/
└── run_2026-01-05_19-30-00/
    ├── config.json              # Test configuration
    ├── docs_snapshot.json       # Pre-flight document list
    ├── questions/
    │   ├── Q001.json            # Full result for each question
    │   ├── Q001_screenshot.png
    │   ├── Q001_html.html       # Raw HTML of assistant message
    │   ├── Q002.json
    │   └── ...
    ├── persistence_checks.json  # Message count at each step
    ├── summary_report.json      # Aggregated results
    └── summary_report.md        # Human-readable report
```

### Question JSON Structure
```json
{
  "id": "Q001",
  "prompt": "What files do I have uploaded?",
  "section": "A",
  "timestamp": "2026-01-05T19:30:15.000Z",
  "timing": {
    "ttft": 150,
    "totalTime": 2500,
    "streamingStable": true
  },
  "response": {
    "text": "Here are your files...",
    "html": "<div class='assistant-message'>...</div>",
    "truncatedText": "Here are your files... (first 500 chars)"
  },
  "domAnalysis": {
    "hasOrderedList": true,
    "hasUnorderedList": false,
    "listItemCount": 11,
    "hasButtons": true,
    "buttonCount": 11,
    "hasHeadings": false,
    "hasTable": false,
    "hasEmoji": false,
    "hasRawMarkers": false,
    "hasFallbackPhrase": false,
    "computedStyles": {
      "color": "rgb(26, 26, 26)",
      "fontSize": "16px",
      "lineHeight": "1.6"
    }
  },
  "validation": {
    "passed": true,
    "failures": [],
    "warnings": []
  },
  "persistence": {
    "messageCountBefore": 0,
    "messageCountAfter": 1,
    "allPreviousMessagesPresent": true
  }
}
```

---

## Phase 1: Pre-flight Validation

Before running questions:
1. Login as test@koda.com
2. Navigate to Documents page
3. Capture all document IDs, filenames, folder paths
4. Save to `docs_snapshot.json`
5. Verify count > 0
6. Start new conversation

---

## Phase 2: Frontend Output Auditor

For each assistant message, check:

### DOM-based Checks
- `<ol>` present → numbered list
- `<ul>` present → bullet list
- `<li>` count
- `<h1>`-`<h4>` present → headings
- `<table>` present
- Button elements with `document-button` or `inline-document` class
- Raw marker patterns in text content

### Style Checks
- Computed color matches expected (#1a1a1a)
- Font size matches (16px)
- No black (#000000) text during streaming

### Content Checks
- No emoji patterns
- No fallback phrases
- No duplicate paragraphs

---

## Phase 3: Persistence Checker

Before each question:
1. Count all `.user-message` and `.assistant-message` elements
2. Store count

After each question:
1. Verify count increased by exactly 2 (1 user + 1 assistant)
2. Verify first 5 messages still exist (by content hash)
3. Flag if any message disappeared

---

## Phase 4: Streaming Instrumentation

Measure:
- TTFT: Time from Enter press to first content in assistant bubble
- Total time: Time until content stabilizes
- Stability: No content replacement after stabilization

CSS validation during streaming:
- Check computed styles match final styles
- No "black text" bug

---

## Phase 5: 100-Question Test Suite

### Block A (1-10): Document Inventory + Filtering
1. List all docs (numbered + buttons)
2. Group by folder (test 1, test 2, test 3)
3. Show only PDFs
4. Show only spreadsheets
5. Show only PPTX and PNG
6. Where is Rosewood Fund? (button only)
7. Where is Real-Estate PPTX? (sentence + button)
8. Newest PDF by date
9. Largest file
10. Sort by type: spreadsheets first, then PDFs, PPTX, images

### Block B (11-20): Location + Navigation
11. Open Capítulo 8 (Framework Scrum).pdf
12. Where is it located?
13. Summarize it in 5 bullets
14. Show section titles/headings
15. Open Anotações Aula 2 (1).pdf
16. Where is it located?
17. Open the earlier one again (follow-up)
18. Does it mention Scrum roles?
19. Open the PNG
20. What is shown in the image?

### Block C (21-30): PPTX Deep Extraction
21. Go back to the PPTX
22. Summarize PPTX in structured outline
23. Which slide talks about business model?
24. Open PPTX at that slide
25. Key numbers in PPTX with slide references
26. Compare PPTX with analise_mezanino PDF
27. Open analise_mezanino_guarda_moveis.pdf
28. Extract main conclusion (2 sentences + citation)
29. Show exact paragraph of conclusion
30. Where is this PDF? (button only)

### Block D (31-40): Spreadsheet Retrieval + Calculations
31. List assumptions in analise PDF
32. Open Lone Mountain Ranch P&L 2024.xlsx
33. Structure of spreadsheet (tabs/sheets)
34. Find total revenue + expenses (sheet + cell)
35. Open Lone Mountain Ranch P&L 2025 (Budget).xlsx
36. Same: total revenue + expenses
37. Compare 2024 vs 2025: top 5 changes
38. Biggest change explanation
39. Show exact cells used
40. Open LMR Improvement Plan 202503

### Block E (41-50): Cross-Spreadsheet Analysis
41. Find $63m reference (sheet/cell)
42. Connect improvement plan to budget
43. Verification checklist for alignment
44. Most "decision critical" spreadsheet
45. Open Rosewood Fund v3.xlsx
46. Investment strategy/allocation quote
47. If table, summarize it
48. Compare Rosewood vs LMR assumptions
49. List spreadsheet buttons only
50. Open the second one

### Block F (51-60): File Actions (Safe Mode)
51. Where is it located? (folder + button)
52. List contents of Koda test folder
53. List contents of test 1 subfolder
54. List contents of test 2 subfolder
55. List contents of test 3 subfolder
56. Which folder has most files?
57. Move would require confirmation - explain
58. Rename would require confirmation - explain
59. Delete non-existent file (graceful error)
60. Confirm all original files still present

### Block G (61-70): PDF Content Deep Questions
61. Open Trabalho projeto .pdf
62. Summarize: Purpose → Method → Results → Conclusion
63. Find one claim and its evidence
64. Show where evidence is stated
65. Open Capítulo 8 again
66. Extract Scrum artifacts/events definitions
67. Open Anotações Aula 2 again
68. Do notes agree with Scrum PDF? (3 matches + 3 differences)
69. What's missing in notes?
70. Open analise_mezanino again

### Block H (71-80): Cross-Doc Reasoning
71. Numeric constraints in analise PDF
72. Qualitative constraints if no numeric
73. Main themes across all documents (cite files)
74. Best file for each theme (buttons only)
75. Open recommended file + why
76. Which file mentions 'budget'?
77. Which file mentions 'strategy'?
78. Open most relevant budget file
79. Top 3 budget drivers
80. Compare with improvement plan

### Block I (81-90): Ambiguity Tolerance
81. Where is that file? (button only)
82. Files in test 3 - which has visuals vs text?
83. Open PPTX - 5 key takeaways (max 12 words each)
84. How does PNG relate to PPTX?
85. Open document about Scrum (no exact name)
86. Show it again (resolve "it")
87. Two most related to 'project work' (buttons)
88. Open second one - 3 sentence summary
89. Why does it say this? (point to section)
90. If can't locate, give closest section

### Block J (91-100): Final Validation
91. List every file: folder path + type + button
92. Did you ever use a fallback? List under-supported questions
93. What did we learn from docs? (6 bullets)
94. What should I do next? (5 action bullets)
95. Open the financial report
96. Open the presentation
97. Open the marketing doc
98. Open the Scrum notes
99. List all again - confirm all present
100. Final confirmation: no rephrase, no upload prompts used

---

## Phase 6: Button Click Validation

Every 10th question:
1. Click a document button
2. Verify modal opens
3. Verify correct filename shown
4. Verify preview renders
5. Close modal
6. Verify chat still intact

---

## Phase 7: Result Persistence

After each question, save:
```
questions/Q{num}.json     - Full structured result
questions/Q{num}.png      - Screenshot
questions/Q{num}.html     - Raw HTML of message
```

---

## Phase 8: Report Generation

### summary_report.json
```json
{
  "runId": "run_2026-01-05_19-30-00",
  "timestamp": "2026-01-05T19:30:00.000Z",
  "duration": 1800000,
  "summary": {
    "total": 100,
    "passed": 95,
    "failed": 5,
    "passRate": "95%",
    "avgTtft": 200,
    "avgTotalTime": 3000
  },
  "hardFails": [],
  "softFails": [],
  "sectionResults": {},
  "persistenceValid": true,
  "streamingStable": true
}
```

### summary_report.md
Human-readable with:
- Pass/fail per question
- Section breakdowns
- Failure details with screenshots
- Recommendations

---

## Phase 9: Playwright Config

Update for 100 questions:
- Test timeout: 30 minutes (1800000ms)
- Per-question timeout: 60 seconds
- Video recording: always
- Trace: always

---

## Hard Fail Conditions (NO-GO)

If ANY of these occur, test fails:
1. Fallback phrase appears
2. Message disappears from chat
3. Answer becomes empty after streaming
4. Raw DOC marker visible
5. File buttons don't render when expected
6. Duplicate answer blocks
7. Wrong streaming style (black text)
8. Conversation loses context

---

## Success Criteria

- 100 questions pass with zero hard fails
- No fallback phrases
- 100% message persistence
- 100% button rendering on expected turns
- Streaming visually stable
- List formatting correct when demanded
