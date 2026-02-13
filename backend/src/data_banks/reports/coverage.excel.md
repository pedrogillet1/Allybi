# Excel Intent Pattern Coverage Report

**Generated:** 2026-02-12
**Pattern banks:** excel.en.any.json (51 patterns), excel.pt.any.json (51 patterns)
**Operator catalog:** 36 Excel operators

## Operator Coverage: 36/36 (100%)

| Operator | Pattern(s) | Status |
|----------|-----------|--------|
| XLSX_SET_CELL_VALUE | excel.set_value.single | Covered |
| XLSX_SET_RANGE_VALUES | excel.set_value.range, excel.set_value.numeric_convert, excel.fill_blank_cells | Covered |
| XLSX_SET_CELL_FORMULA | excel.formula.single | Covered |
| XLSX_SET_RANGE_FORMULAS | excel.formula.range | Covered |
| XLSX_FILL_DOWN | excel.fill_down | Covered |
| XLSX_FILL_RIGHT | excel.fill_right | Covered |
| XLSX_FILL_SERIES | excel.fill_series | Covered |
| XLSX_FORMAT_RANGE | excel.format.bold, .italic, .underline, .color, .font | Covered |
| XLSX_SET_NUMBER_FORMAT | excel.format.number_format, .custom_number_format | Covered |
| XLSX_MERGE_CELLS | excel.merge_cells | Covered |
| XLSX_WRAP_TEXT | excel.wrap_text | Covered |
| XLSX_AUTO_FIT | excel.auto_fit | Covered |
| XLSX_COND_FORMAT_DATA_BARS | excel.cond_format.data_bars | Covered |
| XLSX_COND_FORMAT_COLOR_SCALE | excel.cond_format.color_scale | Covered |
| XLSX_COND_FORMAT_TOP_N | excel.cond_format.top_n | Covered |
| XLSX_SORT_RANGE | excel.sort.single_key | Covered |
| XLSX_FILTER_APPLY | excel.filter.apply | Covered |
| XLSX_FILTER_CLEAR | excel.filter.clear | Covered |
| XLSX_TABLE_CREATE | excel.table.create | Covered |
| XLSX_DATA_VALIDATION_SET | excel.data_validation | Covered |
| XLSX_FREEZE_PANES | excel.freeze_panes | Covered |
| XLSX_HIDE_ROWS_COLS | excel.hide_rows, .hide_columns | Covered |
| XLSX_SHOW_ROWS_COLS | excel.show_rows, .show_columns | Covered |
| XLSX_CHART_CREATE | excel.chart.create, .chart.create_specific | Covered |
| XLSX_CHART_SET_SERIES | excel.chart.set_series | Covered |
| XLSX_CHART_SET_TITLES | excel.chart.set_titles | Covered |
| XLSX_CHART_SET_AXES | excel.chart.set_axes | Covered |
| XLSX_CHART_DELETE | excel.chart.delete | Covered |
| XLSX_INSERT_ROWS | excel.insert_rows | Covered |
| XLSX_DELETE_ROWS | excel.delete_rows | Covered |
| XLSX_INSERT_COLUMNS | excel.insert_columns | Covered |
| XLSX_DELETE_COLUMNS | excel.delete_columns | Covered |
| XLSX_ADD_SHEET | excel.add_sheet | Covered |
| XLSX_RENAME_SHEET | excel.rename_sheet | Covered |
| XLSX_DELETE_SHEET | excel.delete_sheet | Covered |
| XLSX_AGGREGATION | excel.aggregation.sum, .average, .count, .max, .min | Covered |

## Uncovered Operators

None.

## EN/PT Parity

Both EN and PT have 51 patterns with identical operator coverage.

## Pattern Distribution by Category

| Category | Patterns |
|----------|---------|
| Set value | 3 |
| Formula | 2 |
| Fill (down/right/series) | 3 |
| Formatting (bold/italic/underline/color/font) | 5 |
| Number format | 2 |
| Sort/filter | 3 |
| Table | 1 |
| Chart | 6 |
| Conditional formatting | 3 |
| Data validation | 1 |
| Freeze panes | 1 |
| Merge/wrap/auto-fit | 3 |
| Insert/delete rows/cols | 4 |
| Sheet operations | 3 |
| Hide/show | 4 |
| Aggregation | 5 |
| Fill blank cells | 1 |
| Fill series | 1 |
| **Total** | **51** |

## Known Collision Risks

| Pattern A | Pattern B | Risk | Resolution |
|-----------|-----------|------|-----------|
| excel.format.bold | excel.set_value.single | Low | "bold" token not in set_value triggers; negative examples prevent |
| excel.fill_down | excel.fill_series | Low | "fill down" vs "fill series" regexes are distinct |
| excel.chart.create | excel.chart.create_specific | Medium | Specific has higher priority (82 vs 78); specific type token required |
| excel.aggregation.* | excel.formula.single | Low | Aggregation patterns require function keyword (sum/average/etc.) |

## Parser Coverage

| Parser | Status |
|--------|--------|
| A1_RANGE | Supports Sheet!Range, bare range, multi-range |
| SHEET_NAME | Supports quoted and unquoted names with spaces |
| NUMBER_OR_TEXT | Supports locale-aware number parsing |
| COLOR | Dictionary: 50+ EN colors, 50+ PT colors |
| FONT_FAMILY | Dictionary: 30+ font families with aliases |
| CHART_TYPE | Dictionary: 22 EN types, 22 PT types |
| FORMULA | Supports =FUNCTION() syntax, PT→EN translation |
| FORMAT_PATTERN | Dictionary: 20+ named formats + explicit codes |
| SORT_SPEC | Supports "by column X" ascending/descending |

## Spec Compliance

- [x] Selection-first rule (scopeRules on all patterns)
- [x] Explicit range override (allowScopeOverrideByExplicitRange)
- [x] Multi-intent segmentation (connectors: and/then/also)
- [x] Clarification prompts for missing required slots
- [x] Positive + negative examples on all patterns
- [x] Priority-based collision resolution
- [x] PT formula translation (SOMA→SUM, PROCV→VLOOKUP, etc.)
- [x] Locale number parsing (1.000,50 vs 1,000.50)
