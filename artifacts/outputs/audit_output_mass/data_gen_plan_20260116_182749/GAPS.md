# Gap Analysis - Missing Bank Categories

Generated: 2026-01-16T18:27:49

## Executive Summary

The 500-query corpus reveals **12 critical gaps** in the current data bank coverage. These gaps fall into three categories:

1. **Missing Intent Categories** - New intents needed
2. **Missing Normalizers** - Pattern normalization not covered
3. **Missing Infrastructure** - Backend capabilities required

---

## GAP-1: Analytics/Metrics Intent (CRITICAL)

### Affected Queries
- Q29/EN29: "average file size of uploaded documents"
- Q48/EN48: "monthly growth in documents uploaded this quarter"
- Q60/EN60: "tokens used per model in the costs report"
- Q62/EN62: "month-over-month storage usage for 2024"
- Q143/EN143: "five-most-used documents this week"
- Q149/EN149: "files received edits in the last 24 hours"
- Q186/EN186: "tokens spent per model in the cost report"
- Q199/EN199: "tokens per feature in the frontend report"
- Q210/EN210: "tokens per user in the cost analyzer"
- Q247/EN247: "tokens used in the top cost center"

### Current State
- No `analytics_metrics` intent exists
- No routing patterns for token/usage queries
- No backend storage for usage metrics

### Required Banks
```
triggers/analytics_metrics.en.json - 120 patterns
triggers/analytics_metrics.pt.json - 120 patterns
negatives/block_analytics_when_content.json - 80 patterns
```

### Required Infrastructure
```typescript
// queryLog schema
interface QueryMetrics {
  tokensIn: number;
  tokensOut: number;
  model: string;
  feature: string;
  userId: string;
  costCenter?: string;
  timestamp: Date;
}

// document usage tracking
interface DocumentUsage {
  documentId: string;
  viewCount: number;
  referenceCount: number;
  lastAccessed: Date;
  lastEdited: Date;
}
```

---

## GAP-2: Folder Operations Intent (HIGH)

### Affected Queries
- Q16/EN16: "In which folder is the 'Lone Mountain Ranch P&L'..."
- Q27/EN27: "Provide the exact folder path for the integration guide..."
- Q95/EN95: "folder path to the 'integration checklist' doc"
- Q106/EN106: "What folder contains the latest integration guide..."
- Q119/EN119: "List the folders that contain spreadsheets vs PDFs"
- Q126/EN126: "Where is 'Integration Guide 5' stored..."
- Q173/EN173: "Where is the project charter stored?"
- Q181/EN181: "Identify the folder storing the integration checklist"
- Q203/EN203: "What folder contains the 'Project Overview' doc?"
- Q219/EN219: "List the folders containing PDFs vs spreadsheets"
- Q223/EN223: "What folder stores the onboarding templates?"
- Q231/EN231: "What folder contains the quality handbook?"
- Q243/EN243: "Where is the folder for the compliance glossary?"
- Q245/EN245: "What folders contain security policies?"

### Current State
- `file_actions` intent exists but lacks folder-specific patterns
- No dedicated folder path query handling
- "Where is X stored" patterns may misroute to location queries

### Required Banks
```
triggers/file_folder_ops.en.json - 120 patterns
triggers/file_folder_ops.pt.json - 120 patterns
negatives/block_folder_when_content.json - 60 patterns
```

---

## GAP-3: Time Window Normalizer (HIGH)

### Affected Queries
- Q48/EN48: "this quarter"
- Q143/EN143: "this week"
- Q149/EN149: "last 24 hours"
- Q193/EN193: "last sprint"

### Current State
- Month normalization exists
- Quarter normalization partial
- No "this week", "last sprint", "last 24 hours" handling

### Required Banks
```
normalizers/time_windows.en.json - 120 patterns
normalizers/time_windows.pt.json - 120 patterns
```

### Pattern Examples
```json
{
  "last_24_hours": {
    "en": ["last 24 hours", "past 24 hours", "in the last day", "since yesterday"],
    "pt": ["últimas 24 horas", "nas últimas 24 horas", "desde ontem", "no último dia"]
  },
  "this_week": {
    "en": ["this week", "current week", "past 7 days", "last 7 days"],
    "pt": ["esta semana", "semana atual", "últimos 7 dias", "nos últimos 7 dias"]
  },
  "last_sprint": {
    "en": ["last sprint", "previous sprint", "past sprint", "prior sprint"],
    "pt": ["último sprint", "sprint anterior", "sprint passado"]
  },
  "this_quarter": {
    "en": ["this quarter", "current quarter", "Q1/Q2/Q3/Q4 2024"],
    "pt": ["este trimestre", "trimestre atual", "1º/2º/3º/4º trimestre"]
  }
}
```

---

## GAP-4: Document Status/Tags Filter (HIGH)

### Affected Queries
- Q30/EN30: "document statuses (uploaded, in review, approved)"
- Q86/EN86: "document statuses across folders"
- Q174/EN174: "disabled documents (status not usable)"
- Q206/EN206: "documents tagged with 'finance'"
- Q242/EN242: "files tagged with 'audit'"

### Current State
- Document status field exists (`status: usable | processing | error`)
- No tag system implemented
- No patterns to filter by status/tag

### Required Banks
```
normalizers/doc_status.en.json - 60 patterns
normalizers/doc_status.pt.json - 60 patterns
normalizers/doc_tags.en.json - 60 patterns
normalizers/doc_tags.pt.json - 60 patterns
```

### Required Infrastructure
```typescript
// Document model extension
interface Document {
  // ... existing fields
  status: 'uploaded' | 'processing' | 'available' | 'disabled' | 'error';
  tags: string[];  // NEW
  lastEditedAt: Date;  // NEW (for edit tracking)
}
```

---

## GAP-5: Typo/Diacritics Normalizer (MEDIUM)

### Affected Queries
- Q150/EN150: "insperability" (typo for "inseparability")
- Various PT queries with accent variations

### Current State
- No typo correction
- No diacritics normalization (qualidade vs qualidade)

### Required Banks
```
normalizers/typos.en.json - 100 patterns
normalizers/typos.pt.json - 100 patterns
normalizers/diacritics.pt.json - 60 patterns
```

### Pattern Examples
```json
{
  "typo_corrections": {
    "insperability": "inseparability",
    "stakehodler": "stakeholder",
    "compliace": "compliance",
    "qualty": "quality"
  },
  "diacritics_normalization": {
    "qualidade": ["qualidade", "qualidade"],
    "revisão": ["revisão", "revisao"],
    "integração": ["integração", "integracao"],
    "ônus": ["ônus", "onus"]
  }
}
```

---

## GAP-6: Slide/Page/Sheet Location Anchors (MEDIUM)

### Affected Queries
- Q38/EN38: "Point me to the slide that shows..."
- Q55/EN55: "List the slides that mention 'security'..."
- Q69/EN69: "which columns list 'Jan' to 'Dec' totals"
- Q75/EN75: "slides that mention the word 'challenges'"
- Q80/EN80: "Which slides mention 'P&L' explicitly"
- Q97/EN97: "What slides reference automation processes"

### Current State
- Chunk metadata includes page/slide info
- No dedicated slide/page locator patterns
- No column reference handling for Excel

### Required Banks
```
triggers/doc_anchors.en.json - 80 patterns
triggers/doc_anchors.pt.json - 80 patterns
```

---

## GAP-7: Negative Blockers (CRITICAL)

### Current State
- Minimal negative pattern coverage
- Frequent misrouting between intents

### Required Banks (per language)
| Category | Count | Purpose |
|----------|-------|---------|
| block_file_list_when_content | 180 | Prevent file listing when content verbs exist |
| block_help_when_content | 160 | Prevent help routing when asking about docs |
| block_finance_when_no_terms | 120 | Prevent finance routing without finance terms |
| block_doc_count_when_stats | 80 | Prevent "total docs" when asking pages/slides |
| block_analytics_when_content | 80 | Prevent analytics when asking doc content |
| block_exact_filename_fuzzy | 60 | Prevent exact match when fuzzy reference |
| block_generic_empty_sources | 80 | Force clarify when no sources found |

**Total negatives needed: 760 per language**

---

## GAP-8: Formatting Constraint Validators (MEDIUM)

### Current State
- Format detection exists (bullets, tables, numbered)
- No enforcement validation
- Count constraints not always honored

### Required Banks
```
formatting/exact_count.en.json - 140 patterns
formatting/exact_count.pt.json - 140 patterns
formatting/bullets.en.json - 100 patterns
formatting/bullets.pt.json - 100 patterns
formatting/numbered_steps.en.json - 90 patterns
formatting/numbered_steps.pt.json - 90 patterns
formatting/tables.en.json - 120 patterns
formatting/tables.pt.json - 120 patterns
formatting/sentence_limit.en.json - 70 patterns
formatting/sentence_limit.pt.json - 70 patterns
```

---

## GAP-9: Domain Lexicons (MEDIUM)

### Current State
- Basic finance terms in prompts
- No structured lexicon system
- No PT equivalents for domain terms

### Required Banks
| Domain | EN Terms | PT Terms |
|--------|----------|----------|
| agile_project_mgmt | 175 | 175 |
| marketing_service_quality | 225 | 225 |
| finance_accounting | 275 | 275 |
| compliance_security | 225 | 225 |
| analytics_telemetry | 150 | 150 |
| navigation_ui | 125 | 125 |

---

## GAP-10: Compare Intent Patterns (MEDIUM)

### Affected Queries
- Q5/EN5: "Create a table comparing..."
- Q13/EN13: "Compare the claims about..."
- Q46/EN46: "Compare the integration guide's steps..."
- Q114/EN114: "Provide a comparison table..."
- Q148/EN148: "Compare marketing vs operations..."
- Q167/EN167: "Compare the reasons to select..."
- Q172/EN172: "Compare the compliance vs security..."
- Q202/EN202: "Compare the March vs April revenue..."
- Q209/EN209: "Create a table comparing the P&L vs budget..."

### Current State
- `compare` intent exists but patterns are thin
- Table output not always enforced

### Required Banks
```
triggers/compare.en.json - 160 patterns
triggers/compare.pt.json - 160 patterns
```

---

## GAP-11: Edit History Tracking (HIGH for analytics)

### Affected Queries
- Q149/EN149: "files received edits in the last 24 hours"
- Q193/EN193: "documents edited in the last sprint"

### Current State
- `updatedAt` field exists on documents
- No fine-grained edit tracking
- No sprint boundary awareness

### Required Infrastructure
```typescript
interface DocumentEditLog {
  documentId: string;
  editedAt: Date;
  editType: 'content' | 'metadata' | 'move' | 'rename';
  userId: string;
}
```

---

## GAP-12: Multi-pass Retrieval References (LOW)

### Affected Queries
- Q12/EN12: "lessons learned from the multi-pass retrieval case study"
- Q21/EN21: "reasons why multi-pass retrieval is better"
- Q190/EN190: "files mention 'multi-pass retrieval'"

### Current State
- These reference specific document content
- Retrieval should find them naturally
- May need domain lexicon entry

### Required Banks
```
lexicons/retrieval_techniques.json - add "multi-pass retrieval" term
```

---

## Priority Matrix

| Gap | Priority | Effort | Impact |
|-----|----------|--------|--------|
| GAP-1: Analytics Intent | CRITICAL | HIGH | 24 queries affected |
| GAP-7: Negative Blockers | CRITICAL | MEDIUM | Prevents misrouting |
| GAP-2: Folder Ops | HIGH | MEDIUM | 22 queries affected |
| GAP-3: Time Windows | HIGH | LOW | 8 queries affected |
| GAP-4: Status/Tags | HIGH | MEDIUM | 10 queries affected |
| GAP-8: Format Validators | MEDIUM | MEDIUM | All format queries |
| GAP-9: Domain Lexicons | MEDIUM | HIGH | Retrieval quality |
| GAP-10: Compare Patterns | MEDIUM | LOW | 18 queries affected |
| GAP-5: Typos | MEDIUM | LOW | Robustness |
| GAP-6: Anchors | MEDIUM | LOW | Slide/page queries |
| GAP-11: Edit History | HIGH | HIGH | Requires infrastructure |
| GAP-12: Multi-pass | LOW | LOW | 3 queries |

---

## Implementation Order

### Phase A: Critical Routing (Week 1)
1. Generate analytics_metrics triggers (GAP-1)
2. Generate all negative blockers (GAP-7)
3. Generate folder_ops triggers (GAP-2)

### Phase B: Normalizers (Week 2)
1. Time window normalizers (GAP-3)
2. Status/tag normalizers (GAP-4)
3. Typo/diacritics normalizers (GAP-5)

### Phase C: Quality Enhancement (Week 3)
1. Formatting validators (GAP-8)
2. Domain lexicons (GAP-9)
3. Compare patterns (GAP-10)
4. Anchor patterns (GAP-6)

### Phase D: Infrastructure (Parallel)
1. Add tags field to Document model
2. Add lastEditedAt tracking
3. Add DocumentEditLog table
4. Add QueryMetrics logging
