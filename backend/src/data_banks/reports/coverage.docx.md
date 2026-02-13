# DOCX Intent Pattern Coverage Report

**Generated:** 2026-02-12
**Pattern banks:** docx.en.any.json (47 patterns), docx.pt.any.json (48 patterns)
**Operator catalog:** 25 DOCX operators

## Operator Coverage: 24/25 (96%)

| Operator | Pattern(s) | Status |
|----------|-----------|--------|
| DOCX_REWRITE_PARAGRAPH | docx.rewrite.paragraph, .formal, .concise, .expand, .casual, .friendly, .correct_grammar, .instructions | Covered |
| DOCX_REPLACE_SPAN | docx.replace.span | Covered |
| DOCX_REWRITE_SECTION | docx.rewrite.section | Covered |
| DOCX_INSERT_AFTER | docx.insert.after | Covered |
| DOCX_INSERT_BEFORE | docx.insert.before | Covered |
| DOCX_DELETE_PARAGRAPH | docx.delete.paragraph | Covered |
| DOCX_MERGE_PARAGRAPHS | docx.merge.paragraphs | Covered |
| DOCX_SPLIT_PARAGRAPH | docx.split.paragraph | Covered |
| DOCX_SET_RUN_STYLE | docx.format.bold, .italic, .underline, .color, .font, .font_size, .remove_bold, .remove_italic, .remove_underline | Covered |
| DOCX_CLEAR_RUN_STYLE | docx.format.clear | Covered |
| DOCX_SET_PARAGRAPH_STYLE | docx.style.set, docx.heading.set, docx.heading.normal | Covered |
| DOCX_SET_ALIGNMENT | docx.align.center, .left, .right, .justify | Covered |
| DOCX_SET_INDENTATION | docx.format.indent | Covered |
| DOCX_SET_LINE_SPACING | docx.spacing.line | Covered |
| DOCX_SET_PARAGRAPH_SPACING | docx.spacing.paragraph | Covered |
| DOCX_LIST_APPLY_BULLETS | docx.list.bullets | Covered |
| DOCX_LIST_APPLY_NUMBERING | docx.list.numbering | Covered |
| DOCX_LIST_REMOVE | docx.list.remove, docx.list.convert_to_paragraphs | Covered |
| DOCX_LIST_PROMOTE_DEMOTE | docx.list.promote | Covered |
| DOCX_TRANSLATE_SCOPE | docx.translate.section, .document | Covered |
| DOCX_FIND_REPLACE | docx.find_replace, .find_replace.case_sensitive | Covered |
| DOCX_ENRICH_FROM_SOURCES | docx.enrich.sources | Covered |
| DOCX_SET_HEADING_LEVEL | (via DOCX_SET_PARAGRAPH_STYLE) | Indirect |
| DOCX_LIST_RESTART_NUMBERING | docx.list.restart_numbering | Covered |
| DOCX_NUMBERING_REPAIR | docx.numbering.repair | Covered |

## Uncovered Operators

- **DOCX_SET_HEADING_LEVEL**: Not directly referenced; heading levels are set via `DOCX_SET_PARAGRAPH_STYLE` with `"Heading N"` style names. This is architecturally correct since Word heading levels are paragraph styles.

## EN/PT Parity

- EN: 47 patterns
- PT: 48 patterns (includes both `docx.rewrite.informal` and `docx.rewrite.casual` as Portuguese synonyms)
- Operator coverage is identical across both languages.

## Pattern Distribution by Category

| Category | EN | PT |
|----------|----|----|
| Rewrite (paragraph/formal/concise/expand/casual/friendly/grammar/instructions) | 8 | 10 |
| Replace/find-replace | 3 | 3 |
| Translation | 2 | 2 |
| Character formatting (bold/italic/underline/color/font/size) | 6 | 6 |
| Remove formatting (remove bold/italic/underline) | 3 | 3 |
| Clear formatting | 1 | 1 |
| Alignment | 4 | 4 |
| Spacing (line/paragraph) | 2 | 2 |
| Indentation | 1 | 1 |
| Lists (bullets/numbering/remove/promote/convert) | 5 | 5 |
| List numbering (restart/repair) | 2 | 2 |
| Headings (set/normal) | 2 | 2 |
| Structural (insert/delete/merge/split) | 4 | 4 |
| Style set | 1 | 1 |
| Enrich from sources | 1 | 1 |
| **Total** | **47** | **48** |

## Critical Behavior Rules

### Format vs Rewrite Separation
All formatting patterns (bold, italic, underline, color, font, size, alignment, spacing) route to formatting operators only. They include negative examples that prevent false routing to rewrite operators.

Example: "make bold" → `DOCX_SET_RUN_STYLE` (NOT `DOCX_REWRITE_PARAGRAPH`)

### Editor Mode Lock
Patterns only match DOCX operators. Connector/email/slack intents are blocked in editor mode by the runtime's mode gate (Step 0 in pipeline).

### List Structure Preservation
List operations use dedicated operators (`DOCX_LIST_APPLY_BULLETS`, `DOCX_LIST_APPLY_NUMBERING`, `DOCX_LIST_REMOVE`, `DOCX_LIST_PROMOTE_DEMOTE`) and never route through text rewrite. This preserves Word's internal numbering templates.

## Known Collision Risks

| Pattern A | Pattern B | Risk | Resolution |
|-----------|-----------|------|-----------|
| docx.format.bold | docx.format.remove_bold | Low | "remove"/"clear" tokens disambiguate |
| docx.rewrite.paragraph | docx.rewrite.formal | Low | "formal" token required for formal variant |
| docx.rewrite.concise | docx.rewrite.paragraph | Medium | Priority: concise=82 > paragraph=75 |
| docx.rewrite.casual | docx.rewrite.friendly | Low | "casual"/"informal" vs "friendly"/"warm" tokens distinct |
| docx.heading.set | docx.style.set | Medium | Heading regex requires "heading" + level number |
| docx.list.remove | docx.list.convert_to_paragraphs | Low | Convert pattern requires "convert"/"turn into" + "paragraphs" |
| docx.translate.section | docx.translate.document | Low | Document pattern requires "document"/"entire"/"whole" |

## Parser Coverage

| Parser | Status |
|--------|--------|
| LOCATOR_TEXT | Supports quoted text, "titled X", heading references |
| HEADING_LEVEL | Dictionary: "heading 1"–"heading 6" + "h1"–"h6" in EN/PT |
| COLOR | Dictionary: 50+ EN colors, 50+ PT colors with hex codes |
| FONT_FAMILY | Dictionary: 30+ font families with aliases |
| FONT_SIZE | Regex: 1–400pt/px/points |
| LANGUAGE | Supports 6 languages (en/pt/es/fr/de/it) |
| ALIGNMENT | Supports center/left/right/justify in EN/PT |

## Spec Compliance

- [x] Selection-first rule (scopeRules on all patterns)
- [x] Multi-intent segmentation
- [x] Clarification prompts for missing slots
- [x] Positive + negative examples on all patterns
- [x] Priority-based collision resolution
- [x] Format vs rewrite separation enforced
- [x] List structure operations (not text-based)
- [x] Heading numbering repair operator
- [x] Cross-document enrichment pattern
- [x] Editor mode lock (no connector leakage)
