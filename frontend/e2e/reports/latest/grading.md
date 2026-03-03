# Harsh Rubric Scorecard (50 queries)

- Generated: 2026-03-03T23:04:18.566Z
- Input: /Users/pg/Desktop/koda-webapp/frontend/e2e/reports/allybi-human-style-test1-semantic-50-v2-postfix-results.json
- Run ID: run_2026-03-03T23-04-18-566Z
- Verdict: **NO_GO**
- Final Score: **0/100**

- Scope Known: **yes**
- Scope Source: none

## Hard Gates

| Gate | Fail Count | Skip Count |
|---|---:|---:|
| A (Doc-grounded + sources) | 0 | 0 |
| B (Wrong-doc) | 0 | 0 |
| C (Truncation) | 0 | 0 |
| D (Fallback with docs) | 0 | 0 |
| E (Language mismatch) | 5 | 0 |
| F (Source relevance) | 39 | 0 |
| G (Provenance richness) | 50 | 0 |
| H (Analytical format) | 8 | 0 |

Hard fail reasons:
- Gate E failed in 5 queries
- Gate F failed in 39 queries
- Gate G failed in 50 queries
- Gate H failed in 8 queries

## Category Averages

| Category | Avg | Max |
|---|---:|---:|
| Retrieval & Evidence | 0 | 40 |
| Correctness & Coverage | 0 | 25 |
| Reasoning | 0 | 15 |
| Writing | 0 | 10 |
| Conversation | 0 | 10 |

## Outcome Counts

- PASS: 0
- PARTIAL: 0
- FAIL: 50

## Model Usage

- Unique Known Models: 1
- Single Model Monopoly: yes

| Provider::Model | Count |
|---|---:|
| google::gemini-2.5-flash | 50 |

## Top Issues

- GATE_G_PROVENANCE_LOCATION_WEAK: 50
- GATE_F_IRRELEVANT_SOURCE:RF2_Gillet_Neto_Paulo.pdf,Pedro-Gillet.pdf: 6
- GATE_E_LANGUAGE_MISMATCH: 5
- GATE_F_IRRELEVANT_SOURCE:RF2_Gillet_Neto_Paulo.pdf,Pedro-Gillet.pdf,OBA_marketing_servicos (1).pdf: 5
- GATE_F_IRRELEVANT_SOURCE:Trabalho projeto .pdf: 4
- GATE_H_FORMAT:ANALYTICAL_FORMAT_MISSING_REQUIRED_HEADERS: 4
- GATE_H_FORMAT:ANALYTICAL_FORMAT_MISSING_REQUIRED_BLOCKS: 4
- GATE_F_IRRELEVANT_SOURCE:Pedro-Gillet.pdf: 3
- GATE_F_IRRELEVANT_SOURCE:Pedro-Gillet.pdf,RF2_Gillet_Neto_Paulo.pdf: 3
- GATE_F_IRRELEVANT_SOURCE:RF2_Gillet_Neto_Paulo.pdf: 3

## Per Query

| # | Status | Score | Gates | Skips | Issues |
|---:|---|---:|---|---|---|
| 1 | FAIL | 0 | A:P B:P C:P D:P E:F F:F G:F H:P | - | GATE_E_LANGUAGE_MISMATCH; GATE_F_IRRELEVANT_SOURCE:RF2_Gillet_Neto_Paulo.pdf,Pedro-Gillet.pdf,OBA_marketing_servicos (1).pdf; GATE_G_PROVENANCE_LOCATION_WEAK |
| 2 | FAIL | 0 | A:P B:P C:P D:P E:F F:F G:F H:P | - | GATE_E_LANGUAGE_MISMATCH; GATE_F_IRRELEVANT_SOURCE:Trabalho projeto .pdf; GATE_G_PROVENANCE_LOCATION_WEAK |
| 3 | FAIL | 0 | A:P B:P C:P D:P E:P F:F G:F H:F | - | GATE_F_IRRELEVANT_SOURCE:RF2_Gillet_Neto_Paulo.pdf,Pedro-Gillet.pdf; GATE_G_PROVENANCE_LOCATION_WEAK; GATE_H_FORMAT:ANALYTICAL_FORMAT_MISSING_REQUIRED_HEADERS |
| 4 | FAIL | 0 | A:P B:P C:P D:P E:P F:F G:F H:P | - | GATE_F_IRRELEVANT_SOURCE:RF2_Gillet_Neto_Paulo.pdf,Pedro-Gillet.pdf; GATE_G_PROVENANCE_LOCATION_WEAK |
| 5 | FAIL | 0 | A:P B:P C:P D:P E:P F:F G:F H:P | - | GATE_F_IRRELEVANT_SOURCE:Pedro-Gillet.pdf; GATE_G_PROVENANCE_LOCATION_WEAK |
| 6 | FAIL | 0 | A:P B:P C:P D:P E:P F:F G:F H:F | - | GATE_F_IRRELEVANT_SOURCE:RF2_Gillet_Neto_Paulo.pdf,Pedro-Gillet.pdf,OBA_marketing_servicos (1).pdf; GATE_G_PROVENANCE_LOCATION_WEAK; GATE_H_FORMAT:ANALYTICAL_FORMAT_MISSING_REQUIRED_HEADERS |
| 7 | FAIL | 0 | A:P B:P C:P D:P E:P F:F G:F H:P | - | GATE_F_IRRELEVANT_SOURCE:Anotações Aula 2 (1).pdf,RF2_Gillet_Neto_Paulo.pdf,Pedro-Gillet.pdf; GATE_G_PROVENANCE_LOCATION_WEAK |
| 8 | FAIL | 0 | A:P B:P C:P D:P E:P F:F G:F H:P | - | GATE_F_IRRELEVANT_SOURCE:RF2_Gillet_Neto_Paulo.pdf,Pedro-Gillet.pdf,OBA_marketing_servicos (1).pdf; GATE_G_PROVENANCE_LOCATION_WEAK |
| 9 | FAIL | 0 | A:P B:P C:P D:P E:P F:F G:F H:P | - | GATE_F_IRRELEVANT_SOURCE:Pedro-Gillet.pdf,RF2_Gillet_Neto_Paulo.pdf; GATE_G_PROVENANCE_LOCATION_WEAK |
| 10 | FAIL | 0 | A:P B:P C:P D:P E:P F:F G:F H:P | - | GATE_F_IRRELEVANT_SOURCE:Anotações Aula 2 (1).pdf,Pedro-Gillet.pdf,RF2_Gillet_Neto_Paulo.pdf; GATE_G_PROVENANCE_LOCATION_WEAK |
| 11 | FAIL | 0 | A:P B:P C:P D:P E:P F:F G:F H:P | - | GATE_F_IRRELEVANT_SOURCE:RF2_Gillet_Neto_Paulo.pdf,Pedro-Gillet.pdf; GATE_G_PROVENANCE_LOCATION_WEAK |
| 12 | FAIL | 0 | A:P B:P C:P D:P E:P F:F G:F H:P | - | GATE_F_IRRELEVANT_SOURCE:AÉREO ALVARO + 2.pdf; GATE_G_PROVENANCE_LOCATION_WEAK |
| 13 | FAIL | 0 | A:P B:P C:P D:P E:P F:P G:F H:P | - | GATE_G_PROVENANCE_LOCATION_WEAK |
| 14 | FAIL | 0 | A:P B:P C:P D:P E:P F:F G:F H:P | - | GATE_F_IRRELEVANT_SOURCE:Anotações Aula 2 (1).pdf; GATE_G_PROVENANCE_LOCATION_WEAK |
| 15 | FAIL | 0 | A:P B:P C:P D:P E:P F:P G:F H:P | - | GATE_G_PROVENANCE_LOCATION_WEAK |
| 16 | FAIL | 0 | A:P B:P C:P D:P E:P F:P G:F H:P | - | GATE_G_PROVENANCE_LOCATION_WEAK |
| 17 | FAIL | 0 | A:P B:P C:P D:P E:P F:F G:F H:P | - | GATE_F_IRRELEVANT_SOURCE:TRABALHO FINAL (1).PNG; GATE_G_PROVENANCE_LOCATION_WEAK |
| 18 | FAIL | 0 | A:P B:P C:P D:P E:P F:F G:F H:F | - | GATE_F_IRRELEVANT_SOURCE:RF2_Gillet_Neto_Paulo.pdf,Pedro-Gillet.pdf,OBA_marketing_servicos (1).pdf; GATE_G_PROVENANCE_LOCATION_WEAK; GATE_H_FORMAT:ANALYTICAL_FORMAT_MISSING_REQUIRED_BLOCKS |
| 19 | FAIL | 0 | A:P B:P C:P D:P E:P F:F G:F H:P | - | GATE_F_IRRELEVANT_SOURCE:Pedro-Gillet.pdf; GATE_G_PROVENANCE_LOCATION_WEAK |
| 20 | FAIL | 0 | A:P B:P C:P D:P E:P F:F G:F H:P | - | GATE_F_IRRELEVANT_SOURCE:Breguet.pdf; GATE_G_PROVENANCE_LOCATION_WEAK |
| 21 | FAIL | 0 | A:P B:P C:P D:P E:P F:F G:F H:P | - | GATE_F_IRRELEVANT_SOURCE:Pedro-Gillet.pdf; GATE_G_PROVENANCE_LOCATION_WEAK |
| 22 | FAIL | 0 | A:P B:P C:P D:P E:P F:F G:F H:F | - | GATE_F_IRRELEVANT_SOURCE:Pedro-Gillet.pdf,RF2_Gillet_Neto_Paulo.pdf,OBA_marketing_servicos (1).pdf; GATE_G_PROVENANCE_LOCATION_WEAK; GATE_H_FORMAT:ANALYTICAL_FORMAT_MISSING_REQUIRED_BLOCKS |
| 23 | FAIL | 0 | A:P B:P C:P D:P E:P F:F G:F H:P | - | GATE_F_IRRELEVANT_SOURCE:Pedro-Gillet.pdf,RF2_Gillet_Neto_Paulo.pdf; GATE_G_PROVENANCE_LOCATION_WEAK |
| 24 | FAIL | 0 | A:P B:P C:P D:P E:P F:F G:F H:P | - | GATE_F_IRRELEVANT_SOURCE:Pedro-Gillet.pdf,RF2_Gillet_Neto_Paulo.pdf; GATE_G_PROVENANCE_LOCATION_WEAK |
| 25 | FAIL | 0 | A:P B:P C:P D:P E:P F:F G:F H:P | - | GATE_F_IRRELEVANT_SOURCE:RF2_Gillet_Neto_Paulo.pdf,Pedro-Gillet.pdf; GATE_G_PROVENANCE_LOCATION_WEAK |
| 26 | FAIL | 0 | A:P B:P C:P D:P E:F F:P G:F H:P | - | GATE_E_LANGUAGE_MISMATCH; GATE_G_PROVENANCE_LOCATION_WEAK |
| 27 | FAIL | 0 | A:P B:P C:P D:P E:P F:P G:F H:P | - | GATE_G_PROVENANCE_LOCATION_WEAK |
| 28 | FAIL | 0 | A:P B:P C:P D:P E:P F:F G:F H:F | - | GATE_F_IRRELEVANT_SOURCE:exames-5.pdf; GATE_G_PROVENANCE_LOCATION_WEAK; GATE_H_FORMAT:ANALYTICAL_FORMAT_MISSING_REQUIRED_HEADERS |
| 29 | FAIL | 0 | A:P B:P C:P D:P E:P F:F G:F H:P | - | GATE_F_IRRELEVANT_SOURCE:RF2_Gillet_Neto_Paulo.pdf,Pedro-Gillet.pdf,OBA_marketing_servicos (1).pdf; GATE_G_PROVENANCE_LOCATION_WEAK |
| 30 | FAIL | 0 | A:P B:P C:P D:P E:P F:P G:F H:P | - | GATE_G_PROVENANCE_LOCATION_WEAK |
| 31 | FAIL | 0 | A:P B:P C:P D:P E:P F:F G:F H:P | - | GATE_F_IRRELEVANT_SOURCE:RF2_Gillet_Neto_Paulo.pdf; GATE_G_PROVENANCE_LOCATION_WEAK |
| 32 | FAIL | 0 | A:P B:P C:P D:P E:P F:F G:F H:F | - | GATE_F_IRRELEVANT_SOURCE:RF2_Gillet_Neto_Paulo.pdf; GATE_G_PROVENANCE_LOCATION_WEAK; GATE_H_FORMAT:ANALYTICAL_FORMAT_MISSING_REQUIRED_BLOCKS |
| 33 | FAIL | 0 | A:P B:P C:P D:P E:P F:P G:F H:P | - | GATE_G_PROVENANCE_LOCATION_WEAK |
| 34 | FAIL | 0 | A:P B:P C:P D:P E:P F:F G:F H:P | - | GATE_F_IRRELEVANT_SOURCE:OBA_marketing_servicos (1).pdf,Pedro-Gillet.pdf,RF2_Gillet_Neto_Paulo.pdf; GATE_G_PROVENANCE_LOCATION_WEAK |
| 35 | FAIL | 0 | A:P B:P C:P D:P E:P F:P G:F H:P | - | GATE_G_PROVENANCE_LOCATION_WEAK |
| 36 | FAIL | 0 | A:P B:P C:P D:P E:P F:P G:F H:P | - | GATE_G_PROVENANCE_LOCATION_WEAK |
| 37 | FAIL | 0 | A:P B:P C:P D:P E:P F:P G:F H:P | - | GATE_G_PROVENANCE_LOCATION_WEAK |
| 38 | FAIL | 0 | A:P B:P C:P D:P E:F F:P G:F H:P | - | GATE_E_LANGUAGE_MISMATCH; GATE_G_PROVENANCE_LOCATION_WEAK |
| 39 | FAIL | 0 | A:P B:P C:P D:P E:P F:F G:F H:P | - | GATE_F_IRRELEVANT_SOURCE:SEVIS_RTI.pdf; GATE_G_PROVENANCE_LOCATION_WEAK |
| 40 | FAIL | 0 | A:P B:P C:P D:P E:P F:F G:F H:P | - | GATE_F_IRRELEVANT_SOURCE:SEVIS_RTI.pdf; GATE_G_PROVENANCE_LOCATION_WEAK |
| 41 | FAIL | 0 | A:P B:P C:P D:P E:P F:F G:F H:P | - | GATE_F_IRRELEVANT_SOURCE:Trabalho projeto .pdf; GATE_G_PROVENANCE_LOCATION_WEAK |
| 42 | FAIL | 0 | A:P B:P C:P D:P E:P F:F G:F H:P | - | GATE_F_IRRELEVANT_SOURCE:RF2_Gillet_Neto_Paulo.pdf,Pedro-Gillet.pdf; GATE_G_PROVENANCE_LOCATION_WEAK |
| 43 | FAIL | 0 | A:P B:P C:P D:P E:P F:F G:F H:P | - | GATE_F_IRRELEVANT_SOURCE:TRABALHO FINAL (1).PNG; GATE_G_PROVENANCE_LOCATION_WEAK |
| 44 | FAIL | 0 | A:P B:P C:P D:P E:P F:F G:F H:P | - | GATE_F_IRRELEVANT_SOURCE:Trabalho projeto .pdf; GATE_G_PROVENANCE_LOCATION_WEAK |
| 45 | FAIL | 0 | A:P B:P C:P D:P E:F F:F G:F H:P | - | GATE_E_LANGUAGE_MISMATCH; GATE_F_IRRELEVANT_SOURCE:SEVIS_RTI.pdf,Pedro-Gillet.pdf; GATE_G_PROVENANCE_LOCATION_WEAK |
| 46 | FAIL | 0 | A:P B:P C:P D:P E:P F:F G:F H:P | - | GATE_F_IRRELEVANT_SOURCE:RF2_Gillet_Neto_Paulo.pdf; GATE_G_PROVENANCE_LOCATION_WEAK |
| 47 | FAIL | 0 | A:P B:P C:P D:P E:P F:F G:F H:P | - | GATE_F_IRRELEVANT_SOURCE:SEVIS_RTI.pdf,AÉREO ALVARO + 2.pdf; GATE_G_PROVENANCE_LOCATION_WEAK |
| 48 | FAIL | 0 | A:P B:P C:P D:P E:P F:F G:F H:F | - | GATE_F_IRRELEVANT_SOURCE:Anotações Aula 2 (1).pdf,20260121 BESS - Preliminary Assessment of the Brazilian Market Potential 2.pdf; GATE_G_PROVENANCE_LOCATION_WEAK; GATE_H_FORMAT:ANALYTICAL_FORMAT_MISSING_REQUIRED_HEADERS |
| 49 | FAIL | 0 | A:P B:P C:P D:P E:P F:F G:F H:F | - | GATE_F_IRRELEVANT_SOURCE:Trabalho projeto .pdf; GATE_G_PROVENANCE_LOCATION_WEAK; GATE_H_FORMAT:ANALYTICAL_FORMAT_MISSING_REQUIRED_BLOCKS |
| 50 | FAIL | 0 | A:P B:P C:P D:P E:P F:F G:F H:P | - | GATE_F_IRRELEVANT_SOURCE:RF2_Gillet_Neto_Paulo.pdf,Pedro-Gillet.pdf; GATE_G_PROVENANCE_LOCATION_WEAK |
