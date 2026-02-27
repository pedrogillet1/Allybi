# Codex Double-Check: 100 Query Grade Audit

Date: 2026-02-26T22:24:42.341Z

## Summary

- Existing report average: **62.63/100**
- Codex regrade (raw capture): **55.75/100**
- Codex regrade (excluding UI-capture artifact penalty): **70.75/100**
- Existing distribution: {"F":32,"C":41,"D":25,"B":2}
- Codex raw distribution: {"D":21,"C":7,"F":54,"B":18}
- Codex no-UI distribution: {"C":15,"B":15,"D":25,"A":20,"F":25}

## Major blockers to 100%

- ui_artifact_in_capture: 100/100
- limited_info_crutch: 48/100
- wrong_doc_or_no_expected_source: 40/100
- english_prefix_in_pt_run: 23/100
- partial_source_coverage_50pct: 12/100
- partial_source_coverage_33pct: 11/100
- partial_source_coverage_17pct: 10/100
- truncated: 6/100
- strict_mode_low_citation_depth: 1/100
- failed_explain_refusal: 1/100

## Section-level source coverage

- Q1-9 overview: avg coverage 33.3%, zero-match 0/9
- Q10-24 scrum: avg coverage 66.7%, zero-match 5/15 (Q13, Q14, Q17, Q19, Q20)
- Q25-34 notes: avg coverage 25.0%, zero-match 7/10 (Q26, Q27, Q28, Q30, Q31, Q33, Q34)
- Q35-48 project: avg coverage 28.6%, zero-match 9/14 (Q35, Q38, Q39, Q40, Q41, Q42, Q43, Q44, Q46)
- Q49-58 marketing: avg coverage 80.0%, zero-match 2/10 (Q49, Q50)
- Q59-68 image/OCR: avg coverage 15.0%, zero-match 8/10 (Q59, Q60, Q61, Q63, Q64, Q65, Q66, Q68)
- Q69-80 deck: avg coverage 25.0%, zero-match 9/12 (Q69, Q70, Q71, Q72, Q74, Q75, Q77, Q79, Q80)
- Q81-100 synthesis/guards: avg coverage 31.7%, zero-match 0/20

## File-level causes (confirmed)

- `frontend/e2e/query-test-100.spec.ts`: response extraction reads `assistant-message-content` container (`innerText`) that includes UI chips/source labels, creating 100% artifact leakage in grading text.
- `frontend/e2e/query-test-100.spec.ts`: `sseTerminalType` is initialized but never actually set from stream frames, so transport diagnostics are incomplete.
- `frontend/src/components/chat/ChatInterface.jsx` (`detectMessageLang`): regex heuristic defaults to `en` when PT query misses a narrow keyword list; this explains English hedge prefix in PT run.
- `backend/src/services/core/retrieval/evidenceGate.service.ts` + `memory_policy.any.json`: hedge prefix can be English when upstream language resolves `en`, producing mixed-language output.
- `frontend/e2e/query-test-100.spec.ts`: injector forces all 6 docs on every turn; retrieval then frequently chooses wrong doc for single-doc intents (OCR/deck especially), hurting relevance.

## Per-query double-check table

| # | Existing | Codex Raw | Codex No-UI | Expected Docs | Actual Sources | Key blockers |
|---:|---:|---:|---:|---|---|---|
| 1 | F 49 | D 60 | C 75 | Capítulo 8 Framework Scrum, Anotações Aula 2 1, Trabalho projeto, OBA marketing servicos 1, TRABALHO FINAL 1, guarda bens self storage | Capítulo 8 Framework Scrum | ui_artifact_in_capture, partial_source_coverage_17pct |
| 2 | C 75 | C 70 | B 85 | Capítulo 8 Framework Scrum, Anotações Aula 2 1, Trabalho projeto, OBA marketing servicos 1, TRABALHO FINAL 1, guarda bens self storage | Anotações Aula 2 1, OBA marketing servicos 1, guarda bens self storage | ui_artifact_in_capture, partial_source_coverage_50pct |
| 3 | C 79 | D 65 | B 80 | Capítulo 8 Framework Scrum, Anotações Aula 2 1, Trabalho projeto, OBA marketing servicos 1, TRABALHO FINAL 1, guarda bens self storage | OBA marketing servicos 1, Capítulo 8 Framework Scrum | ui_artifact_in_capture, partial_source_coverage_33pct |
| 4 | D 65 | D 62 | C 77 | Capítulo 8 Framework Scrum, Anotações Aula 2 1, Trabalho projeto, OBA marketing servicos 1, TRABALHO FINAL 1, guarda bens self storage | Capítulo 8 Framework Scrum, Trabalho projeto, TRABALHO FINAL 1 | ui_artifact_in_capture, limited_info_crutch, partial_source_coverage_50pct |
| 5 | D 64 | F 57 | C 72 | Capítulo 8 Framework Scrum, Anotações Aula 2 1, Trabalho projeto, OBA marketing servicos 1, TRABALHO FINAL 1, guarda bens self storage | OBA marketing servicos 1, Anotações Aula 2 1 | ui_artifact_in_capture, limited_info_crutch, partial_source_coverage_33pct |
| 6 | C 78 | C 70 | B 85 | Capítulo 8 Framework Scrum, Anotações Aula 2 1, Trabalho projeto, OBA marketing servicos 1, TRABALHO FINAL 1, guarda bens self storage | OBA marketing servicos 1, Capítulo 8 Framework Scrum, Trabalho projeto | ui_artifact_in_capture, partial_source_coverage_50pct |
| 7 | C 73 | D 65 | B 80 | Capítulo 8 Framework Scrum, Anotações Aula 2 1, Trabalho projeto, OBA marketing servicos 1, TRABALHO FINAL 1, guarda bens self storage | Capítulo 8 Framework Scrum, OBA marketing servicos 1 | ui_artifact_in_capture, partial_source_coverage_33pct |
| 8 | F 59 | F 52 | D 67 | Capítulo 8 Framework Scrum, Anotações Aula 2 1, Trabalho projeto, OBA marketing servicos 1, TRABALHO FINAL 1, guarda bens self storage | Capítulo 8 Framework Scrum | ui_artifact_in_capture, limited_info_crutch, partial_source_coverage_17pct |
| 9 | D 63 | F 52 | D 67 | Capítulo 8 Framework Scrum, Anotações Aula 2 1, Trabalho projeto, OBA marketing servicos 1, TRABALHO FINAL 1, guarda bens self storage | OBA marketing servicos 1 | ui_artifact_in_capture, limited_info_crutch, partial_source_coverage_17pct |
| 10 | D 62 | D 69 | B 84 | Capítulo 8 Framework Scrum | Capítulo 8 Framework Scrum | ui_artifact_in_capture, english_prefix_in_pt_run, limited_info_crutch |
| 11 | D 65 | B 85 | A 100 | Capítulo 8 Framework Scrum | Capítulo 8 Framework Scrum | ui_artifact_in_capture |
| 12 | C 78 | B 85 | A 100 | Capítulo 8 Framework Scrum | Capítulo 8 Framework Scrum, TRABALHO FINAL 1 | ui_artifact_in_capture |
| 13 | F 53 | F 29 | F 44 | Capítulo 8 Framework Scrum | OBA marketing servicos 1, Anotações Aula 2 1 | ui_artifact_in_capture, english_prefix_in_pt_run, limited_info_crutch, wrong_doc_or_no_expected_source |
| 14 | F 48 | F 45 | D 60 | Capítulo 8 Framework Scrum | OBA marketing servicos 1, Anotações Aula 2 1, guarda bens self storage | ui_artifact_in_capture, wrong_doc_or_no_expected_source |
| 15 | C 79 | B 85 | A 100 | Capítulo 8 Framework Scrum | Capítulo 8 Framework Scrum, Trabalho projeto | ui_artifact_in_capture |
| 16 | C 76 | B 85 | A 100 | Capítulo 8 Framework Scrum | Capítulo 8 Framework Scrum | ui_artifact_in_capture |
| 17 | F 41 | F 17 | F 32 | Capítulo 8 Framework Scrum | TRABALHO FINAL 1, guarda bens self storage, Trabalho projeto | truncated, ui_artifact_in_capture, english_prefix_in_pt_run, limited_info_crutch |
| 18 | F 40 | B 85 | A 100 | Capítulo 8 Framework Scrum | TRABALHO FINAL 1, Capítulo 8 Framework Scrum, Trabalho projeto | ui_artifact_in_capture |
| 19 | D 69 | F 37 | F 52 | Capítulo 8 Framework Scrum | TRABALHO FINAL 1, OBA marketing servicos 1, Anotações Aula 2 1 | ui_artifact_in_capture, limited_info_crutch, wrong_doc_or_no_expected_source |
| 20 | C 70 | F 37 | F 52 | Capítulo 8 Framework Scrum | OBA marketing servicos 1, guarda bens self storage | ui_artifact_in_capture, limited_info_crutch, wrong_doc_or_no_expected_source |
| 21 | C 79 | B 85 | A 100 | Capítulo 8 Framework Scrum | Capítulo 8 Framework Scrum, OBA marketing servicos 1, Anotações Aula 2 1 | ui_artifact_in_capture |
| 22 | C 72 | D 69 | B 84 | Capítulo 8 Framework Scrum | OBA marketing servicos 1, Capítulo 8 Framework Scrum | ui_artifact_in_capture, english_prefix_in_pt_run, limited_info_crutch |
| 23 | B 80 | B 85 | A 100 | Capítulo 8 Framework Scrum | TRABALHO FINAL 1, Capítulo 8 Framework Scrum, OBA marketing servicos 1 | ui_artifact_in_capture |
| 24 | C 77 | B 85 | A 100 | Capítulo 8 Framework Scrum | Capítulo 8 Framework Scrum, OBA marketing servicos 1 | ui_artifact_in_capture |
| 25 | D 61 | F 54 | D 69 | Capítulo 8 Framework Scrum, Anotações Aula 2 1 | OBA marketing servicos 1, TRABALHO FINAL 1, Capítulo 8 Framework Scrum | ui_artifact_in_capture, english_prefix_in_pt_run, limited_info_crutch, partial_source_coverage_50pct |
| 26 | D 60 | F 37 | F 52 | Anotações Aula 2 1 | Capítulo 8 Framework Scrum | ui_artifact_in_capture, limited_info_crutch, wrong_doc_or_no_expected_source |
| 27 | D 60 | F 45 | D 60 | Anotações Aula 2 1 | Capítulo 8 Framework Scrum, OBA marketing servicos 1, TRABALHO FINAL 1 | ui_artifact_in_capture, wrong_doc_or_no_expected_source |
| 28 | D 62 | F 37 | F 52 | Anotações Aula 2 1 | OBA marketing servicos 1, Capítulo 8 Framework Scrum, TRABALHO FINAL 1 | ui_artifact_in_capture, limited_info_crutch, wrong_doc_or_no_expected_source |
| 29 | C 74 | B 85 | A 100 | Anotações Aula 2 1 | Capítulo 8 Framework Scrum, Anotações Aula 2 1, guarda bens self storage | ui_artifact_in_capture |
| 30 | C 74 | F 45 | D 60 | Anotações Aula 2 1 | Capítulo 8 Framework Scrum | ui_artifact_in_capture, wrong_doc_or_no_expected_source |
| 31 | C 70 | F 45 | D 60 | Anotações Aula 2 1 | Capítulo 8 Framework Scrum, Trabalho projeto, OBA marketing servicos 1 | ui_artifact_in_capture, wrong_doc_or_no_expected_source |
| 32 | D 69 | C 77 | A 92 | Anotações Aula 2 1 | OBA marketing servicos 1, TRABALHO FINAL 1, Anotações Aula 2 1 | ui_artifact_in_capture, limited_info_crutch |
| 33 | C 78 | F 45 | D 60 | Anotações Aula 2 1 | Capítulo 8 Framework Scrum | ui_artifact_in_capture, wrong_doc_or_no_expected_source |
| 34 | C 77 | F 45 | D 60 | Anotações Aula 2 1 | Capítulo 8 Framework Scrum | ui_artifact_in_capture, wrong_doc_or_no_expected_source |
| 35 | F 44 | F 45 | D 60 | Trabalho projeto | Capítulo 8 Framework Scrum | ui_artifact_in_capture, wrong_doc_or_no_expected_source |
| 36 | C 75 | B 85 | A 100 | Trabalho projeto | Capítulo 8 Framework Scrum, Trabalho projeto | ui_artifact_in_capture |
| 37 | D 66 | D 69 | B 84 | Trabalho projeto | Trabalho projeto | ui_artifact_in_capture, english_prefix_in_pt_run, limited_info_crutch |
| 38 | F 30 | F 29 | F 44 | Trabalho projeto | Capítulo 8 Framework Scrum | ui_artifact_in_capture, english_prefix_in_pt_run, limited_info_crutch, wrong_doc_or_no_expected_source |
| 39 | F 49 | F 45 | D 60 | Trabalho projeto | Capítulo 8 Framework Scrum | ui_artifact_in_capture, wrong_doc_or_no_expected_source |
| 40 | F 40 | F 33 | F 48 | Trabalho projeto | Capítulo 8 Framework Scrum, OBA marketing servicos 1, TRABALHO FINAL 1 | truncated, ui_artifact_in_capture, wrong_doc_or_no_expected_source |
| 41 | D 60 | F 45 | D 60 | Trabalho projeto | Capítulo 8 Framework Scrum, OBA marketing servicos 1 | ui_artifact_in_capture, wrong_doc_or_no_expected_source |
| 42 | D 61 | F 37 | F 52 | Trabalho projeto | OBA marketing servicos 1, Anotações Aula 2 1 | ui_artifact_in_capture, limited_info_crutch, wrong_doc_or_no_expected_source |
| 43 | D 64 | F 29 | F 44 | Trabalho projeto | OBA marketing servicos 1, TRABALHO FINAL 1, Capítulo 8 Framework Scrum | ui_artifact_in_capture, english_prefix_in_pt_run, limited_info_crutch, wrong_doc_or_no_expected_source |
| 44 | D 69 | F 29 | F 44 | Trabalho projeto | OBA marketing servicos 1, Anotações Aula 2 1 | ui_artifact_in_capture, english_prefix_in_pt_run, limited_info_crutch, wrong_doc_or_no_expected_source |
| 45 | C 78 | B 85 | A 100 | Trabalho projeto | TRABALHO FINAL 1, Trabalho projeto, guarda bens self storage | ui_artifact_in_capture |
| 46 | C 71 | F 45 | D 60 | Trabalho projeto | Capítulo 8 Framework Scrum | ui_artifact_in_capture, wrong_doc_or_no_expected_source |
| 47 | C 76 | D 62 | C 77 | Trabalho projeto, Capítulo 8 Framework Scrum | TRABALHO FINAL 1, Trabalho projeto, OBA marketing servicos 1 | ui_artifact_in_capture, limited_info_crutch, partial_source_coverage_50pct |
| 48 | C 74 | C 70 | B 85 | Trabalho projeto, Capítulo 8 Framework Scrum | Capítulo 8 Framework Scrum, OBA marketing servicos 1 | ui_artifact_in_capture, partial_source_coverage_50pct |
| 49 | B 83 | F 45 | D 60 | OBA marketing servicos 1 | Capítulo 8 Framework Scrum, Trabalho projeto | ui_artifact_in_capture, wrong_doc_or_no_expected_source |
| 50 | C 77 | F 45 | D 60 | OBA marketing servicos 1 | Capítulo 8 Framework Scrum, TRABALHO FINAL 1, Trabalho projeto | ui_artifact_in_capture, wrong_doc_or_no_expected_source |
| 51 | D 65 | B 85 | A 100 | OBA marketing servicos 1 | Capítulo 8 Framework Scrum, OBA marketing servicos 1 | ui_artifact_in_capture |
| 52 | C 70 | B 85 | A 100 | OBA marketing servicos 1 | OBA marketing servicos 1 | ui_artifact_in_capture |
| 53 | D 64 | B 85 | A 100 | OBA marketing servicos 1 | OBA marketing servicos 1, TRABALHO FINAL 1 | ui_artifact_in_capture |
| 54 | F 50 | D 69 | B 84 | OBA marketing servicos 1 | OBA marketing servicos 1 | ui_artifact_in_capture, english_prefix_in_pt_run, limited_info_crutch |
| 55 | F 46 | B 85 | A 100 | OBA marketing servicos 1 | Capítulo 8 Framework Scrum, OBA marketing servicos 1 | ui_artifact_in_capture |
| 56 | C 73 | B 85 | A 100 | OBA marketing servicos 1 | Capítulo 8 Framework Scrum, OBA marketing servicos 1, TRABALHO FINAL 1 | ui_artifact_in_capture |
| 57 | C 77 | B 85 | A 100 | OBA marketing servicos 1 | Capítulo 8 Framework Scrum, OBA marketing servicos 1 | ui_artifact_in_capture |
| 58 | D 68 | D 69 | B 84 | OBA marketing servicos 1 | OBA marketing servicos 1, TRABALHO FINAL 1 | ui_artifact_in_capture, english_prefix_in_pt_run, limited_info_crutch |
| 59 | C 75 | F 45 | D 60 | TRABALHO FINAL 1 | OBA marketing servicos 1, Capítulo 8 Framework Scrum, Trabalho projeto | ui_artifact_in_capture, wrong_doc_or_no_expected_source |
| 60 | C 78 | F 45 | D 60 | TRABALHO FINAL 1 | guarda bens self storage, OBA marketing servicos 1, Capítulo 8 Framework Scrum | ui_artifact_in_capture, wrong_doc_or_no_expected_source |
| 61 | F 37 | F 33 | F 48 | TRABALHO FINAL 1 | Anotações Aula 2 1 | truncated, ui_artifact_in_capture, wrong_doc_or_no_expected_source |
| 62 | F 50 | D 69 | B 84 | TRABALHO FINAL 1 | OBA marketing servicos 1, TRABALHO FINAL 1, Anotações Aula 2 1 | ui_artifact_in_capture, english_prefix_in_pt_run, limited_info_crutch |
| 63 | F 46 | F 29 | F 44 | TRABALHO FINAL 1 | Anotações Aula 2 1 | ui_artifact_in_capture, english_prefix_in_pt_run, limited_info_crutch, wrong_doc_or_no_expected_source |
| 64 | F 45 | F 25 | F 40 | TRABALHO FINAL 1 | Anotações Aula 2 1 | truncated, ui_artifact_in_capture, limited_info_crutch, wrong_doc_or_no_expected_source |
| 65 | F 42 | F 29 | F 44 | TRABALHO FINAL 1 | Anotações Aula 2 1 | ui_artifact_in_capture, english_prefix_in_pt_run, limited_info_crutch, wrong_doc_or_no_expected_source |
| 66 | F 40 | F 29 | F 44 | TRABALHO FINAL 1 | OBA marketing servicos 1, Capítulo 8 Framework Scrum | ui_artifact_in_capture, english_prefix_in_pt_run, limited_info_crutch, wrong_doc_or_no_expected_source |
| 67 | F 56 | D 62 | C 77 | TRABALHO FINAL 1, Trabalho projeto | OBA marketing servicos 1, TRABALHO FINAL 1, Anotações Aula 2 1 | ui_artifact_in_capture, limited_info_crutch, partial_source_coverage_50pct |
| 68 | F 56 | F 29 | F 44 | TRABALHO FINAL 1, Trabalho projeto | Anotações Aula 2 1 | ui_artifact_in_capture, english_prefix_in_pt_run, limited_info_crutch, wrong_doc_or_no_expected_source |
| 69 | D 69 | F 45 | D 60 | guarda bens self storage | Capítulo 8 Framework Scrum, Trabalho projeto | ui_artifact_in_capture, wrong_doc_or_no_expected_source |
| 70 | C 73 | F 45 | D 60 | guarda bens self storage | Capítulo 8 Framework Scrum, OBA marketing servicos 1, TRABALHO FINAL 1 | ui_artifact_in_capture, wrong_doc_or_no_expected_source |
| 71 | F 56 | F 45 | D 60 | guarda bens self storage | Trabalho projeto, Anotações Aula 2 1 | ui_artifact_in_capture, wrong_doc_or_no_expected_source |
| 72 | F 42 | F 45 | D 60 | guarda bens self storage | Trabalho projeto, TRABALHO FINAL 1 | ui_artifact_in_capture, wrong_doc_or_no_expected_source |
| 73 | D 68 | B 85 | A 100 | guarda bens self storage | Capítulo 8 Framework Scrum, guarda bens self storage, Trabalho projeto | ui_artifact_in_capture |
| 74 | F 56 | F 37 | F 52 | guarda bens self storage | TRABALHO FINAL 1 | ui_artifact_in_capture, limited_info_crutch, wrong_doc_or_no_expected_source |
| 75 | F 58 | F 37 | F 52 | guarda bens self storage | OBA marketing servicos 1 | ui_artifact_in_capture, limited_info_crutch, wrong_doc_or_no_expected_source |
| 76 | C 76 | D 69 | B 84 | guarda bens self storage | guarda bens self storage, OBA marketing servicos 1, TRABALHO FINAL 1 | ui_artifact_in_capture, english_prefix_in_pt_run, limited_info_crutch |
| 77 | D 69 | F 29 | F 44 | guarda bens self storage | OBA marketing servicos 1, TRABALHO FINAL 1 | ui_artifact_in_capture, english_prefix_in_pt_run, limited_info_crutch, wrong_doc_or_no_expected_source |
| 78 | C 79 | C 77 | A 92 | guarda bens self storage | guarda bens self storage, OBA marketing servicos 1, Anotações Aula 2 1 | ui_artifact_in_capture, limited_info_crutch |
| 79 | C 78 | F 37 | F 52 | guarda bens self storage | OBA marketing servicos 1, TRABALHO FINAL 1, Anotações Aula 2 1 | ui_artifact_in_capture, limited_info_crutch, wrong_doc_or_no_expected_source |
| 80 | C 71 | F 29 | F 44 | guarda bens self storage | OBA marketing servicos 1, TRABALHO FINAL 1, Anotações Aula 2 1 | ui_artifact_in_capture, english_prefix_in_pt_run, limited_info_crutch, wrong_doc_or_no_expected_source |
| 81 | C 71 | F 57 | C 72 | Capítulo 8 Framework Scrum, Anotações Aula 2 1, Trabalho projeto, OBA marketing servicos 1, TRABALHO FINAL 1, guarda bens self storage | OBA marketing servicos 1, Anotações Aula 2 1 | ui_artifact_in_capture, limited_info_crutch, partial_source_coverage_33pct |
| 82 | C 71 | D 62 | C 77 | Capítulo 8 Framework Scrum, Anotações Aula 2 1, Trabalho projeto, OBA marketing servicos 1, TRABALHO FINAL 1, guarda bens self storage | OBA marketing servicos 1, TRABALHO FINAL 1, Anotações Aula 2 1 | ui_artifact_in_capture, limited_info_crutch, partial_source_coverage_50pct |
| 83 | C 75 | F 57 | C 72 | Capítulo 8 Framework Scrum, Anotações Aula 2 1, Trabalho projeto, OBA marketing servicos 1, TRABALHO FINAL 1, guarda bens self storage | OBA marketing servicos 1, Anotações Aula 2 1 | ui_artifact_in_capture, limited_info_crutch, partial_source_coverage_33pct |
| 84 | C 78 | C 70 | B 85 | Capítulo 8 Framework Scrum, Anotações Aula 2 1, Trabalho projeto, OBA marketing servicos 1, TRABALHO FINAL 1, guarda bens self storage | Trabalho projeto, Capítulo 8 Framework Scrum, OBA marketing servicos 1 | ui_artifact_in_capture, partial_source_coverage_50pct |
| 85 | C 75 | C 70 | B 85 | Capítulo 8 Framework Scrum, Anotações Aula 2 1, Trabalho projeto, OBA marketing servicos 1, TRABALHO FINAL 1, guarda bens self storage | OBA marketing servicos 1, Capítulo 8 Framework Scrum, guarda bens self storage | ui_artifact_in_capture, partial_source_coverage_50pct |
| 86 | C 74 | D 60 | C 75 | Capítulo 8 Framework Scrum, Anotações Aula 2 1, Trabalho projeto, OBA marketing servicos 1, TRABALHO FINAL 1, guarda bens self storage | Capítulo 8 Framework Scrum | ui_artifact_in_capture, partial_source_coverage_17pct |
| 87 | F 44 | F 32 | F 47 | Capítulo 8 Framework Scrum, Anotações Aula 2 1, Trabalho projeto, OBA marketing servicos 1, TRABALHO FINAL 1, guarda bens self storage | Trabalho projeto | truncated, ui_artifact_in_capture, english_prefix_in_pt_run, limited_info_crutch |
| 88 | C 73 | D 60 | C 75 | Capítulo 8 Framework Scrum, Anotações Aula 2 1, Trabalho projeto, OBA marketing servicos 1, TRABALHO FINAL 1, guarda bens self storage | Capítulo 8 Framework Scrum | ui_artifact_in_capture, partial_source_coverage_17pct |
| 89 | C 71 | F 57 | C 72 | Capítulo 8 Framework Scrum, Anotações Aula 2 1, Trabalho projeto, OBA marketing servicos 1, TRABALHO FINAL 1, guarda bens self storage | OBA marketing servicos 1, TRABALHO FINAL 1 | ui_artifact_in_capture, limited_info_crutch, partial_source_coverage_33pct |
| 90 | D 68 | F 49 | D 64 | Capítulo 8 Framework Scrum, Anotações Aula 2 1, Trabalho projeto, OBA marketing servicos 1, TRABALHO FINAL 1, guarda bens self storage | OBA marketing servicos 1, Anotações Aula 2 1 | ui_artifact_in_capture, english_prefix_in_pt_run, limited_info_crutch, partial_source_coverage_33pct |
| 91 | C 73 | F 50 | D 65 | Capítulo 8 Framework Scrum, Anotações Aula 2 1, Trabalho projeto, OBA marketing servicos 1, TRABALHO FINAL 1, guarda bens self storage | Capítulo 8 Framework Scrum | ui_artifact_in_capture, partial_source_coverage_17pct, strict_mode_low_citation_depth |
| 92 | D 62 | F 40 | F 55 | Capítulo 8 Framework Scrum, Anotações Aula 2 1, Trabalho projeto, OBA marketing servicos 1, TRABALHO FINAL 1, guarda bens self storage | guarda bens self storage | truncated, ui_artifact_in_capture, limited_info_crutch, partial_source_coverage_17pct |
| 93 | F 23 | D 62 | C 77 | Capítulo 8 Framework Scrum, Anotações Aula 2 1, Trabalho projeto, OBA marketing servicos 1, TRABALHO FINAL 1, guarda bens self storage | guarda bens self storage, OBA marketing servicos 1, TRABALHO FINAL 1 | ui_artifact_in_capture, limited_info_crutch, partial_source_coverage_50pct |
| 94 | F 23 | D 60 | C 75 | Capítulo 8 Framework Scrum, Anotações Aula 2 1, Trabalho projeto, OBA marketing servicos 1, TRABALHO FINAL 1, guarda bens self storage | Capítulo 8 Framework Scrum | ui_artifact_in_capture, partial_source_coverage_17pct |
| 95 | F 23 | D 60 | C 75 | Capítulo 8 Framework Scrum, Anotações Aula 2 1, Trabalho projeto, OBA marketing servicos 1, TRABALHO FINAL 1, guarda bens self storage | Capítulo 8 Framework Scrum | ui_artifact_in_capture, partial_source_coverage_17pct |
| 96 | F 23 | F 32 | F 47 | Capítulo 8 Framework Scrum, Anotações Aula 2 1, Trabalho projeto, OBA marketing servicos 1, TRABALHO FINAL 1, guarda bens self storage | Capítulo 8 Framework Scrum, OBA marketing servicos 1 | ui_artifact_in_capture, limited_info_crutch, partial_source_coverage_33pct, failed_explain_refusal |
| 97 | F 54 | D 62 | C 77 | Capítulo 8 Framework Scrum, Anotações Aula 2 1, Trabalho projeto, OBA marketing servicos 1, TRABALHO FINAL 1, guarda bens self storage | OBA marketing servicos 1, TRABALHO FINAL 1, Anotações Aula 2 1 | ui_artifact_in_capture, limited_info_crutch, partial_source_coverage_50pct |
| 98 | F 48 | F 49 | D 64 | Capítulo 8 Framework Scrum, Anotações Aula 2 1, Trabalho projeto, OBA marketing servicos 1, TRABALHO FINAL 1, guarda bens self storage | Capítulo 8 Framework Scrum, OBA marketing servicos 1 | ui_artifact_in_capture, english_prefix_in_pt_run, limited_info_crutch, partial_source_coverage_33pct |
| 99 | F 36 | F 49 | D 64 | Capítulo 8 Framework Scrum, Anotações Aula 2 1, Trabalho projeto, OBA marketing servicos 1, TRABALHO FINAL 1, guarda bens self storage | OBA marketing servicos 1, Anotações Aula 2 1 | ui_artifact_in_capture, english_prefix_in_pt_run, limited_info_crutch, partial_source_coverage_33pct |
| 100 | D 69 | D 65 | B 80 | Capítulo 8 Framework Scrum, Anotações Aula 2 1, Trabalho projeto, OBA marketing servicos 1, TRABALHO FINAL 1, guarda bens self storage | Capítulo 8 Framework Scrum, Trabalho projeto | ui_artifact_in_capture, partial_source_coverage_33pct |

## What must be fixed to hit 100/100

1. Fix grade-capture contamination (capture only markdown answer text, not source/followup chip labels).
2. Improve language routing to keep PT responses PT-only (no English hedge prefixes).
3. Stop all-doc injection for every turn; use targeted doc scope per query block or rely strict intent scope lock.
4. Add strong doc-intent routing for image/OCR and deck query ranges to avoid wrong-source retrieval.
5. Add adversarial/refusal enforcement tests for Q93-Q96 style prompts (must refuse, not reuse previous summary template).
6. Eliminate remaining truncations in table-heavy and OCR-heavy turns.
7. Populate and validate `sseTerminalType` so transport-level failures are diagnosable.
