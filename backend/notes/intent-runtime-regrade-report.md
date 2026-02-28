# Intent Patterns + Runtime Regrade Report

Date: 2026-02-28

## Executive Summary
- Intent patterns overall: **8.8/10**
- Runtime overall: **9.3/10**
- Blocker to 10/10 intent patterns: DOCX banks missing deterministic conflict metadata on all intents.

## backend/src/data_banks/intent_patterns/docx.en.any.json
- patterns: 62
- average intent score (10-point rubric): 4.97
- intents below 10/10: 62
- top issue counts: missing_disambiguation_group=62, missing_mutual_exclusion=62, missing_score_adjustments=62, missing_token_triggers=39, missing_tokens_none=26, missing_clarify_if_missing=24, missing_regex_triggers=2, weak_tokens_none=1

### Intents below 10/10
- docx.page_break | score=2.7 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_tokens_none,missing_regex_triggers,missing_clarify_if_missing
- docx.section_break | score=2.7 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_tokens_none,missing_regex_triggers,missing_clarify_if_missing
- docx.toc.update | score=2.7 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_tokens_none,missing_token_triggers,missing_clarify_if_missing
- docx.heading.style_apply | score=3.2 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_tokens_none,missing_token_triggers,missing_clarify_if_missing
- docx.numbering.repair | score=3.2 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_tokens_none,missing_token_triggers,missing_clarify_if_missing
- docx.spacing.line | score=3.2 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_tokens_none,missing_token_triggers,missing_clarify_if_missing
- docx.spacing.paragraph | score=3.2 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_tokens_none,missing_token_triggers,missing_clarify_if_missing
- docx.toc.insert | score=3.2 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_tokens_none,missing_token_triggers,missing_clarify_if_missing
- docx.align.left | score=3.5 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_tokens_none,missing_token_triggers
- docx.align.right | score=3.5 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_tokens_none,missing_token_triggers
- docx.case.sentence | score=3.5 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_tokens_none,missing_token_triggers
- docx.find_replace.case_sensitive | score=3.5 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_tokens_none,missing_token_triggers
- docx.replace.span | score=3.5 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_tokens_none,missing_token_triggers
- docx.enrich.sources | score=4 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_tokens_none,missing_token_triggers
- docx.heading.normal | score=4 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_tokens_none,missing_token_triggers
- docx.heading.set | score=4 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_tokens_none,missing_token_triggers
- docx.style.set | score=4 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_tokens_none,missing_token_triggers
- docx.translate.document | score=4 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_tokens_none,missing_token_triggers
- docx.translate.section | score=4 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_tokens_none,missing_token_triggers
- docx.format.indent | score=4.2 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_tokens_none,missing_clarify_if_missing
- docx.list.promote | score=4.7 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_token_triggers,missing_clarify_if_missing
- docx.rewrite.friendly | score=4.7 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_token_triggers,missing_clarify_if_missing
- docx.align.center | score=5 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_tokens_none
- docx.align.justify | score=5 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_tokens_none
- docx.case.lower | score=5 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_tokens_none
- docx.case.title | score=5 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_tokens_none
- docx.case.upper | score=5 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_tokens_none
- docx.find_replace | score=5 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_tokens_none
- docx.list.bullets_to_numbered | score=5 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_token_triggers
- docx.list.numbered_to_bullets | score=5 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_token_triggers
- docx.summarize.to_bullets | score=5 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,weak_tokens_none,missing_token_triggers
- docx.delete.paragraph | score=5.2 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_token_triggers,missing_clarify_if_missing
- docx.insert.after | score=5.2 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_token_triggers,missing_clarify_if_missing
- docx.insert.before | score=5.2 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_token_triggers,missing_clarify_if_missing
- docx.rewrite.casual | score=5.2 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_token_triggers,missing_clarify_if_missing
- docx.rewrite.formal | score=5.2 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_token_triggers,missing_clarify_if_missing
- docx.rewrite.instructions | score=5.2 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_token_triggers,missing_clarify_if_missing
- docx.rewrite.section | score=5.2 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_token_triggers,missing_clarify_if_missing
- docx.split.paragraph | score=5.2 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_token_triggers,missing_clarify_if_missing
- docx.format.remove_bold | score=5.5 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_token_triggers
- docx.format.remove_italic | score=5.5 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_token_triggers
- docx.format.remove_underline | score=5.5 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_token_triggers
- docx.list.bullets_to_paragraph | score=5.5 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_token_triggers
- docx.list.convert_to_paragraphs | score=5.5 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_token_triggers
- docx.list.remove | score=5.5 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_token_triggers
- docx.list.restart_numbering | score=5.5 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_token_triggers
- docx.section.remove | score=5.7 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_clarify_if_missing
- docx.format.clear | score=6 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_token_triggers
- docx.merge.paragraphs | score=6 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_token_triggers
- docx.rewrite.concise | score=6.2 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_clarify_if_missing
- docx.rewrite.correct_grammar | score=6.2 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_clarify_if_missing
- docx.rewrite.expand | score=6.2 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_clarify_if_missing
- docx.rewrite.paragraph | score=6.2 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_clarify_if_missing
- docx.list.bullets | score=6.5 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments
- docx.list.numbering | score=6.5 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments
- docx.list.paragraph_to_bullets | score=6.5 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments
- docx.format.bold | score=7 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments
- docx.format.color | score=7 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments
- docx.format.font | score=7 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments
- docx.format.font_size | score=7 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments
- docx.format.italic | score=7 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments
- docx.format.underline | score=7 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments

## backend/src/data_banks/intent_patterns/docx.pt.any.json
- patterns: 63
- average intent score (10-point rubric): 5.76
- intents below 10/10: 63
- top issue counts: missing_disambiguation_group=63, missing_mutual_exclusion=63, missing_score_adjustments=63, missing_token_triggers=33, missing_clarify_if_missing=25, missing_tokens_none=3, missing_regex_triggers=2, low_positive_examples=1, weak_tokens_none=1

### Intents below 10/10
- docx.list.convert_to_paragraphs | score=2.7 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_tokens_none,missing_token_triggers,missing_clarify_if_missing
- docx.page_break | score=2.7 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_tokens_none,missing_regex_triggers,missing_clarify_if_missing
- docx.section_break | score=2.7 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_tokens_none,missing_regex_triggers,missing_clarify_if_missing
- docx.enrich.sources | score=4.7 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_token_triggers,missing_clarify_if_missing
- docx.heading.style_apply | score=4.7 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_token_triggers,missing_clarify_if_missing
- docx.rewrite.friendly | score=4.7 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_token_triggers,missing_clarify_if_missing
- docx.rewrite.instructions | score=4.7 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_token_triggers,missing_clarify_if_missing
- docx.spacing.paragraph | score=4.7 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_token_triggers,missing_clarify_if_missing
- docx.toc.update | score=4.7 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_token_triggers,missing_clarify_if_missing
- docx.case.sentence | score=5 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_token_triggers,low_positive_examples
- docx.summarize.to_bullets | score=5 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,weak_tokens_none,missing_token_triggers
- docx.delete.paragraph | score=5.2 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_token_triggers,missing_clarify_if_missing
- docx.list.promote | score=5.2 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_token_triggers,missing_clarify_if_missing
- docx.numbering.repair | score=5.2 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_token_triggers,missing_clarify_if_missing
- docx.rewrite.casual | score=5.2 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_token_triggers,missing_clarify_if_missing
- docx.rewrite.informal | score=5.2 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_token_triggers,missing_clarify_if_missing
- docx.toc.insert | score=5.2 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_token_triggers,missing_clarify_if_missing
- docx.align.left | score=5.5 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_token_triggers
- docx.align.right | score=5.5 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_token_triggers
- docx.case.title | score=5.5 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_token_triggers
- docx.find_replace.case_sensitive | score=5.5 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_token_triggers
- docx.format.remove_bold | score=5.5 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_token_triggers
- docx.format.remove_italic | score=5.5 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_token_triggers
- docx.format.remove_underline | score=5.5 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_token_triggers
- docx.heading.normal | score=5.5 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_token_triggers
- docx.list.bullets_to_numbered | score=5.5 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_token_triggers
- docx.list.bullets_to_paragraph | score=5.5 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_token_triggers
- docx.list.numbered_to_bullets | score=5.5 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_token_triggers
- docx.list.restart_numbering | score=5.5 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_token_triggers
- docx.translate.document | score=5.5 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_token_triggers
- docx.heading.set | score=5.7 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_clarify_if_missing
- docx.section.remove | score=5.7 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_clarify_if_missing
- docx.split.paragraph | score=5.7 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_clarify_if_missing
- docx.format.clear | score=6 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_token_triggers
- docx.insert.after | score=6 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_token_triggers
- docx.insert.before | score=6 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_token_triggers
- docx.list.remove | score=6 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_token_triggers
- docx.spacing.line | score=6 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_token_triggers
- docx.format.indent | score=6.2 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_clarify_if_missing
- docx.rewrite.concise | score=6.2 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_clarify_if_missing
- docx.rewrite.correct_grammar | score=6.2 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_clarify_if_missing
- docx.rewrite.expand | score=6.2 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_clarify_if_missing
- docx.rewrite.formal | score=6.2 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_clarify_if_missing
- docx.rewrite.paragraph | score=6.2 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_clarify_if_missing
- docx.rewrite.section | score=6.2 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments,missing_clarify_if_missing
- docx.align.justify | score=6.5 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments
- docx.case.lower | score=6.5 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments
- docx.find_replace | score=6.5 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments
- docx.list.paragraph_to_bullets | score=6.5 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments
- docx.translate.section | score=6.5 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments
- docx.align.center | score=7 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments
- docx.case.upper | score=7 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments
- docx.format.bold | score=7 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments
- docx.format.color | score=7 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments
- docx.format.font | score=7 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments
- docx.format.font_size | score=7 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments
- docx.format.italic | score=7 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments
- docx.format.underline | score=7 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments
- docx.list.bullets | score=7 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments
- docx.list.numbering | score=7 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments
- docx.merge.paragraphs | score=7 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments
- docx.replace.span | score=7 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments
- docx.style.set | score=7 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_score_adjustments

## backend/src/data_banks/intent_patterns/excel.en.any.json
- patterns: 56
- average intent score (10-point rubric): 7.39
- intents below 10/10: 53
- top issue counts: missing_clarify_if_missing=45, missing_token_triggers=22, missing_mutual_exclusion=20, missing_disambiguation_group=19, low_positive_examples=16, missing_regex_triggers=5

### Intents below 10/10
- excel.cond_format.data_bars | score=4.7 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_token_triggers,low_positive_examples,missing_clarify_if_missing
- excel.auto_fit | score=5.2 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_token_triggers,missing_clarify_if_missing
- excel.cond_format.color_scale | score=5.2 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_token_triggers,missing_clarify_if_missing
- excel.cond_format.top_n | score=5.2 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_token_triggers,missing_clarify_if_missing
- excel.data_validation | score=5.2 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_token_triggers,missing_clarify_if_missing
- excel.wrap_text | score=5.2 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_token_triggers,missing_clarify_if_missing
- excel.format.italic | score=5.7 | issues=missing_disambiguation_group,missing_mutual_exclusion,low_positive_examples,missing_clarify_if_missing
- excel.format.underline | score=5.7 | issues=missing_disambiguation_group,missing_mutual_exclusion,low_positive_examples,missing_clarify_if_missing
- excel.lock_cells | score=5.7 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_regex_triggers,missing_clarify_if_missing
- excel.merge_cells | score=5.7 | issues=missing_disambiguation_group,missing_mutual_exclusion,low_positive_examples,missing_clarify_if_missing
- excel.trim_whitespace | score=5.7 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_regex_triggers,missing_clarify_if_missing
- excel.format.bold | score=6.2 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_clarify_if_missing
- excel.format.font | score=6.2 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_clarify_if_missing
- excel.remove_duplicates | score=6.2 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_regex_triggers,missing_clarify_if_missing
- excel.normalize_values | score=6.5 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_regex_triggers
- excel.set_protection | score=6.5 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_regex_triggers
- excel.delete_columns | score=6.7 | issues=missing_token_triggers,low_positive_examples,missing_clarify_if_missing
- excel.freeze_panes | score=6.7 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_clarify_if_missing
- excel.hide_columns | score=6.7 | issues=missing_token_triggers,low_positive_examples,missing_clarify_if_missing
- excel.show_columns | score=6.7 | issues=missing_token_triggers,low_positive_examples,missing_clarify_if_missing
- excel.show_rows | score=6.7 | issues=missing_token_triggers,low_positive_examples,missing_clarify_if_missing
- excel.format.color | score=7 | issues=missing_disambiguation_group,missing_mutual_exclusion
- excel.add_sheet | score=7.2 | issues=missing_token_triggers,missing_clarify_if_missing
- excel.chart.create_specific | score=7.2 | issues=missing_token_triggers,missing_clarify_if_missing
- excel.delete_rows | score=7.2 | issues=missing_token_triggers,low_positive_examples,missing_clarify_if_missing
- excel.delete_sheet | score=7.2 | issues=missing_token_triggers,low_positive_examples,missing_clarify_if_missing
- excel.fill_blank_cells | score=7.2 | issues=missing_token_triggers,missing_clarify_if_missing
- excel.format.custom_number_format | score=7.2 | issues=missing_token_triggers,missing_clarify_if_missing
- excel.hide_rows | score=7.2 | issues=missing_token_triggers,low_positive_examples,missing_clarify_if_missing
- excel.insert_columns | score=7.2 | issues=missing_token_triggers,low_positive_examples,missing_clarify_if_missing
- excel.table.create | score=7.2 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_clarify_if_missing
- excel.aggregation.count | score=7.7 | issues=low_positive_examples,missing_clarify_if_missing
- excel.chart.update | score=7.7 | issues=missing_token_triggers,missing_clarify_if_missing
- excel.formula.range | score=7.7 | issues=low_positive_examples,missing_clarify_if_missing
- excel.insert_rows | score=7.7 | issues=missing_token_triggers,missing_clarify_if_missing
- excel.rename_sheet | score=8 | issues=missing_token_triggers,low_positive_examples
- excel.aggregation.average | score=8.2 | issues=missing_clarify_if_missing
- excel.aggregation.max | score=8.2 | issues=missing_clarify_if_missing
- excel.aggregation.min | score=8.2 | issues=missing_clarify_if_missing
- excel.chart.set_axes | score=8.2 | issues=missing_token_triggers,missing_clarify_if_missing
- excel.fill_right | score=8.2 | issues=low_positive_examples,missing_clarify_if_missing
- excel.sort.single_key | score=8.2 | issues=missing_mutual_exclusion,missing_clarify_if_missing
- excel.aggregation.sum | score=8.7 | issues=missing_clarify_if_missing
- excel.fill_down | score=8.7 | issues=missing_clarify_if_missing
- excel.filter.apply | score=8.7 | issues=missing_clarify_if_missing
- excel.filter.clear | score=8.7 | issues=missing_clarify_if_missing
- excel.set_value.numeric_convert | score=8.7 | issues=missing_clarify_if_missing
- excel.chart.create | score=9.2 | issues=missing_clarify_if_missing
- excel.fill_series | score=9.2 | issues=missing_clarify_if_missing
- excel.chart.delete | score=9.5 | issues=
- excel.chart.set_series | score=9.5 | issues=
- excel.chart.set_titles | score=9.5 | issues=
- excel.formula.single | score=9.5 | issues=

## backend/src/data_banks/intent_patterns/excel.pt.any.json
- patterns: 56
- average intent score (10-point rubric): 7.38
- intents below 10/10: 53
- top issue counts: missing_clarify_if_missing=45, missing_token_triggers=22, missing_mutual_exclusion=20, missing_disambiguation_group=19, low_positive_examples=16, missing_regex_triggers=5

### Intents below 10/10
- excel.cond_format.data_bars | score=4.7 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_token_triggers,low_positive_examples,missing_clarify_if_missing
- excel.auto_fit | score=5.2 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_token_triggers,missing_clarify_if_missing
- excel.cond_format.color_scale | score=5.2 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_token_triggers,missing_clarify_if_missing
- excel.cond_format.top_n | score=5.2 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_token_triggers,missing_clarify_if_missing
- excel.data_validation | score=5.2 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_token_triggers,missing_clarify_if_missing
- excel.wrap_text | score=5.2 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_token_triggers,missing_clarify_if_missing
- excel.format.italic | score=5.7 | issues=missing_disambiguation_group,missing_mutual_exclusion,low_positive_examples,missing_clarify_if_missing
- excel.format.underline | score=5.7 | issues=missing_disambiguation_group,missing_mutual_exclusion,low_positive_examples,missing_clarify_if_missing
- excel.lock_cells | score=5.7 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_regex_triggers,missing_clarify_if_missing
- excel.merge_cells | score=5.7 | issues=missing_disambiguation_group,missing_mutual_exclusion,low_positive_examples,missing_clarify_if_missing
- excel.remove_duplicates | score=5.7 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_regex_triggers,missing_clarify_if_missing
- excel.trim_whitespace | score=5.7 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_regex_triggers,missing_clarify_if_missing
- excel.format.bold | score=6.2 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_clarify_if_missing
- excel.format.font | score=6.2 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_clarify_if_missing
- excel.normalize_values | score=6.5 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_regex_triggers
- excel.set_protection | score=6.5 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_regex_triggers
- excel.delete_columns | score=6.7 | issues=missing_token_triggers,low_positive_examples,missing_clarify_if_missing
- excel.freeze_panes | score=6.7 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_clarify_if_missing
- excel.hide_columns | score=6.7 | issues=missing_token_triggers,low_positive_examples,missing_clarify_if_missing
- excel.show_columns | score=6.7 | issues=missing_token_triggers,low_positive_examples,missing_clarify_if_missing
- excel.show_rows | score=6.7 | issues=missing_token_triggers,low_positive_examples,missing_clarify_if_missing
- excel.format.color | score=7 | issues=missing_disambiguation_group,missing_mutual_exclusion
- excel.add_sheet | score=7.2 | issues=missing_token_triggers,missing_clarify_if_missing
- excel.chart.create_specific | score=7.2 | issues=missing_token_triggers,missing_clarify_if_missing
- excel.delete_rows | score=7.2 | issues=missing_token_triggers,low_positive_examples,missing_clarify_if_missing
- excel.delete_sheet | score=7.2 | issues=missing_token_triggers,low_positive_examples,missing_clarify_if_missing
- excel.fill_blank_cells | score=7.2 | issues=missing_token_triggers,missing_clarify_if_missing
- excel.format.custom_number_format | score=7.2 | issues=missing_token_triggers,missing_clarify_if_missing
- excel.hide_rows | score=7.2 | issues=missing_token_triggers,low_positive_examples,missing_clarify_if_missing
- excel.insert_columns | score=7.2 | issues=missing_token_triggers,low_positive_examples,missing_clarify_if_missing
- excel.table.create | score=7.2 | issues=missing_disambiguation_group,missing_mutual_exclusion,missing_clarify_if_missing
- excel.aggregation.count | score=7.7 | issues=low_positive_examples,missing_clarify_if_missing
- excel.chart.update | score=7.7 | issues=missing_token_triggers,missing_clarify_if_missing
- excel.formula.range | score=7.7 | issues=low_positive_examples,missing_clarify_if_missing
- excel.insert_rows | score=7.7 | issues=missing_token_triggers,missing_clarify_if_missing
- excel.rename_sheet | score=8 | issues=missing_token_triggers,low_positive_examples
- excel.aggregation.average | score=8.2 | issues=missing_clarify_if_missing
- excel.aggregation.max | score=8.2 | issues=missing_clarify_if_missing
- excel.aggregation.min | score=8.2 | issues=missing_clarify_if_missing
- excel.chart.set_axes | score=8.2 | issues=missing_token_triggers,missing_clarify_if_missing
- excel.fill_right | score=8.2 | issues=low_positive_examples,missing_clarify_if_missing
- excel.sort.single_key | score=8.2 | issues=missing_mutual_exclusion,missing_clarify_if_missing
- excel.aggregation.sum | score=8.7 | issues=missing_clarify_if_missing
- excel.fill_down | score=8.7 | issues=missing_clarify_if_missing
- excel.filter.apply | score=8.7 | issues=missing_clarify_if_missing
- excel.filter.clear | score=8.7 | issues=missing_clarify_if_missing
- excel.set_value.numeric_convert | score=8.7 | issues=missing_clarify_if_missing
- excel.chart.create | score=9.2 | issues=missing_clarify_if_missing
- excel.fill_series | score=9.2 | issues=missing_clarify_if_missing
- excel.chart.delete | score=9.5 | issues=
- excel.chart.set_series | score=9.5 | issues=
- excel.chart.set_titles | score=9.5 | issues=
- excel.formula.single | score=9.5 | issues=

## Runtime 9.3 Breakdown (What prevents 10/10)
- Missing direct unit tests for [EvidenceValidator.ts](/Users/pg/Desktop/koda-webapp/backend/src/modules/chat/runtime/EvidenceValidator.ts) and [ContractNormalizer.ts](/Users/pg/Desktop/koda-webapp/backend/src/modules/chat/runtime/ContractNormalizer.ts).
- No test asserts `sourceInvariantFailureCode` behavior in both chat and stream paths inside [CentralizedChatRuntimeDelegate.ts](/Users/pg/Desktop/koda-webapp/backend/src/modules/chat/runtime/CentralizedChatRuntimeDelegate.ts).
- No dedicated test suite for nav-pills contract branches in [responseContractEnforcer.service.ts](/Users/pg/Desktop/koda-webapp/backend/src/services/core/enforcement/responseContractEnforcer.service.ts).
- doc_grounded_table has partial coverage; finalization+source-filtering edge cases need explicit tests.

## Fastest Path to 10/10
1. Add disambiguationGroup + mutuallyExclusiveWith + scoreAdjustments to DOCX EN/PT patterns.
2. Add tokens_none to remaining DOCX intents missing hard negatives (page/section break + list convert).
3. Add explicit token triggers to regex-only DOCX intents to reduce fragility.
4. Add missing clarifyIfMissing for rewrite/spacing/heading/table-break intents requiring slots.
5. Add runtime unit tests for EvidenceValidator + ContractNormalizer + sourceInvariantFailureCode.
6. Add responseContractEnforcer tests for nav_pills_missing_buttons and source-leak stripping.
