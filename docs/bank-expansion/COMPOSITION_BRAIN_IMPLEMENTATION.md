# Composition Brain Implementation

## Scope

This pass rewrote the weak style banks and added a real composition layer inside `backend/src/data_banks/document_intelligence/compose/`.

Edited existing banks:

- `backend/src/data_banks/document_intelligence/compose/anti_robotic_style_rules.any.json`
- `backend/src/data_banks/document_intelligence/compose/voice_personality_profiles.any.json`
- `backend/src/data_banks/document_intelligence/compose/empathy_and_support_language.any.json`
- `backend/src/data_banks/document_intelligence/compose/response_templates.any.json`
- `backend/src/data_banks/microcopy/allybi_response_style.any.json`
- `backend/src/data_banks/prompts/system_base.any.json`

Created new composition banks:

- `backend/src/data_banks/document_intelligence/compose/answer_strategies.any.json`
- `backend/src/data_banks/document_intelligence/compose/rhetorical_moves.any.json`
- `backend/src/data_banks/document_intelligence/compose/evidence_synthesis.any.json`
- `backend/src/data_banks/document_intelligence/compose/uncertainty_calibration.any.json`
- `backend/src/data_banks/document_intelligence/compose/compare_and_contrast.any.json`
- `backend/src/data_banks/document_intelligence/compose/claim_strength_language.any.json`
- `backend/src/data_banks/document_intelligence/compose/table_narration.any.json`
- `backend/src/data_banks/document_intelligence/compose/quote_explanation_patterns.any.json`
- `backend/src/data_banks/document_intelligence/compose/openers_and_framing.any.json`
- `backend/src/data_banks/document_intelligence/compose/closers_and_next_steps.any.json`
- `backend/src/data_banks/document_intelligence/compose/anti_repetition_patterns.any.json`
- `backend/src/data_banks/document_intelligence/compose/sentence_rhythm_and_variety.any.json`
- `backend/src/data_banks/document_intelligence/compose/audience_styles/executive.any.json`
- `backend/src/data_banks/document_intelligence/compose/audience_styles/analyst.any.json`
- `backend/src/data_banks/document_intelligence/compose/audience_styles/operator.any.json`
- `backend/src/data_banks/document_intelligence/compose/audience_styles/general_user.any.json`
- `backend/src/data_banks/document_intelligence/compose/domain_writers/legal_writer.any.json`
- `backend/src/data_banks/document_intelligence/compose/domain_writers/finance_writer.any.json`
- `backend/src/data_banks/document_intelligence/compose/domain_writers/accounting_writer.any.json`
- `backend/src/data_banks/document_intelligence/compose/domain_writers/medical_writer.any.json`
- `backend/src/data_banks/document_intelligence/compose/domain_writers/ops_writer.any.json`

## Design

The new layer is organized around four runtime decisions:

1. Strategy

- `answer_strategies.any.json` chooses the overall answer arc.
- `response_templates.any.json` maps the arc to structural output shapes.

2. Voice

- `voice_personality_profiles.any.json` selects the answer personality.
- `audience_styles/*` compresses or expands for audience needs.
- `domain_writers/*` adds domain-native phrasing discipline.

3. Synthesis

- `rhetorical_moves.any.json` controls how claims enter and pivot.
- `evidence_synthesis.any.json` keeps multi-point support from turning into evidence dumping.
- `uncertainty_calibration.any.json` and `claim_strength_language.any.json` keep confidence wording aligned with support.

4. Repair

- `anti_robotic_style_rules.any.json` and `anti_repetition_patterns.any.json` catch templated output patterns.
- `sentence_rhythm_and_variety.any.json` introduces cadence contrast.
- `table_narration.any.json`, `quote_explanation_patterns.any.json`, `openers_and_framing.any.json`, and `closers_and_next_steps.any.json` improve the final surface.

## Runtime Intent

The banks were written as layered inputs rather than one giant monolith:

- `system_base.any.json` defines the permanent answer posture.
- `response_templates.any.json` defines answer shapes.
- `compose/*.any.json` defines composition behavior and repair logic.
- `allybi_response_style.any.json` stays editing-specific and does not try to own general chat composition.

Each created or rewritten bank includes:

- `_meta.owner`
- `_meta.usedBy`
- `_meta.tests`
- `_meta.version`
- `runtimeUsageNotes`

## Main Improvements

- The anti-robotic layer now covers repeated starters, flat cadence, filler, evidence dumping, and generic verb choice.
- Voice selection is no longer a two-profile stub; it now distinguishes executive, analyst, sensitive, legal, finance, ops, and general-user modes.
- Empathy language is now scenario-based and bounded instead of canned.
- Response templates now cover direct answers, evidence synthesis, compare, quote explanation, table narration, risk readouts, and clarification shapes.
- The new composition layer separates answer planning, rhetorical movement, confidence calibration, and repair.

## Known Follow-On Work

- None of these banks are wired through registry or dependency changes in this pass.
- Existing legacy compose banks such as `openers.any.json`, `closers.any.json`, and `transition_phrases.any.json` were left untouched.
- The next safe step is runtime wiring and eval expansion, not more surface-bank proliferation.
