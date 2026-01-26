# Koda Data Banks Catalog

**Generated:** 2026-01-18 16:14:46
**Source:** `/Users/pg/Desktop/koda-webapp/backend/src/data_banks/`

---

## Executive Summary

| Metric | Value |
|--------|-------|
| **Total Bank Files** | 457 |
| **Total Patterns/Entries** | 52,817 |
| **Categories** | 12 |
| **Languages** | EN (154), PT (154), ES (59), Unknown (90) |

---

## Totals by Category

| Category | Files | Patterns | % of Total |
|----------|-------|----------|------------|
| triggers | 227 | 32,076 | 60.7% |
| negatives | 68 | 5,162 | 9.8% |
| lexicons | 38 | 4,729 | 9.0% |
| root | 1 | 3,388 | 6.4% |
| overlays | 35 | 2,173 | 4.1% |
| formatting | 23 | 1,687 | 3.2% |
| normalizers | 21 | 1,511 | 2.9% |
| templates | 32 | 767 | 1.5% |
| signals | 5 | 510 | 1.0% |
| rules | 3 | 384 | 0.7% |
| manifests | 1 | 251 | 0.5% |
| aliases | 3 | 179 | 0.3% |

---

## Totals by Language

| Language | Files | % |
|----------|-------|---|
| English (en) | 154 | 33.7% |
| Portuguese (pt) | 154 | 33.7% |
| Spanish (es) | 59 | 12.9% |
| Unknown/Shared | 90 | 19.7% |

### Language Parity Analysis
- **EN/PT parity:** Strong - 154 files each
- **ES coverage:** Partial - 59 files (38% of EN/PT count)
- **Gap:** ES needs ~95 more files for full parity

---

## Top 10 Largest Banks

| Rank | Bank | Entries | Category |
|------|------|---------|----------|
| 1 | pattern_bank.runtime.json | 3,388 | root |
| 2 | content_location.pt.json | 1,722 | triggers |
| 3 | content_location.en.json | 1,670 | triggers |
| 4 | content_location.es.json | 1,482 | triggers |
| 5 | excel_subintents.en.json | 1,111 | triggers |
| 6 | excel_subintents.pt.json | 1,103 | triggers |
| 7 | excel_subintents.es.json | 1,062 | triggers |
| 8 | navigation.pt.json | 457 | lexicons |
| 9 | finance_accounting.json | 450 | lexicons |
| 10 | marketing_service_quality.json | 450 | lexicons |

---

## What's Currently Wired vs Unused

### Wired (Active in Runtime)
Based on manifest and code inspection:
- `triggers/` - All files loaded by BrainDataLoaderService
- `negatives/` - Loaded for intent dampening
- `overlays/` - Loaded for format/followup/clarify detection
- `normalizers/` - Loaded for query preprocessing
- `lexicons/` - Loaded for domain term detection
- `templates/` - Loaded for answer composition

### Present but Potentially Unused
- `root/pattern_bank.runtime.json` - Legacy bank (3,388 entries) - may overlap with structured banks
- `signals/` directory - 5 files, 510 patterns - may be superseded by overlays
- `rules/` directory - 3 files, 384 patterns - formatting triggers may be superseded

### Missing Files Indicated by Manifest
See `MISSING_VS_TARGET.md` for detailed gap analysis.

---

## Key Findings

1. **Trigger banks dominate** - 60.7% of all patterns are routing triggers
2. **ES language gap** - Only 38% ES coverage vs EN/PT
3. **Legacy overlap** - `pattern_bank.runtime.json` may contain duplicate patterns
4. **Navigation banks complete** - Full EN/PT/ES coverage for navigation operators
5. **Format-specific banks strong** - PDF/PPTX/DOCX/Excel all have EN/PT/ES templates

---

## Files in This Catalog

| File | Description |
|------|-------------|
| `README.md` | This summary |
| `BANK_INDEX.md` | Complete file listing by category |
| `COUNTS_BY_BANK.json` | Machine-readable counts |
| `PARITY_REPORT.md` | EN/PT/ES parity analysis |
| `WIRING_REPORT.md` | What's loaded at runtime |
| `COVERAGE_MAP.md` | Banks → capabilities mapping |
| `MISSING_VS_TARGET.md` | Gap analysis vs plan targets |
