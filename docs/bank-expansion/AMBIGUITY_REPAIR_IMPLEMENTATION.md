# Ambiguity And Repair Implementation

## Scope

Added three ambiguity banks and seven repair banks to make document-grounded behavior more resilient, less extractor-like, and more assistant-like:

- `backend/src/data_banks/ambiguity/clarification_question_bank.any.json`
- `backend/src/data_banks/ambiguity/field_role_disambiguation.any.json`
- `backend/src/data_banks/ambiguity/one_best_question_policy.any.json`
- `backend/src/data_banks/repair/answer_recovery_strategies.any.json`
- `backend/src/data_banks/repair/partial_answer_recovery.any.json`
- `backend/src/data_banks/repair/not_enough_evidence.any.json`
- `backend/src/data_banks/repair/contradiction_resolution.any.json`
- `backend/src/data_banks/repair/followup_generation.any.json`
- `backend/src/data_banks/repair/false_negative_rescue.any.json`
- `backend/src/data_banks/repair/reask_vs_answer_policy.any.json`

## Behavioral Goals Encoded

### Clarify only when it matters

The ambiguity layer now encodes:

- one-question-only behavior
- closed-choice questions when options exist
- suppression of clarification when a cautious scoped answer is safe
- ranking of candidate questions by unblock value instead of asking every plausible question

This should reduce brittle re-asking and improve premium-assistant flow.

### Resolve role confusion explicitly

`field_role_disambiguation.any.json` covers common role collisions such as:

- signer vs witness
- signer vs owner
- owner vs beneficial owner
- patient vs subscriber
- beneficiary vs claimant
- issuer vs provider
- payer vs payee vs account holder

The bank blocks role substitution without direct evidence and prefers exact role labels when they exist.

### Repair before fallback

The repair layer now attempts:

- retrieval rescue for likely false negatives
- partial-answer recovery when some subparts are grounded
- contradiction reconciliation using precedence rules
- cautious answer modes when the answer is mostly stable
- explicit evidence-gap handling only after repair is exhausted

This should make weak retrieval look like intelligent continuation instead of hard failure.

## Runtime Shape

Each new bank includes:

- `_meta` with ownership, tests, and change log
- `config` for deterministic runtime behavior
- `runtimeUsageNotes` to expose intended selection stage, consumer, and emitted signals
- machine-readable `rules` or `strategies`
- embedded `tests.cases` metadata for scenario coverage

## Expected Effects

Expected user-visible improvements:

- fewer unnecessary clarification loops
- cleaner handling of ambiguous people and party roles
- more useful partial answers instead of empty fallbacks
- contradiction responses that explain the conflict rather than hiding it
- better next-step suggestions after evidence gaps

## Validation

Validated in-turn:

- all new JSON files parse successfully
- new banks use the local `.any.json` structure used elsewhere in `backend/src/data_banks`
- one nonstandard operator was normalized during validation

No runtime wiring or manifest updates were made in this pass.
