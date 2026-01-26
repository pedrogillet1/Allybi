# HELP MISROUTE CASES ANALYSIS

## Executive Summary

This document identifies cases where the HELP intent incorrectly wins over document-related intents, causing Koda to return generic product help responses instead of document-based answers.

## Problem Statement

**Symptom:** User asks about document content (including follow-ups) → System routes to HELP → Returns generic help template like "Posso ajudá-lo com: Upload e gerenciamento de documentos..." instead of answering from documents.

**Root Cause:** Multiple overlapping issues:
1. `intent_patterns.runtime.json` contains overly broad HELP keywords
2. Follow-up queries without explicit document keywords fail document patterns
3. Help intent patterns include terms like "guide", "guia" that conflict with document names

---

## Analysis of Help Keyword Collisions

### Keywords in `help` intent that conflict with document queries:

| Keyword | Conflict Scenario |
|---------|-------------------|
| `guide` (EN) | Matches "Integration Guide 5" - a document reference |
| `guia` (PT) | Matches "o guia propõe" - the guide proposes |
| `tutorial` | Could match document tutorials |
| `where is`, `where can i find` | Matches file location queries |
| `how to`, `how do i`, `how can i` | Generic - matches document queries |
| `can you`, `can koda`, `does koda` | Could match document capability questions |

### Patterns in `help` intent that are overly broad:

From `intent_patterns.runtime.json` lines 123-136:
```json
"^how\\s+(do|can)\\s+i\\s+(upload|add|import)\\b"  // OK - specific to upload
"\\b(tutorial|guide|getting\\s+started)\\b"  // PROBLEM - "guide" matches docs
"^(can|does)\\s+(koda|you)\\s+\\w+\\s*(\\?)?$"  // Too broad
```

---

## Identified Misroute Categories

### Category 1: Document Guide References
**Pattern:** User asks about a document named "Guide" (e.g., "Integration Guide")
**Example queries:**
- "What does the Integration Guide propose?"
- "O que o guia propõe em termos de arquitetura?"
- "Per the guide, what is the recommendation?"

**Why help wins:** The word "guide/guia" matches help keywords before document patterns are evaluated.

### Category 2: Follow-up Queries
**Pattern:** User asks a follow-up question without explicit document keywords
**Example queries:**
- "E por quê?" (And why?)
- "E quanto foi o total?" (And what was the total?)
- "Com base nesses números..." (Based on those numbers...)
- "Julho foi outlier?" (Was July an outlier?)

**Why help wins:** No explicit document keywords, query is short/ambiguous, conversation context not properly inherited.

### Category 3: Implicit Document Context
**Pattern:** Query implicitly references document content via pronouns or short references
**Example queries:**
- "O que isso significa?" (What does this mean?)
- "Explique melhor" (Explain better)
- "Sobre esse aspecto..." (About this aspect...)

**Why help wins:** Pronouns/demonstratives don't trigger document patterns.

---

## Trace Evidence from Routing System

### From `intent_patterns.runtime.json`:

Help keywords that cause collision:
```json
"keywords": {
  "en": ["guide", "how to", "how do i", "where is", "where can i find", "can you"],
  "pt": ["guia", "como", "como faço", "onde fica", "você pode"]
}
```

### From `routingPriority.service.ts`:

Follow-up detection exists (lines 339-414) but may not be triggering properly:
```typescript
const FOLLOWUP_PHRASES_PT = [
  'com base', 'nesses', 'isso', 'desses',
  'o guia', 'esse guia',  // Added but may not override help
  'e por quê', 'por quê',
  ...
];
```

The blocker logic (lines 787-800) only applies when:
- `previousIsDocRelated` is true
- `followupStrength` is 'strong' or 'moderate'

**Gap:** If the intent engine scores help higher BEFORE routing priority runs, the adjustment may not be enough.

---

## Expected Failing Queries from 50-Query Corpus

Based on `corpus_grouping_50.json`, these queries are at risk:

### Grouped Conversation Chains (highest risk):

| Query ID | Query Text | Risk |
|----------|-----------|------|
| q16 | "Com base nesses números..." | Follow-up, no explicit doc keywords |
| q36 | "Julho foi outlier?" | Follow-up about EBITDA data |
| q40 | "O que o guia propõe..." | Contains "guia" (help keyword) |

### PT Queries with Guide References:

| Query ID | Query Text | Risk |
|----------|-----------|------|
| q32 | "Explique o que é 'SIPOC'..." | Contains "explique" without doc anchor |
| q34 | "Isso parece Scrum..." | Follow-up with pronouns |

---

## Root Cause Summary

1. **Pattern Collision:** HELP keywords like "guide/guia" match document names
2. **Follow-up Inheritance Gap:** Short follow-ups don't inherit doc context strongly enough
3. **Scoring Order:** Help intent scores first, routing priority adjustments insufficient
4. **No Hard Blocker:** No explicit rule saying "if last N turns were documents, NEVER route to help"

---

## Fix Requirements

### 1. Remove Conflicting Keywords from HELP
- Remove `guide` from EN help keywords
- Remove `guia` from PT help keywords (or add negative patterns)
- Keep them ONLY in `file_actions` intent for "find guide.pdf" queries

### 2. Strengthen Follow-up Inheritance
- If previous 1-2 turns were `documents/compare/excel/pptx`, boost that intent +0.80
- Apply this BEFORE help scoring

### 3. Add Hard Blocker for Document Context
- If conversation has doc intent in last 3 turns, BLOCK help intent entirely
- Only allow help if user explicitly says "help", "ajuda", "how do I use koda"

### 4. Redefine HELP as Strictly Product Usage
- HELP should ONLY match:
  - Upload/download questions
  - Login/account/password
  - "What can Koda do"/"O que é Koda"
  - Settings/preferences UI questions

---

## Files to Modify

| File | Changes |
|------|---------|
| `intent_patterns.runtime.json` | Remove guide/guia from help keywords, add negative patterns |
| `routingPriority.service.ts` | Strengthen doc-context blocker, add hard help blocker |
| `decisionTree.service.ts` | Check conversation context before returning help family |
| `kodaOrchestratorV3.service.ts` | Pass conversation history to routing for context |

---

## Verification Plan

1. Run 50-query evaluation with routing trace logging
2. Check that q16, q36, q40 route to documents, not help
3. Verify 0 queries get help intent when asking about document content
4. Confirm help still works for actual product usage questions
