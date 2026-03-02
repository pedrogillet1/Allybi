# Data Bank Types and Complexity

- Generated: 2026-03-02T21:24:15.147Z
- Source registry: `backend/src/data_banks/manifest/bank_registry.any.json`
- Data banks root: `backend/src/data_banks`
- Tokenizer: `gpt-tokenizer.encode`

## Overall

- Total banks: **1019**
- Total size: **19.76 MB** (20719127 bytes)
- Total words: **1390073**
- Total tokens: **5095958**

## Complexity Scale

- Per-bank complexity is percentile-based by token count.
- Low: <= 1782 tokens
- Medium: 1783 to 5196 tokens
- High: 5197 to 32683 tokens
- Very High: > 32683 tokens

## Types Summary

| Type (Category) | Banks | MB | Words | Tokens | Avg Tokens/Bank | Complexity | Missing Files |
|---|---:|---:|---:|---:|---:|---|---:|
| semantics | 606 | 11.91 | 819246 | 2985224 | 4926 | Medium | 0 |
| manifest | 15 | 1.46 | 91159 | 437385 | 29159 | High | 0 |
| routing | 27 | 1 | 72002 | 269237 | 9972 | High | 0 |
| probes | 10 | 1.07 | 79593 | 245686 | 24569 | High | 0 |
| intent_patterns | 4 | 0.75 | 51480 | 196759 | 49190 | Very High | 0 |
| retrieval | 36 | 0.58 | 33334 | 156108 | 4336 | Medium | 0 |
| policies | 64 | 0.59 | 43890 | 153383 | 2397 | Medium | 0 |
| operators | 50 | 0.53 | 47650 | 134227 | 2685 | Medium | 0 |
| normalizers | 10 | 0.5 | 37292 | 133004 | 13300 | High | 0 |
| lexicons | 34 | 0.29 | 20001 | 82073 | 2414 | Medium | 0 |
| quality | 36 | 0.26 | 22176 | 67881 | 1886 | Medium | 0 |
| dictionaries | 31 | 0.17 | 15097 | 50055 | 1615 | Low | 0 |
| templates | 3 | 0.11 | 11378 | 32993 | 10998 | High | 0 |
| microcopy | 11 | 0.12 | 13036 | 32147 | 2922 | Medium | 0 |
| parsers | 10 | 0.1 | 6846 | 27831 | 2783 | Medium | 0 |
| formatting | 21 | 0.09 | 6879 | 26281 | 1251 | Low | 0 |
| prompts | 13 | 0.07 | 6686 | 19164 | 1474 | Low | 0 |
| overlays | 6 | 0.04 | 3493 | 11645 | 1941 | Medium | 0 |
| triggers | 2 | 0.03 | 2567 | 9889 | 4945 | Medium | 0 |
| schemas | 16 | 0.03 | 1958 | 7543 | 471 | Low | 0 |
| ambiguity | 3 | 0.02 | 1797 | 6984 | 2328 | Medium | 0 |
| fallbacks | 5 | 0.02 | 1113 | 5382 | 1076 | Low | 0 |
| scope | 3 | 0.01 | 986 | 3532 | 1177 | Low | 0 |
| tests | 3 | 0.01 | 414 | 1545 | 515 | Low | 0 |

## Banks By Type

### semantics (606)

| Bank ID | Path | Tokens | Complexity | Last Updated |
|---|---|---:|---|---|
| medical_explanation_templates | `semantics/domain/medical_explanation_templates.any.json` | 172754 | Very High | 2026-03-01 |
| medical_report_ontology | `semantics/domain/medical_report_ontology.any.json` | 158848 | Very High | 2026-03-01 |
| doc_taxonomy | `semantics/taxonomy/doc_taxonomy.any.json` | 78183 | Very High | 2026-03-01 |
| legal_clause_ontology | `semantics/domain/legal_clause_ontology.any.json` | 76613 | Very High | 2026-03-01 |
| legal_risk_heuristics | `semantics/domain/legal_risk_heuristics.any.json` | 70784 | Very High | 2026-03-01 |
| medical_safety_boundaries | `semantics/domain/medical_safety_boundaries.any.json` | 68209 | Very High | 2026-03-01 |
| excel_function_catalog | `agents/excel_calc/execution/excel_function_catalog.any.json` | 66088 | Very High | 2026-03-01 |
| legal_reference_rules | `semantics/domain/legal_reference_rules.any.json` | 62646 | Very High | 2026-03-01 |
| python_recipe_catalog | `agents/excel_calc/execution/python_recipe_catalog.any.json` | 59035 | Very High | 2026-03-01 |
| ops_kpi_ontology | `semantics/domain/ops_kpi_ontology.any.json` | 56484 | Very High | 2026-03-01 |
| finance_kpi_ontology | `semantics/domain/finance_kpi_ontology.any.json` | 55208 | Very High | 2026-03-01 |
| headings_map | `semantics/structure/headings_map.any.json` | 47133 | Very High | 2026-03-01 |
| ops_doc_logic | `semantics/domain/ops_doc_logic.any.json` | 46778 | Very High | 2026-03-01 |
| finance_doc_logic | `semantics/domain/finance_doc_logic.any.json` | 44747 | Very High | 2026-03-01 |
| accounting_rules | `semantics/domain/accounting_rules.any.json` | 43243 | Very High | 2026-03-01 |
| doc_aliases_housing | `normalizers/doc_aliases/housing.any.json` | 42278 | Very High | 2026-02-27 |
| doc_aliases_banking | `normalizers/doc_aliases/banking.any.json` | 41371 | Very High | 2026-02-27 |
| column_semantics_ontology | `agents/excel_calc/semantics/column_semantics_ontology.any.json` | 39846 | Very High | 2026-02-28 |
| doc_aliases_billing | `normalizers/doc_aliases/billing.any.json` | 37920 | Very High | 2026-02-27 |
| stats_method_ontology | `agents/excel_calc/execution/stats_method_ontology.any.json` | 27824 | High | 2026-02-28 |
| doc_aliases_identity | `normalizers/doc_aliases/identity.any.json` | 25236 | High | 2026-02-27 |
| money_patterns | `semantics/entities/money_patterns.any.json` | 24222 | High | 2026-03-01 |
| doc_aliases_tax | `normalizers/doc_aliases/tax.any.json` | 23599 | High | 2026-02-27 |
| range_resolution_rules | `agents/excel_calc/semantics/range_resolution_rules.any.json` | 22958 | High | 2026-02-28 |
| spreadsheet_semantics | `semantics/spreadsheet_semantics.any.json` | 22443 | High | 2026-03-01 |
| doc_aliases_insurance | `normalizers/doc_aliases/insurance.any.json` | 22400 | High | 2026-02-27 |
| date_patterns | `semantics/entities/date_patterns.any.json` | 22316 | High | 2026-03-01 |
| layout_cues | `semantics/structure/layout_cues.any.json` | 21418 | High | 2026-03-01 |
| table_header_ontology_medical | `semantics/structure/table_header_ontology.medical.any.json` | 21240 | High | 2026-03-01 |
| table_header_ontology_insurance | `semantics/structure/table_header_ontology.insurance.any.json` | 20665 | High | 2026-03-01 |
| table_header_ontology_billing | `semantics/structure/table_header_ontology.billing.any.json` | 20174 | High | 2026-03-01 |
| table_header_ontology_legal | `semantics/structure/table_header_ontology.legal.any.json` | 20061 | High | 2026-03-01 |
| table_header_ontology_tax | `semantics/structure/table_header_ontology.tax.any.json` | 19900 | High | 2026-03-01 |
| identifier_patterns | `semantics/entities/identifier_patterns.any.json` | 19686 | High | 2026-03-01 |
| table_header_ontology_banking | `semantics/structure/table_header_ontology.banking.any.json` | 19549 | High | 2026-03-01 |
| table_header_ontology_finance | `semantics/structure/table_header_ontology.finance.any.json` | 19034 | High | 2026-03-01 |
| locale_numeric_date_rules | `agents/excel_calc/semantics/locale_numeric_date_rules.any.json` | 18836 | High | 2026-02-28 |
| table_header_ontology_ops | `semantics/structure/table_header_ontology.ops.any.json` | 16787 | High | 2026-03-01 |
| di_doc_type_ontology | `document_intelligence/semantics/doc_type_ontology.any.json` | 16206 | High | 2026-02-27 |
| table_header_ontology_accounting | `semantics/structure/table_header_ontology.accounting.any.json` | 15310 | High | 2026-03-01 |
| distribution_ontology | `agents/excel_calc/execution/distribution_ontology.any.json` | 15141 | High | 2026-02-28 |
| doc_archetypes_accounting | `semantics/taxonomy/doc_archetypes/accounting.any.json` | 15018 | High | 2026-02-28 |
| doc_archetypes_ops | `semantics/taxonomy/doc_archetypes/ops.any.json` | 12552 | High | 2026-02-27 |
| doc_archetypes_medical | `semantics/taxonomy/doc_archetypes/medical.any.json` | 12284 | High | 2026-02-27 |
| doc_archetypes_legal | `semantics/taxonomy/doc_archetypes/legal.any.json` | 12121 | High | 2026-02-27 |
| party_patterns | `semantics/entities/party_patterns.any.json` | 11849 | High | 2026-03-01 |
| excel_number_formats_structure | `semantics/structure/excel_number_formats.any.json` | 10837 | High | 2026-03-01 |
| doc_archetypes_finance | `semantics/taxonomy/doc_archetypes/finance.any.json` | 10821 | High | 2026-02-27 |
| boost_rules_accounting | `retrieval/boost_rules.accounting.any.json` | 10658 | High | 2026-02-27 |
| section_priority_accounting | `retrieval/section_priority.accounting.any.json` | 9415 | High | 2026-02-27 |
| sheetname_patterns | `semantics/structure/sheetname_patterns.any.json` | 9026 | High | 2026-03-01 |
| di_metric_ontology | `document_intelligence/semantics/metric_ontology.any.json` | 8606 | High | 2026-02-27 |
| query_rewrites_accounting | `retrieval/query_rewrites.accounting.any.json` | 8121 | High | 2026-02-27 |
| di_entity_ontology | `document_intelligence/semantics/entity_ontology.any.json` | 6663 | High | 2026-02-27 |
| domain_ontology | `semantics/domain_ontology.any.json` | 6450 | High | 2026-01-26 |
| di_finance_doc_type_catalog | `document_intelligence/domains/finance/doc_types/doc_type_catalog.any.json` | 6443 | High | 2026-02-28 |
| legal_doc_type_catalog | `document_intelligence/domains/legal/doc_types/doc_type_catalog.any.json` | 6414 | High | 2026-02-27 |
| legal_legal_litigation_memo_tables | `document_intelligence/domains/legal/doc_types/tables/legal_litigation_memo.tables.any.json` | 6401 | High | 2026-02-27 |
| legal_litigation_memo_tables | `document_intelligence/domains/legal/doc_types/tables/litigation_memo.tables.any.json` | 6353 | High | 2026-02-27 |
| legal_legal_lease_agreement_tables | `document_intelligence/domains/legal/doc_types/tables/legal_lease_agreement.tables.any.json` | 6333 | High | 2026-02-27 |
| medical_radiology_report_tables | `document_intelligence/domains/medical/doc_types/tables/radiology_report.tables.any.json` | 6328 | High | 2026-02-27 |
| legal_nda_tables | `document_intelligence/domains/legal/doc_types/tables/nda.tables.any.json` | 6327 | High | 2026-02-27 |
| medical_discharge_summary_tables | `document_intelligence/domains/medical/doc_types/tables/discharge_summary.tables.any.json` | 6327 | High | 2026-02-27 |
| medical_med_referral_note_tables | `document_intelligence/domains/medical/doc_types/tables/med_referral_note.tables.any.json` | 6306 | High | 2026-02-27 |
| legal_dpa_tables | `document_intelligence/domains/legal/doc_types/tables/dpa.tables.any.json` | 6305 | High | 2026-02-27 |
| legal_sow_tables | `document_intelligence/domains/legal/doc_types/tables/sow.tables.any.json` | 6305 | High | 2026-02-27 |
| legal_employment_agreement_tables | `document_intelligence/domains/legal/doc_types/tables/employment_agreement.tables.any.json` | 6285 | High | 2026-02-27 |
| legal_msa_tables | `document_intelligence/domains/legal/doc_types/tables/msa.tables.any.json` | 6282 | High | 2026-02-27 |
| medical_med_lab_report_tables | `document_intelligence/domains/medical/doc_types/tables/med_lab_report.tables.any.json` | 6282 | High | 2026-02-27 |
| legal_terms_tables | `document_intelligence/domains/legal/doc_types/tables/terms.tables.any.json` | 6281 | High | 2026-02-27 |
| legal_privacy_policy_tables | `document_intelligence/domains/legal/doc_types/tables/privacy_policy.tables.any.json` | 6261 | High | 2026-02-27 |
| legal_board_resolution_tables | `document_intelligence/domains/legal/doc_types/tables/board_resolution.tables.any.json` | 6260 | High | 2026-02-27 |
| medical_care_plan_tables | `document_intelligence/domains/medical/doc_types/tables/care_plan.tables.any.json` | 6259 | High | 2026-02-27 |
| medical_soap_note_tables | `document_intelligence/domains/medical/doc_types/tables/soap_note.tables.any.json` | 6259 | High | 2026-02-27 |
| medical_lab_report_tables | `document_intelligence/domains/medical/doc_types/tables/lab_report.tables.any.json` | 6258 | High | 2026-02-27 |
| medical_med_list_tables | `document_intelligence/domains/medical/doc_types/tables/med_list.tables.any.json` | 6258 | High | 2026-02-27 |
| medical_progress_note_tables | `document_intelligence/domains/medical/doc_types/tables/progress_note.tables.any.json` | 6258 | High | 2026-02-27 |
| medical_referral_tables | `document_intelligence/domains/medical/doc_types/tables/referral.tables.any.json` | 6258 | High | 2026-02-27 |
| legal_lease_tables | `document_intelligence/domains/legal/doc_types/tables/lease.tables.any.json` | 6237 | High | 2026-02-27 |
| di_section_ontology | `document_intelligence/semantics/section_ontology.any.json` | 5995 | High | 2026-02-27 |
| medical_med_immunization_record_extraction_hints | `document_intelligence/domains/medical/doc_types/extraction/med_immunization_record.extraction_hints.any.json` | 5226 | High | 2026-02-27 |
| medical_med_followup_instructions_extraction_hints | `document_intelligence/domains/medical/doc_types/extraction/med_followup_instructions.extraction_hints.any.json` | 5196 | Medium | 2026-02-27 |
| medical_med_history_and_physical_extraction_hints | `document_intelligence/domains/medical/doc_types/extraction/med_history_and_physical.extraction_hints.any.json` | 5196 | Medium | 2026-02-27 |
| medical_med_radiology_report_extraction_hints | `document_intelligence/domains/medical/doc_types/extraction/med_radiology_report.extraction_hints.any.json` | 5196 | Medium | 2026-02-27 |
| medical_med_discharge_summary_extraction_hints | `document_intelligence/domains/medical/doc_types/extraction/med_discharge_summary.extraction_hints.any.json` | 5134 | Medium | 2026-02-27 |
| medical_med_lab_results_report_extraction_hints | `document_intelligence/domains/medical/doc_types/extraction/med_lab_results_report.extraction_hints.any.json` | 5134 | Medium | 2026-02-27 |
| medical_med_pathology_report_extraction_hints | `document_intelligence/domains/medical/doc_types/extraction/med_pathology_report.extraction_hints.any.json` | 5134 | Medium | 2026-02-27 |
| medical_med_vitals_chart_extraction_hints | `document_intelligence/domains/medical/doc_types/extraction/med_vitals_chart.extraction_hints.any.json` | 5134 | Medium | 2026-02-27 |
| medical_med_allergy_list_extraction_hints | `document_intelligence/domains/medical/doc_types/extraction/med_allergy_list.extraction_hints.any.json` | 5133 | Medium | 2026-02-27 |
| medical_med_ecg_report_extraction_hints | `document_intelligence/domains/medical/doc_types/extraction/med_ecg_report.extraction_hints.any.json` | 5133 | Medium | 2026-02-27 |
| medical_med_emergency_note_extraction_hints | `document_intelligence/domains/medical/doc_types/extraction/med_emergency_note.extraction_hints.any.json` | 5133 | Medium | 2026-02-27 |
| medical_med_medication_list_extraction_hints | `document_intelligence/domains/medical/doc_types/extraction/med_medication_list.extraction_hints.any.json` | 5133 | Medium | 2026-02-27 |
| medical_med_nursing_note_extraction_hints | `document_intelligence/domains/medical/doc_types/extraction/med_nursing_note.extraction_hints.any.json` | 5133 | Medium | 2026-02-27 |
| medical_med_referral_letter_extraction_hints | `document_intelligence/domains/medical/doc_types/extraction/med_referral_letter.extraction_hints.any.json` | 5133 | Medium | 2026-02-27 |
| medical_med_care_plan_extraction_hints | `document_intelligence/domains/medical/doc_types/extraction/med_care_plan.extraction_hints.any.json` | 5103 | Medium | 2026-02-27 |
| medical_med_consult_note_extraction_hints | `document_intelligence/domains/medical/doc_types/extraction/med_consult_note.extraction_hints.any.json` | 5103 | Medium | 2026-02-27 |
| medical_med_soap_note_extraction_hints | `document_intelligence/domains/medical/doc_types/extraction/med_soap_note.extraction_hints.any.json` | 5103 | Medium | 2026-02-27 |
| medical_med_problem_list_extraction_hints | `document_intelligence/domains/medical/doc_types/extraction/med_problem_list.extraction_hints.any.json` | 5041 | Medium | 2026-02-27 |
| medical_med_progress_note_extraction_hints | `document_intelligence/domains/medical/doc_types/extraction/med_progress_note.extraction_hints.any.json` | 5041 | Medium | 2026-02-27 |
| medical_med_prescription_extraction_hints | `document_intelligence/domains/medical/doc_types/extraction/med_prescription.extraction_hints.any.json` | 5040 | Medium | 2026-02-27 |
| legal_bylaws_charter_extraction_hints | `document_intelligence/domains/legal/doc_types/extraction/legal_bylaws_charter.extraction_hints.any.json` | 4734 | Medium | 2026-02-27 |
| legal_partnership_jv_extraction_hints | `document_intelligence/domains/legal/doc_types/extraction/legal_partnership_jv.extraction_hints.any.json` | 4705 | Medium | 2026-02-27 |
| legal_consulting_agreement_extraction_hints | `document_intelligence/domains/legal/doc_types/extraction/legal_consulting_agreement.extraction_hints.any.json` | 4678 | Medium | 2026-02-27 |
| legal_contractor_agreement_extraction_hints | `document_intelligence/domains/legal/doc_types/extraction/legal_contractor_agreement.extraction_hints.any.json` | 4651 | Medium | 2026-02-27 |
| legal_acceptable_use_policy_extraction_hints | `document_intelligence/domains/legal/doc_types/extraction/legal_acceptable_use_policy.extraction_hints.any.json` | 4626 | Medium | 2026-02-27 |
| legal_data_retention_policy_extraction_hints | `document_intelligence/domains/legal/doc_types/extraction/legal_data_retention_policy.extraction_hints.any.json` | 4626 | Medium | 2026-02-27 |
| legal_code_of_conduct_extraction_hints | `document_intelligence/domains/legal/doc_types/extraction/legal_code_of_conduct.extraction_hints.any.json` | 4625 | Medium | 2026-02-27 |
| legal_reseller_distribution_extraction_hints | `document_intelligence/domains/legal/doc_types/extraction/legal_reseller_distribution.extraction_hints.any.json` | 4625 | Medium | 2026-02-27 |
| legal_settlement_agreement_extraction_hints | `document_intelligence/domains/legal/doc_types/extraction/legal_settlement_agreement.extraction_hints.any.json` | 4624 | Medium | 2026-02-27 |
| di_unit_and_measurement_ontology | `document_intelligence/semantics/unit_and_measurement_ontology.any.json` | 4596 | Medium | 2026-02-27 |
| legal_motion_brief_extraction_hints | `document_intelligence/domains/legal/doc_types/extraction/legal_motion_brief.extraction_hints.any.json` | 4571 | Medium | 2026-02-27 |
| legal_terms_of_service_extraction_hints | `document_intelligence/domains/legal/doc_types/extraction/legal_terms_of_service.extraction_hints.any.json` | 4571 | Medium | 2026-02-27 |
| legal_complaint_extraction_hints | `document_intelligence/domains/legal/doc_types/extraction/legal_complaint.extraction_hints.any.json` | 4544 | Medium | 2026-02-27 |
| legal_court_order_extraction_hints | `document_intelligence/domains/legal/doc_types/extraction/legal_court_order.extraction_hints.any.json` | 4544 | Medium | 2026-02-27 |
| legal_eula_extraction_hints | `document_intelligence/domains/legal/doc_types/extraction/legal_eula.extraction_hints.any.json` | 4544 | Medium | 2026-02-27 |
| legal_license_agreement_extraction_hints | `document_intelligence/domains/legal/doc_types/extraction/legal_license_agreement.extraction_hints.any.json` | 4544 | Medium | 2026-02-27 |
| legal_written_consent_extraction_hints | `document_intelligence/domains/legal/doc_types/extraction/legal_written_consent.extraction_hints.any.json` | 4544 | Medium | 2026-02-27 |
| legal_baa_extraction_hints | `document_intelligence/domains/legal/doc_types/extraction/legal_baa.extraction_hints.any.json` | 4517 | Medium | 2026-02-27 |
| legal_board_minutes_extraction_hints | `document_intelligence/domains/legal/doc_types/extraction/legal_board_minutes.extraction_hints.any.json` | 4517 | Medium | 2026-02-27 |
| legal_ip_assignment_extraction_hints | `document_intelligence/domains/legal/doc_types/extraction/legal_ip_assignment.extraction_hints.any.json` | 4517 | Medium | 2026-02-27 |
| legal_sla_extraction_hints | `document_intelligence/domains/legal/doc_types/extraction/legal_sla.extraction_hints.any.json` | 4517 | Medium | 2026-02-27 |
| legal_cookie_policy_extraction_hints | `document_intelligence/domains/legal/doc_types/extraction/legal_cookie_policy.extraction_hints.any.json` | 4490 | Medium | 2026-02-27 |
| legal_offer_letter_extraction_hints | `document_intelligence/domains/legal/doc_types/extraction/legal_offer_letter.extraction_hints.any.json` | 4490 | Medium | 2026-02-27 |
| legal_security_policy_extraction_hints | `document_intelligence/domains/legal/doc_types/extraction/legal_security_policy.extraction_hints.any.json` | 4490 | Medium | 2026-02-27 |
| medical_doc_type_catalog | `document_intelligence/domains/medical/doc_types/doc_type_catalog.any.json` | 4103 | Medium | 2026-02-27 |
| allybi_capabilities | `semantics/allybi_capabilities.any.json` | 3862 | Medium | 2026-02-12 |
| di_insurance_extraction_ins_explanation_of_benefits | `document_intelligence/domains/insurance/doc_types/extraction/ins_explanation_of_benefits.extraction_hints.any.json` | 3796 | Medium | 2026-02-27 |
| di_tax_extraction_tax_individual_income_return | `document_intelligence/domains/tax/doc_types/extraction/tax_individual_income_return.extraction_hints.any.json` | 3734 | Medium | 2026-02-27 |
| di_insurance_extraction_ins_policy_document | `document_intelligence/domains/insurance/doc_types/extraction/ins_policy_document.extraction_hints.any.json` | 3665 | Medium | 2026-02-27 |
| legal_legal_litigation_memo_extraction_hints | `document_intelligence/domains/legal/doc_types/extraction/legal_litigation_memo.extraction_hints.any.json` | 3589 | Medium | 2026-02-27 |
| document_intelligence_bank_map | `semantics/document_intelligence_bank_map.any.json` | 3577 | Medium | 2026-03-01 |
| di_tax_extraction_tax_property_tax_bill | `document_intelligence/domains/tax/doc_types/extraction/tax_property_tax_bill.extraction_hints.any.json` | 3571 | Medium | 2026-02-27 |
| di_tax_extraction_tax_assessment_notice | `document_intelligence/domains/tax/doc_types/extraction/tax_assessment_notice.extraction_hints.any.json` | 3568 | Medium | 2026-02-27 |
| di_identity_extraction_id_proof_of_address | `document_intelligence/domains/identity/doc_types/extraction/id_proof_of_address.extraction_hints.any.json` | 3557 | Medium | 2026-02-27 |
| di_identity_extraction_id_business_registration_certificate | `document_intelligence/domains/identity/doc_types/extraction/id_business_registration_certificate.extraction_hints.any.json` | 3556 | Medium | 2026-02-27 |
| di_insurance_extraction_ins_premium_invoice | `document_intelligence/domains/insurance/doc_types/extraction/ins_premium_invoice.extraction_hints.any.json` | 3553 | Medium | 2026-02-27 |
| di_tax_extraction_tax_payment_slip | `document_intelligence/domains/tax/doc_types/extraction/tax_payment_slip.extraction_hints.any.json` | 3547 | Medium | 2026-02-27 |
| di_identity_extraction_id_passport | `document_intelligence/domains/identity/doc_types/extraction/id_passport.extraction_hints.any.json` | 3532 | Medium | 2026-02-27 |
| di_insurance_extraction_ins_claim_submission | `document_intelligence/domains/insurance/doc_types/extraction/ins_claim_submission.extraction_hints.any.json` | 3532 | Medium | 2026-02-27 |
| legal_legal_lease_agreement_extraction_hints | `document_intelligence/domains/legal/doc_types/extraction/legal_lease_agreement.extraction_hints.any.json` | 3519 | Medium | 2026-02-27 |
| legal_litigation_memo_extraction_hints | `document_intelligence/domains/legal/doc_types/extraction/litigation_memo.extraction_hints.any.json` | 3517 | Medium | 2026-02-27 |
| di_identity_extraction_id_driver_license | `document_intelligence/domains/identity/doc_types/extraction/id_driver_license.extraction_hints.any.json` | 3515 | Medium | 2026-02-27 |
| medical_med_referral_note_extraction_hints | `document_intelligence/domains/medical/doc_types/extraction/med_referral_note.extraction_hints.any.json` | 3506 | Medium | 2026-02-27 |
| medical_radiology_report_extraction_hints | `document_intelligence/domains/medical/doc_types/extraction/radiology_report.extraction_hints.any.json` | 3472 | Medium | 2026-02-27 |
| medical_discharge_summary_extraction_hints | `document_intelligence/domains/medical/doc_types/extraction/discharge_summary.extraction_hints.any.json` | 3471 | Medium | 2026-02-27 |
| legal_employment_agreement_extraction_hints | `document_intelligence/domains/legal/doc_types/extraction/employment_agreement.extraction_hints.any.json` | 3447 | Medium | 2026-02-27 |
| legal_dpa_extraction_hints | `document_intelligence/domains/legal/doc_types/extraction/dpa.extraction_hints.any.json` | 3445 | Medium | 2026-02-27 |
| legal_nda_extraction_hints | `document_intelligence/domains/legal/doc_types/extraction/nda.extraction_hints.any.json` | 3445 | Medium | 2026-02-27 |
| legal_sow_extraction_hints | `document_intelligence/domains/legal/doc_types/extraction/sow.extraction_hints.any.json` | 3445 | Medium | 2026-02-27 |
| medical_med_lab_report_extraction_hints | `document_intelligence/domains/medical/doc_types/extraction/med_lab_report.extraction_hints.any.json` | 3436 | Medium | 2026-02-27 |
| medical_med_list_extraction_hints | `document_intelligence/domains/medical/doc_types/extraction/med_list.extraction_hints.any.json` | 3434 | Medium | 2026-02-27 |
| medical_referral_extraction_hints | `document_intelligence/domains/medical/doc_types/extraction/referral.extraction_hints.any.json` | 3434 | Medium | 2026-02-27 |
| legal_privacy_policy_extraction_hints | `document_intelligence/domains/legal/doc_types/extraction/privacy_policy.extraction_hints.any.json` | 3411 | Medium | 2026-02-27 |
| legal_board_resolution_extraction_hints | `document_intelligence/domains/legal/doc_types/extraction/board_resolution.extraction_hints.any.json` | 3410 | Medium | 2026-02-27 |
| legal_msa_extraction_hints | `document_intelligence/domains/legal/doc_types/extraction/msa.extraction_hints.any.json` | 3410 | Medium | 2026-02-27 |
| legal_terms_extraction_hints | `document_intelligence/domains/legal/doc_types/extraction/terms.extraction_hints.any.json` | 3409 | Medium | 2026-02-27 |
| medical_care_plan_extraction_hints | `document_intelligence/domains/medical/doc_types/extraction/care_plan.extraction_hints.any.json` | 3401 | Medium | 2026-02-27 |
| medical_soap_note_extraction_hints | `document_intelligence/domains/medical/doc_types/extraction/soap_note.extraction_hints.any.json` | 3401 | Medium | 2026-02-27 |
| medical_lab_report_extraction_hints | `document_intelligence/domains/medical/doc_types/extraction/lab_report.extraction_hints.any.json` | 3400 | Medium | 2026-02-27 |
| medical_progress_note_extraction_hints | `document_intelligence/domains/medical/doc_types/extraction/progress_note.extraction_hints.any.json` | 3400 | Medium | 2026-02-27 |
| legal_lease_extraction_hints | `document_intelligence/domains/legal/doc_types/extraction/lease.extraction_hints.any.json` | 3375 | Medium | 2026-02-27 |
| capabilities_catalog | `semantics/capabilities_catalog.any.json` | 3082 | Medium | 2026-03-01 |
| docint_eval_suite_registry | `document_intelligence/eval/suites/suite_registry.any.json` | 2971 | Medium | 2026-02-27 |
| di_domain_ontology | `document_intelligence/semantics/domain_ontology.any.json` | 2867 | Medium | 2026-02-27 |
| legal_nda_sections | `document_intelligence/domains/legal/doc_types/sections/nda.sections.any.json` | 2819 | Medium | 2026-02-27 |
| legal_legal_litigation_memo_sections | `document_intelligence/domains/legal/doc_types/sections/legal_litigation_memo.sections.any.json` | 2795 | Medium | 2026-02-27 |
| legal_litigation_memo_sections | `document_intelligence/domains/legal/doc_types/sections/litigation_memo.sections.any.json` | 2791 | Medium | 2026-02-27 |
| legal_dpa_sections | `document_intelligence/domains/legal/doc_types/sections/dpa.sections.any.json` | 2787 | Medium | 2026-02-27 |
| legal_sow_sections | `document_intelligence/domains/legal/doc_types/sections/sow.sections.any.json` | 2787 | Medium | 2026-02-27 |
| legal_msa_sections | `document_intelligence/domains/legal/doc_types/sections/msa.sections.any.json` | 2786 | Medium | 2026-02-27 |
| legal_terms_sections | `document_intelligence/domains/legal/doc_types/sections/terms.sections.any.json` | 2785 | Medium | 2026-02-27 |
| legal_legal_lease_agreement_sections | `document_intelligence/domains/legal/doc_types/sections/legal_lease_agreement.sections.any.json` | 2761 | Medium | 2026-02-27 |
| medical_radiology_report_sections | `document_intelligence/domains/medical/doc_types/sections/radiology_report.sections.any.json` | 2761 | Medium | 2026-02-27 |
| medical_discharge_summary_sections | `document_intelligence/domains/medical/doc_types/sections/discharge_summary.sections.any.json` | 2760 | Medium | 2026-02-27 |
| legal_employment_agreement_sections | `document_intelligence/domains/legal/doc_types/sections/employment_agreement.sections.any.json` | 2757 | Medium | 2026-02-27 |
| legal_privacy_policy_sections | `document_intelligence/domains/legal/doc_types/sections/privacy_policy.sections.any.json` | 2755 | Medium | 2026-02-27 |
| legal_board_resolution_sections | `document_intelligence/domains/legal/doc_types/sections/board_resolution.sections.any.json` | 2754 | Medium | 2026-02-27 |
| legal_lease_sections | `document_intelligence/domains/legal/doc_types/sections/lease.sections.any.json` | 2753 | Medium | 2026-02-27 |
| di_accounting_doc_type_catalog | `document_intelligence/domains/accounting/doc_types/doc_type_catalog.any.json` | 2741 | Medium | 2026-02-28 |
| medical_med_referral_note_sections | `document_intelligence/domains/medical/doc_types/sections/med_referral_note.sections.any.json` | 2729 | Medium | 2026-02-27 |
| medical_med_lab_report_sections | `document_intelligence/domains/medical/doc_types/sections/med_lab_report.sections.any.json` | 2727 | Medium | 2026-02-27 |
| medical_care_plan_sections | `document_intelligence/domains/medical/doc_types/sections/care_plan.sections.any.json` | 2726 | Medium | 2026-02-27 |
| medical_soap_note_sections | `document_intelligence/domains/medical/doc_types/sections/soap_note.sections.any.json` | 2726 | Medium | 2026-02-27 |
| di_identity_tables_id_passport | `document_intelligence/domains/identity/doc_types/tables/id_passport.tables.any.json` | 2725 | Medium | 2026-02-27 |
| medical_lab_report_sections | `document_intelligence/domains/medical/doc_types/sections/lab_report.sections.any.json` | 2725 | Medium | 2026-02-27 |
| medical_med_list_sections | `document_intelligence/domains/medical/doc_types/sections/med_list.sections.any.json` | 2725 | Medium | 2026-02-27 |
| medical_progress_note_sections | `document_intelligence/domains/medical/doc_types/sections/progress_note.sections.any.json` | 2725 | Medium | 2026-02-27 |
| medical_referral_sections | `document_intelligence/domains/medical/doc_types/sections/referral.sections.any.json` | 2725 | Medium | 2026-02-27 |
| di_identity_tables_id_business_registration_certificate | `document_intelligence/domains/identity/doc_types/tables/id_business_registration_certificate.tables.any.json` | 2724 | Medium | 2026-02-27 |
| di_identity_tables_id_proof_of_address | `document_intelligence/domains/identity/doc_types/tables/id_proof_of_address.tables.any.json` | 2723 | Medium | 2026-02-27 |
| di_identity_tables_id_driver_license | `document_intelligence/domains/identity/doc_types/tables/id_driver_license.tables.any.json` | 2718 | Medium | 2026-02-27 |
| legal_partnership_jv_tables | `document_intelligence/domains/legal/doc_types/tables/legal_partnership_jv.tables.any.json` | 2707 | Medium | 2026-02-27 |
| legal_ip_assignment_tables | `document_intelligence/domains/legal/doc_types/tables/legal_ip_assignment.tables.any.json` | 2701 | Medium | 2026-02-27 |
| legal_reseller_distribution_tables | `document_intelligence/domains/legal/doc_types/tables/legal_reseller_distribution.tables.any.json` | 2697 | Medium | 2026-02-27 |
| legal_bylaws_charter_tables | `document_intelligence/domains/legal/doc_types/tables/legal_bylaws_charter.tables.any.json` | 2694 | Medium | 2026-02-27 |
| legal_data_retention_policy_tables | `document_intelligence/domains/legal/doc_types/tables/legal_data_retention_policy.tables.any.json` | 2682 | Medium | 2026-02-27 |
| medical_med_followup_instructions_tables | `document_intelligence/domains/medical/doc_types/tables/med_followup_instructions.tables.any.json` | 2676 | Medium | 2026-02-27 |
| medical_med_history_and_physical_tables | `document_intelligence/domains/medical/doc_types/tables/med_history_and_physical.tables.any.json` | 2676 | Medium | 2026-02-27 |
| legal_acceptable_use_policy_tables | `document_intelligence/domains/legal/doc_types/tables/legal_acceptable_use_policy.tables.any.json` | 2674 | Medium | 2026-02-27 |
| medical_med_lab_results_report_tables | `document_intelligence/domains/medical/doc_types/tables/med_lab_results_report.tables.any.json` | 2674 | Medium | 2026-02-27 |
| medical_med_immunization_record_tables | `document_intelligence/domains/medical/doc_types/tables/med_immunization_record.tables.any.json` | 2668 | Medium | 2026-02-27 |
| medical_med_radiology_report_tables | `document_intelligence/domains/medical/doc_types/tables/med_radiology_report.tables.any.json` | 2660 | Medium | 2026-02-27 |
| medical_med_vitals_chart_tables | `document_intelligence/domains/medical/doc_types/tables/med_vitals_chart.tables.any.json` | 2658 | Medium | 2026-02-27 |
| legal_contractor_agreement_tables | `document_intelligence/domains/legal/doc_types/tables/legal_contractor_agreement.tables.any.json` | 2657 | Medium | 2026-02-27 |
| medical_med_allergy_list_tables | `document_intelligence/domains/medical/doc_types/tables/med_allergy_list.tables.any.json` | 2657 | Medium | 2026-02-27 |
| legal_motion_brief_tables | `document_intelligence/domains/legal/doc_types/tables/legal_motion_brief.tables.any.json` | 2655 | Medium | 2026-02-27 |
| legal_sla_tables | `document_intelligence/domains/legal/doc_types/tables/legal_sla.tables.any.json` | 2653 | Medium | 2026-02-27 |
| legal_consulting_agreement_tables | `document_intelligence/domains/legal/doc_types/tables/legal_consulting_agreement.tables.any.json` | 2650 | Medium | 2026-02-27 |
| medical_med_pathology_report_tables | `document_intelligence/domains/medical/doc_types/tables/med_pathology_report.tables.any.json` | 2650 | Medium | 2026-02-27 |
| medical_med_nursing_note_tables | `document_intelligence/domains/medical/doc_types/tables/med_nursing_note.tables.any.json` | 2649 | Medium | 2026-02-27 |
| legal_settlement_agreement_tables | `document_intelligence/domains/legal/doc_types/tables/legal_settlement_agreement.tables.any.json` | 2648 | Medium | 2026-02-27 |
| legal_baa_tables | `document_intelligence/domains/legal/doc_types/tables/legal_baa.tables.any.json` | 2645 | Medium | 2026-02-27 |
| legal_board_minutes_tables | `document_intelligence/domains/legal/doc_types/tables/legal_board_minutes.tables.any.json` | 2645 | Medium | 2026-02-27 |
| legal_code_of_conduct_tables | `document_intelligence/domains/legal/doc_types/tables/legal_code_of_conduct.tables.any.json` | 2641 | Medium | 2026-02-27 |
| medical_med_ecg_report_tables | `document_intelligence/domains/medical/doc_types/tables/med_ecg_report.tables.any.json` | 2641 | Medium | 2026-02-27 |
| medical_med_referral_letter_tables | `document_intelligence/domains/medical/doc_types/tables/med_referral_letter.tables.any.json` | 2641 | Medium | 2026-02-27 |
| legal_terms_of_service_tables | `document_intelligence/domains/legal/doc_types/tables/legal_terms_of_service.tables.any.json` | 2639 | Medium | 2026-02-27 |
| legal_eula_tables | `document_intelligence/domains/legal/doc_types/tables/legal_eula.tables.any.json` | 2638 | Medium | 2026-02-27 |
| medical_med_discharge_summary_tables | `document_intelligence/domains/medical/doc_types/tables/med_discharge_summary.tables.any.json` | 2634 | Medium | 2026-02-27 |
| medical_med_care_plan_tables | `document_intelligence/domains/medical/doc_types/tables/med_care_plan.tables.any.json` | 2633 | Medium | 2026-02-27 |
| medical_med_emergency_note_tables | `document_intelligence/domains/medical/doc_types/tables/med_emergency_note.tables.any.json` | 2633 | Medium | 2026-02-27 |
| medical_med_medication_list_tables | `document_intelligence/domains/medical/doc_types/tables/med_medication_list.tables.any.json` | 2633 | Medium | 2026-02-27 |
| legal_written_consent_tables | `document_intelligence/domains/legal/doc_types/tables/legal_written_consent.tables.any.json` | 2630 | Medium | 2026-02-27 |
| legal_offer_letter_tables | `document_intelligence/domains/legal/doc_types/tables/legal_offer_letter.tables.any.json` | 2628 | Medium | 2026-02-27 |
| legal_security_policy_tables | `document_intelligence/domains/legal/doc_types/tables/legal_security_policy.tables.any.json` | 2628 | Medium | 2026-02-27 |
| medical_med_consult_note_tables | `document_intelligence/domains/medical/doc_types/tables/med_consult_note.tables.any.json` | 2625 | Medium | 2026-02-27 |
| medical_med_problem_list_tables | `document_intelligence/domains/medical/doc_types/tables/med_problem_list.tables.any.json` | 2623 | Medium | 2026-02-27 |
| medical_med_progress_note_tables | `document_intelligence/domains/medical/doc_types/tables/med_progress_note.tables.any.json` | 2623 | Medium | 2026-02-27 |
| legal_license_agreement_tables | `document_intelligence/domains/legal/doc_types/tables/legal_license_agreement.tables.any.json` | 2622 | Medium | 2026-02-27 |
| medical_med_soap_note_tables | `document_intelligence/domains/medical/doc_types/tables/med_soap_note.tables.any.json` | 2617 | Medium | 2026-02-27 |
| legal_complaint_tables | `document_intelligence/domains/legal/doc_types/tables/legal_complaint.tables.any.json` | 2614 | Medium | 2026-02-27 |
| legal_court_order_tables | `document_intelligence/domains/legal/doc_types/tables/legal_court_order.tables.any.json` | 2614 | Medium | 2026-02-27 |
| legal_cookie_policy_tables | `document_intelligence/domains/legal/doc_types/tables/legal_cookie_policy.tables.any.json` | 2612 | Medium | 2026-02-27 |
| medical_med_prescription_tables | `document_intelligence/domains/medical/doc_types/tables/med_prescription.tables.any.json` | 2598 | Medium | 2026-02-27 |
| query_slot_contracts | `semantics/query_slot_contracts.any.json` | 2525 | Medium | 2026-02-20 |
| di_insurance_tables_ins_explanation_of_benefits | `document_intelligence/domains/insurance/doc_types/tables/ins_explanation_of_benefits.tables.any.json` | 2523 | Medium | 2026-02-27 |
| di_tax_tables_tax_individual_income_return | `document_intelligence/domains/tax/doc_types/tables/tax_individual_income_return.tables.any.json` | 2515 | Medium | 2026-02-27 |
| di_insurance_tables_ins_premium_invoice | `document_intelligence/domains/insurance/doc_types/tables/ins_premium_invoice.tables.any.json` | 2514 | Medium | 2026-02-27 |
| di_tax_tables_tax_property_tax_bill | `document_intelligence/domains/tax/doc_types/tables/tax_property_tax_bill.tables.any.json` | 2512 | Medium | 2026-02-27 |
| di_insurance_tables_ins_policy_document | `document_intelligence/domains/insurance/doc_types/tables/ins_policy_document.tables.any.json` | 2510 | Medium | 2026-02-27 |
| di_tax_tables_tax_assessment_notice | `document_intelligence/domains/tax/doc_types/tables/tax_assessment_notice.tables.any.json` | 2510 | Medium | 2026-02-27 |
| di_insurance_tables_ins_claim_submission | `document_intelligence/domains/insurance/doc_types/tables/ins_claim_submission.tables.any.json` | 2507 | Medium | 2026-02-27 |
| di_tax_tables_tax_payment_slip | `document_intelligence/domains/tax/doc_types/tables/tax_payment_slip.tables.any.json` | 2506 | Medium | 2026-02-27 |
| di_education_extraction_edu_student_financial_aid_award | `document_intelligence/domains/education/doc_types/extraction/edu_student_financial_aid_award.extraction_hints.any.json` | 2148 | Medium | 2026-02-27 |
| di_hr_payroll_extraction_hr_benefits_enrollment_summary | `document_intelligence/domains/hr_payroll/doc_types/extraction/hr_benefits_enrollment_summary.extraction_hints.any.json` | 2147 | Medium | 2026-02-27 |
| di_hr_payroll_extraction_hr_employment_verification_letter | `document_intelligence/domains/hr_payroll/doc_types/extraction/hr_employment_verification_letter.extraction_hints.any.json` | 2144 | Medium | 2026-02-27 |
| di_travel_extraction_travel_car_rental_agreement | `document_intelligence/domains/travel/doc_types/extraction/travel_car_rental_agreement.extraction_hints.any.json` | 2142 | Medium | 2026-02-27 |
| di_travel_extraction_travel_travel_insurance_policy | `document_intelligence/domains/travel/doc_types/extraction/travel_travel_insurance_policy.extraction_hints.any.json` | 2142 | Medium | 2026-02-27 |
| di_travel_extraction_travel_visa_application_receipt | `document_intelligence/domains/travel/doc_types/extraction/travel_visa_application_receipt.extraction_hints.any.json` | 2142 | Medium | 2026-02-27 |
| di_education_extraction_edu_diploma_certificate | `document_intelligence/domains/education/doc_types/extraction/edu_diploma_certificate.extraction_hints.any.json` | 2139 | Medium | 2026-02-27 |
| di_housing_extraction_housing_home_inspection_report | `document_intelligence/domains/housing/doc_types/extraction/housing_home_inspection_report.extraction_hints.any.json` | 2139 | Medium | 2026-02-27 |
| di_housing_extraction_housing_mortgage_statement | `document_intelligence/domains/housing/doc_types/extraction/housing_mortgage_statement.extraction_hints.any.json` | 2139 | Medium | 2026-02-27 |
| di_housing_extraction_housing_rent_receipt | `document_intelligence/domains/housing/doc_types/extraction/housing_rent_receipt.extraction_hints.any.json` | 2139 | Medium | 2026-02-27 |
| di_travel_extraction_travel_hotel_booking_confirmation | `document_intelligence/domains/travel/doc_types/extraction/travel_hotel_booking_confirmation.extraction_hints.any.json` | 2139 | Medium | 2026-02-27 |
| di_hr_payroll_extraction_hr_expense_report | `document_intelligence/domains/hr_payroll/doc_types/extraction/hr_expense_report.extraction_hints.any.json` | 2138 | Medium | 2026-02-27 |
| di_education_extraction_edu_course_syllabus | `document_intelligence/domains/education/doc_types/extraction/edu_course_syllabus.extraction_hints.any.json` | 2136 | Medium | 2026-02-27 |
| di_education_extraction_edu_enrollment_letter | `document_intelligence/domains/education/doc_types/extraction/edu_enrollment_letter.extraction_hints.any.json` | 2136 | Medium | 2026-02-27 |
| di_housing_extraction_housing_hoa_statement | `document_intelligence/domains/housing/doc_types/extraction/housing_hoa_statement.extraction_hints.any.json` | 2136 | Medium | 2026-02-27 |
| di_housing_extraction_housing_lease_summary | `document_intelligence/domains/housing/doc_types/extraction/housing_lease_summary.extraction_hints.any.json` | 2136 | Medium | 2026-02-27 |
| di_housing_extraction_housing_property_tax_bill | `document_intelligence/domains/housing/doc_types/extraction/housing_property_tax_bill.extraction_hints.any.json` | 2136 | Medium | 2026-02-27 |
| di_travel_extraction_travel_boarding_pass | `document_intelligence/domains/travel/doc_types/extraction/travel_boarding_pass.extraction_hints.any.json` | 2136 | Medium | 2026-02-27 |
| di_hr_payroll_extraction_hr_pay_stub | `document_intelligence/domains/hr_payroll/doc_types/extraction/hr_pay_stub.extraction_hints.any.json` | 2135 | Medium | 2026-02-27 |
| di_hr_payroll_extraction_hr_timesheet | `document_intelligence/domains/hr_payroll/doc_types/extraction/hr_timesheet.extraction_hints.any.json` | 2135 | Medium | 2026-02-27 |
| di_education_extraction_edu_student_schedule | `document_intelligence/domains/education/doc_types/extraction/edu_student_schedule.extraction_hints.any.json` | 2133 | Medium | 2026-02-27 |
| di_education_extraction_edu_transcript | `document_intelligence/domains/education/doc_types/extraction/edu_transcript.extraction_hints.any.json` | 2133 | Medium | 2026-02-27 |
| di_travel_extraction_travel_itinerary | `document_intelligence/domains/travel/doc_types/extraction/travel_itinerary.extraction_hints.any.json` | 2133 | Medium | 2026-02-27 |
| legal_ip_assignment_sections | `document_intelligence/domains/legal/doc_types/sections/legal_ip_assignment.sections.any.json` | 2092 | Medium | 2026-02-27 |
| legal_partnership_jv_sections | `document_intelligence/domains/legal/doc_types/sections/legal_partnership_jv.sections.any.json` | 2066 | Medium | 2026-02-27 |
| legal_reseller_distribution_sections | `document_intelligence/domains/legal/doc_types/sections/legal_reseller_distribution.sections.any.json` | 2064 | Medium | 2026-02-27 |
| di_banking_extraction_banking_credit_card_statement | `document_intelligence/domains/banking/doc_types/extraction/banking_credit_card_statement.extraction_hints.any.json` | 2055 | Medium | 2026-02-27 |
| di_banking_extraction_banking_loan_statement | `document_intelligence/domains/banking/doc_types/extraction/banking_loan_statement.extraction_hints.any.json` | 2055 | Medium | 2026-02-27 |
| di_banking_extraction_banking_payment_receipt | `document_intelligence/domains/banking/doc_types/extraction/banking_payment_receipt.extraction_hints.any.json` | 2055 | Medium | 2026-02-27 |
| di_billing_extraction_billing_electricity_bill | `document_intelligence/domains/billing/doc_types/extraction/billing_electricity_bill.extraction_hints.any.json` | 2055 | Medium | 2026-02-27 |
| di_billing_extraction_billing_retail_receipt | `document_intelligence/domains/billing/doc_types/extraction/billing_retail_receipt.extraction_hints.any.json` | 2055 | Medium | 2026-02-27 |
| di_billing_extraction_billing_water_sewer_bill | `document_intelligence/domains/billing/doc_types/extraction/billing_water_sewer_bill.extraction_hints.any.json` | 2055 | Medium | 2026-02-27 |
| di_banking_extraction_banking_bank_statement | `document_intelligence/domains/banking/doc_types/extraction/banking_bank_statement.extraction_hints.any.json` | 2052 | Medium | 2026-02-27 |
| di_billing_extraction_billing_internet_bill | `document_intelligence/domains/billing/doc_types/extraction/billing_internet_bill.extraction_hints.any.json` | 2052 | Medium | 2026-02-27 |
| di_billing_extraction_billing_phone_bill_mobile | `document_intelligence/domains/billing/doc_types/extraction/billing_phone_bill_mobile.extraction_hints.any.json` | 2052 | Medium | 2026-02-27 |
| di_billing_extraction_billing_invoice_business | `document_intelligence/domains/billing/doc_types/extraction/billing_invoice_business.extraction_hints.any.json` | 2049 | Medium | 2026-02-27 |
| legal_bylaws_charter_sections | `document_intelligence/domains/legal/doc_types/sections/legal_bylaws_charter.sections.any.json` | 2021 | Medium | 2026-02-27 |
| legal_data_retention_policy_sections | `document_intelligence/domains/legal/doc_types/sections/legal_data_retention_policy.sections.any.json` | 2017 | Medium | 2026-02-27 |
| legal_acceptable_use_policy_sections | `document_intelligence/domains/legal/doc_types/sections/legal_acceptable_use_policy.sections.any.json` | 2001 | Medium | 2026-02-27 |
| legal_sla_sections | `document_intelligence/domains/legal/doc_types/sections/legal_sla.sections.any.json` | 1996 | Medium | 2026-02-27 |
| legal_motion_brief_sections | `document_intelligence/domains/legal/doc_types/sections/legal_motion_brief.sections.any.json` | 1982 | Medium | 2026-02-27 |
| legal_baa_sections | `document_intelligence/domains/legal/doc_types/sections/legal_baa.sections.any.json` | 1980 | Medium | 2026-02-27 |
| legal_board_minutes_sections | `document_intelligence/domains/legal/doc_types/sections/legal_board_minutes.sections.any.json` | 1980 | Medium | 2026-02-27 |
| legal_contractor_agreement_sections | `document_intelligence/domains/legal/doc_types/sections/legal_contractor_agreement.sections.any.json` | 1968 | Medium | 2026-02-27 |
| legal_eula_sections | `document_intelligence/domains/legal/doc_types/sections/legal_eula.sections.any.json` | 1965 | Medium | 2026-02-27 |
| legal_settlement_agreement_sections | `document_intelligence/domains/legal/doc_types/sections/legal_settlement_agreement.sections.any.json` | 1951 | Medium | 2026-02-27 |
| legal_terms_of_service_sections | `document_intelligence/domains/legal/doc_types/sections/legal_terms_of_service.sections.any.json` | 1950 | Medium | 2026-02-27 |
| legal_offer_letter_sections | `document_intelligence/domains/legal/doc_types/sections/legal_offer_letter.sections.any.json` | 1947 | Medium | 2026-02-27 |
| legal_security_policy_sections | `document_intelligence/domains/legal/doc_types/sections/legal_security_policy.sections.any.json` | 1947 | Medium | 2026-02-27 |
| legal_consulting_agreement_sections | `document_intelligence/domains/legal/doc_types/sections/legal_consulting_agreement.sections.any.json` | 1937 | Medium | 2026-02-27 |
| legal_code_of_conduct_sections | `document_intelligence/domains/legal/doc_types/sections/legal_code_of_conduct.sections.any.json` | 1936 | Medium | 2026-02-27 |
| legal_written_consent_sections | `document_intelligence/domains/legal/doc_types/sections/legal_written_consent.sections.any.json` | 1933 | Medium | 2026-02-27 |
| stopwords_docnames | `semantics/stopwords_docnames.any.json` | 1918 | Medium | 2026-01-26 |
| legal_license_agreement_sections | `document_intelligence/domains/legal/doc_types/sections/legal_license_agreement.sections.any.json` | 1917 | Medium | 2026-02-27 |
| legal_cookie_policy_sections | `document_intelligence/domains/legal/doc_types/sections/legal_cookie_policy.sections.any.json` | 1915 | Medium | 2026-02-27 |
| legal_complaint_sections | `document_intelligence/domains/legal/doc_types/sections/legal_complaint.sections.any.json` | 1901 | Medium | 2026-02-27 |
| legal_court_order_sections | `document_intelligence/domains/legal/doc_types/sections/legal_court_order.sections.any.json` | 1901 | Medium | 2026-02-27 |
| medical_med_lab_results_report_sections | `document_intelligence/domains/medical/doc_types/sections/med_lab_results_report.sections.any.json` | 1888 | Medium | 2026-02-27 |
| medical_med_followup_instructions_sections | `document_intelligence/domains/medical/doc_types/sections/med_followup_instructions.sections.any.json` | 1875 | Medium | 2026-02-27 |
| medical_med_history_and_physical_sections | `document_intelligence/domains/medical/doc_types/sections/med_history_and_physical.sections.any.json` | 1875 | Medium | 2026-02-27 |
| medical_med_immunization_record_sections | `document_intelligence/domains/medical/doc_types/sections/med_immunization_record.sections.any.json` | 1860 | Medium | 2026-02-27 |
| medical_med_vitals_chart_sections | `document_intelligence/domains/medical/doc_types/sections/med_vitals_chart.sections.any.json` | 1858 | Medium | 2026-02-27 |
| medical_med_allergy_list_sections | `document_intelligence/domains/medical/doc_types/sections/med_allergy_list.sections.any.json` | 1857 | Medium | 2026-02-27 |
| medical_med_radiology_report_sections | `document_intelligence/domains/medical/doc_types/sections/med_radiology_report.sections.any.json` | 1845 | Medium | 2026-02-27 |
| medical_med_pathology_report_sections | `document_intelligence/domains/medical/doc_types/sections/med_pathology_report.sections.any.json` | 1843 | Medium | 2026-02-27 |
| medical_med_nursing_note_sections | `document_intelligence/domains/medical/doc_types/sections/med_nursing_note.sections.any.json` | 1842 | Medium | 2026-02-27 |
| doc_archetypes | `normalizers/doc_archetypes.any.json` | 1837 | Medium | 2026-02-27 |
| medical_med_ecg_report_sections | `document_intelligence/domains/medical/doc_types/sections/med_ecg_report.sections.any.json` | 1827 | Medium | 2026-02-27 |
| medical_med_referral_letter_sections | `document_intelligence/domains/medical/doc_types/sections/med_referral_letter.sections.any.json` | 1827 | Medium | 2026-02-27 |
| medical_med_discharge_summary_sections | `document_intelligence/domains/medical/doc_types/sections/med_discharge_summary.sections.any.json` | 1813 | Medium | 2026-02-27 |
| medical_med_care_plan_sections | `document_intelligence/domains/medical/doc_types/sections/med_care_plan.sections.any.json` | 1812 | Medium | 2026-02-27 |
| medical_med_emergency_note_sections | `document_intelligence/domains/medical/doc_types/sections/med_emergency_note.sections.any.json` | 1812 | Medium | 2026-02-27 |
| medical_med_medication_list_sections | `document_intelligence/domains/medical/doc_types/sections/med_medication_list.sections.any.json` | 1812 | Medium | 2026-02-27 |
| medical_med_problem_list_sections | `document_intelligence/domains/medical/doc_types/sections/med_problem_list.sections.any.json` | 1810 | Medium | 2026-02-27 |
| medical_med_progress_note_sections | `document_intelligence/domains/medical/doc_types/sections/med_progress_note.sections.any.json` | 1810 | Medium | 2026-02-27 |
| medical_med_consult_note_sections | `document_intelligence/domains/medical/doc_types/sections/med_consult_note.sections.any.json` | 1797 | Medium | 2026-02-27 |
| medical_med_soap_note_sections | `document_intelligence/domains/medical/doc_types/sections/med_soap_note.sections.any.json` | 1782 | Low | 2026-02-27 |
| medical_med_prescription_sections | `document_intelligence/domains/medical/doc_types/sections/med_prescription.sections.any.json` | 1764 | Low | 2026-02-27 |
| allybi_crossdoc_grounding | `semantics/allybi_crossdoc_grounding.any.json` | 1677 | Low | 2026-02-12 |
| di_finance_tables_fin_covenant_compliance_certificate | `document_intelligence/domains/finance/doc_types/tables/fin_covenant_compliance_certificate.tables.any.json` | 1654 | Low | 2026-02-27 |
| di_finance_tables_fin_board_deck_finance | `document_intelligence/domains/finance/doc_types/tables/fin_board_deck_finance.tables.any.json` | 1651 | Low | 2026-02-27 |
| di_finance_tables_fin_investor_presentation | `document_intelligence/domains/finance/doc_types/tables/fin_investor_presentation.tables.any.json` | 1651 | Low | 2026-02-27 |
| di_finance_tables_fin_unit_economics_model | `document_intelligence/domains/finance/doc_types/tables/fin_unit_economics_model.tables.any.json` | 1651 | Low | 2026-02-27 |
| di_finance_tables_fin_covenant | `document_intelligence/domains/finance/doc_types/tables/fin_covenant.tables.any.json` | 1648 | Low | 2026-02-28 |
| di_finance_tables_fin_earnings_release | `document_intelligence/domains/finance/doc_types/tables/fin_earnings_release.tables.any.json` | 1648 | Low | 2026-02-28 |
| di_finance_tables_fin_monthly_close_pack | `document_intelligence/domains/finance/doc_types/tables/fin_monthly_close_pack.tables.any.json` | 1648 | Low | 2026-02-27 |
| di_finance_tables_fin_rolling_forecast | `document_intelligence/domains/finance/doc_types/tables/fin_rolling_forecast.tables.any.json` | 1648 | Low | 2026-02-27 |
| di_finance_tables_fin_arr_mrr_report | `document_intelligence/domains/finance/doc_types/tables/fin_arr_mrr_report.tables.any.json` | 1647 | Low | 2026-02-27 |
| di_finance_tables_fin_cohort_analysis | `document_intelligence/domains/finance/doc_types/tables/fin_cohort_analysis.tables.any.json` | 1647 | Low | 2026-02-27 |
| di_finance_tables_fin_10k | `document_intelligence/domains/finance/doc_types/tables/fin_10k.tables.any.json` | 1645 | Low | 2026-02-28 |
| di_finance_tables_fin_10q | `document_intelligence/domains/finance/doc_types/tables/fin_10q.tables.any.json` | 1645 | Low | 2026-02-28 |
| di_finance_tables_fin_8k | `document_intelligence/domains/finance/doc_types/tables/fin_8k.tables.any.json` | 1645 | Low | 2026-02-28 |
| di_finance_tables_fin_cash_forecast | `document_intelligence/domains/finance/doc_types/tables/fin_cash_forecast.tables.any.json` | 1645 | Low | 2026-02-27 |
| di_finance_tables_fin_debt_schedule | `document_intelligence/domains/finance/doc_types/tables/fin_debt_schedule.tables.any.json` | 1645 | Low | 2026-02-27 |
| di_finance_tables_fin_esg_report | `document_intelligence/domains/finance/doc_types/tables/fin_esg_report.tables.any.json` | 1645 | Low | 2026-02-27 |
| di_finance_tables_fin_kpi_dashboard | `document_intelligence/domains/finance/doc_types/tables/fin_kpi_dashboard.tables.any.json` | 1645 | Low | 2026-02-27 |
| di_finance_tables_fin_statements_pack | `document_intelligence/domains/finance/doc_types/tables/fin_statements_pack.tables.any.json` | 1645 | Low | 2026-02-28 |
| di_finance_tables_fin_variance_report | `document_intelligence/domains/finance/doc_types/tables/fin_variance_report.tables.any.json` | 1645 | Low | 2026-02-27 |
| di_finance_tables_fin_pipeline_report | `document_intelligence/domains/finance/doc_types/tables/fin_pipeline_report.tables.any.json` | 1644 | Low | 2026-02-27 |
| di_finance_tables_fin_variance | `document_intelligence/domains/finance/doc_types/tables/fin_variance.tables.any.json` | 1643 | Low | 2026-02-28 |
| di_finance_tables_fin_bank_statement | `document_intelligence/domains/finance/doc_types/tables/fin_bank_statement.tables.any.json` | 1642 | Low | 2026-02-27 |
| di_finance_tables_fin_forecast | `document_intelligence/domains/finance/doc_types/tables/fin_forecast.tables.any.json` | 1642 | Low | 2026-02-28 |
| di_finance_tables_fin_cap_table | `document_intelligence/domains/finance/doc_types/tables/fin_cap_table.tables.any.json` | 1641 | Low | 2026-02-28 |
| di_finance_tables_fin_budget | `document_intelligence/domains/finance/doc_types/tables/fin_budget.tables.any.json` | 1639 | Low | 2026-02-28 |
| di_banking_tables_banking_credit_card_statement | `document_intelligence/domains/banking/doc_types/tables/banking_credit_card_statement.tables.any.json` | 1353 | Low | 2026-02-27 |
| di_banking_tables_banking_loan_statement | `document_intelligence/domains/banking/doc_types/tables/banking_loan_statement.tables.any.json` | 1353 | Low | 2026-02-27 |
| di_banking_tables_banking_payment_receipt | `document_intelligence/domains/banking/doc_types/tables/banking_payment_receipt.tables.any.json` | 1353 | Low | 2026-02-27 |
| di_billing_tables_billing_electricity_bill | `document_intelligence/domains/billing/doc_types/tables/billing_electricity_bill.tables.any.json` | 1353 | Low | 2026-02-27 |
| di_billing_tables_billing_retail_receipt | `document_intelligence/domains/billing/doc_types/tables/billing_retail_receipt.tables.any.json` | 1353 | Low | 2026-02-27 |
| di_billing_tables_billing_water_sewer_bill | `document_intelligence/domains/billing/doc_types/tables/billing_water_sewer_bill.tables.any.json` | 1353 | Low | 2026-02-27 |
| di_banking_tables_banking_bank_statement | `document_intelligence/domains/banking/doc_types/tables/banking_bank_statement.tables.any.json` | 1339 | Low | 2026-02-27 |
| di_billing_tables_billing_internet_bill | `document_intelligence/domains/billing/doc_types/tables/billing_internet_bill.tables.any.json` | 1339 | Low | 2026-02-27 |
| di_billing_tables_billing_phone_bill_mobile | `document_intelligence/domains/billing/doc_types/tables/billing_phone_bill_mobile.tables.any.json` | 1339 | Low | 2026-02-27 |
| di_billing_tables_billing_invoice_business | `document_intelligence/domains/billing/doc_types/tables/billing_invoice_business.tables.any.json` | 1325 | Low | 2026-02-27 |
| di_ops_extraction_ops_work_order | `document_intelligence/domains/ops/doc_types/extraction/ops_work_order.extraction_hints.any.json` | 1283 | Low | 2026-02-27 |
| di_tax_doc_type_catalog | `document_intelligence/domains/tax/doc_types/doc_type_catalog.any.json` | 1281 | Low | 2026-02-27 |
| di_identity_doc_type_catalog | `document_intelligence/domains/identity/doc_types/doc_type_catalog.any.json` | 1277 | Low | 2026-02-27 |
| entity_role_ontology | `semantics/entity_role_ontology.any.json` | 1276 | Low | 2026-02-20 |
| di_insurance_doc_type_catalog | `document_intelligence/domains/insurance/doc_types/doc_type_catalog.any.json` | 1268 | Low | 2026-02-27 |
| di_billing_sections_billing_phone_bill_mobile | `document_intelligence/domains/billing/doc_types/sections/billing_phone_bill_mobile.sections.any.json` | 1201 | Low | 2026-02-27 |
| di_billing_sections_billing_electricity_bill | `document_intelligence/domains/billing/doc_types/sections/billing_electricity_bill.sections.any.json` | 1199 | Low | 2026-02-27 |
| di_banking_sections_banking_loan_statement | `document_intelligence/domains/banking/doc_types/sections/banking_loan_statement.sections.any.json` | 1198 | Low | 2026-02-27 |
| di_billing_sections_billing_water_sewer_bill | `document_intelligence/domains/billing/doc_types/sections/billing_water_sewer_bill.sections.any.json` | 1198 | Low | 2026-02-27 |
| di_banking_sections_banking_payment_receipt | `document_intelligence/domains/banking/doc_types/sections/banking_payment_receipt.sections.any.json` | 1197 | Low | 2026-02-27 |
| di_billing_sections_billing_retail_receipt | `document_intelligence/domains/billing/doc_types/sections/billing_retail_receipt.sections.any.json` | 1197 | Low | 2026-02-27 |
| di_banking_sections_banking_credit_card_statement | `document_intelligence/domains/banking/doc_types/sections/banking_credit_card_statement.sections.any.json` | 1196 | Low | 2026-02-27 |
| di_billing_sections_billing_internet_bill | `document_intelligence/domains/billing/doc_types/sections/billing_internet_bill.sections.any.json` | 1196 | Low | 2026-02-27 |
| di_banking_sections_banking_bank_statement | `document_intelligence/domains/banking/doc_types/sections/banking_bank_statement.sections.any.json` | 1195 | Low | 2026-02-27 |
| di_billing_sections_billing_invoice_business | `document_intelligence/domains/billing/doc_types/sections/billing_invoice_business.sections.any.json` | 1193 | Low | 2026-02-27 |
| di_education_sections_edu_student_financial_aid_award | `document_intelligence/domains/education/doc_types/sections/edu_student_financial_aid_award.sections.any.json` | 1134 | Low | 2026-02-27 |
| di_hr_payroll_sections_hr_benefits_enrollment_summary | `document_intelligence/domains/hr_payroll/doc_types/sections/hr_benefits_enrollment_summary.sections.any.json` | 1133 | Low | 2026-02-27 |
| di_hr_payroll_sections_hr_employment_verification_letter | `document_intelligence/domains/hr_payroll/doc_types/sections/hr_employment_verification_letter.sections.any.json` | 1130 | Low | 2026-02-27 |
| di_travel_sections_travel_car_rental_agreement | `document_intelligence/domains/travel/doc_types/sections/travel_car_rental_agreement.sections.any.json` | 1128 | Low | 2026-02-27 |
| di_travel_sections_travel_travel_insurance_policy | `document_intelligence/domains/travel/doc_types/sections/travel_travel_insurance_policy.sections.any.json` | 1128 | Low | 2026-02-27 |
| di_travel_sections_travel_visa_application_receipt | `document_intelligence/domains/travel/doc_types/sections/travel_visa_application_receipt.sections.any.json` | 1128 | Low | 2026-02-27 |
| di_education_sections_edu_diploma_certificate | `document_intelligence/domains/education/doc_types/sections/edu_diploma_certificate.sections.any.json` | 1125 | Low | 2026-02-27 |
| di_housing_sections_housing_home_inspection_report | `document_intelligence/domains/housing/doc_types/sections/housing_home_inspection_report.sections.any.json` | 1125 | Low | 2026-02-27 |
| di_housing_sections_housing_mortgage_statement | `document_intelligence/domains/housing/doc_types/sections/housing_mortgage_statement.sections.any.json` | 1125 | Low | 2026-02-27 |
| di_housing_sections_housing_rent_receipt | `document_intelligence/domains/housing/doc_types/sections/housing_rent_receipt.sections.any.json` | 1125 | Low | 2026-02-27 |
| di_travel_sections_travel_hotel_booking_confirmation | `document_intelligence/domains/travel/doc_types/sections/travel_hotel_booking_confirmation.sections.any.json` | 1125 | Low | 2026-02-27 |
| di_hr_payroll_sections_hr_expense_report | `document_intelligence/domains/hr_payroll/doc_types/sections/hr_expense_report.sections.any.json` | 1124 | Low | 2026-02-27 |
| di_education_sections_edu_course_syllabus | `document_intelligence/domains/education/doc_types/sections/edu_course_syllabus.sections.any.json` | 1122 | Low | 2026-02-27 |
| di_education_sections_edu_enrollment_letter | `document_intelligence/domains/education/doc_types/sections/edu_enrollment_letter.sections.any.json` | 1122 | Low | 2026-02-27 |
| di_housing_sections_housing_hoa_statement | `document_intelligence/domains/housing/doc_types/sections/housing_hoa_statement.sections.any.json` | 1122 | Low | 2026-02-27 |
| di_housing_sections_housing_lease_summary | `document_intelligence/domains/housing/doc_types/sections/housing_lease_summary.sections.any.json` | 1122 | Low | 2026-02-27 |
| di_housing_sections_housing_property_tax_bill | `document_intelligence/domains/housing/doc_types/sections/housing_property_tax_bill.sections.any.json` | 1122 | Low | 2026-02-27 |
| di_travel_sections_travel_boarding_pass | `document_intelligence/domains/travel/doc_types/sections/travel_boarding_pass.sections.any.json` | 1122 | Low | 2026-02-27 |
| di_hr_payroll_sections_hr_pay_stub | `document_intelligence/domains/hr_payroll/doc_types/sections/hr_pay_stub.sections.any.json` | 1121 | Low | 2026-02-27 |
| di_hr_payroll_sections_hr_timesheet | `document_intelligence/domains/hr_payroll/doc_types/sections/hr_timesheet.sections.any.json` | 1121 | Low | 2026-02-27 |
| di_education_sections_edu_student_schedule | `document_intelligence/domains/education/doc_types/sections/edu_student_schedule.sections.any.json` | 1119 | Low | 2026-02-27 |
| di_education_sections_edu_transcript | `document_intelligence/domains/education/doc_types/sections/edu_transcript.sections.any.json` | 1119 | Low | 2026-02-27 |
| di_travel_sections_travel_itinerary | `document_intelligence/domains/travel/doc_types/sections/travel_itinerary.sections.any.json` | 1119 | Low | 2026-02-27 |
| di_education_tables_edu_student_financial_aid_award | `document_intelligence/domains/education/doc_types/tables/edu_student_financial_aid_award.tables.any.json` | 1105 | Low | 2026-02-27 |
| di_hr_payroll_tables_hr_benefits_enrollment_summary | `document_intelligence/domains/hr_payroll/doc_types/tables/hr_benefits_enrollment_summary.tables.any.json` | 1104 | Low | 2026-02-27 |
| di_hr_payroll_tables_hr_employment_verification_letter | `document_intelligence/domains/hr_payroll/doc_types/tables/hr_employment_verification_letter.tables.any.json` | 1101 | Low | 2026-02-27 |
| di_travel_tables_travel_car_rental_agreement | `document_intelligence/domains/travel/doc_types/tables/travel_car_rental_agreement.tables.any.json` | 1099 | Low | 2026-02-27 |
| di_travel_tables_travel_travel_insurance_policy | `document_intelligence/domains/travel/doc_types/tables/travel_travel_insurance_policy.tables.any.json` | 1099 | Low | 2026-02-27 |
| di_travel_tables_travel_visa_application_receipt | `document_intelligence/domains/travel/doc_types/tables/travel_visa_application_receipt.tables.any.json` | 1099 | Low | 2026-02-27 |
| di_education_tables_edu_diploma_certificate | `document_intelligence/domains/education/doc_types/tables/edu_diploma_certificate.tables.any.json` | 1096 | Low | 2026-02-27 |
| di_housing_tables_housing_home_inspection_report | `document_intelligence/domains/housing/doc_types/tables/housing_home_inspection_report.tables.any.json` | 1096 | Low | 2026-02-27 |
| di_housing_tables_housing_mortgage_statement | `document_intelligence/domains/housing/doc_types/tables/housing_mortgage_statement.tables.any.json` | 1096 | Low | 2026-02-27 |
| di_housing_tables_housing_rent_receipt | `document_intelligence/domains/housing/doc_types/tables/housing_rent_receipt.tables.any.json` | 1096 | Low | 2026-02-27 |
| di_travel_tables_travel_hotel_booking_confirmation | `document_intelligence/domains/travel/doc_types/tables/travel_hotel_booking_confirmation.tables.any.json` | 1096 | Low | 2026-02-27 |
| di_hr_payroll_tables_hr_expense_report | `document_intelligence/domains/hr_payroll/doc_types/tables/hr_expense_report.tables.any.json` | 1095 | Low | 2026-02-27 |
| di_education_tables_edu_course_syllabus | `document_intelligence/domains/education/doc_types/tables/edu_course_syllabus.tables.any.json` | 1093 | Low | 2026-02-27 |
| di_education_tables_edu_enrollment_letter | `document_intelligence/domains/education/doc_types/tables/edu_enrollment_letter.tables.any.json` | 1093 | Low | 2026-02-27 |
| di_housing_tables_housing_hoa_statement | `document_intelligence/domains/housing/doc_types/tables/housing_hoa_statement.tables.any.json` | 1093 | Low | 2026-02-27 |
| di_housing_tables_housing_lease_summary | `document_intelligence/domains/housing/doc_types/tables/housing_lease_summary.tables.any.json` | 1093 | Low | 2026-02-27 |
| di_housing_tables_housing_property_tax_bill | `document_intelligence/domains/housing/doc_types/tables/housing_property_tax_bill.tables.any.json` | 1093 | Low | 2026-02-27 |
| di_travel_tables_travel_boarding_pass | `document_intelligence/domains/travel/doc_types/tables/travel_boarding_pass.tables.any.json` | 1093 | Low | 2026-02-27 |
| di_hr_payroll_tables_hr_pay_stub | `document_intelligence/domains/hr_payroll/doc_types/tables/hr_pay_stub.tables.any.json` | 1092 | Low | 2026-02-27 |
| di_hr_payroll_tables_hr_timesheet | `document_intelligence/domains/hr_payroll/doc_types/tables/hr_timesheet.tables.any.json` | 1092 | Low | 2026-02-27 |
| di_education_tables_edu_student_schedule | `document_intelligence/domains/education/doc_types/tables/edu_student_schedule.tables.any.json` | 1090 | Low | 2026-02-27 |
| di_education_tables_edu_transcript | `document_intelligence/domains/education/doc_types/tables/edu_transcript.tables.any.json` | 1090 | Low | 2026-02-27 |
| di_travel_tables_travel_itinerary | `document_intelligence/domains/travel/doc_types/tables/travel_itinerary.tables.any.json` | 1090 | Low | 2026-02-27 |
| di_accounting_tables_acct_bank_rec | `document_intelligence/domains/accounting/doc_types/tables/acct_bank_rec.tables.any.json` | 962 | Low | 2026-02-28 |
| di_accounting_tables_acct_je_support | `document_intelligence/domains/accounting/doc_types/tables/acct_je_support.tables.any.json` | 956 | Low | 2026-02-28 |
| di_ops_extraction_ops_incident_report | `document_intelligence/domains/ops/doc_types/extraction/ops_incident_report.extraction_hints.any.json` | 956 | Low | 2026-02-27 |
| di_ops_doc_type_catalog | `document_intelligence/domains/ops/doc_types/doc_type_catalog.any.json` | 928 | Low | 2026-02-27 |
| di_ops_extraction_ops_shipping_manifest | `document_intelligence/domains/ops/doc_types/extraction/ops_shipping_manifest.extraction_hints.any.json` | 920 | Low | 2026-02-27 |
| di_accounting_tables_acct_prepaids_amortization_schedule | `document_intelligence/domains/accounting/doc_types/tables/acct_prepaids_amortization_schedule.tables.any.json` | 902 | Low | 2026-02-27 |
| di_ops_extraction_ops_sla_report | `document_intelligence/domains/ops/doc_types/extraction/ops_sla_report.extraction_hints.any.json` | 900 | Low | 2026-02-27 |
| di_ops_extraction_ops_quality_report | `document_intelligence/domains/ops/doc_types/extraction/ops_quality_report.extraction_hints.any.json` | 893 | Low | 2026-02-27 |
| di_ops_extraction_ops_maintenance_log | `document_intelligence/domains/ops/doc_types/extraction/ops_maintenance_log.extraction_hints.any.json` | 884 | Low | 2026-02-27 |
| di_travel_doc_type_catalog | `document_intelligence/domains/travel/doc_types/doc_type_catalog.any.json` | 879 | Low | 2026-02-27 |
| di_tax_sections_tax_individual_income_return | `document_intelligence/domains/tax/doc_types/sections/tax_individual_income_return.sections.any.json` | 874 | Low | 2026-02-27 |
| di_insurance_sections_ins_explanation_of_benefits | `document_intelligence/domains/insurance/doc_types/sections/ins_explanation_of_benefits.sections.any.json` | 873 | Low | 2026-02-27 |
| di_accounting_tables_acct_accruals_schedule | `document_intelligence/domains/accounting/doc_types/tables/acct_accruals_schedule.tables.any.json` | 872 | Low | 2026-02-27 |
| di_accounting_tables_acct_lease_accounting_schedule | `document_intelligence/domains/accounting/doc_types/tables/acct_lease_accounting_schedule.tables.any.json` | 872 | Low | 2026-02-27 |
| di_accounting_tables_acct_credit_card_reconciliation | `document_intelligence/domains/accounting/doc_types/tables/acct_credit_card_reconciliation.tables.any.json` | 870 | Low | 2026-02-27 |
| di_accounting_tables_acct_inventory_valuation_report | `document_intelligence/domains/accounting/doc_types/tables/acct_inventory_valuation_report.tables.any.json` | 869 | Low | 2026-02-27 |
| di_accounting_tables_acct_revenue_recognition_schedule | `document_intelligence/domains/accounting/doc_types/tables/acct_revenue_recognition_schedule.tables.any.json` | 868 | Low | 2026-02-27 |
| di_identity_sections_id_proof_of_address | `document_intelligence/domains/identity/doc_types/sections/id_proof_of_address.sections.any.json` | 867 | Low | 2026-02-27 |
| di_tax_sections_tax_property_tax_bill | `document_intelligence/domains/tax/doc_types/sections/tax_property_tax_bill.sections.any.json` | 866 | Low | 2026-02-27 |
| di_accounting_tables_acct_fixed_asset_register | `document_intelligence/domains/accounting/doc_types/tables/acct_fixed_asset_register.tables.any.json` | 865 | Low | 2026-02-27 |
| di_accounting_tables_acct_journal_entry_support | `document_intelligence/domains/accounting/doc_types/tables/acct_journal_entry_support.tables.any.json` | 865 | Low | 2026-02-27 |
| di_insurance_sections_ins_premium_invoice | `document_intelligence/domains/insurance/doc_types/sections/ins_premium_invoice.sections.any.json` | 865 | Low | 2026-02-27 |
| di_tax_sections_tax_assessment_notice | `document_intelligence/domains/tax/doc_types/sections/tax_assessment_notice.sections.any.json` | 865 | Low | 2026-02-27 |
| di_tax_sections_tax_payment_slip | `document_intelligence/domains/tax/doc_types/sections/tax_payment_slip.sections.any.json` | 865 | Low | 2026-02-27 |
| di_identity_sections_id_business_registration_certificate | `document_intelligence/domains/identity/doc_types/sections/id_business_registration_certificate.sections.any.json` | 864 | Low | 2026-02-27 |
| di_accounting_tables_acct_gl_export | `document_intelligence/domains/accounting/doc_types/tables/acct_gl_export.tables.any.json` | 863 | Low | 2026-02-28 |
| di_accounting_tables_acct_payment_run_report | `document_intelligence/domains/accounting/doc_types/tables/acct_payment_run_report.tables.any.json` | 863 | Low | 2026-02-27 |
| di_insurance_sections_ins_policy_document | `document_intelligence/domains/insurance/doc_types/sections/ins_policy_document.sections.any.json` | 863 | Low | 2026-02-27 |
| di_accounting_tables_acct_ap_aging | `document_intelligence/domains/accounting/doc_types/tables/acct_ap_aging.tables.any.json` | 862 | Low | 2026-02-28 |
| di_accounting_tables_acct_ar_aging | `document_intelligence/domains/accounting/doc_types/tables/acct_ar_aging.tables.any.json` | 862 | Low | 2026-02-28 |
| di_accounting_tables_acct_depreciation_schedule | `document_intelligence/domains/accounting/doc_types/tables/acct_depreciation_schedule.tables.any.json` | 862 | Low | 2026-02-27 |
| di_accounting_tables_acct_intercompany_reconciliation | `document_intelligence/domains/accounting/doc_types/tables/acct_intercompany_reconciliation.tables.any.json` | 862 | Low | 2026-02-27 |
| di_identity_sections_id_driver_license | `document_intelligence/domains/identity/doc_types/sections/id_driver_license.sections.any.json` | 862 | Low | 2026-02-27 |
| di_insurance_sections_ins_claim_submission | `document_intelligence/domains/insurance/doc_types/sections/ins_claim_submission.sections.any.json` | 862 | Low | 2026-02-27 |
| di_ops_sections_ops_work_order | `document_intelligence/domains/ops/doc_types/sections/ops_work_order.sections.any.json` | 861 | Low | 2026-02-27 |
| di_accounting_tables_acct_audit_workpaper | `document_intelligence/domains/accounting/doc_types/tables/acct_audit_workpaper.tables.any.json` | 859 | Low | 2026-02-28 |
| di_accounting_tables_acct_controls_narrative | `document_intelligence/domains/accounting/doc_types/tables/acct_controls_narrative.tables.any.json` | 858 | Low | 2026-02-28 |
| di_identity_sections_id_passport | `document_intelligence/domains/identity/doc_types/sections/id_passport.sections.any.json` | 855 | Low | 2026-02-27 |
| di_accounting_tables_acct_pbc_list | `document_intelligence/domains/accounting/doc_types/tables/acct_pbc_list.tables.any.json` | 853 | Low | 2026-02-27 |
| di_accounting_tables_acct_management_rep_letter | `document_intelligence/domains/accounting/doc_types/tables/acct_management_rep_letter.tables.any.json` | 852 | Low | 2026-02-27 |
| di_accounting_tables_acct_chart_of_accounts | `document_intelligence/domains/accounting/doc_types/tables/acct_chart_of_accounts.tables.any.json` | 851 | Low | 2026-02-27 |
| di_accounting_tables_acct_bank_reconciliation | `document_intelligence/domains/accounting/doc_types/tables/acct_bank_reconciliation.tables.any.json` | 850 | Low | 2026-02-27 |
| di_accounting_tables_acct_invoice_register | `document_intelligence/domains/accounting/doc_types/tables/acct_invoice_register.tables.any.json` | 849 | Low | 2026-02-27 |
| di_accounting_tables_acct_trial_balance | `document_intelligence/domains/accounting/doc_types/tables/acct_trial_balance.tables.any.json` | 847 | Low | 2026-02-28 |
| di_housing_doc_type_catalog | `document_intelligence/domains/housing/doc_types/doc_type_catalog.any.json` | 823 | Low | 2026-02-27 |
| di_education_doc_type_catalog | `document_intelligence/domains/education/doc_types/doc_type_catalog.any.json` | 818 | Low | 2026-02-27 |
| di_billing_doc_type_catalog | `document_intelligence/domains/billing/doc_types/doc_type_catalog.any.json` | 808 | Low | 2026-02-27 |
| di_ops_sections_ops_sla_report | `document_intelligence/domains/ops/doc_types/sections/ops_sla_report.sections.any.json` | 796 | Low | 2026-02-27 |
| di_ops_sections_ops_incident_report | `document_intelligence/domains/ops/doc_types/sections/ops_incident_report.sections.any.json` | 764 | Low | 2026-02-27 |
| di_hr_payroll_doc_type_catalog | `document_intelligence/domains/hr_payroll/doc_types/doc_type_catalog.any.json` | 722 | Low | 2026-02-27 |
| di_accounting_extraction_acct_prepaids_amortization_schedule | `document_intelligence/domains/accounting/doc_types/extraction/acct_prepaids_amortization_schedule.extraction_hints.any.json` | 716 | Low | 2026-02-27 |
| di_accounting_extraction_acct_depreciation_schedule | `document_intelligence/domains/accounting/doc_types/extraction/acct_depreciation_schedule.extraction_hints.any.json` | 715 | Low | 2026-02-27 |
| di_accounting_extraction_acct_revenue_recognition_schedule | `document_intelligence/domains/accounting/doc_types/extraction/acct_revenue_recognition_schedule.extraction_hints.any.json` | 708 | Low | 2026-02-27 |
| di_accounting_extraction_acct_accruals_schedule | `document_intelligence/domains/accounting/doc_types/extraction/acct_accruals_schedule.extraction_hints.any.json` | 704 | Low | 2026-02-27 |
| di_ops_sections_ops_shipping_manifest | `document_intelligence/domains/ops/doc_types/sections/ops_shipping_manifest.sections.any.json` | 703 | Low | 2026-02-27 |
| di_finance_extraction_fin_covenant_compliance_certificate | `document_intelligence/domains/finance/doc_types/extraction/fin_covenant_compliance_certificate.extraction_hints.any.json` | 701 | Low | 2026-02-27 |
| rate_limit_policy | `policies/rate_limit_policy.any.json` | 700 | Low | 2026-02-27 |
| di_accounting_extraction_acct_fixed_asset_register | `document_intelligence/domains/accounting/doc_types/extraction/acct_fixed_asset_register.extraction_hints.any.json` | 699 | Low | 2026-02-27 |
| di_ops_sections_ops_quality_report | `document_intelligence/domains/ops/doc_types/sections/ops_quality_report.sections.any.json` | 698 | Low | 2026-02-27 |
| di_accounting_extraction_acct_intercompany_reconciliation | `document_intelligence/domains/accounting/doc_types/extraction/acct_intercompany_reconciliation.extraction_hints.any.json` | 697 | Low | 2026-02-27 |
| di_accounting_extraction_acct_ap_aging | `document_intelligence/domains/accounting/doc_types/extraction/acct_ap_aging.extraction_hints.any.json` | 694 | Low | 2026-02-28 |
| di_accounting_extraction_acct_ar_aging | `document_intelligence/domains/accounting/doc_types/extraction/acct_ar_aging.extraction_hints.any.json` | 694 | Low | 2026-02-28 |
| di_accounting_extraction_acct_trial_balance | `document_intelligence/domains/accounting/doc_types/extraction/acct_trial_balance.extraction_hints.any.json` | 692 | Low | 2026-02-28 |
| di_finance_extraction_fin_8k | `document_intelligence/domains/finance/doc_types/extraction/fin_8k.extraction_hints.any.json` | 691 | Low | 2026-02-28 |
| di_accounting_extraction_acct_bank_reconciliation | `document_intelligence/domains/accounting/doc_types/extraction/acct_bank_reconciliation.extraction_hints.any.json` | 689 | Low | 2026-02-27 |
| di_accounting_extraction_acct_journal_entry_support | `document_intelligence/domains/accounting/doc_types/extraction/acct_journal_entry_support.extraction_hints.any.json` | 689 | Low | 2026-02-27 |
| di_accounting_extraction_acct_audit_workpaper | `document_intelligence/domains/accounting/doc_types/extraction/acct_audit_workpaper.extraction_hints.any.json` | 688 | Low | 2026-02-28 |
| di_accounting_extraction_acct_chart_of_accounts | `document_intelligence/domains/accounting/doc_types/extraction/acct_chart_of_accounts.extraction_hints.any.json` | 687 | Low | 2026-02-27 |
| di_accounting_extraction_acct_controls_narrative | `document_intelligence/domains/accounting/doc_types/extraction/acct_controls_narrative.extraction_hints.any.json` | 686 | Low | 2026-02-28 |
| di_accounting_extraction_acct_management_rep_letter | `document_intelligence/domains/accounting/doc_types/extraction/acct_management_rep_letter.extraction_hints.any.json` | 685 | Low | 2026-02-27 |
| di_accounting_extraction_acct_lease_accounting_schedule | `document_intelligence/domains/accounting/doc_types/extraction/acct_lease_accounting_schedule.extraction_hints.any.json` | 683 | Low | 2026-02-27 |
| di_ops_sections_ops_maintenance_log | `document_intelligence/domains/ops/doc_types/sections/ops_maintenance_log.sections.any.json` | 683 | Low | 2026-02-27 |
| di_accounting_extraction_acct_invoice_register | `document_intelligence/domains/accounting/doc_types/extraction/acct_invoice_register.extraction_hints.any.json` | 682 | Low | 2026-02-27 |
| di_finance_extraction_fin_10q | `document_intelligence/domains/finance/doc_types/extraction/fin_10q.extraction_hints.any.json` | 682 | Low | 2026-02-28 |
| excel_formula_catalog | `semantics/excel_formula_catalog.any.json` | 682 | Low | 2026-02-13 |
| di_accounting_extraction_acct_payment_run_report | `document_intelligence/domains/accounting/doc_types/extraction/acct_payment_run_report.extraction_hints.any.json` | 680 | Low | 2026-02-27 |
| di_accounting_extraction_acct_inventory_valuation_report | `document_intelligence/domains/accounting/doc_types/extraction/acct_inventory_valuation_report.extraction_hints.any.json` | 679 | Low | 2026-02-27 |
| di_accounting_extraction_acct_gl_export | `document_intelligence/domains/accounting/doc_types/extraction/acct_gl_export.extraction_hints.any.json` | 678 | Low | 2026-02-28 |
| di_accounting_extraction_acct_credit_card_reconciliation | `document_intelligence/domains/accounting/doc_types/extraction/acct_credit_card_reconciliation.extraction_hints.any.json` | 677 | Low | 2026-02-27 |
| di_finance_extraction_fin_10k | `document_intelligence/domains/finance/doc_types/extraction/fin_10k.extraction_hints.any.json` | 677 | Low | 2026-02-28 |
| di_accounting_extraction_acct_pbc_list | `document_intelligence/domains/accounting/doc_types/extraction/acct_pbc_list.extraction_hints.any.json` | 676 | Low | 2026-02-27 |
| di_finance_extraction_fin_arr_mrr_report | `document_intelligence/domains/finance/doc_types/extraction/fin_arr_mrr_report.extraction_hints.any.json` | 667 | Low | 2026-02-27 |
| di_finance_extraction_fin_monthly_close_pack | `document_intelligence/domains/finance/doc_types/extraction/fin_monthly_close_pack.extraction_hints.any.json` | 666 | Low | 2026-02-27 |
| di_finance_extraction_fin_statements_pack | `document_intelligence/domains/finance/doc_types/extraction/fin_statements_pack.extraction_hints.any.json` | 665 | Low | 2026-02-28 |
| di_finance_extraction_fin_investor_presentation | `document_intelligence/domains/finance/doc_types/extraction/fin_investor_presentation.extraction_hints.any.json` | 663 | Low | 2026-02-27 |
| di_finance_extraction_fin_earnings_release | `document_intelligence/domains/finance/doc_types/extraction/fin_earnings_release.extraction_hints.any.json` | 662 | Low | 2026-02-28 |
| di_ops_tables_ops_sla_report | `document_intelligence/domains/ops/doc_types/tables/ops_sla_report.tables.any.json` | 662 | Low | 2026-02-27 |
| di_finance_extraction_fin_board_deck_finance | `document_intelligence/domains/finance/doc_types/extraction/fin_board_deck_finance.extraction_hints.any.json` | 659 | Low | 2026-02-27 |
| di_finance_extraction_fin_cohort_analysis | `document_intelligence/domains/finance/doc_types/extraction/fin_cohort_analysis.extraction_hints.any.json` | 659 | Low | 2026-02-27 |
| di_finance_extraction_fin_debt_schedule | `document_intelligence/domains/finance/doc_types/extraction/fin_debt_schedule.extraction_hints.any.json` | 658 | Low | 2026-02-27 |
| di_finance_extraction_fin_unit_economics_model | `document_intelligence/domains/finance/doc_types/extraction/fin_unit_economics_model.extraction_hints.any.json` | 658 | Low | 2026-02-27 |
| di_finance_extraction_fin_cap_table | `document_intelligence/domains/finance/doc_types/extraction/fin_cap_table.extraction_hints.any.json` | 652 | Low | 2026-02-28 |
| di_finance_extraction_fin_esg_report | `document_intelligence/domains/finance/doc_types/extraction/fin_esg_report.extraction_hints.any.json` | 652 | Low | 2026-02-27 |
| di_finance_extraction_fin_variance_report | `document_intelligence/domains/finance/doc_types/extraction/fin_variance_report.extraction_hints.any.json` | 651 | Low | 2026-02-27 |
| di_accounting_sections_acct_je_support | `document_intelligence/domains/accounting/doc_types/sections/acct_je_support.sections.any.json` | 650 | Low | 2026-02-28 |
| di_finance_extraction_fin_cash_forecast | `document_intelligence/domains/finance/doc_types/extraction/fin_cash_forecast.extraction_hints.any.json` | 650 | Low | 2026-02-27 |
| di_finance_extraction_fin_kpi_dashboard | `document_intelligence/domains/finance/doc_types/extraction/fin_kpi_dashboard.extraction_hints.any.json` | 648 | Low | 2026-02-27 |
| di_finance_extraction_fin_pipeline_report | `document_intelligence/domains/finance/doc_types/extraction/fin_pipeline_report.extraction_hints.any.json` | 641 | Low | 2026-02-27 |
| di_finance_extraction_fin_bank_statement | `document_intelligence/domains/finance/doc_types/extraction/fin_bank_statement.extraction_hints.any.json` | 639 | Low | 2026-02-27 |
| di_finance_extraction_fin_forecast | `document_intelligence/domains/finance/doc_types/extraction/fin_forecast.extraction_hints.any.json` | 637 | Low | 2026-02-28 |
| di_finance_extraction_fin_rolling_forecast | `document_intelligence/domains/finance/doc_types/extraction/fin_rolling_forecast.extraction_hints.any.json` | 634 | Low | 2026-02-27 |
| di_finance_extraction_fin_budget | `document_intelligence/domains/finance/doc_types/extraction/fin_budget.extraction_hints.any.json` | 620 | Low | 2026-02-28 |
| legal_domain_profile | `document_intelligence/domains/legal/domain_profile.any.json` | 590 | Low | 2026-02-27 |
| privacy_minimal_rules | `quality/privacy_minimal_rules.any.json` | 585 | Low | 2026-02-27 |
| di_banking_doc_type_catalog | `document_intelligence/domains/banking/doc_types/doc_type_catalog.any.json` | 577 | Low | 2026-02-27 |
| di_finance_sections_fin_10k | `document_intelligence/domains/finance/doc_types/sections/fin_10k.sections.any.json` | 572 | Low | 2026-02-28 |
| di_finance_sections_fin_10q | `document_intelligence/domains/finance/doc_types/sections/fin_10q.sections.any.json` | 572 | Low | 2026-02-28 |
| di_finance_sections_fin_8k | `document_intelligence/domains/finance/doc_types/sections/fin_8k.sections.any.json` | 572 | Low | 2026-02-28 |
| di_accounting_sections_acct_bank_rec | `document_intelligence/domains/accounting/doc_types/sections/acct_bank_rec.sections.any.json` | 561 | Low | 2026-02-28 |
| di_ops_tables_ops_quality_report | `document_intelligence/domains/ops/doc_types/tables/ops_quality_report.tables.any.json` | 545 | Low | 2026-02-27 |
| di_ops_tables_ops_maintenance_log | `document_intelligence/domains/ops/doc_types/tables/ops_maintenance_log.tables.any.json` | 541 | Low | 2026-02-27 |
| di_ops_tables_ops_shipping_manifest | `document_intelligence/domains/ops/doc_types/tables/ops_shipping_manifest.tables.any.json` | 539 | Low | 2026-02-27 |
| di_finance_sections_fin_covenant_compliance_certificate | `document_intelligence/domains/finance/doc_types/sections/fin_covenant_compliance_certificate.sections.any.json` | 525 | Low | 2026-02-27 |
| di_finance_sections_fin_board_deck_finance | `document_intelligence/domains/finance/doc_types/sections/fin_board_deck_finance.sections.any.json` | 521 | Low | 2026-02-27 |
| di_finance_sections_fin_investor_presentation | `document_intelligence/domains/finance/doc_types/sections/fin_investor_presentation.sections.any.json` | 521 | Low | 2026-02-27 |
| di_finance_sections_fin_unit_economics_model | `document_intelligence/domains/finance/doc_types/sections/fin_unit_economics_model.sections.any.json` | 521 | Low | 2026-02-27 |
| di_finance_sections_fin_arr_mrr_report | `document_intelligence/domains/finance/doc_types/sections/fin_arr_mrr_report.sections.any.json` | 518 | Low | 2026-02-27 |
| di_finance_sections_fin_earnings_release | `document_intelligence/domains/finance/doc_types/sections/fin_earnings_release.sections.any.json` | 518 | Low | 2026-02-28 |
| di_finance_sections_fin_monthly_close_pack | `document_intelligence/domains/finance/doc_types/sections/fin_monthly_close_pack.sections.any.json` | 518 | Low | 2026-02-27 |
| di_finance_sections_fin_rolling_forecast | `document_intelligence/domains/finance/doc_types/sections/fin_rolling_forecast.sections.any.json` | 518 | Low | 2026-02-27 |
| di_finance_sections_fin_cash_forecast | `document_intelligence/domains/finance/doc_types/sections/fin_cash_forecast.sections.any.json` | 516 | Low | 2026-02-27 |
| di_finance_sections_fin_debt_schedule | `document_intelligence/domains/finance/doc_types/sections/fin_debt_schedule.sections.any.json` | 516 | Low | 2026-02-27 |
| di_finance_sections_fin_cap_table | `document_intelligence/domains/finance/doc_types/sections/fin_cap_table.sections.any.json` | 515 | Low | 2026-02-28 |
| di_finance_sections_fin_cohort_analysis | `document_intelligence/domains/finance/doc_types/sections/fin_cohort_analysis.sections.any.json` | 515 | Low | 2026-02-27 |
| di_finance_sections_fin_esg_report | `document_intelligence/domains/finance/doc_types/sections/fin_esg_report.sections.any.json` | 515 | Low | 2026-02-27 |
| di_finance_sections_fin_kpi_dashboard | `document_intelligence/domains/finance/doc_types/sections/fin_kpi_dashboard.sections.any.json` | 515 | Low | 2026-02-27 |
| di_finance_sections_fin_statements_pack | `document_intelligence/domains/finance/doc_types/sections/fin_statements_pack.sections.any.json` | 515 | Low | 2026-02-28 |
| di_finance_sections_fin_variance_report | `document_intelligence/domains/finance/doc_types/sections/fin_variance_report.sections.any.json` | 515 | Low | 2026-02-27 |
| di_ops_tables_ops_work_order | `document_intelligence/domains/ops/doc_types/tables/ops_work_order.tables.any.json` | 514 | Low | 2026-02-27 |
| di_finance_sections_fin_bank_statement | `document_intelligence/domains/finance/doc_types/sections/fin_bank_statement.sections.any.json` | 513 | Low | 2026-02-27 |
| di_finance_sections_fin_forecast | `document_intelligence/domains/finance/doc_types/sections/fin_forecast.sections.any.json` | 512 | Low | 2026-02-28 |
| di_finance_sections_fin_pipeline_report | `document_intelligence/domains/finance/doc_types/sections/fin_pipeline_report.sections.any.json` | 512 | Low | 2026-02-27 |
| di_finance_sections_fin_budget | `document_intelligence/domains/finance/doc_types/sections/fin_budget.sections.any.json` | 509 | Low | 2026-02-28 |
| di_ops_tables_ops_incident_report | `document_intelligence/domains/ops/doc_types/tables/ops_incident_report.tables.any.json` | 505 | Low | 2026-02-27 |
| di_hr_payroll_domain_profile | `document_intelligence/domains/hr_payroll/domain_profile.any.json` | 483 | Low | 2026-02-27 |
| di_banking_domain_profile | `document_intelligence/domains/banking/domain_profile.any.json` | 478 | Low | 2026-02-27 |
| di_billing_domain_profile | `document_intelligence/domains/billing/domain_profile.any.json` | 477 | Low | 2026-02-27 |
| di_finance_sections_fin_covenant | `document_intelligence/domains/finance/doc_types/sections/fin_covenant.sections.any.json` | 471 | Low | 2026-02-28 |
| di_housing_domain_profile | `document_intelligence/domains/housing/domain_profile.any.json` | 468 | Low | 2026-02-27 |
| di_education_domain_profile | `document_intelligence/domains/education/domain_profile.any.json` | 465 | Low | 2026-02-27 |
| di_travel_domain_profile | `document_intelligence/domains/travel/domain_profile.any.json` | 463 | Low | 2026-02-27 |
| di_ops_domain_profile | `document_intelligence/domains/ops/domain_profile.any.json` | 462 | Low | 2026-02-27 |
| medical_domain_profile | `document_intelligence/domains/medical/domain_profile.any.json` | 458 | Low | 2026-02-27 |
| hallucination_guards | `quality/hallucination_guards.any.json` | 454 | Low | 2026-02-27 |
| compliance_policy | `policies/compliance_policy.any.json` | 439 | Low | 2026-02-27 |
| di_accounting_domain_profile | `document_intelligence/domains/accounting/domain_profile.any.json` | 439 | Low | 2026-02-27 |
| di_accounting_sections_acct_prepaids_amortization_schedule | `document_intelligence/domains/accounting/doc_types/sections/acct_prepaids_amortization_schedule.sections.any.json` | 434 | Low | 2026-02-27 |
| di_finance_domain_profile | `document_intelligence/domains/finance/domain_profile.any.json` | 434 | Low | 2026-02-27 |
| di_accounting_sections_acct_accruals_schedule | `document_intelligence/domains/accounting/doc_types/sections/acct_accruals_schedule.sections.any.json` | 420 | Low | 2026-02-27 |
| di_accounting_sections_acct_credit_card_reconciliation | `document_intelligence/domains/accounting/doc_types/sections/acct_credit_card_reconciliation.sections.any.json` | 419 | Low | 2026-02-27 |
| di_accounting_sections_acct_inventory_valuation_report | `document_intelligence/domains/accounting/doc_types/sections/acct_inventory_valuation_report.sections.any.json` | 419 | Low | 2026-02-27 |
| di_accounting_sections_acct_lease_accounting_schedule | `document_intelligence/domains/accounting/doc_types/sections/acct_lease_accounting_schedule.sections.any.json` | 419 | Low | 2026-02-27 |
| di_accounting_extraction_acct_je_support | `document_intelligence/domains/accounting/doc_types/extraction/acct_je_support.extraction_hints.any.json` | 418 | Low | 2026-02-28 |
| di_accounting_sections_acct_revenue_recognition_schedule | `document_intelligence/domains/accounting/doc_types/sections/acct_revenue_recognition_schedule.sections.any.json` | 418 | Low | 2026-02-27 |
| di_accounting_sections_acct_audit_workpaper | `document_intelligence/domains/accounting/doc_types/sections/acct_audit_workpaper.sections.any.json` | 416 | Low | 2026-02-28 |
| di_accounting_sections_acct_journal_entry_support | `document_intelligence/domains/accounting/doc_types/sections/acct_journal_entry_support.sections.any.json` | 416 | Low | 2026-02-27 |
| di_accounting_sections_acct_depreciation_schedule | `document_intelligence/domains/accounting/doc_types/sections/acct_depreciation_schedule.sections.any.json` | 415 | Low | 2026-02-27 |
| di_accounting_sections_acct_intercompany_reconciliation | `document_intelligence/domains/accounting/doc_types/sections/acct_intercompany_reconciliation.sections.any.json` | 415 | Low | 2026-02-27 |
| di_accounting_sections_acct_payment_run_report | `document_intelligence/domains/accounting/doc_types/sections/acct_payment_run_report.sections.any.json` | 415 | Low | 2026-02-27 |
| di_accounting_sections_acct_ap_aging | `document_intelligence/domains/accounting/doc_types/sections/acct_ap_aging.sections.any.json` | 414 | Low | 2026-02-28 |
| di_accounting_sections_acct_ar_aging | `document_intelligence/domains/accounting/doc_types/sections/acct_ar_aging.sections.any.json` | 414 | Low | 2026-02-28 |
| di_accounting_sections_acct_fixed_asset_register | `document_intelligence/domains/accounting/doc_types/sections/acct_fixed_asset_register.sections.any.json` | 414 | Low | 2026-02-27 |
| di_accounting_sections_acct_management_rep_letter | `document_intelligence/domains/accounting/doc_types/sections/acct_management_rep_letter.sections.any.json` | 414 | Low | 2026-02-27 |
| di_accounting_sections_acct_controls_narrative | `document_intelligence/domains/accounting/doc_types/sections/acct_controls_narrative.sections.any.json` | 412 | Low | 2026-02-28 |
| di_accounting_sections_acct_bank_reconciliation | `document_intelligence/domains/accounting/doc_types/sections/acct_bank_reconciliation.sections.any.json` | 411 | Low | 2026-02-27 |
| di_accounting_sections_acct_chart_of_accounts | `document_intelligence/domains/accounting/doc_types/sections/acct_chart_of_accounts.sections.any.json` | 411 | Low | 2026-02-27 |
| di_accounting_sections_acct_gl_export | `document_intelligence/domains/accounting/doc_types/sections/acct_gl_export.sections.any.json` | 411 | Low | 2026-02-28 |
| di_accounting_sections_acct_pbc_list | `document_intelligence/domains/accounting/doc_types/sections/acct_pbc_list.sections.any.json` | 410 | Low | 2026-02-27 |
| di_accounting_sections_acct_trial_balance | `document_intelligence/domains/accounting/doc_types/sections/acct_trial_balance.sections.any.json` | 409 | Low | 2026-02-28 |
| doc_grounding_checks | `quality/doc_grounding_checks.any.json` | 409 | Low | 2026-02-27 |
| di_accounting_sections_acct_invoice_register | `document_intelligence/domains/accounting/doc_types/sections/acct_invoice_register.sections.any.json` | 407 | Low | 2026-02-27 |
| di_finance_sections_fin_variance | `document_intelligence/domains/finance/doc_types/sections/fin_variance.sections.any.json` | 399 | Low | 2026-02-28 |
| allybi_chart_spec_bank | `semantics/allybi_chart_spec_bank.any.json` | 395 | Low | 2026-02-12 |
| allybi_formula_bank | `semantics/allybi_formula_bank.any.json` | 394 | Low | 2026-02-12 |
| di_accounting_extraction_acct_bank_rec | `document_intelligence/domains/accounting/doc_types/extraction/acct_bank_rec.extraction_hints.any.json` | 378 | Low | 2026-02-28 |
| di_finance_extraction_fin_covenant | `document_intelligence/domains/finance/doc_types/extraction/fin_covenant.extraction_hints.any.json` | 377 | Low | 2026-02-28 |
| quote_styles | `formatting/quote_styles.any.json` | 317 | Low | 2026-02-27 |
| list_styles | `formatting/list_styles.any.json` | 312 | Low | 2026-02-27 |
| citation_styles | `formatting/citation_styles.any.json` | 306 | Low | 2026-02-27 |
| dedupe_and_repetition | `quality/dedupe_and_repetition.any.json` | 298 | Low | 2026-02-27 |
| di_tax_domain_profile | `document_intelligence/domains/tax/domain_profile.any.json` | 296 | Low | 2026-02-27 |
| di_finance_extraction_fin_variance | `document_intelligence/domains/finance/doc_types/extraction/fin_variance.extraction_hints.any.json` | 294 | Low | 2026-02-28 |
| di_identity_domain_profile | `document_intelligence/domains/identity/domain_profile.any.json` | 294 | Low | 2026-02-27 |
| table_styles | `formatting/table_styles.any.json` | 289 | Low | 2026-02-27 |
| di_insurance_domain_profile | `document_intelligence/domains/insurance/domain_profile.any.json` | 287 | Low | 2026-02-27 |
| extraction_policy | `semantics/extraction_policy.any.json` | 276 | Low | 2026-02-20 |
| pii_field_labels | `quality/pii_field_labels.any.json` | 215 | Low | 2026-02-27 |
| logging_policy | `policies/logging_policy.any.json` | 207 | Low | 2026-02-27 |

### manifest (15)

| Bank ID | Path | Tokens | Complexity | Last Updated |
|---|---|---:|---|---|
| bank_registry | `manifest/bank_registry.any.json` | 224584 | Very High | 2026-01-26 |
| bank_checksums | `manifest/bank_checksums.any.json` | 80743 | Very High | 2026-01-26 |
| bank_aliases | `manifest/bank_aliases.any.json` | 71039 | Very High | 2026-01-25 |
| bank_dependencies | `manifest/bank_dependencies.any.json` | 36649 | Very High | 2026-01-26 |
| document_intelligence_dependency_graph | `document_intelligence/manifest/dependency_graph.any.json` | 7175 | High | 2026-02-28 |
| bank_manifest | `manifest/bank_manifest.any.json` | 4223 | Medium | 2026-01-25 |
| versioning | `manifest/versioning.any.json` | 2583 | Medium | 2026-01-25 |
| feature_flags | `manifest/feature_flags.any.json` | 2180 | Medium | 2026-01-25 |
| document_intelligence_runtime_wiring_gates | `document_intelligence/manifest/runtime_wiring_gates.any.json` | 2118 | Medium | 2026-02-28 |
| document_intelligence_schema_registry | `document_intelligence/manifest/bank_schema_registry.any.json` | 1572 | Low | 2026-02-28 |
| environments | `manifest/environments.any.json` | 1292 | Low | 2026-01-25 |
| languages | `manifest/languages.any.json` | 1192 | Low | 2026-01-25 |
| document_intelligence_usage_manifest | `document_intelligence/manifest/usage_manifest.any.json` | 1042 | Low | 2026-02-28 |
| unused_bank_lifecycle | `manifest/unused_bank_lifecycle.any.json` | 629 | Low | 2026-02-27 |
| document_intelligence_orphan_allowlist | `document_intelligence/manifest/orphan_allowlist.any.json` | 364 | Low | 2026-02-28 |

### routing (27)

| Bank ID | Path | Tokens | Complexity | Last Updated |
|---|---|---:|---|---|
| calc_intent_patterns_pt | `agents/excel_calc/routing/calc_intent_patterns.pt.any.json` | 98332 | Very High | 2026-03-01 |
| calc_intent_patterns_en | `agents/excel_calc/routing/calc_intent_patterns.en.any.json` | 77614 | Very High | 2026-02-28 |
| calc_task_taxonomy | `agents/excel_calc/routing/calc_task_taxonomy.any.json` | 23327 | High | 2026-02-28 |
| slot_schemas_excel_calc | `agents/excel_calc/routing/slot_schemas.any.json` | 19908 | High | 2026-02-28 |
| intent_patterns | `routing/intent_patterns.any.json` | 7528 | High | 2026-01-26 |
| connectors_routing | `routing/connectors_routing.any.json` | 4338 | Medium | 2026-02-27 |
| legal_domain_detection_rules | `document_intelligence/domains/legal/domain_detection_rules.any.json` | 3835 | Medium | 2026-02-27 |
| di_finance_domain_detection_rules | `document_intelligence/domains/finance/domain_detection_rules.any.json` | 3482 | Medium | 2026-02-27 |
| email_routing | `routing/email_routing.any.json` | 3397 | Medium | 2026-02-09 |
| intent_config | `routing/intent_config.any.json` | 3188 | Medium | 2026-01-26 |
| operator_families | `routing/operator_families.any.json` | 3188 | Medium | 2026-01-26 |
| medical_domain_detection_rules | `document_intelligence/domains/medical/domain_detection_rules.any.json` | 2452 | Medium | 2026-02-27 |
| allybi_intents | `routing/allybi_intents.any.json` | 2311 | Medium | 2026-02-12 |
| editing_routing | `routing/editing_routing.any.json` | 2190 | Medium | 2026-02-27 |
| di_identity_domain_detection_rules | `document_intelligence/domains/identity/domain_detection_rules.any.json` | 1650 | Low | 2026-02-27 |
| di_billing_domain_detection_rules | `document_intelligence/domains/billing/domain_detection_rules.any.json` | 1629 | Low | 2026-02-27 |
| di_tax_domain_detection_rules | `document_intelligence/domains/tax/domain_detection_rules.any.json` | 1511 | Low | 2026-02-27 |
| di_insurance_domain_detection_rules | `document_intelligence/domains/insurance/domain_detection_rules.any.json` | 1477 | Low | 2026-02-27 |
| chart_intent_taxonomy | `agents/excel_calc/charts/chart_intent_taxonomy.any.json` | 1341 | Low | 2026-03-01 |
| di_accounting_domain_detection_rules | `document_intelligence/domains/accounting/domain_detection_rules.any.json` | 1152 | Low | 2026-02-27 |
| di_ops_domain_detection_rules | `document_intelligence/domains/ops/domain_detection_rules.any.json` | 1107 | Low | 2026-02-27 |
| di_banking_domain_detection_rules | `document_intelligence/domains/banking/domain_detection_rules.any.json` | 1099 | Low | 2026-02-27 |
| di_travel_domain_detection_rules | `document_intelligence/domains/travel/domain_detection_rules.any.json` | 841 | Low | 2026-02-27 |
| di_housing_domain_detection_rules | `document_intelligence/domains/housing/domain_detection_rules.any.json` | 736 | Low | 2026-02-27 |
| di_education_domain_detection_rules | `document_intelligence/domains/education/domain_detection_rules.any.json` | 714 | Low | 2026-02-27 |
| di_hr_payroll_domain_detection_rules | `document_intelligence/domains/hr_payroll/domain_detection_rules.any.json` | 656 | Low | 2026-02-27 |
| routing_priority | `routing/routing_priority.any.json` | 234 | Low | 2026-02-20 |

### probes (10)

| Bank ID | Path | Tokens | Complexity | Last Updated |
|---|---|---:|---|---|
| pattern_library | `probes/marketing/pattern_library.any.json` | 34712 | Very High | 2026-02-27 |
| keyword_taxonomy_legal | `probes/marketing/keyword_taxonomy.legal.any.json` | 32683 | High | 2026-02-27 |
| keyword_taxonomy_medical | `probes/marketing/keyword_taxonomy.medical.any.json` | 32453 | High | 2026-02-27 |
| keyword_taxonomy_ops | `probes/marketing/keyword_taxonomy.ops.any.json` | 31762 | High | 2026-02-27 |
| keyword_taxonomy_finance | `probes/marketing/keyword_taxonomy.finance.any.json` | 31143 | High | 2026-02-27 |
| pain_points_medical | `probes/marketing/pain_points.medical.any.json` | 20978 | High | 2026-02-27 |
| pain_points_legal | `probes/marketing/pain_points.legal.any.json` | 20543 | High | 2026-02-27 |
| pain_points_finance | `probes/marketing/pain_points.finance.any.json` | 20456 | High | 2026-02-27 |
| pain_points_ops | `probes/marketing/pain_points.ops.any.json` | 20446 | High | 2026-02-27 |
| excel_edit_regression | `probes/excel_edit_regression.any.json` | 510 | Low | 2026-02-13 |

### intent_patterns (4)

| Bank ID | Path | Tokens | Complexity | Last Updated |
|---|---|---:|---|---|
| intent_patterns_docx_pt | `intent_patterns/docx.pt.any.json` | 54249 | Very High | 2026-02-12 |
| intent_patterns_excel_pt | `intent_patterns/excel.pt.any.json` | 51933 | Very High | 2026-02-12 |
| intent_patterns_excel_en | `intent_patterns/excel.en.any.json` | 46331 | Very High | 2026-02-12 |
| intent_patterns_docx_en | `intent_patterns/docx.en.any.json` | 44246 | Very High | 2026-02-12 |

### retrieval (36)

| Bank ID | Path | Tokens | Complexity | Last Updated |
|---|---|---:|---|---|
| boost_rules_legal | `retrieval/boost_rules.legal.any.json` | 10675 | High | 2026-02-28 |
| boost_rules_ops | `retrieval/boost_rules.ops.any.json` | 10528 | High | 2026-02-28 |
| boost_rules_finance | `retrieval/boost_rules.finance.any.json` | 10479 | High | 2026-02-27 |
| boost_rules_medical | `retrieval/boost_rules.medical.any.json` | 10414 | High | 2026-02-28 |
| section_priority_finance | `retrieval/section_priority.finance.any.json` | 9077 | High | 2026-02-27 |
| section_priority_legal | `retrieval/section_priority.legal.any.json` | 8965 | High | 2026-02-28 |
| section_priority_ops | `retrieval/section_priority.ops.any.json` | 8934 | High | 2026-02-28 |
| section_priority_medical | `retrieval/section_priority.medical.any.json` | 8905 | High | 2026-02-28 |
| query_rewrites_finance | `retrieval/query_rewrites.finance.any.json` | 8167 | High | 2026-02-28 |
| query_rewrites_medical | `retrieval/query_rewrites.medical.any.json` | 7153 | High | 2026-02-28 |
| query_rewrites_ops | `retrieval/query_rewrites.ops.any.json` | 6978 | High | 2026-02-28 |
| query_rewrites_legal | `retrieval/query_rewrites.legal.any.json` | 6878 | High | 2026-02-28 |
| legal_retrieval_strategies | `document_intelligence/domains/legal/retrieval_strategies.any.json` | 4883 | Medium | 2026-02-27 |
| source_engine | `retrieval/source_engine.any.json` | 4634 | Medium | 2026-02-04 |
| medical_retrieval_strategies | `document_intelligence/domains/medical/retrieval_strategies.any.json` | 3720 | Medium | 2026-02-27 |
| semantic_search_config | `retrieval/semantic_search_config.any.json` | 3382 | Medium | 2026-01-26 |
| evidence_packaging | `retrieval/evidence_packaging.any.json` | 3112 | Medium | 2026-01-26 |
| retrieval_ranker_config | `retrieval/retrieval_ranker_config.any.json` | 2896 | Medium | 2026-01-26 |
| doc_title_boost_rules | `retrieval/doc_title_boost_rules.any.json` | 2642 | Medium | 2026-01-26 |
| retrieval_negatives | `retrieval/retrieval_negatives.any.json` | 2263 | Medium | 2026-01-26 |
| keyword_boost_rules | `retrieval/keyword_boost_rules.any.json` | 2207 | Medium | 2026-01-26 |
| doc_type_boost_rules | `retrieval/doc_type_boost_rules.any.json` | 2101 | Medium | 2026-01-26 |
| diversification_rules | `retrieval/diversification_rules.any.json` | 2042 | Medium | 2026-01-26 |
| recency_boost_rules | `retrieval/recency_boost_rules.any.json` | 1872 | Medium | 2026-01-26 |
| di_insurance_retrieval_strategies | `document_intelligence/domains/insurance/retrieval_strategies.any.json` | 1229 | Low | 2026-02-27 |
| di_identity_retrieval_strategies | `document_intelligence/domains/identity/retrieval_strategies.any.json` | 1210 | Low | 2026-02-27 |
| di_tax_retrieval_strategies | `document_intelligence/domains/tax/retrieval_strategies.any.json` | 1182 | Low | 2026-02-27 |
| di_housing_retrieval_strategies | `document_intelligence/domains/housing/retrieval_strategies.any.json` | 1181 | Low | 2026-02-27 |
| di_hr_payroll_retrieval_strategies | `document_intelligence/domains/hr_payroll/retrieval_strategies.any.json` | 1179 | Low | 2026-02-27 |
| di_travel_retrieval_strategies | `document_intelligence/domains/travel/retrieval_strategies.any.json` | 1162 | Low | 2026-02-27 |
| di_education_retrieval_strategies | `document_intelligence/domains/education/retrieval_strategies.any.json` | 1160 | Low | 2026-02-27 |
| di_billing_retrieval_strategies | `document_intelligence/domains/billing/retrieval_strategies.any.json` | 1120 | Low | 2026-02-27 |
| di_finance_retrieval_strategies | `document_intelligence/domains/finance/retrieval_strategies.any.json` | 988 | Low | 2026-02-27 |
| di_accounting_retrieval_strategies | `document_intelligence/domains/accounting/retrieval_strategies.any.json` | 941 | Low | 2026-02-27 |
| di_ops_retrieval_strategies | `document_intelligence/domains/ops/retrieval_strategies.any.json` | 938 | Low | 2026-02-27 |
| di_banking_retrieval_strategies | `document_intelligence/domains/banking/retrieval_strategies.any.json` | 911 | Low | 2026-02-27 |

### policies (64)

| Bank ID | Path | Tokens | Complexity | Last Updated |
|---|---|---:|---|---|
| python_sandbox_policy | `policies/python_sandbox_policy.any.json` | 14354 | High | 2026-02-27 |
| decision_support_accounting | `policies/reasoning/decision_support.accounting.any.json` | 12328 | High | 2026-02-27 |
| decision_support_legal | `policies/reasoning/decision_support.legal.any.json` | 12225 | High | 2026-02-27 |
| decision_support_medical | `policies/reasoning/decision_support.medical.any.json` | 12177 | High | 2026-02-27 |
| decision_support_finance | `policies/reasoning/decision_support.finance.any.json` | 12105 | High | 2026-02-27 |
| decision_support_ops | `policies/reasoning/decision_support.ops.any.json` | 12080 | High | 2026-02-27 |
| explain_style_accounting | `policies/reasoning/explain_style.accounting.any.json` | 5354 | High | 2026-02-27 |
| explain_style_legal | `policies/reasoning/explain_style.legal.any.json` | 5328 | High | 2026-02-27 |
| explain_style_finance | `policies/reasoning/explain_style.finance.any.json` | 5256 | High | 2026-02-27 |
| explain_style_medical | `policies/reasoning/explain_style.medical.any.json` | 5256 | High | 2026-02-27 |
| explain_style_ops | `policies/reasoning/explain_style.ops.any.json` | 5255 | High | 2026-02-27 |
| memory_policy_tests | `policies/memory_policy_tests.any.json` | 4984 | Medium | 2026-02-20 |
| memory_policy | `policies/memory_policy.any.json` | 4936 | Medium | 2026-01-26 |
| clarification_policy | `policies/clarification_policy.any.json` | 2497 | Medium | 2026-01-26 |
| assumption_policy | `policies/reasoning/assumption_policy.any.json` | 2355 | Medium | 2026-02-27 |
| refusal_policy | `policies/refusal_policy.any.json` | 2151 | Medium | 2026-01-26 |
| editing_policy | `policies/editing.policy.any.json` | 1856 | Medium | 2026-02-07 |
| di_identity_redaction_and_safety_rules | `document_intelligence/domains/identity/redaction_and_safety_rules.any.json` | 1835 | Medium | 2026-02-27 |
| di_insurance_redaction_and_safety_rules | `document_intelligence/domains/insurance/redaction_and_safety_rules.any.json` | 1694 | Low | 2026-02-27 |
| orchestrator_certification | `policies/orchestrator_certification.any.json` | 1655 | Low | 2026-02-20 |
| di_tax_redaction_and_safety_rules | `document_intelligence/domains/tax/redaction_and_safety_rules.any.json` | 1630 | Low | 2026-02-27 |
| fallback_policy | `policies/fallback_policy.any.json` | 1552 | Low | 2026-01-26 |
| medical_redaction_and_safety_rules | `document_intelligence/domains/medical/redaction_and_safety_rules.any.json` | 1243 | Low | 2026-02-27 |
| legal_redaction_and_safety_rules | `document_intelligence/domains/legal/redaction_and_safety_rules.any.json` | 1055 | Low | 2026-02-27 |
| di_accounting_reasoning_scaffolds | `document_intelligence/domains/accounting/reasoning_scaffolds.any.json` | 904 | Low | 2026-02-27 |
| di_finance_reasoning_scaffolds | `document_intelligence/domains/finance/reasoning_scaffolds.any.json` | 817 | Low | 2026-02-27 |
| di_ops_redaction_and_safety_rules | `document_intelligence/domains/ops/redaction_and_safety_rules.any.json` | 780 | Low | 2026-02-27 |
| di_hr_payroll_redaction_and_safety_rules | `document_intelligence/domains/hr_payroll/redaction_and_safety_rules.any.json` | 762 | Low | 2026-02-27 |
| di_finance_redaction_and_safety_rules | `document_intelligence/domains/finance/redaction_and_safety_rules.any.json` | 748 | Low | 2026-02-27 |
| di_education_redaction_and_safety_rules | `document_intelligence/domains/education/redaction_and_safety_rules.any.json` | 739 | Low | 2026-02-27 |
| di_housing_redaction_and_safety_rules | `document_intelligence/domains/housing/redaction_and_safety_rules.any.json` | 739 | Low | 2026-02-27 |
| di_travel_redaction_and_safety_rules | `document_intelligence/domains/travel/redaction_and_safety_rules.any.json` | 739 | Low | 2026-02-27 |
| di_accounting_redaction_and_safety_rules | `document_intelligence/domains/accounting/redaction_and_safety_rules.any.json` | 727 | Low | 2026-02-27 |
| di_banking_redaction_and_safety_rules | `document_intelligence/domains/banking/redaction_and_safety_rules.any.json` | 711 | Low | 2026-02-27 |
| di_billing_redaction_and_safety_rules | `document_intelligence/domains/billing/redaction_and_safety_rules.any.json` | 701 | Low | 2026-02-27 |
| di_finance_disclaimer_policy | `document_intelligence/domains/finance/disclaimer_policy.any.json` | 628 | Low | 2026-02-27 |
| di_insurance_reasoning_scaffolds | `document_intelligence/domains/insurance/reasoning_scaffolds.any.json` | 610 | Low | 2026-02-27 |
| di_tax_reasoning_scaffolds | `document_intelligence/domains/tax/reasoning_scaffolds.any.json` | 603 | Low | 2026-02-27 |
| di_identity_reasoning_scaffolds | `document_intelligence/domains/identity/reasoning_scaffolds.any.json` | 602 | Low | 2026-02-27 |
| di_ops_reasoning_scaffolds | `document_intelligence/domains/ops/reasoning_scaffolds.any.json` | 570 | Low | 2026-02-27 |
| di_tax_disclaimer_policy | `document_intelligence/domains/tax/disclaimer_policy.any.json` | 560 | Low | 2026-02-27 |
| di_hr_payroll_reasoning_scaffolds | `document_intelligence/domains/hr_payroll/reasoning_scaffolds.any.json` | 555 | Low | 2026-02-27 |
| di_insurance_disclaimer_policy | `document_intelligence/domains/insurance/disclaimer_policy.any.json` | 550 | Low | 2026-02-27 |
| di_banking_reasoning_scaffolds | `document_intelligence/domains/banking/reasoning_scaffolds.any.json` | 545 | Low | 2026-02-27 |
| di_education_reasoning_scaffolds | `document_intelligence/domains/education/reasoning_scaffolds.any.json` | 540 | Low | 2026-02-27 |
| di_housing_reasoning_scaffolds | `document_intelligence/domains/housing/reasoning_scaffolds.any.json` | 540 | Low | 2026-02-27 |
| di_identity_disclaimer_policy | `document_intelligence/domains/identity/disclaimer_policy.any.json` | 540 | Low | 2026-02-27 |
| di_travel_reasoning_scaffolds | `document_intelligence/domains/travel/reasoning_scaffolds.any.json` | 540 | Low | 2026-02-27 |
| di_accounting_disclaimer_policy | `document_intelligence/domains/accounting/disclaimer_policy.any.json` | 538 | Low | 2026-02-27 |
| di_billing_reasoning_scaffolds | `document_intelligence/domains/billing/reasoning_scaffolds.any.json` | 537 | Low | 2026-02-27 |
| legal_disclaimer_policy | `document_intelligence/domains/legal/disclaimer_policy.any.json` | 497 | Low | 2026-02-27 |
| legal_reasoning_scaffolds | `document_intelligence/domains/legal/reasoning_scaffolds.any.json` | 476 | Low | 2026-02-27 |
| medical_disclaimer_policy | `document_intelligence/domains/medical/disclaimer_policy.any.json` | 408 | Low | 2026-02-27 |
| llm_builder_policy | `policies/llm_builder_policy.any.json` | 391 | Low | 2026-03-02 |
| di_ops_disclaimer_policy | `document_intelligence/domains/ops/disclaimer_policy.any.json` | 388 | Low | 2026-02-27 |
| di_banking_disclaimer_policy | `document_intelligence/domains/banking/disclaimer_policy.any.json` | 383 | Low | 2026-02-27 |
| di_billing_disclaimer_policy | `document_intelligence/domains/billing/disclaimer_policy.any.json` | 377 | Low | 2026-02-27 |
| di_education_disclaimer_policy | `document_intelligence/domains/education/disclaimer_policy.any.json` | 373 | Low | 2026-02-27 |
| di_housing_disclaimer_policy | `document_intelligence/domains/housing/disclaimer_policy.any.json` | 372 | Low | 2026-02-27 |
| di_hr_payroll_disclaimer_policy | `document_intelligence/domains/hr_payroll/disclaimer_policy.any.json` | 372 | Low | 2026-02-27 |
| di_travel_disclaimer_policy | `document_intelligence/domains/travel/disclaimer_policy.any.json` | 363 | Low | 2026-02-27 |
| medical_reasoning_scaffolds | `document_intelligence/domains/medical/reasoning_scaffolds.any.json` | 353 | Low | 2026-02-27 |
| editing_agent_policy | `policies/editing_agent_policy.any.json` | 338 | Low | 2026-02-27 |
| allybi_connector_permissions | `policies/allybi_connector_permissions.any.json` | 306 | Low | 2026-02-12 |

### operators (50)

| Bank ID | Path | Tokens | Complexity | Last Updated |
|---|---|---:|---|---|
| file_action_operators | `operators/file_action_operators.any.json` | 13356 | High | 2026-02-06 |
| operator_contracts | `operators/operator_contracts.any.json` | 13168 | High | 2026-03-01 |
| allybi_xlsx_operators | `operators/allybi_xlsx_operators.any.json` | 8436 | High | 2026-02-12 |
| allybi_docx_operators | `operators/allybi_docx_operators.any.json` | 4137 | Medium | 2026-02-12 |
| operator_output_shapes | `operators/operator_output_shapes.any.json` | 3152 | Medium | 2026-03-01 |
| operator_collision_matrix | `operators/operator_collision_matrix.any.json` | 2635 | Medium | 2026-03-01 |
| operator_playbook_evaluate_legal | `operators/playbooks/evaluate/legal.any.json` | 2056 | Medium | 2026-02-27 |
| operator_playbook_evaluate_medical | `operators/playbooks/evaluate/medical.any.json` | 2050 | Medium | 2026-02-27 |
| operator_playbook_calculate_finance | `operators/playbooks/calculate/finance.any.json` | 2048 | Medium | 2026-02-27 |
| operator_playbook_validate_legal | `operators/playbooks/validate/legal.any.json` | 2048 | Medium | 2026-02-27 |
| operator_playbook_advise_medical | `operators/playbooks/advise/medical.any.json` | 2043 | Medium | 2026-02-27 |
| operator_playbook_advise_ops | `operators/playbooks/advise/ops.any.json` | 2042 | Medium | 2026-02-27 |
| operator_playbook_validate_medical | `operators/playbooks/validate/medical.any.json` | 2040 | Medium | 2026-02-27 |
| operator_playbook_evaluate_ops | `operators/playbooks/evaluate/ops.any.json` | 2038 | Medium | 2026-02-27 |
| operator_playbook_monitor_ops | `operators/playbooks/monitor/ops.any.json` | 2038 | Medium | 2026-02-27 |
| operator_playbook_advise_legal | `operators/playbooks/advise/legal.any.json` | 2036 | Medium | 2026-02-27 |
| operator_playbook_locate_legal | `operators/playbooks/locate/legal.any.json` | 2036 | Medium | 2026-02-27 |
| operator_playbook_locate_medical | `operators/playbooks/locate/medical.any.json` | 2036 | Medium | 2026-02-27 |
| operator_playbook_summarize_legal | `operators/playbooks/summarize/legal.any.json` | 2036 | Medium | 2026-02-27 |
| operator_playbook_summarize_medical | `operators/playbooks/summarize/medical.any.json` | 2036 | Medium | 2026-02-27 |
| operator_playbook_calculate_legal | `operators/playbooks/calculate/legal.any.json` | 2035 | Medium | 2026-02-27 |
| operator_playbook_locate_ops | `operators/playbooks/locate/ops.any.json` | 2035 | Medium | 2026-02-27 |
| operator_playbook_summarize_ops | `operators/playbooks/summarize/ops.any.json` | 2035 | Medium | 2026-02-27 |
| operator_playbook_calculate_medical | `operators/playbooks/calculate/medical.any.json` | 2033 | Medium | 2026-02-27 |
| operator_playbook_extract_legal | `operators/playbooks/extract/legal.any.json` | 2033 | Medium | 2026-02-27 |
| operator_playbook_extract_medical | `operators/playbooks/extract/medical.any.json` | 2033 | Medium | 2026-02-27 |
| operator_playbook_monitor_legal | `operators/playbooks/monitor/legal.any.json` | 2033 | Medium | 2026-02-27 |
| operator_playbook_extract_ops | `operators/playbooks/extract/ops.any.json` | 2032 | Medium | 2026-02-27 |
| operator_playbook_calculate_ops | `operators/playbooks/calculate/ops.any.json` | 2031 | Medium | 2026-02-27 |
| operator_playbook_compare_legal | `operators/playbooks/compare/legal.any.json` | 2031 | Medium | 2026-02-27 |
| operator_playbook_compare_medical | `operators/playbooks/compare/medical.any.json` | 2031 | Medium | 2026-02-27 |
| operator_playbook_monitor_medical | `operators/playbooks/monitor/medical.any.json` | 2031 | Medium | 2026-02-27 |
| operator_playbook_compare_ops | `operators/playbooks/compare/ops.any.json` | 2030 | Medium | 2026-02-27 |
| operator_playbook_navigate_legal | `operators/playbooks/navigate/legal.any.json` | 2029 | Medium | 2026-02-27 |
| operator_playbook_validate_ops | `operators/playbooks/validate/ops.any.json` | 2029 | Medium | 2026-02-27 |
| operator_playbook_open_legal | `operators/playbooks/open/legal.any.json` | 2028 | Medium | 2026-02-27 |
| operator_playbook_navigate_medical | `operators/playbooks/navigate/medical.any.json` | 2026 | Medium | 2026-02-27 |
| operator_playbook_open_medical | `operators/playbooks/open/medical.any.json` | 2025 | Medium | 2026-02-27 |
| operator_playbook_navigate_ops | `operators/playbooks/navigate/ops.any.json` | 2024 | Medium | 2026-02-27 |
| operator_playbook_open_ops | `operators/playbooks/open/ops.any.json` | 2023 | Medium | 2026-02-27 |
| operator_playbook_evaluate_finance | `operators/playbooks/evaluate/finance.any.json` | 2021 | Medium | 2026-02-27 |
| operator_playbook_advise_finance | `operators/playbooks/advise/finance.any.json` | 2018 | Medium | 2026-02-27 |
| operator_playbook_locate_finance | `operators/playbooks/locate/finance.any.json` | 2018 | Medium | 2026-02-27 |
| operator_playbook_summarize_finance | `operators/playbooks/summarize/finance.any.json` | 2018 | Medium | 2026-02-27 |
| operator_playbook_extract_finance | `operators/playbooks/extract/finance.any.json` | 2015 | Medium | 2026-02-27 |
| operator_playbook_monitor_finance | `operators/playbooks/monitor/finance.any.json` | 2015 | Medium | 2026-02-27 |
| operator_playbook_compare_finance | `operators/playbooks/compare/finance.any.json` | 2013 | Medium | 2026-02-27 |
| operator_playbook_navigate_finance | `operators/playbooks/navigate/finance.any.json` | 2012 | Medium | 2026-02-27 |
| operator_playbook_validate_finance | `operators/playbooks/validate/finance.any.json` | 2012 | Medium | 2026-02-27 |
| operator_playbook_open_finance | `operators/playbooks/open/finance.any.json` | 2011 | Medium | 2026-02-27 |

### normalizers (10)

| Bank ID | Path | Tokens | Complexity | Last Updated |
|---|---|---:|---|---|
| doc_aliases_accounting | `normalizers/doc_aliases/accounting.any.json` | 27220 | High | 2026-02-28 |
| doc_aliases_legal | `normalizers/doc_aliases/legal.any.json` | 23863 | High | 2026-02-27 |
| doc_aliases_medical | `normalizers/doc_aliases/medical.any.json` | 22011 | High | 2026-02-27 |
| doc_aliases_finance | `normalizers/doc_aliases/finance.any.json` | 21443 | High | 2026-02-27 |
| doc_aliases_ops | `normalizers/doc_aliases/ops.any.json` | 14015 | High | 2026-02-27 |
| di_normalization_rules | `document_intelligence/language/normalization_rules.any.json` | 6970 | High | 2026-02-27 |
| di_abbreviation_global | `document_intelligence/language/abbreviation_global.any.json` | 6933 | High | 2026-02-27 |
| synonym_expansion | `normalizers/synonym_expansion.any.json` | 4842 | Medium | 2026-01-26 |
| language_indicators | `normalizers/language_indicators.any.json` | 4196 | Medium | 2026-01-26 |
| doc_aliases | `normalizers/doc_aliases.any.json` | 1511 | Low | 2026-01-26 |

### lexicons (34)

| Bank ID | Path | Tokens | Complexity | Last Updated |
|---|---|---:|---|---|
| medical_lexicon_pt | `document_intelligence/domains/medical/lexicons/terminology.pt.any.json` | 9821 | High | 2026-02-27 |
| legal_lexicon_pt | `document_intelligence/domains/legal/lexicons/terminology.pt.any.json` | 9544 | High | 2026-02-27 |
| medical_lexicon_en | `document_intelligence/domains/medical/lexicons/terminology.en.any.json` | 7767 | High | 2026-02-27 |
| legal_lexicon_en | `document_intelligence/domains/legal/lexicons/terminology.en.any.json` | 7548 | High | 2026-02-27 |
| di_tax_lexicon_pt | `document_intelligence/domains/tax/lexicons/tax.pt.any.json` | 4758 | Medium | 2026-02-27 |
| di_insurance_lexicon_pt | `document_intelligence/domains/insurance/lexicons/insurance.pt.any.json` | 4530 | Medium | 2026-02-27 |
| di_identity_lexicon_pt | `document_intelligence/domains/identity/lexicons/identity.pt.any.json` | 3751 | Medium | 2026-02-27 |
| di_tax_lexicon_en | `document_intelligence/domains/tax/lexicons/tax.en.any.json` | 3495 | Medium | 2026-02-27 |
| di_insurance_lexicon_en | `document_intelligence/domains/insurance/lexicons/insurance.en.any.json` | 3306 | Medium | 2026-02-27 |
| di_identity_lexicon_en | `document_intelligence/domains/identity/lexicons/identity.en.any.json` | 2804 | Medium | 2026-02-27 |
| di_finance_lexicon_pt | `document_intelligence/domains/finance/lexicons/finance.pt.any.json` | 1336 | Low | 2026-02-27 |
| di_ops_lexicon_pt | `document_intelligence/domains/ops/lexicons/ops.pt.any.json` | 1301 | Low | 2026-02-27 |
| di_accounting_lexicon_pt | `document_intelligence/domains/accounting/lexicons/accounting.pt.any.json` | 1268 | Low | 2026-02-27 |
| di_hr_payroll_lexicon_pt | `document_intelligence/domains/hr_payroll/lexicons/hr_payroll.pt.any.json` | 1254 | Low | 2026-02-27 |
| di_housing_lexicon_pt | `document_intelligence/domains/housing/lexicons/housing.pt.any.json` | 1217 | Low | 2026-02-27 |
| di_travel_lexicon_pt | `document_intelligence/domains/travel/lexicons/travel.pt.any.json` | 1181 | Low | 2026-02-27 |
| di_billing_lexicon_pt | `document_intelligence/domains/billing/lexicons/billing.pt.any.json` | 1163 | Low | 2026-02-27 |
| di_hr_payroll_lexicon_en | `document_intelligence/domains/hr_payroll/lexicons/hr_payroll.en.any.json` | 1158 | Low | 2026-02-27 |
| di_banking_lexicon_pt | `document_intelligence/domains/banking/lexicons/banking.pt.any.json` | 1154 | Low | 2026-02-27 |
| di_education_lexicon_pt | `document_intelligence/domains/education/lexicons/education.pt.any.json` | 1151 | Low | 2026-02-27 |
| di_ops_lexicon_en | `document_intelligence/domains/ops/lexicons/ops.en.any.json` | 1140 | Low | 2026-02-27 |
| di_housing_lexicon_en | `document_intelligence/domains/housing/lexicons/housing.en.any.json` | 1104 | Low | 2026-02-27 |
| di_travel_lexicon_en | `document_intelligence/domains/travel/lexicons/travel.en.any.json` | 1095 | Low | 2026-02-27 |
| di_banking_lexicon_en | `document_intelligence/domains/banking/lexicons/banking.en.any.json` | 1089 | Low | 2026-02-27 |
| di_billing_lexicon_en | `document_intelligence/domains/billing/lexicons/billing.en.any.json` | 1085 | Low | 2026-02-27 |
| di_education_lexicon_en | `document_intelligence/domains/education/lexicons/education.en.any.json` | 1078 | Low | 2026-02-27 |
| di_finance_lexicon_en | `document_intelligence/domains/finance/lexicons/finance.en.any.json` | 1043 | Low | 2026-02-27 |
| di_accounting_lexicon_en | `document_intelligence/domains/accounting/lexicons/accounting.en.any.json` | 991 | Low | 2026-02-27 |
| docx_pt | `lexicons/docx.pt.any.json` | 962 | Low | 2026-02-12 |
| docx_en | `lexicons/docx.en.any.json` | 835 | Low | 2026-02-12 |
| common_pt | `lexicons/common.pt.any.json` | 618 | Low | 2026-02-12 |
| excel_pt | `lexicons/excel.pt.any.json` | 553 | Low | 2026-02-12 |
| common_en | `lexicons/common.en.any.json` | 505 | Low | 2026-02-12 |
| excel_en | `lexicons/excel.en.any.json` | 468 | Low | 2026-02-12 |

### quality (36)

| Bank ID | Path | Tokens | Complexity | Last Updated |
|---|---|---:|---|---|
| result_verification_policy | `agents/excel_calc/quality/result_verification_policy.any.json` | 8609 | High | 2026-02-28 |
| numeric_integrity_rules | `agents/excel_calc/quality/numeric_integrity_rules.any.json` | 6507 | High | 2026-02-28 |
| ambiguity_questions | `quality/document_intelligence/ambiguity_questions.any.json` | 5435 | High | 2026-02-27 |
| quality_gates | `quality/quality_gates.any.json` | 5372 | High | 2026-01-26 |
| clarification_policy_excel_calc | `agents/excel_calc/quality/clarification_policy.any.json` | 5153 | Medium | 2026-02-28 |
| wrong_doc_lock | `quality/document_intelligence/wrong_doc_lock.any.json` | 4271 | Medium | 2026-02-27 |
| numeric_integrity | `quality/document_intelligence/numeric_integrity.any.json` | 4163 | Medium | 2026-02-27 |
| source_policy | `quality/document_intelligence/source_policy.any.json` | 3962 | Medium | 2026-02-27 |
| di_finance_evidence_requirements | `document_intelligence/domains/finance/evidence_requirements.any.json` | 2229 | Medium | 2026-02-27 |
| di_insurance_evidence_requirements | `document_intelligence/domains/insurance/evidence_requirements.any.json` | 1303 | Low | 2026-02-27 |
| di_tax_evidence_requirements | `document_intelligence/domains/tax/evidence_requirements.any.json` | 1264 | Low | 2026-02-27 |
| legal_evidence_requirements | `document_intelligence/domains/legal/evidence_requirements.any.json` | 1240 | Low | 2026-02-27 |
| di_identity_evidence_requirements | `document_intelligence/domains/identity/evidence_requirements.any.json` | 1236 | Low | 2026-02-27 |
| di_accounting_evidence_requirements | `document_intelligence/domains/accounting/evidence_requirements.any.json` | 1076 | Low | 2026-02-27 |
| medical_evidence_requirements | `document_intelligence/domains/medical/evidence_requirements.any.json` | 990 | Low | 2026-02-27 |
| di_hr_payroll_evidence_requirements | `document_intelligence/domains/hr_payroll/evidence_requirements.any.json` | 942 | Low | 2026-02-27 |
| di_accounting_validation_policies | `document_intelligence/domains/accounting/validation_policies.any.json` | 927 | Low | 2026-02-27 |
| di_education_evidence_requirements | `document_intelligence/domains/education/evidence_requirements.any.json` | 925 | Low | 2026-02-27 |
| di_housing_evidence_requirements | `document_intelligence/domains/housing/evidence_requirements.any.json` | 925 | Low | 2026-02-27 |
| di_travel_evidence_requirements | `document_intelligence/domains/travel/evidence_requirements.any.json` | 925 | Low | 2026-02-27 |
| di_billing_evidence_requirements | `document_intelligence/domains/billing/evidence_requirements.any.json` | 899 | Low | 2026-02-27 |
| legal_validation_policies | `document_intelligence/domains/legal/validation_policies.any.json` | 848 | Low | 2026-02-27 |
| di_ops_evidence_requirements | `document_intelligence/domains/ops/evidence_requirements.any.json` | 836 | Low | 2026-02-27 |
| di_banking_evidence_requirements | `document_intelligence/domains/banking/evidence_requirements.any.json` | 832 | Low | 2026-02-27 |
| di_tax_validation_policies | `document_intelligence/domains/tax/validation_policies.any.json` | 743 | Low | 2026-02-27 |
| di_insurance_validation_policies | `document_intelligence/domains/insurance/validation_policies.any.json` | 739 | Low | 2026-02-27 |
| di_identity_validation_policies | `document_intelligence/domains/identity/validation_policies.any.json` | 722 | Low | 2026-02-27 |
| di_finance_validation_policies | `document_intelligence/domains/finance/validation_policies.any.json` | 716 | Low | 2026-02-27 |
| di_ops_validation_policies | `document_intelligence/domains/ops/validation_policies.any.json` | 533 | Low | 2026-02-27 |
| di_billing_validation_policies | `document_intelligence/domains/billing/validation_policies.any.json` | 522 | Low | 2026-02-27 |
| di_housing_validation_policies | `document_intelligence/domains/housing/validation_policies.any.json` | 521 | Low | 2026-02-27 |
| di_hr_payroll_validation_policies | `document_intelligence/domains/hr_payroll/validation_policies.any.json` | 520 | Low | 2026-02-27 |
| di_travel_validation_policies | `document_intelligence/domains/travel/validation_policies.any.json` | 512 | Low | 2026-02-27 |
| di_banking_validation_policies | `document_intelligence/domains/banking/validation_policies.any.json` | 503 | Low | 2026-02-27 |
| di_education_validation_policies | `document_intelligence/domains/education/validation_policies.any.json` | 495 | Low | 2026-02-27 |
| medical_validation_policies | `document_intelligence/domains/medical/validation_policies.any.json` | 486 | Low | 2026-02-27 |

### dictionaries (31)

| Bank ID | Path | Tokens | Complexity | Last Updated |
|---|---|---:|---|---|
| chart_types_pt | `dictionaries/chart_types.pt.any.json` | 13216 | High | 2026-02-27 |
| chart_types_en | `dictionaries/chart_types.en.any.json` | 11877 | High | 2026-02-27 |
| legal_abbreviations_pt | `document_intelligence/domains/legal/abbreviations/common.pt.any.json` | 1851 | Medium | 2026-02-27 |
| medical_abbreviations_pt | `document_intelligence/domains/medical/abbreviations/common.pt.any.json` | 1826 | Medium | 2026-02-27 |
| medical_abbreviations_en | `document_intelligence/domains/medical/abbreviations/common.en.any.json` | 1708 | Low | 2026-02-27 |
| legal_abbreviations_en | `document_intelligence/domains/legal/abbreviations/common.en.any.json` | 1633 | Low | 2026-02-27 |
| di_insurance_abbreviations_pt | `document_intelligence/domains/insurance/abbreviations/insurance.pt.any.json` | 1195 | Low | 2026-02-27 |
| di_tax_abbreviations_pt | `document_intelligence/domains/tax/abbreviations/tax.pt.any.json` | 1195 | Low | 2026-02-27 |
| di_finance_abbreviations_pt | `document_intelligence/domains/finance/abbreviations/finance.pt.any.json` | 1138 | Low | 2026-02-27 |
| di_insurance_abbreviations_en | `document_intelligence/domains/insurance/abbreviations/insurance.en.any.json` | 1115 | Low | 2026-02-27 |
| di_finance_abbreviations_en | `document_intelligence/domains/finance/abbreviations/finance.en.any.json` | 1003 | Low | 2026-02-27 |
| di_tax_abbreviations_en | `document_intelligence/domains/tax/abbreviations/tax.en.any.json` | 998 | Low | 2026-02-27 |
| di_identity_abbreviations_pt | `document_intelligence/domains/identity/abbreviations/identity.pt.any.json` | 904 | Low | 2026-02-27 |
| di_identity_abbreviations_en | `document_intelligence/domains/identity/abbreviations/identity.en.any.json` | 794 | Low | 2026-02-27 |
| di_hr_payroll_abbreviations_pt | `document_intelligence/domains/hr_payroll/abbreviations/hr_payroll.pt.any.json` | 623 | Low | 2026-02-27 |
| di_ops_abbreviations_pt | `document_intelligence/domains/ops/abbreviations/ops.pt.any.json` | 611 | Low | 2026-02-27 |
| di_accounting_abbreviations_pt | `document_intelligence/domains/accounting/abbreviations/accounting.pt.any.json` | 606 | Low | 2026-02-27 |
| di_billing_abbreviations_pt | `document_intelligence/domains/billing/abbreviations/billing.pt.any.json` | 600 | Low | 2026-02-27 |
| di_banking_abbreviations_pt | `document_intelligence/domains/banking/abbreviations/banking.pt.any.json` | 599 | Low | 2026-02-27 |
| di_education_abbreviations_pt | `document_intelligence/domains/education/abbreviations/education.pt.any.json` | 585 | Low | 2026-02-27 |
| di_hr_payroll_abbreviations_en | `document_intelligence/domains/hr_payroll/abbreviations/hr_payroll.en.any.json` | 573 | Low | 2026-02-27 |
| di_housing_abbreviations_pt | `document_intelligence/domains/housing/abbreviations/housing.pt.any.json` | 558 | Low | 2026-02-27 |
| di_banking_abbreviations_en | `document_intelligence/domains/banking/abbreviations/banking.en.any.json` | 557 | Low | 2026-02-27 |
| di_billing_abbreviations_en | `document_intelligence/domains/billing/abbreviations/billing.en.any.json` | 551 | Low | 2026-02-27 |
| di_ops_abbreviations_en | `document_intelligence/domains/ops/abbreviations/ops.en.any.json` | 550 | Low | 2026-02-27 |
| di_travel_abbreviations_pt | `document_intelligence/domains/travel/abbreviations/travel.pt.any.json` | 550 | Low | 2026-02-27 |
| di_travel_abbreviations_en | `document_intelligence/domains/travel/abbreviations/travel.en.any.json` | 547 | Low | 2026-02-27 |
| di_education_abbreviations_en | `document_intelligence/domains/education/abbreviations/education.en.any.json` | 546 | Low | 2026-02-27 |
| di_housing_abbreviations_en | `document_intelligence/domains/housing/abbreviations/housing.en.any.json` | 533 | Low | 2026-02-27 |
| di_accounting_abbreviations_en | `document_intelligence/domains/accounting/abbreviations/accounting.en.any.json` | 531 | Low | 2026-02-27 |
| allybi_font_aliases | `dictionaries/allybi_font_aliases.any.json` | 482 | Low | 2026-02-17 |

### templates (3)

| Bank ID | Path | Tokens | Complexity | Last Updated |
|---|---|---:|---|---|
| python_chart_recipes | `templates/python_chart_recipes.any.json` | 27198 | High | 2026-02-27 |
| chart_templates | `agents/excel_calc/charts/chart_templates.any.json` | 3029 | Medium | 2026-03-01 |
| chart_recipe_catalog | `agents/excel_calc/charts/chart_recipe_catalog.any.json` | 2766 | Medium | 2026-03-01 |

### microcopy (11)

| Bank ID | Path | Tokens | Complexity | Last Updated |
|---|---|---:|---|---|
| editing_microcopy | `microcopy/editing_microcopy.any.json` | 8537 | High | 2026-02-07 |
| no_docs_messages | `microcopy/no_docs_messages.any.json` | 5049 | Medium | 2026-01-26 |
| edit_error_catalog | `microcopy/edit_error_catalog.any.json` | 4152 | Medium | 2026-02-17 |
| followup_suggestions | `microcopy/followup_suggestions.any.json` | 3286 | Medium | 2026-02-19 |
| koda_product_help | `microcopy/koda_product_help.any.json` | 3176 | Medium | 2026-03-01 |
| processing_messages | `microcopy/processing_messages.any.json` | 2817 | Medium | 2026-01-26 |
| scoped_not_found_messages | `microcopy/scoped_not_found_messages.any.json` | 2502 | Medium | 2026-01-26 |
| disambiguation_microcopy | `microcopy/disambiguation_microcopy.any.json` | 965 | Low | 2026-01-26 |
| refusal_phrases | `microcopy/refusal_phrases.any.json` | 904 | Low | 2026-01-26 |
| allybi_response_style | `microcopy/allybi_response_style.any.json` | 381 | Low | 2026-02-12 |
| editing_ux | `microcopy/editing_ux.any.json` | 378 | Low | 2026-02-27 |

### parsers (10)

| Bank ID | Path | Tokens | Complexity | Last Updated |
|---|---|---:|---|---|
| operator_catalog | `parsers/operator_catalog.any.json` | 15907 | High | 2026-02-12 |
| docx_heading_levels_pt | `semantics/structure/docx_heading_levels.pt.any.json` | 4180 | Medium | 2026-03-01 |
| docx_heading_levels_en | `semantics/structure/docx_heading_levels.en.any.json` | 3884 | Medium | 2026-03-01 |
| colors_pt | `parsers/colors.pt.any.json` | 689 | Low | 2026-02-12 |
| excel_functions_pt_to_en | `parsers/excel_functions_pt_to_en.any.json` | 666 | Low | 2026-02-12 |
| colors_en | `parsers/colors.en.any.json` | 637 | Low | 2026-02-12 |
| fonts | `parsers/fonts.any.json` | 630 | Low | 2026-02-12 |
| excel_chart_types_pt | `parsers/excel_chart_types.pt.any.json` | 467 | Low | 2026-02-12 |
| excel_chart_types_en | `parsers/excel_chart_types.en.any.json` | 413 | Low | 2026-02-12 |
| excel_number_formats | `parsers/excel_number_formats.any.json` | 358 | Low | 2026-02-12 |

### formatting (21)

| Bank ID | Path | Tokens | Complexity | Last Updated |
|---|---|---:|---|---|
| answer_style_policy | `formatting/answer_style_policy.any.json` | 5217 | High | 2026-01-26 |
| render_policy | `formatting/render_policy.any.json` | 2751 | Medium | 2026-01-26 |
| truncation_and_limits | `formatting/truncation_and_limits.any.json` | 2392 | Medium | 2026-01-26 |
| banned_phrases | `formatting/banned_phrases.any.json` | 2367 | Medium | 2026-01-26 |
| bolding_rules | `formatting/bolding_rules.any.json` | 1583 | Low | 2026-01-26 |
| bullet_rules | `formatting/bullet_rules.any.json` | 1200 | Low | 2026-01-26 |
| table_rules | `formatting/table_rules.any.json` | 1081 | Low | 2026-01-26 |
| di_finance_answer_style_bank | `document_intelligence/domains/finance/answer_style_bank.any.json` | 825 | Low | 2026-02-27 |
| di_tax_answer_style_bank | `document_intelligence/domains/tax/answer_style_bank.any.json` | 798 | Low | 2026-02-27 |
| di_insurance_answer_style_bank | `document_intelligence/domains/insurance/answer_style_bank.any.json` | 797 | Low | 2026-02-27 |
| di_identity_answer_style_bank | `document_intelligence/domains/identity/answer_style_bank.any.json` | 790 | Low | 2026-02-27 |
| legal_answer_style_bank | `document_intelligence/domains/legal/answer_style_bank.any.json` | 784 | Low | 2026-02-27 |
| di_accounting_answer_style_bank | `document_intelligence/domains/accounting/answer_style_bank.any.json` | 778 | Low | 2026-02-27 |
| di_ops_answer_style_bank | `document_intelligence/domains/ops/answer_style_bank.any.json` | 638 | Low | 2026-02-27 |
| di_hr_payroll_answer_style_bank | `document_intelligence/domains/hr_payroll/answer_style_bank.any.json` | 627 | Low | 2026-02-27 |
| di_billing_answer_style_bank | `document_intelligence/domains/billing/answer_style_bank.any.json` | 619 | Low | 2026-02-27 |
| di_banking_answer_style_bank | `document_intelligence/domains/banking/answer_style_bank.any.json` | 616 | Low | 2026-02-27 |
| di_education_answer_style_bank | `document_intelligence/domains/education/answer_style_bank.any.json` | 610 | Low | 2026-02-27 |
| di_housing_answer_style_bank | `document_intelligence/domains/housing/answer_style_bank.any.json` | 610 | Low | 2026-02-27 |
| di_travel_answer_style_bank | `document_intelligence/domains/travel/answer_style_bank.any.json` | 610 | Low | 2026-02-27 |
| medical_answer_style_bank | `document_intelligence/domains/medical/answer_style_bank.any.json` | 588 | Low | 2026-02-27 |

### prompts (13)

| Bank ID | Path | Tokens | Complexity | Last Updated |
|---|---|---:|---|---|
| tool_prompts | `prompts/tool_prompts.any.json` | 3735 | Medium | 2026-01-26 |
| fallback_prompt | `prompts/fallback_prompt.any.json` | 2810 | Medium | 2026-01-26 |
| editing_task_prompts | `prompts/editing_task_prompts.any.json` | 2794 | Medium | 2026-03-02 |
| retrieval_prompt | `prompts/retrieval_prompt.any.json` | 1986 | Medium | 2026-01-26 |
| disambiguation_prompt | `prompts/disambiguation_prompt.any.json` | 1676 | Low | 2026-01-26 |
| prompt_registry | `prompts/prompt_registry.any.json` | 1415 | Low | 2026-02-27 |
| task_answer_with_sources | `prompts/task_answer_with_sources.any.json` | 1414 | Low | 2026-02-19 |
| task_plan_generation | `prompts/task_plan_generation.any.json` | 1045 | Low | 2026-03-02 |
| rag_policy | `prompts/rag_policy.any.json` | 759 | Low | 2026-02-19 |
| system_base | `prompts/system_base.any.json` | 464 | Low | 2026-02-19 |
| policy_citations | `prompts/policy_citations.any.json` | 387 | Low | 2026-02-19 |
| mode_editing | `prompts/mode_editing.any.json` | 343 | Low | 2026-02-19 |
| mode_chat | `prompts/mode_chat.any.json` | 336 | Low | 2026-02-19 |

### overlays (6)

| Bank ID | Path | Tokens | Complexity | Last Updated |
|---|---|---:|---|---|
| scope_hints | `overlays/scope_hints.any.json` | 3455 | Medium | 2026-01-26 |
| discourse_markers | `overlays/discourse_markers.any.json` | 3165 | Medium | 2026-01-26 |
| followup_indicators | `overlays/followup_indicators.any.json` | 2671 | Medium | 2026-01-26 |
| ui_contracts | `overlays/ui_contracts.any.json` | 1661 | Low | 2026-01-26 |
| allybi_render_cards | `overlays/allybi_render_cards.any.json` | 364 | Low | 2026-02-12 |
| excel_shortcuts | `overlays/excel_shortcuts.any.json` | 329 | Low | 2026-02-13 |

### triggers (2)

| Bank ID | Path | Tokens | Complexity | Last Updated |
|---|---|---:|---|---|
| allybi_language_triggers | `triggers/allybi_language_triggers.any.json` | 7635 | High | 2026-02-12 |
| language_triggers | `triggers/language_triggers.any.json` | 2254 | Medium | 2026-01-26 |

### schemas (16)

| Bank ID | Path | Tokens | Complexity | Last Updated |
|---|---|---:|---|---|
| bank_schema | `schemas/bank_schema.any.json` | 1166 | Low | 2026-01-26 |
| query_rewrites_schema | `schemas/query_rewrites_schema.any.json` | 1142 | Low | 2026-02-28 |
| document_intelligence_manifest_schema | `schemas/document_intelligence_manifest_schema.any.json` | 673 | Low | 2026-02-28 |
| marketing_probe_schema | `schemas/marketing_probe_schema.any.json` | 439 | Low | 2026-02-28 |
| ontology_schema | `schemas/ontology_schema.any.json` | 425 | Low | 2026-02-27 |
| operator_playbook_schema | `schemas/operator_playbook_schema.any.json` | 401 | Low | 2026-02-28 |
| domain_profile_schema | `schemas/domain_profile_schema.any.json` | 395 | Low | 2026-02-27 |
| doc_identity_schema | `schemas/doc_identity_schema.any.json` | 389 | Low | 2026-02-28 |
| reasoning_policy_schema | `schemas/reasoning_policy_schema.any.json` | 356 | Low | 2026-02-28 |
| retrieval_document_intelligence_schema | `schemas/retrieval_document_intelligence_schema.any.json` | 347 | Low | 2026-02-28 |
| answer_style_schema | `schemas/answer_style_schema.any.json` | 336 | Low | 2026-02-27 |
| evidence_requirements_schema | `schemas/evidence_requirements_schema.any.json` | 327 | Low | 2026-02-27 |
| quality_document_intelligence_schema | `schemas/quality_document_intelligence_schema.any.json` | 307 | Low | 2026-02-28 |
| doc_type_catalog_schema | `schemas/doc_type_catalog_schema.any.json` | 282 | Low | 2026-02-27 |
| domain_detection_schema | `schemas/domain_detection_schema.any.json` | 279 | Low | 2026-02-27 |
| parser_bank_schema | `schemas/parser_bank_schema.any.json` | 279 | Low | 2026-02-28 |

### ambiguity (3)

| Bank ID | Path | Tokens | Complexity | Last Updated |
|---|---|---:|---|---|
| ambiguity_rank_features | `ambiguity/ambiguity_rank_features.any.json` | 2754 | Medium | 2026-01-26 |
| disambiguation_policies | `ambiguity/disambiguation_policies.any.json` | 2433 | Medium | 2026-01-26 |
| clarification_phrases | `ambiguity/clarification_phrases.any.json` | 1797 | Medium | 2026-01-26 |

### fallbacks (5)

| Bank ID | Path | Tokens | Complexity | Last Updated |
|---|---|---:|---|---|
| fallback_processing | `fallbacks/fallback_processing.any.json` | 1526 | Low | 2026-01-26 |
| fallback_router | `fallbacks/fallback_router.any.json` | 1321 | Low | 2026-01-27 |
| fallback_extraction_recovery | `fallbacks/fallback_extraction_recovery.any.json` | 1071 | Low | 2026-01-26 |
| fallback_not_found_scope | `fallbacks/fallback_not_found_scope.any.json` | 791 | Low | 2026-01-26 |
| fallback_scope_empty | `fallbacks/fallback_scope_empty.any.json` | 673 | Low | 2026-01-26 |

### scope (3)

| Bank ID | Path | Tokens | Complexity | Last Updated |
|---|---|---:|---|---|
| scope_resolution | `scope/scope_resolution.any.json` | 2706 | Medium | 2026-01-25 |
| allybi_docx_resolvers | `scope/allybi_docx_resolvers.any.json` | 493 | Low | 2026-02-12 |
| allybi_xlsx_resolvers | `scope/allybi_xlsx_resolvers.any.json` | 333 | Low | 2026-02-12 |

### tests (3)

| Bank ID | Path | Tokens | Complexity | Last Updated |
|---|---|---:|---|---|
| slot_extraction_cases | `tests/slot_extraction_cases.any.json` | 634 | Low | 2026-02-26 |
| memory_semantic_continuity | `tests/memory_semantic_continuity.any.json` | 525 | Low | 2026-02-26 |
| excel_calc_eval_suite_registry | `agents/excel_calc/eval/suite_registry.any.json` | 386 | Low | 2026-03-01 |

