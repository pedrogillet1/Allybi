# Document Intelligence Implementation TODO

Generated checklist to guarantee all document intelligence banks are created, populated, and wired correctly.

## Global Acceptance Gates
- [ ] `npm run docint:scaffold` completes without error
- [ ] `npm run banks:checksum:generate` updates checksums for new banks
- [ ] `npm run docint:verify -- --strict` passes
- [ ] `npm run test:runtime-wiring` passes
- [ ] Startup strict mode (`NODE_ENV=production`) loads all required core banks
- [ ] Retrieval answers include grounded evidence without wrong-doc drift

## Domains
- [ ] Domain coverage complete: finance
- [ ] Domain coverage complete: legal
- [ ] Domain coverage complete: medical
- [ ] Domain coverage complete: ops

## Operators
- [ ] Operator playbooks reviewed: navigate
- [ ] Operator playbooks reviewed: open
- [ ] Operator playbooks reviewed: extract
- [ ] Operator playbooks reviewed: summarize
- [ ] Operator playbooks reviewed: compare
- [ ] Operator playbooks reviewed: locate
- [ ] Operator playbooks reviewed: calculate
- [ ] Operator playbooks reviewed: evaluate
- [ ] Operator playbooks reviewed: validate
- [ ] Operator playbooks reviewed: advise
- [ ] Operator playbooks reviewed: monitor

## Taxonomy Banks
- [ ] doc_taxonomy
- [ ] doc_archetypes_finance
- [ ] doc_archetypes_legal
- [ ] doc_archetypes_medical
- [ ] doc_archetypes_ops

## Structure Banks
- [ ] headings_map
- [ ] table_header_ontology_finance
- [ ] table_header_ontology_legal
- [ ] table_header_ontology_medical
- [ ] table_header_ontology_ops
- [ ] sheetname_patterns
- [ ] layout_cues

## Entities Banks
- [ ] money_patterns
- [ ] date_patterns
- [ ] party_patterns
- [ ] identifier_patterns

## Domain Banks
- [ ] finance_kpi_ontology
- [ ] accounting_rules
- [ ] finance_doc_logic
- [ ] legal_clause_ontology
- [ ] legal_risk_heuristics
- [ ] legal_reference_rules
- [ ] medical_report_ontology
- [ ] medical_safety_boundaries
- [ ] medical_explanation_templates

## Operators Banks
- [ ] operator_playbook_navigate_finance
- [ ] operator_playbook_navigate_legal
- [ ] operator_playbook_navigate_medical
- [ ] operator_playbook_navigate_ops
- [ ] operator_playbook_open_finance
- [ ] operator_playbook_open_legal
- [ ] operator_playbook_open_medical
- [ ] operator_playbook_open_ops
- [ ] operator_playbook_extract_finance
- [ ] operator_playbook_extract_legal
- [ ] operator_playbook_extract_medical
- [ ] operator_playbook_extract_ops
- [ ] operator_playbook_summarize_finance
- [ ] operator_playbook_summarize_legal
- [ ] operator_playbook_summarize_medical
- [ ] operator_playbook_summarize_ops
- [ ] operator_playbook_compare_finance
- [ ] operator_playbook_compare_legal
- [ ] operator_playbook_compare_medical
- [ ] operator_playbook_compare_ops
- [ ] operator_playbook_locate_finance
- [ ] operator_playbook_locate_legal
- [ ] operator_playbook_locate_medical
- [ ] operator_playbook_locate_ops
- [ ] operator_playbook_calculate_finance
- [ ] operator_playbook_calculate_legal
- [ ] operator_playbook_calculate_medical
- [ ] operator_playbook_calculate_ops
- [ ] operator_playbook_evaluate_finance
- [ ] operator_playbook_evaluate_legal
- [ ] operator_playbook_evaluate_medical
- [ ] operator_playbook_evaluate_ops
- [ ] operator_playbook_validate_finance
- [ ] operator_playbook_validate_legal
- [ ] operator_playbook_validate_medical
- [ ] operator_playbook_validate_ops
- [ ] operator_playbook_advise_finance
- [ ] operator_playbook_advise_legal
- [ ] operator_playbook_advise_medical
- [ ] operator_playbook_advise_ops
- [ ] operator_playbook_monitor_finance
- [ ] operator_playbook_monitor_legal
- [ ] operator_playbook_monitor_medical
- [ ] operator_playbook_monitor_ops

## Reasoning Banks
- [ ] explain_style_finance
- [ ] decision_support_finance
- [ ] explain_style_legal
- [ ] decision_support_legal
- [ ] explain_style_medical
- [ ] decision_support_medical
- [ ] explain_style_ops
- [ ] decision_support_ops
- [ ] assumption_policy

## Quality Banks
- [ ] numeric_integrity
- [ ] wrong_doc_lock
- [ ] source_policy
- [ ] ambiguity_questions

## Retrieval Banks
- [ ] query_rewrites_finance
- [ ] boost_rules_finance
- [ ] section_priority_finance
- [ ] query_rewrites_legal
- [ ] boost_rules_legal
- [ ] section_priority_legal
- [ ] query_rewrites_medical
- [ ] boost_rules_medical
- [ ] section_priority_medical
- [ ] query_rewrites_ops
- [ ] boost_rules_ops
- [ ] section_priority_ops

## Marketing Banks
- [ ] keyword_taxonomy_finance
- [ ] pain_points_finance
- [ ] keyword_taxonomy_legal
- [ ] pain_points_legal
- [ ] keyword_taxonomy_medical
- [ ] pain_points_medical
- [ ] keyword_taxonomy_ops
- [ ] pain_points_ops
- [ ] pattern_library

## Required Core Banks
- [ ] doc_taxonomy
- [ ] doc_archetypes_finance
- [ ] doc_aliases_finance
- [ ] doc_archetypes_legal
- [ ] doc_aliases_legal
- [ ] doc_archetypes_medical
- [ ] doc_aliases_medical
- [ ] doc_archetypes_ops
- [ ] doc_aliases_ops
- [ ] headings_map
- [ ] table_header_ontology_finance
- [ ] table_header_ontology_legal
- [ ] table_header_ontology_medical
- [ ] table_header_ontology_ops
- [ ] sheetname_patterns
- [ ] layout_cues
- [ ] money_patterns
- [ ] date_patterns
- [ ] party_patterns
- [ ] identifier_patterns
- [ ] finance_kpi_ontology
- [ ] accounting_rules
- [ ] finance_doc_logic
- [ ] legal_clause_ontology
- [ ] legal_risk_heuristics
- [ ] legal_reference_rules
- [ ] medical_report_ontology
- [ ] medical_safety_boundaries
- [ ] medical_explanation_templates
- [ ] operator_playbook_navigate_finance
- [ ] operator_playbook_navigate_legal
- [ ] operator_playbook_navigate_medical
- [ ] operator_playbook_navigate_ops
- [ ] operator_playbook_open_finance
- [ ] operator_playbook_open_legal
- [ ] operator_playbook_open_medical
- [ ] operator_playbook_open_ops
- [ ] operator_playbook_extract_finance
- [ ] operator_playbook_extract_legal
- [ ] operator_playbook_extract_medical
- [ ] operator_playbook_extract_ops
- [ ] operator_playbook_summarize_finance
- [ ] operator_playbook_summarize_legal
- [ ] operator_playbook_summarize_medical
- [ ] operator_playbook_summarize_ops
- [ ] operator_playbook_compare_finance
- [ ] operator_playbook_compare_legal
- [ ] operator_playbook_compare_medical
- [ ] operator_playbook_compare_ops
- [ ] operator_playbook_locate_finance
- [ ] operator_playbook_locate_legal
- [ ] operator_playbook_locate_medical
- [ ] operator_playbook_locate_ops
- [ ] operator_playbook_calculate_finance
- [ ] operator_playbook_calculate_legal
- [ ] operator_playbook_calculate_medical
- [ ] operator_playbook_calculate_ops
- [ ] operator_playbook_evaluate_finance
- [ ] operator_playbook_evaluate_legal
- [ ] operator_playbook_evaluate_medical
- [ ] operator_playbook_evaluate_ops
- [ ] operator_playbook_validate_finance
- [ ] operator_playbook_validate_legal
- [ ] operator_playbook_validate_medical
- [ ] operator_playbook_validate_ops
- [ ] operator_playbook_advise_finance
- [ ] operator_playbook_advise_legal
- [ ] operator_playbook_advise_medical
- [ ] operator_playbook_advise_ops
- [ ] operator_playbook_monitor_finance
- [ ] operator_playbook_monitor_legal
- [ ] operator_playbook_monitor_medical
- [ ] operator_playbook_monitor_ops
- [ ] explain_style_finance
- [ ] decision_support_finance
- [ ] explain_style_legal
- [ ] decision_support_legal
- [ ] explain_style_medical
- [ ] decision_support_medical
- [ ] explain_style_ops
- [ ] decision_support_ops
- [ ] assumption_policy
- [ ] numeric_integrity
- [ ] wrong_doc_lock
- [ ] source_policy
- [ ] ambiguity_questions
- [ ] query_rewrites_finance
- [ ] boost_rules_finance
- [ ] section_priority_finance
- [ ] query_rewrites_legal
- [ ] boost_rules_legal
- [ ] section_priority_legal
- [ ] query_rewrites_medical
- [ ] boost_rules_medical
- [ ] section_priority_medical
- [ ] query_rewrites_ops
- [ ] boost_rules_ops
- [ ] section_priority_ops

## Optional Banks
- [ ] keyword_taxonomy_finance
- [ ] pain_points_finance
- [ ] keyword_taxonomy_legal
- [ ] pain_points_legal
- [ ] keyword_taxonomy_medical
- [ ] pain_points_medical
- [ ] keyword_taxonomy_ops
- [ ] pain_points_ops
- [ ] pattern_library

## Wiring Tasks
- [ ] Register all banks in `manifest/bank_registry.any.json`
- [ ] Add dependency nodes in `manifest/bank_dependencies.any.json`
- [ ] Add aliases in `manifest/bank_aliases.any.json`
- [ ] Integrate document intelligence integrity service into bootstrap
- [ ] Ensure runtime integrity includes doc intelligence map as required
- [ ] Add retrieval domain rewrite hook using `query_rewrites_{domain}`
- [ ] Add operator/domain loading adapter for playbooks
- [ ] Wire quality policy readers for source/numeric/wrong-doc/ambiguity
- [ ] Add telemetry for doc-int policy hits and misses

## Data Population Tasks
- [ ] Fill finance KPI formulas and synonyms
- [ ] Fill legal clause ontology and risk heuristics
- [ ] Fill medical report ontology and safety boundaries
- [ ] Populate multilingual heading/table header ontologies (EN/PT)
- [ ] Populate entity patterns for IDs, money, dates, parties
- [ ] Add at least 50 high-quality examples per domain/operator playbook

## Validation and Certification
- [ ] Add unit tests for document intelligence integrity service
- [ ] Add retrieval tests for domain rewrite behavior
- [ ] Add quality-gate tests for wrong-doc lock and source policy
- [ ] Add finance/legal/medical evaluation sets (100 prompts each)
- [ ] Define pass thresholds for evidence fidelity and safety boundaries

## Deployment Readiness
- [ ] Enable feature flag rollout in staging (10% -> 50% -> 100%)
- [ ] Monitor failure reasons by bank id and domain
- [ ] Backfill/reprocess non-AI-usable docs with new policies
- [ ] Publish runbook for doc intelligence bank updates
