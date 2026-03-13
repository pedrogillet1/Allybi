# Evidence and Validation Brain Implementation

## Scope

Added 12 new data banks to harden exact-field extraction, role-precise binding, quote integrity, table reasoning, cross-document synthesis, and claim-level refusal-to-infer behavior:

- `backend/src/data_banks/retrieval/evidence_binding_contract.any.json`
- `backend/src/data_banks/retrieval/field_role_ontology.any.json`
- `backend/src/data_banks/retrieval/field_lock_patterns.any.json`
- `backend/src/data_banks/retrieval/quote_span_rules.any.json`
- `backend/src/data_banks/retrieval/table_reasoning_rules.any.json`
- `backend/src/data_banks/retrieval/row_column_disambiguation.any.json`
- `backend/src/data_banks/retrieval/cross_doc_synthesis_rules.any.json`
- `backend/src/data_banks/retrieval/evidence_packaging_strategies.any.json`
- `backend/src/data_banks/validation/field_exactness_rules.any.json`
- `backend/src/data_banks/validation/claim_strength_matrix.any.json`
- `backend/src/data_banks/validation/fact_type_requirements_expanded.any.json`
- `backend/src/data_banks/validation/conflict_resolution_rules.any.json`
- `backend/src/data_banks/validation/table_integrity_rules.any.json`

Created directory:

- `backend/src/data_banks/validation/` (new)

## Goals Mapped

1. Clarify vs answer
   - `claim_strength_matrix` and `field_exactness_rules` enforce fallback behavior when evidence is weak.
   - `fact_type_requirements_expanded` and `evidence_packaging_strategies` emit explicit partial-response or clarification actions before confident completion.

2. Role confusion protection
   - `field_role_ontology` encodes canonical role anchors and forbidden swaps for signer/owner/witness/beneficiary/issuer/patient/subscriber/payer/account_holder/etc.
   - `field_lock_patterns` and `evidence_binding_contract` prevent cross-turn and cross-query role drift for high-risk roles.

3. Exact field and anchor binding
   - `evidence_binding_contract` enforces evidence contracts and exact field-role matching.
   - `field_exactness_rules` and `validation/fact_type_requirements_expanded` reject low-confidence substitutions, silent role merges, and missing row/column/table anchors.

4. Table integrity and coordinate precision
   - `table_reasoning_rules` and `row_column_disambiguation` require explicit row/column context, prohibit axis swap and implicit transpose inference.
   - `table_integrity_rules` validates header/row/column consistency, merged-cell handling, and aggregate labeling constraints.

5. Quote correctness
   - `quote_span_rules` requires exact span boundaries for quoted text, blocks multi-doc merged quotes, and requires disclosure on truncation or normalization.

6. Cross-doc safety
   - `cross_doc_synthesis_rules` blocks implicit cross-document merges, forces explicit doc-scope confirmation, and enforces conflict surfacing.
   - `evidence_packaging_strategies` chooses single-doc vs cross-doc packaging modes with required disclosure settings.

7. Validation policy and conflict control
   - `conflict_resolution_rules` formalizes conflict outcomes by type (numeric, role, quote, table axes).
   - `claim_strength_matrix` defines refusal-to-infer thresholds and disallowance for conflict-heavy weak inference.

## Runtime-facing Metadata

Every new bank includes:

- `_meta` with `id`, `version`, `owner`, `usedBy`, `tests`.
- `config` with deterministic toggles and thresholds.
- `runtimeUsageNotes` for selection stage, consumer, intent, and emitted signals.

## Test Metadata

Each file carries both:

- `_meta.tests` references to executable test names.
- Structured `tests.cases` entries with inputs and expected actions for rule-level regression.

## Notes

- No existing files outside `retrieval/**`, `validation/**`, and `docs/bank-expansion/**` were edited.
- These banks are additive and designed to be wired by existing service consumers through the current `dataBankLoader`.
