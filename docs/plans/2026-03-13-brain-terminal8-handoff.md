# Brain Terminal 8 Handoff

**Date**: 2026-03-13
**Scope owned**: `backend/src/data_banks/document_intelligence/eval/**`, `backend/src/data_banks/eval/**`, certification tests tied to brain layers, handoff report
**Scope not owned**: shared manifests, suite registries, runtime service rewiring outside owned test surface

## What changed

Added standalone proof-bank coverage for brain-layer evaluation without touching shared manifests or shared suite registries.

New owned eval assets:

- `backend/src/data_banks/document_intelligence/eval/gold_queries/brain_questions.any.json`
- `backend/src/data_banks/document_intelligence/eval/adversarial/brain_traps.any.json`
- `backend/src/data_banks/document_intelligence/eval/multilingual/pt_en_parity.any.json`
- `backend/src/data_banks/document_intelligence/eval/style/composition.any.json`

New certification gates:

- `backend/src/tests/certification/brain-layer-proof-bank.cert.test.ts`
- `backend/src/tests/certification/brain-layer-runtime-proofs.cert.test.ts`

## Audit summary

Existing coverage already had partial proof for:

- retrieval precision
- wrong-doc contamination
- provenance strictness
- analytical structure

What was missing before this terminal:

- a single owned proof bank covering the full brain flow end-to-end
- explicit mapping from failure reports to owned regression suites
- PT/EN parity coverage in owned certification
- proof-bank coverage for false clarification traps and weak-answer recovery
- a matrix showing which test proves which brain layer

## Brain questions used for proof

No canonical in-repo file named the "8 brain questions". To avoid inventing hidden product contract in shared manifests, this terminal encoded the proof stages explicitly in owned eval data and mapped them to observed failures:

1. Which attached document is actually in scope?
2. What exact field or task is the user asking for?
3. Which evidence chunk best answers the question?
4. What exact field value is justified by the evidence?
5. Which nearby documents must be rejected as distractors?
6. Do we have rich provenance for every grounded claim?
7. Is clarification truly required, or is the question already answerable?
8. How should the answer be composed so it is evidence-first, human, and calibrated?

## Regression links covered

The new proof bank directly links owned cases to known failures in:

- `reports/query-grading/GRADING-REPORT.md`
- `frontend/e2e/reports/latest/a-plus-gap-deep-dive.md`

Covered failure themes:

- `missing_provenance`
- `insufficient_provenance_coverage`
- `INTENT_NEEDS_CLARIFICATION`
- `language_contract_mismatch`
- wrong-doc / irrelevant-citation bleed
- missing analytical blocks

## Proof matrix

| Brain layer | Proof bank coverage | Runtime certification proof |
| --- | --- | --- |
| Scope lock | `gold_queries/brain_questions.any.json` BQ1 | `brain-layer-runtime-proofs.cert.test.ts` lease scope-lock retrieval case |
| Intent resolution | `gold_queries/brain_questions.any.json` BQ2 | `brain-layer-proof-bank.cert.test.ts` required category coverage |
| Retrieval precision | `gold_queries/brain_questions.any.json` BQ3 | `brain-layer-runtime-proofs.cert.test.ts` top-doc and exact-snippet retrieval checks |
| Field exactness | `gold_queries/brain_questions.any.json` BQ4 | `brain-layer-runtime-proofs.cert.test.ts` ATT and certidao exact-value retrieval checks |
| Wrong-doc defense | `gold_queries/brain_questions.any.json` BQ5 and `adversarial/brain_traps.any.json` | `brain-layer-runtime-proofs.cert.test.ts` no-leak doc-lock check |
| Provenance richness | `gold_queries/brain_questions.any.json` BQ6 and `adversarial/brain_traps.any.json` | `brain-layer-runtime-proofs.cert.test.ts` strict multi-ref provenance validator pass case |
| Clarification guard | `gold_queries/brain_questions.any.json` BQ7 and `adversarial/brain_traps.any.json` | `brain-layer-proof-bank.cert.test.ts` false-clarification trap coverage gate |
| Composition | `gold_queries/brain_questions.any.json` BQ8 and `style/composition.any.json` | `brain-layer-runtime-proofs.cert.test.ts` analytical blocks, evidence-first structure, uncertainty, non-robotic tone, weak-answer recovery |
| Multilingual parity | `multilingual/pt_en_parity.any.json` and `adversarial/brain_traps.any.json` | `brain-layer-runtime-proofs.cert.test.ts` PT/EN top-doc parity and localized synthesis lines |

## Constraints and rationale

Shared eval suite registration is not owned here. Because existing registry/integrity tests enforce manifest ownership, these proof banks are intentionally consumed by standalone certification suites instead of being added to shared registries.

That keeps the new coverage:

- owned
- executable
- regression-linked
- non-decorative

## Files delivered

- `backend/src/data_banks/document_intelligence/eval/gold_queries/brain_questions.any.json`
- `backend/src/data_banks/document_intelligence/eval/adversarial/brain_traps.any.json`
- `backend/src/data_banks/document_intelligence/eval/multilingual/pt_en_parity.any.json`
- `backend/src/data_banks/document_intelligence/eval/style/composition.any.json`
- `backend/src/tests/certification/brain-layer-proof-bank.cert.test.ts`
- `backend/src/tests/certification/brain-layer-runtime-proofs.cert.test.ts`
- `docs/plans/2026-03-13-brain-terminal8-handoff.md`
