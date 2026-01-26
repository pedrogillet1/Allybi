# Template Coverage Matrix - Final Analysis

**Generated:** 2026-01-18 17:00
**Auditor:** Claude PHASE A
**Target:** ≥5 templates per (intent × operator × output shape × language)

---

## Executive Summary

| Category | EN | PT | ES | Status |
|----------|----|----|-----|--------|
| answer_styles | 6 | 6 | 6 | **CRITICAL GAP** |
| file_actions_microcopy | 6 | 6 | 6 | **CRITICAL GAP** |
| clarify_templates | 5 | 5 | 5 | **CRITICAL GAP** |
| error_templates | 5 | 5 | 5 | **CRITICAL GAP** |
| navigation_answers | ~20* | ~20* | ~20* | OK (structured) |
| pdf_answers | 47 | 58 | 47 | OK |
| excel_answers | 26 | 27 | 27 | OK |
| docx_answers | 26 | 33 | 26 | OK |
| pptx_answers | 23 | 23 | 23 | OK |
| shared_answers | 36 | 47 | 36 | OK |

*navigation_answers uses structured template objects, not string templates

---

## Critical Gaps Identified

### 1. answer_styles (6 per language → need 30+)

Current templates:
- definition (1)
- summary (1)
- extraction (1)
- comparison (1)
- list (1)
- count (1)

**Missing for ChatGPT-feel:**
- paragraph variants (5+ needed)
- bullet short variants (5+ needed)
- bullet long variants (5+ needed)
- numbered steps variants (5+ needed)
- table variants (5+ needed)

**Gap:** 24+ templates needed per language

### 2. file_actions_microcopy (6 per language → need 30+)

Current templates:
- list (1)
- filter (1)
- locate (1)
- not_found (1)
- disambiguate (1)
- count (1)

**Missing for ChatGPT-feel:**
- open variants (5+ needed)
- show_file variants (5+ needed)
- multiple_match variants (5+ needed)
- folder_contents variants (5+ needed)
- recent_files variants (3+ needed)

**Gap:** 23+ templates needed per language

### 3. clarify_templates (5 per language → need 20+)

**Missing:**
- ambiguous_query variants (5+)
- missing_context variants (5+)
- multiple_options variants (5+)
- confirm_action variants (5+)

**Gap:** 15+ templates needed per language

### 4. error_templates (5 per language → need 20+)

**Missing:**
- file_not_found variants (5+)
- permission_denied variants (3+)
- processing_error variants (3+)
- timeout variants (3+)
- generic_error variants (3+)

**Gap:** 15+ templates needed per language

---

## Coverage Matrix by Intent Family

### documents (summarize, extract, explain, compare)

| Operator | Shape | EN | PT | ES | Target | Status |
|----------|-------|----|----|-----|--------|--------|
| summarize | paragraph | 4 | 4 | 4 | 5 | ❌ -1 |
| summarize | bullets | 3 | 3 | 3 | 5 | ❌ -2 |
| extract | paragraph | 4 | 5 | 4 | 5 | ⚠️ |
| extract | bullets | 2 | 2 | 2 | 5 | ❌ -3 |
| explain | paragraph | 3 | 3 | 3 | 5 | ❌ -2 |
| compare | table | 2 | 2 | 2 | 5 | ❌ -3 |
| compare | bullets | 2 | 2 | 2 | 5 | ❌ -3 |

### file_actions (open, list, locate, filter, disambiguate)

| Operator | Shape | EN | PT | ES | Target | Status |
|----------|-------|----|----|-----|--------|--------|
| open | button-only | 1 | 1 | 1 | 5 | ❌ -4 |
| locate | button+text | 1 | 1 | 1 | 5 | ❌ -4 |
| list | file_list | 1 | 1 | 1 | 5 | ❌ -4 |
| filter | file_list | 1 | 1 | 1 | 5 | ❌ -4 |
| disambiguate | buttons | 1 | 1 | 1 | 5 | ❌ -4 |
| count | paragraph | 1 | 1 | 1 | 5 | ❌ -4 |

### navigation (breadcrumb, folder, tree)

| Operator | Shape | EN | PT | ES | Target | Status |
|----------|-------|----|----|-----|--------|--------|
| show_path | breadcrumb | 2 | 2 | 2 | 5 | ❌ -3 |
| list_folder | file_list | 2 | 2 | 2 | 5 | ❌ -3 |
| show_tree | tree | 2 | 2 | 2 | 5 | ❌ -3 |
| go_up | file_list | 1 | 1 | 1 | 5 | ❌ -4 |
| filter_context | file_list | 1 | 1 | 1 | 5 | ❌ -4 |

### excel/finance (compute, lookup, aggregate)

| Operator | Shape | EN | PT | ES | Target | Status |
|----------|-------|----|----|-----|--------|--------|
| compute | paragraph | 4 | 4 | 4 | 5 | ⚠️ -1 |
| compute | steps | 3 | 3 | 3 | 5 | ❌ -2 |
| lookup | paragraph | 4 | 4 | 4 | 5 | ⚠️ -1 |
| aggregate | table | 4 | 4 | 4 | 5 | ⚠️ -1 |
| aggregate | bullets | 3 | 3 | 3 | 5 | ❌ -2 |

### help/error/clarify

| Operator | Shape | EN | PT | ES | Target | Status |
|----------|-------|----|----|-----|--------|--------|
| help | paragraph | 2 | 2 | 2 | 5 | ❌ -3 |
| error | paragraph | 5 | 5 | 5 | 5 | ✅ |
| clarify | paragraph | 5 | 5 | 5 | 5 | ✅ |

---

## Required Template Generation

### Priority 1: file_actions_microcopy (CRITICAL for ChatGPT-feel)

**Current:** 6 templates per language
**Target:** 30 templates per language
**Gap:** 24 templates × 3 languages = **72 templates to generate**

Templates needed:
```
open:
  - "Opening {filename}..."
  - "Here you go:"
  - "Opening now."
  - "{filename} is ready."
  - "Here it is:"

locate:
  - "{filename} is in {folder}."
  - "Found it in {folder}."
  - "It's in {folder}:"
  - "Located in {folder}."
  - "Here's where it is:"

list:
  - "Here are your files:"
  - "Your documents:"
  - "Files in your library:"
  - "{count} files found:"
  - "Showing your files:"

filter:
  - "Here are your {type} files:"
  - "{count} {type} files:"
  - "Filtered to {type}:"
  - "Showing only {type}:"
  - "{type} documents:"

disambiguate:
  - "Which one did you mean?"
  - "I found {count} matches. Select one:"
  - "Multiple files match. Choose:"
  - "Several options. Pick one:"
  - "Did you mean one of these?"

count:
  - "You have {count} files."
  - "{count} documents in your library."
  - "There are {count} files."
  - "{count} total."
  - "Your file count: {count}"
```

### Priority 2: answer_styles (CRITICAL for variety)

**Current:** 6 templates per language
**Target:** 30 templates per language
**Gap:** 24 templates × 3 languages = **72 templates to generate**

Templates needed per style:
- definition: 5 variants
- summary: 5 variants
- extraction: 5 variants
- comparison: 5 variants
- list: 5 variants
- count: 5 variants

### Priority 3: Navigation (button-only consistency)

**Current:** ~20 structured templates per language
**Target:** 5 variants per operator
**Gap:** ~15 templates × 3 languages = **45 templates to generate**

---

## Action Required

1. **Generate 72 file_actions_microcopy templates** (24 per language)
2. **Generate 72 answer_styles templates** (24 per language)
3. **Generate 45 navigation templates** (15 per language)
4. **Generate 45 clarify/error templates** (15 per language)

**Total Generation Required:** ~234 templates

---

## Conclusion

**PHASE A STATUS: GAP IDENTIFIED**

Template coverage is insufficient for ChatGPT-feel due to:
1. Low variety in file_actions responses (causes robotic repetition)
2. Low variety in answer styles (causes generic phrasing)
3. Limited navigation template variants (causes UI inconsistency)

Next step: Generate missing templates to reach ≥5 per cell.
