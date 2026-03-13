# Eval and Proof Brain Implementation

## Scope
Implemented a dedicated eval/proof layer under `eval/` to provide:
- gold queries for domain exactness,
- adversarial harnesses for known failure modes,
- multilingual parity checks for EN/PT and numeric locale handling,
- style proof banks for anti-robotic, repetition, empathy, and rhythm.

## Files Added
- `eval/gold_queries/legal_field_exactness.any.json`
- `eval/gold_queries/finance_table_exactness.any.json`
- `eval/gold_queries/accounting_reconciliation.any.json`
- `eval/gold_queries/medical_report_safety.any.json`
- `eval/gold_queries/general_assistant_open_ended.any.json`
- `eval/adversarial/wrong_doc.any.json`
- `eval/adversarial/title_only_extraction.any.json`
- `eval/adversarial/owners_vs_signers.any.json`
- `eval/adversarial/table_corruption.any.json`
- `eval/adversarial/partial_answer.any.json`
- `eval/adversarial/fake_citation.any.json`
- `eval/adversarial/ambiguity_followups.any.json`
- `eval/adversarial/fallback_false_negative.any.json`
- `eval/adversarial/high_latency_weak_answer.any.json`
- `eval/multilingual/pt_en_parity.any.json`
- `eval/multilingual/locale_number_parity.any.json`
- `eval/style/anti_robotic.any.json`
- `eval/style/repetition.any.json`
- `eval/style/canned_empathy.any.json`
- `eval/style/rhythm_and_variety.any.json`

## What the proof layer catches
- Wrong doc leakage and scope contamination in cross-document environments.
- Title-only extraction by forcing section-line anchoring.
- Owner vs signer role conflation by requiring distinct role mapping.
- Table corruption and malformed layout failures by requiring recovery markers and uncertainty flags.
- Partial answers and false negatives where required fields are under-produced.
- Fake citations through invalid-anchor and impossible-range detection.
- Ambiguity under-clarification and over-confident responses under weak signals.
- Style inflation patterns including repetition, canned empathy, robotic intros, and sentence monotony.
- Numeric locale drift between EN and PT, including decimal/thousand separator parity.

## Gold expectations and failure conditions
Each file includes either explicit `expected` behavior, `failureConditions`, or both:
- Gold query files include deterministic extraction checks (anchors, units, clauses, and source specificity).
- Adversarial files include `failureConditions` with negative score caps and guard actions.
- Style/adversarial files include explicit phrase bans, minimum variety thresholds, and penalties.

## Integration notes
- `owner` and `usedBy` entries assume eval execution path is available in:
  - `services/eval/*`
  - `services/quality/evalJudge.service.ts`
  - `services/eval/styleJudge.service.ts`
- Next step is to wire these files into an eval suite registry so CI enforces:
  - wrong-doc/title-only detection,
  - no-fake-citation behavior,
  - multilingual parity and style penalty checks.
