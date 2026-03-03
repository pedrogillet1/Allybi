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
- [ ] Domain coverage complete: accounting
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
- [ ] doc_archetypes_accounting

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
- [ ] query_rewrites_accounting
- [ ] boost_rules_accounting
- [ ] section_priority_accounting
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
- [ ] doc_archetypes_accounting
- [ ] doc_aliases_accounting
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
- [ ] ops_kpi_ontology
- [ ] ops_doc_logic
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
- [ ] query_rewrites_accounting
- [ ] boost_rules_accounting
- [ ] section_priority_accounting
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
- [ ] keyword_taxonomy_legal
- [ ] keyword_taxonomy_medical
- [ ] keyword_taxonomy_ops
- [ ] legal_abbreviations_en
- [ ] legal_abbreviations_pt
- [ ] legal_answer_style_bank
- [ ] legal_board_resolution_extraction_hints
- [ ] legal_board_resolution_sections
- [ ] legal_board_resolution_tables
- [ ] legal_disclaimer_policy
- [ ] legal_doc_type_catalog
- [ ] legal_domain_detection_rules
- [ ] legal_domain_profile
- [ ] legal_dpa_extraction_hints
- [ ] legal_dpa_sections
- [ ] legal_dpa_tables
- [ ] legal_employment_agreement_extraction_hints
- [ ] legal_employment_agreement_sections
- [ ] legal_employment_agreement_tables
- [ ] legal_evidence_requirements
- [ ] legal_lease_extraction_hints
- [ ] legal_lease_sections
- [ ] legal_lease_tables
- [ ] legal_lexicon_en
- [ ] legal_lexicon_pt
- [ ] legal_litigation_memo_extraction_hints
- [ ] legal_litigation_memo_sections
- [ ] legal_litigation_memo_tables
- [ ] legal_msa_extraction_hints
- [ ] legal_msa_sections
- [ ] legal_msa_tables
- [ ] legal_nda_extraction_hints
- [ ] legal_nda_sections
- [ ] legal_nda_tables
- [ ] legal_privacy_policy_extraction_hints
- [ ] legal_privacy_policy_sections
- [ ] legal_privacy_policy_tables
- [ ] legal_reasoning_scaffolds
- [ ] legal_redaction_and_safety_rules
- [ ] legal_retrieval_strategies
- [ ] legal_sow_extraction_hints
- [ ] legal_sow_sections
- [ ] legal_sow_tables
- [ ] legal_terms_extraction_hints
- [ ] legal_terms_sections
- [ ] legal_terms_tables
- [ ] legal_validation_policies
- [ ] medical_abbreviations_en
- [ ] medical_abbreviations_pt
- [ ] medical_answer_style_bank
- [ ] medical_care_plan_extraction_hints
- [ ] medical_care_plan_sections
- [ ] medical_care_plan_tables
- [ ] medical_discharge_summary_extraction_hints
- [ ] medical_discharge_summary_sections
- [ ] medical_discharge_summary_tables
- [ ] medical_disclaimer_policy
- [ ] medical_doc_type_catalog
- [ ] medical_domain_detection_rules
- [ ] medical_domain_profile
- [ ] medical_evidence_requirements
- [ ] medical_lab_report_extraction_hints
- [ ] medical_lab_report_sections
- [ ] medical_lab_report_tables
- [ ] medical_lexicon_en
- [ ] medical_lexicon_pt
- [ ] medical_med_list_extraction_hints
- [ ] medical_med_list_sections
- [ ] medical_med_list_tables
- [ ] medical_progress_note_extraction_hints
- [ ] medical_progress_note_sections
- [ ] medical_progress_note_tables
- [ ] medical_radiology_report_extraction_hints
- [ ] medical_radiology_report_sections
- [ ] medical_radiology_report_tables
- [ ] medical_reasoning_scaffolds
- [ ] medical_redaction_and_safety_rules
- [ ] medical_referral_extraction_hints
- [ ] medical_referral_sections
- [ ] medical_referral_tables
- [ ] medical_retrieval_strategies
- [ ] medical_soap_note_extraction_hints
- [ ] medical_soap_note_sections
- [ ] medical_soap_note_tables
- [ ] medical_validation_policies
- [ ] pain_points_finance
- [ ] pain_points_legal
- [ ] pain_points_medical
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
