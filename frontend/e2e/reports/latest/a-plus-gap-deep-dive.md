# A+ Gap Deep Dive (Queries)

Generated: 2026-03-04T14:13:53.079Z
Source: frontend/e2e/reports/latest/scorecard.json

## Scope

- Total queries analyzed: **50**
- Queries currently A+: **0**
- Queries below A+ (needs work): **50**
- Target bar for A+: **>=95 with no hard gate failures**

## What Is Missing For All Queries To Reach A+

| Gate | Missing In | Fail Rate | Requirement |
|---|---:|---:|---|
| A | 0/50 | 0% | Doc-grounded answers must include sources when docs are attached. |
| B | 0/50 | 0% | Sources must stay within the attached docset (no wrong-doc/out-of-scope). |
| C | 0/50 | 0% | No semantic truncation in final answer. |
| D | 0/50 | 0% | No fallback response without sources when docs are attached. |
| E | 5/50 | 10% | Answer language must match expected language. |
| F | 39/50 | 78% | All cited sources must be relevant to the query intent. |
| G | 50/50 | 100% | At least one cited source must include rich location (page/slide/sheet/cell/section/locationLabel/locationKey). |
| H | 8/50 | 16% | Analytical queries must include required structure headers/blocks. |

Universal blocker(s):
- Gate G: At least one cited source must include rich location (page/slide/sheet/cell/section/locationLabel/locationKey).

## Failure Clusters

| Failed Gate Combo | Query Count |
|---|---:|
| FG | 28 |
| G | 9 |
| FGH | 8 |
| EFG | 3 |
| EG | 2 |

## Top Missing Pieces (Issue Frequency)

| Issue | Count |
|---|---:|
| GATE_G_PROVENANCE_LOCATION_WEAK | 50 |
| GATE_F_IRRELEVANT_SOURCE:RF2_Gillet_Neto_Paulo.pdf,Pedro-Gillet.pdf | 6 |
| GATE_E_LANGUAGE_MISMATCH | 5 |
| GATE_F_IRRELEVANT_SOURCE:RF2_Gillet_Neto_Paulo.pdf,Pedro-Gillet.pdf,OBA_marketing_servicos (1).pdf | 5 |
| GATE_F_IRRELEVANT_SOURCE:Trabalho projeto .pdf | 4 |
| GATE_H_FORMAT:ANALYTICAL_FORMAT_MISSING_REQUIRED_HEADERS | 4 |
| GATE_H_FORMAT:ANALYTICAL_FORMAT_MISSING_REQUIRED_BLOCKS | 4 |
| GATE_F_IRRELEVANT_SOURCE:Pedro-Gillet.pdf | 3 |
| GATE_F_IRRELEVANT_SOURCE:Pedro-Gillet.pdf,RF2_Gillet_Neto_Paulo.pdf | 3 |
| GATE_F_IRRELEVANT_SOURCE:RF2_Gillet_Neto_Paulo.pdf | 3 |
| GATE_F_IRRELEVANT_SOURCE:TRABALHO FINAL (1).PNG | 2 |
| GATE_F_IRRELEVANT_SOURCE:SEVIS_RTI.pdf | 2 |
| GATE_F_IRRELEVANT_SOURCE:Anotações Aula 2 (1).pdf,RF2_Gillet_Neto_Paulo.pdf,Pedro-Gillet.pdf | 1 |
| GATE_F_IRRELEVANT_SOURCE:Anotações Aula 2 (1).pdf,Pedro-Gillet.pdf,RF2_Gillet_Neto_Paulo.pdf | 1 |
| GATE_F_IRRELEVANT_SOURCE:AÉREO ALVARO + 2.pdf | 1 |
| GATE_F_IRRELEVANT_SOURCE:Anotações Aula 2 (1).pdf | 1 |
| GATE_F_IRRELEVANT_SOURCE:Breguet.pdf | 1 |
| GATE_F_IRRELEVANT_SOURCE:Pedro-Gillet.pdf,RF2_Gillet_Neto_Paulo.pdf,OBA_marketing_servicos (1).pdf | 1 |
| GATE_F_IRRELEVANT_SOURCE:exames-5.pdf | 1 |
| GATE_F_IRRELEVANT_SOURCE:OBA_marketing_servicos (1).pdf,Pedro-Gillet.pdf,RF2_Gillet_Neto_Paulo.pdf | 1 |

## Most Flagged Irrelevant Sources (Gate F)

| Source | Count |
|---|---:|
| Pedro-Gillet.pdf | 22 |
| RF2_Gillet_Neto_Paulo.pdf | 21 |
| OBA_marketing_servicos (1).pdf | 7 |
| Trabalho projeto .pdf | 4 |
| Anotações Aula 2 (1).pdf | 4 |
| SEVIS_RTI.pdf | 4 |
| AÉREO ALVARO + 2.pdf | 2 |
| TRABALHO FINAL (1).PNG | 2 |
| Breguet.pdf | 1 |
| exames-5.pdf | 1 |
| 20260121 BESS - Preliminary Assessment of the Brazilian Market Potential 2.pdf | 1 |

## Gate H Missing Format Reasons

| Reason | Count |
|---|---:|
| ANALYTICAL_FORMAT_MISSING_REQUIRED_HEADERS | 4 |
| ANALYTICAL_FORMAT_MISSING_REQUIRED_BLOCKS | 4 |

## Per Query Missing Checklist

| # | Score | Failed Gates | Missing For A+ |
|---:|---:|---|---|
| 1 | 0 | E, F, G | E: Rewrite response fully in Portuguese; remove English fallback boilerplate; keep locale-consistent wording. / F: Replace irrelevant citations (RF2_Gillet_Neto_Paulo.pdf, Pedro-Gillet.pdf, OBA_marketing_servicos (1).pdf) with query-relevant evidence sources only. / G: Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key). |
| 2 | 0 | E, F, G | E: Rewrite response fully in Portuguese; remove English fallback boilerplate; keep locale-consistent wording. / F: Replace irrelevant citations (Trabalho projeto .pdf) with query-relevant evidence sources only. / G: Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key). |
| 3 | 0 | F, G, H | F: Replace irrelevant citations (RF2_Gillet_Neto_Paulo.pdf, Pedro-Gillet.pdf) with query-relevant evidence sources only. / G: Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key). / H: Add required analytical headers (Direct Answer, Key Evidence, Sources Used) within response-length constraints. |
| 4 | 0 | F, G | F: Replace irrelevant citations (RF2_Gillet_Neto_Paulo.pdf, Pedro-Gillet.pdf) with query-relevant evidence sources only. / G: Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key). |
| 5 | 0 | F, G | F: Replace irrelevant citations (Pedro-Gillet.pdf) with query-relevant evidence sources only. / G: Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key). |
| 6 | 0 | F, G, H | F: Replace irrelevant citations (RF2_Gillet_Neto_Paulo.pdf, Pedro-Gillet.pdf, OBA_marketing_servicos (1).pdf) with query-relevant evidence sources only. / G: Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key). / H: Add required analytical headers (Direct Answer, Key Evidence, Sources Used) within response-length constraints. |
| 7 | 0 | F, G | F: Replace irrelevant citations (Anotações Aula 2 (1).pdf, RF2_Gillet_Neto_Paulo.pdf, Pedro-Gillet.pdf) with query-relevant evidence sources only. / G: Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key). |
| 8 | 0 | F, G | F: Replace irrelevant citations (RF2_Gillet_Neto_Paulo.pdf, Pedro-Gillet.pdf, OBA_marketing_servicos (1).pdf) with query-relevant evidence sources only. / G: Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key). |
| 9 | 0 | F, G | F: Replace irrelevant citations (Pedro-Gillet.pdf, RF2_Gillet_Neto_Paulo.pdf) with query-relevant evidence sources only. / G: Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key). |
| 10 | 0 | F, G | F: Replace irrelevant citations (Anotações Aula 2 (1).pdf, Pedro-Gillet.pdf, RF2_Gillet_Neto_Paulo.pdf) with query-relevant evidence sources only. / G: Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key). |
| 11 | 0 | F, G | F: Replace irrelevant citations (RF2_Gillet_Neto_Paulo.pdf, Pedro-Gillet.pdf) with query-relevant evidence sources only. / G: Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key). |
| 12 | 0 | F, G | F: Replace irrelevant citations (AÉREO ALVARO + 2.pdf) with query-relevant evidence sources only. / G: Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key). |
| 13 | 0 | G | G: Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key). |
| 14 | 0 | F, G | F: Replace irrelevant citations (Anotações Aula 2 (1).pdf) with query-relevant evidence sources only. / G: Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key). |
| 15 | 0 | G | G: Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key). |
| 16 | 0 | G | G: Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key). |
| 17 | 0 | F, G | F: Replace irrelevant citations (TRABALHO FINAL (1).PNG) with query-relevant evidence sources only. / G: Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key). |
| 18 | 0 | F, G, H | F: Replace irrelevant citations (RF2_Gillet_Neto_Paulo.pdf, Pedro-Gillet.pdf, OBA_marketing_servicos (1).pdf) with query-relevant evidence sources only. / G: Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key). / H: Restructure response into required analytical blocks with explicit evidence and source sections. |
| 19 | 0 | F, G | F: Replace irrelevant citations (Pedro-Gillet.pdf) with query-relevant evidence sources only. / G: Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key). |
| 20 | 0 | F, G | F: Replace irrelevant citations (Breguet.pdf) with query-relevant evidence sources only. / G: Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key). |
| 21 | 0 | F, G | F: Replace irrelevant citations (Pedro-Gillet.pdf) with query-relevant evidence sources only. / G: Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key). |
| 22 | 0 | F, G, H | F: Replace irrelevant citations (Pedro-Gillet.pdf, RF2_Gillet_Neto_Paulo.pdf, OBA_marketing_servicos (1).pdf) with query-relevant evidence sources only. / G: Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key). / H: Restructure response into required analytical blocks with explicit evidence and source sections. |
| 23 | 0 | F, G | F: Replace irrelevant citations (Pedro-Gillet.pdf, RF2_Gillet_Neto_Paulo.pdf) with query-relevant evidence sources only. / G: Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key). |
| 24 | 0 | F, G | F: Replace irrelevant citations (Pedro-Gillet.pdf, RF2_Gillet_Neto_Paulo.pdf) with query-relevant evidence sources only. / G: Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key). |
| 25 | 0 | F, G | F: Replace irrelevant citations (RF2_Gillet_Neto_Paulo.pdf, Pedro-Gillet.pdf) with query-relevant evidence sources only. / G: Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key). |
| 26 | 0 | E, G | E: Rewrite response fully in Portuguese; remove English fallback boilerplate; keep locale-consistent wording. / G: Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key). |
| 27 | 0 | G | G: Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key). |
| 28 | 0 | F, G, H | F: Replace irrelevant citations (exames-5.pdf) with query-relevant evidence sources only. / G: Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key). / H: Add required analytical headers (Direct Answer, Key Evidence, Sources Used) within response-length constraints. |
| 29 | 0 | F, G | F: Replace irrelevant citations (RF2_Gillet_Neto_Paulo.pdf, Pedro-Gillet.pdf, OBA_marketing_servicos (1).pdf) with query-relevant evidence sources only. / G: Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key). |
| 30 | 0 | G | G: Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key). |
| 31 | 0 | F, G | F: Replace irrelevant citations (RF2_Gillet_Neto_Paulo.pdf) with query-relevant evidence sources only. / G: Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key). |
| 32 | 0 | F, G, H | F: Replace irrelevant citations (RF2_Gillet_Neto_Paulo.pdf) with query-relevant evidence sources only. / G: Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key). / H: Restructure response into required analytical blocks with explicit evidence and source sections. |
| 33 | 0 | G | G: Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key). |
| 34 | 0 | F, G | F: Replace irrelevant citations (OBA_marketing_servicos (1).pdf, Pedro-Gillet.pdf, RF2_Gillet_Neto_Paulo.pdf) with query-relevant evidence sources only. / G: Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key). |
| 35 | 0 | G | G: Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key). |
| 36 | 0 | G | G: Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key). |
| 37 | 0 | G | G: Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key). |
| 38 | 0 | E, G | E: Rewrite response fully in Portuguese; remove English fallback boilerplate; keep locale-consistent wording. / G: Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key). |
| 39 | 0 | F, G | F: Replace irrelevant citations (SEVIS_RTI.pdf) with query-relevant evidence sources only. / G: Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key). |
| 40 | 0 | F, G | F: Replace irrelevant citations (SEVIS_RTI.pdf) with query-relevant evidence sources only. / G: Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key). |
| 41 | 0 | F, G | F: Replace irrelevant citations (Trabalho projeto .pdf) with query-relevant evidence sources only. / G: Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key). |
| 42 | 0 | F, G | F: Replace irrelevant citations (RF2_Gillet_Neto_Paulo.pdf, Pedro-Gillet.pdf) with query-relevant evidence sources only. / G: Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key). |
| 43 | 0 | F, G | F: Replace irrelevant citations (TRABALHO FINAL (1).PNG) with query-relevant evidence sources only. / G: Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key). |
| 44 | 0 | F, G | F: Replace irrelevant citations (Trabalho projeto .pdf) with query-relevant evidence sources only. / G: Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key). |
| 45 | 0 | E, F, G | E: Rewrite response fully in Portuguese; remove English fallback boilerplate; keep locale-consistent wording. / F: Replace irrelevant citations (SEVIS_RTI.pdf, Pedro-Gillet.pdf) with query-relevant evidence sources only. / G: Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key). |
| 46 | 0 | F, G | F: Replace irrelevant citations (RF2_Gillet_Neto_Paulo.pdf) with query-relevant evidence sources only. / G: Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key). |
| 47 | 0 | F, G | F: Replace irrelevant citations (SEVIS_RTI.pdf, AÉREO ALVARO + 2.pdf) with query-relevant evidence sources only. / G: Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key). |
| 48 | 0 | F, G, H | F: Replace irrelevant citations (Anotações Aula 2 (1).pdf, 20260121 BESS - Preliminary Assessment of the Brazilian Market Potential 2.pdf) with query-relevant evidence sources only. / G: Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key). / H: Add required analytical headers (Direct Answer, Key Evidence, Sources Used) within response-length constraints. |
| 49 | 0 | F, G, H | F: Replace irrelevant citations (Trabalho projeto .pdf) with query-relevant evidence sources only. / G: Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key). / H: Restructure response into required analytical blocks with explicit evidence and source sections. |
| 50 | 0 | F, G | F: Replace irrelevant citations (RF2_Gillet_Neto_Paulo.pdf, Pedro-Gillet.pdf) with query-relevant evidence sources only. / G: Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key). |

## Detailed Query Notes

### Q1
- Failed gates: E, F, G
- Issues: GATE_E_LANGUAGE_MISMATCH; GATE_F_IRRELEVANT_SOURCE:RF2_Gillet_Neto_Paulo.pdf,Pedro-Gillet.pdf,OBA_marketing_servicos (1).pdf; GATE_G_PROVENANCE_LOCATION_WEAK
- Source names: RF2_Gillet_Neto_Paulo.pdf, Pedro-Gillet.pdf, OBA_marketing_servicos (1).pdf
- Failure code: table_contract_violation
- Response preview: Tentando outro metodo agora.
- Required fix (Gate E): Rewrite response fully in Portuguese; remove English fallback boilerplate; keep locale-consistent wording.
- Required fix (Gate F): Replace irrelevant citations (RF2_Gillet_Neto_Paulo.pdf, Pedro-Gillet.pdf, OBA_marketing_servicos (1).pdf) with query-relevant evidence sources only.
- Required fix (Gate G): Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key).

### Q2
- Failed gates: E, F, G
- Issues: GATE_E_LANGUAGE_MISMATCH; GATE_F_IRRELEVANT_SOURCE:Trabalho projeto .pdf; GATE_G_PROVENANCE_LOCATION_WEAK
- Source names: Trabalho projeto .pdf
- Failure code: missing_provenance
- Response preview: | Trilha Temática | Documento | Justificativa |
| --- | --- | --- |
| Trabalho projeto.pdf | Discute cronograma, metodologias ágeis e reuniões. | Trabalho projeto.pdf, p.6 |
- Required fix (Gate E): Rewrite response fully in Portuguese; remove English fallback boilerplate; keep locale-consistent wording.
- Required fix (Gate F): Replace irrelevant citations (Trabalho projeto .pdf) with query-relevant evidence sources only.
- Required fix (Gate G): Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key).

### Q3
- Failed gates: F, G, H
- Issues: GATE_F_IRRELEVANT_SOURCE:RF2_Gillet_Neto_Paulo.pdf,Pedro-Gillet.pdf; GATE_G_PROVENANCE_LOCATION_WEAK; GATE_H_FORMAT:ANALYTICAL_FORMAT_MISSING_REQUIRED_HEADERS
- Source names: RF2_Gillet_Neto_Paulo.pdf, Pedro-Gillet.pdf
- Failure code: missing_provenance
- Response preview: | Com base nas informacoes limitadas disponiveis, | Entidade | Documentos |
| --- | --- | --- |
| MATCH Hospitality AG | RF2_Gillet_Neto_Paulo.pdf | RF2_Gillet_Neto_Paulo.pdf, c:1, c:15, c:17 |
| PREFEITURA DO MUNICÍPIO DE SÃO PAULO | Pedro
- Required fix (Gate F): Replace irrelevant citations (RF2_Gillet_Neto_Paulo.pdf, Pedro-Gillet.pdf) with query-relevant evidence sources only.
- Required fix (Gate G): Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key).
- Required fix (Gate H): Add required analytical headers (Direct Answer, Key Evidence, Sources Used) within response-length constraints.

### Q4
- Failed gates: F, G
- Issues: GATE_F_IRRELEVANT_SOURCE:RF2_Gillet_Neto_Paulo.pdf,Pedro-Gillet.pdf; GATE_G_PROVENANCE_LOCATION_WEAK
- Source names: RF2_Gillet_Neto_Paulo.pdf, Pedro-Gillet.pdf
- Failure code: missing_provenance
- Response preview: Com base nas informacoes limitadas disponiveis,
| Data | Evento |
| --- | --- |
| 05/10/2023 | Emissão da Nota Fiscal Eletrônica de Serviços |
- Required fix (Gate F): Replace irrelevant citations (RF2_Gillet_Neto_Paulo.pdf, Pedro-Gillet.pdf) with query-relevant evidence sources only.
- Required fix (Gate G): Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key).

### Q5
- Failed gates: F, G
- Issues: GATE_F_IRRELEVANT_SOURCE:Pedro-Gillet.pdf; GATE_G_PROVENANCE_LOCATION_WEAK
- Source names: Pedro-Gillet.pdf
- Failure code: missing_provenance
- Response preview: Não encontrei detalhes específicos sobre valores monetários nos seus documentos. Você pode me dizer qual arquivo devo verificar?
- Required fix (Gate F): Replace irrelevant citations (Pedro-Gillet.pdf) with query-relevant evidence sources only.
- Required fix (Gate G): Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key).

### Q6
- Failed gates: F, G, H
- Issues: GATE_F_IRRELEVANT_SOURCE:RF2_Gillet_Neto_Paulo.pdf,Pedro-Gillet.pdf,OBA_marketing_servicos (1).pdf; GATE_G_PROVENANCE_LOCATION_WEAK; GATE_H_FORMAT:ANALYTICAL_FORMAT_MISSING_REQUIRED_HEADERS
- Source names: RF2_Gillet_Neto_Paulo.pdf, Pedro-Gillet.pdf, OBA_marketing_servicos (1).pdf
- Failure code: missing_provenance
- Response preview: | Com base nas informacoes limitadas disponiveis, | Lacuna de Informação | Pergunta para Fechar Lacuna |
| --- | --- | --- |
| Valores monetários detalhados | Quais valores monetários e seus contextos? | RF2_Gillet_Neto_Paulo.pdf, c:0 |
| O
- Required fix (Gate F): Replace irrelevant citations (RF2_Gillet_Neto_Paulo.pdf, Pedro-Gillet.pdf, OBA_marketing_servicos (1).pdf) with query-relevant evidence sources only.
- Required fix (Gate G): Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key).
- Required fix (Gate H): Add required analytical headers (Direct Answer, Key Evidence, Sources Used) within response-length constraints.

### Q7
- Failed gates: F, G
- Issues: GATE_F_IRRELEVANT_SOURCE:Anotações Aula 2 (1).pdf,RF2_Gillet_Neto_Paulo.pdf,Pedro-Gillet.pdf; GATE_G_PROVENANCE_LOCATION_WEAK
- Source names: Anotações Aula 2 (1).pdf, RF2_Gillet_Neto_Paulo.pdf, Pedro-Gillet.pdf
- Failure code: missing_provenance
- Response preview: Com base nas informacoes limitadas disponiveis, Eu não estou encontrando isso no escopo atual.
- Required fix (Gate F): Replace irrelevant citations (Anotações Aula 2 (1).pdf, RF2_Gillet_Neto_Paulo.pdf, Pedro-Gillet.pdf) with query-relevant evidence sources only.
- Required fix (Gate G): Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key).

### Q8
- Failed gates: F, G
- Issues: GATE_F_IRRELEVANT_SOURCE:RF2_Gillet_Neto_Paulo.pdf,Pedro-Gillet.pdf,OBA_marketing_servicos (1).pdf; GATE_G_PROVENANCE_LOCATION_WEAK
- Source names: RF2_Gillet_Neto_Paulo.pdf, Pedro-Gillet.pdf, OBA_marketing_servicos (1).pdf
- Failure code: missing_provenance
- Response preview: Com base nas informacoes limitadas disponiveis, o documento "Análise preliminar do mercado brasileiro de BESS" não foi encontrado no escopo atual.
- Required fix (Gate F): Replace irrelevant citations (RF2_Gillet_Neto_Paulo.pdf, Pedro-Gillet.pdf, OBA_marketing_servicos (1).pdf) with query-relevant evidence sources only.
- Required fix (Gate G): Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key).

### Q9
- Failed gates: F, G
- Issues: GATE_F_IRRELEVANT_SOURCE:Pedro-Gillet.pdf,RF2_Gillet_Neto_Paulo.pdf; GATE_G_PROVENANCE_LOCATION_WEAK
- Source names: Pedro-Gillet.pdf, RF2_Gillet_Neto_Paulo.pdf
- Failure code: missing_provenance
- Response preview: Não encontrei detalhes específicos sobre isso nos seus documentos. Você pode me dizer qual arquivo devo verificar?
- Required fix (Gate F): Replace irrelevant citations (Pedro-Gillet.pdf, RF2_Gillet_Neto_Paulo.pdf) with query-relevant evidence sources only.
- Required fix (Gate G): Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key).

### Q10
- Failed gates: F, G
- Issues: GATE_F_IRRELEVANT_SOURCE:Anotações Aula 2 (1).pdf,Pedro-Gillet.pdf,RF2_Gillet_Neto_Paulo.pdf; GATE_G_PROVENANCE_LOCATION_WEAK
- Source names: Anotações Aula 2 (1).pdf, Pedro-Gillet.pdf, RF2_Gillet_Neto_Paulo.pdf
- Failure code: missing_provenance
- Response preview: Com base nas informacoes limitadas disponiveis, o documento "Demonstrativo de saída do imóvel (Unidade 214)" n
- Required fix (Gate F): Replace irrelevant citations (Anotações Aula 2 (1).pdf, Pedro-Gillet.pdf, RF2_Gillet_Neto_Paulo.pdf) with query-relevant evidence sources only.
- Required fix (Gate G): Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key).

### Q11
- Failed gates: F, G
- Issues: GATE_F_IRRELEVANT_SOURCE:RF2_Gillet_Neto_Paulo.pdf,Pedro-Gillet.pdf; GATE_G_PROVENANCE_LOCATION_WEAK
- Source names: RF2_Gillet_Neto_Paulo.pdf, Pedro-Gillet.pdf
- Failure code: missing_provenance
- Response preview: Com base nas informacoes limitadas disponiveis, o documento "Comprovante de viagem aérea do Álvaro" não foi encontrado no escopo atual.
- Required fix (Gate F): Replace irrelevant citations (RF2_Gillet_Neto_Paulo.pdf, Pedro-Gillet.pdf) with query-relevant evidence sources only.
- Required fix (Gate G): Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key).

### Q12
- Failed gates: F, G
- Issues: GATE_F_IRRELEVANT_SOURCE:AÉREO ALVARO + 2.pdf; GATE_G_PROVENANCE_LOCATION_WEAK
- Source names: AÉREO ALVARO + 2.pdf
- Failure code: missing_provenance
- Response preview: | Com base no documento "AÉREO ALVARO + 2.pdf", as seguintes informações foram identificadas: | Categoria | Detalhe |
| --- | --- | --- |
| Penalidade | No-show cancela voos subsequentes | AÉREO ALVARO + 2.pdf, c:2 |
| Penalidade | No-show 
- Required fix (Gate F): Replace irrelevant citations (AÉREO ALVARO + 2.pdf) with query-relevant evidence sources only.
- Required fix (Gate G): Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key).

### Q13
- Failed gates: G
- Issues: GATE_G_PROVENANCE_LOCATION_WEAK
- Source names: Anotações Aula 2 (1).pdf
- Failure code: missing_provenance
- Response preview: | Com base nas informacoes limitadas disponiveis, as seguintes informações foram extraídas do documento "Anotações da Aula 2": | Categoria | Detalhe |
| --- | --- | --- |
| Conceito Central | Cálculo de custo total | Anotações Aula 2 (1).pd
- Required fix (Gate G): Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key).

### Q14
- Failed gates: F, G
- Issues: GATE_F_IRRELEVANT_SOURCE:Anotações Aula 2 (1).pdf; GATE_G_PROVENANCE_LOCATION_WEAK
- Source names: Anotações Aula 2 (1).pdf
- Failure code: missing_provenance
- Response preview: | Com base nas informacoes limitadas disponiveis, as seguintes etapas e métodos implícitos foram identificados: | Etapa/Método | Detalhe Implícito |
| --- | --- | --- |
| 1. Definir Função Objetivo | Minimizar custo total de transporte. | A
- Required fix (Gate F): Replace irrelevant citations (Anotações Aula 2 (1).pdf) with query-relevant evidence sources only.
- Required fix (Gate G): Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key).

### Q15
- Failed gates: G
- Issues: GATE_G_PROVENANCE_LOCATION_WEAK
- Source names: ARM Montana & Arizona Summary_3.12.25.pdf
- Failure code: missing_provenance
- Response preview: | Com base nas informacoes limitadas disponiveis, as seguintes informações foram extraídas do documento "Resumo ARM Montana e Arizona": | Categoria | Detalhe |
| --- | --- | --- |
| Objetivo | Não detalhado explicitamente no trecho. |  |
| 
- Required fix (Gate G): Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key).

### Q16
- Failed gates: G
- Issues: GATE_G_PROVENANCE_LOCATION_WEAK
- Source names: ARM Montana & Arizona Summary_3.12.25.pdf
- Failure code: missing_provenance
- Response preview: | Com base nas informacoes limitadas disponiveis, as seguintes informações foram extraídas do documento "Resumo ARM Montana e Arizona": | Categoria | Detalhe |
| --- | --- | --- |
| Métricas | NOI Saída: 22M, 6.5M, 8M | ARM Montana & Arizon
- Required fix (Gate G): Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key).

### Q17
- Failed gates: F, G
- Issues: GATE_F_IRRELEVANT_SOURCE:TRABALHO FINAL (1).PNG; GATE_G_PROVENANCE_LOCATION_WEAK
- Source names: TRABALHO FINAL (1).PNG
- Failure code: missing_provenance
- Response preview: Com base nas informações limitadas disponíveis, o documento "Fatura ATT de dezembro de 2023" não foi encontrado no escopo atual.
- Required fix (Gate F): Replace irrelevant citations (TRABALHO FINAL (1).PNG) with query-relevant evidence sources only.
- Required fix (Gate G): Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key).

### Q18
- Failed gates: F, G, H
- Issues: GATE_F_IRRELEVANT_SOURCE:RF2_Gillet_Neto_Paulo.pdf,Pedro-Gillet.pdf,OBA_marketing_servicos (1).pdf; GATE_G_PROVENANCE_LOCATION_WEAK; GATE_H_FORMAT:ANALYTICAL_FORMAT_MISSING_REQUIRED_BLOCKS
- Source names: RF2_Gillet_Neto_Paulo.pdf, Pedro-Gillet.pdf, OBA_marketing_servicos (1).pdf
- Failure code: missing_provenance
- Response preview: Com base nas informacoes limitadas disponiveis, Com base nas informações limitadas disponíveis, o documento "Fatura ATT de dezembro de 2023" não foi encontrado no escopo atual. Portanto, não é possível detalhar cobranças, variações ou monta
- Required fix (Gate F): Replace irrelevant citations (RF2_Gillet_Neto_Paulo.pdf, Pedro-Gillet.pdf, OBA_marketing_servicos (1).pdf) with query-relevant evidence sources only.
- Required fix (Gate G): Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key).
- Required fix (Gate H): Restructure response into required analytical blocks with explicit evidence and source sections.

### Q19
- Failed gates: F, G
- Issues: GATE_F_IRRELEVANT_SOURCE:Pedro-Gillet.pdf; GATE_G_PROVENANCE_LOCATION_WEAK
- Source names: Pedro-Gillet.pdf
- Failure code: missing_provenance
- Response preview: Com base nas informacoes limitadas disponiveis, o documento "Dossiê Breguet" não foi encontrado no escopo atual. Portanto, não é possível identificar sua natureza, dados factuais ou finalidade.
- Required fix (Gate F): Replace irrelevant citations (Pedro-Gillet.pdf) with query-relevant evidence sources only.
- Required fix (Gate G): Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key).

### Q20
- Failed gates: F, G
- Issues: GATE_F_IRRELEVANT_SOURCE:Breguet.pdf; GATE_G_PROVENANCE_LOCATION_WEAK
- Source names: Breguet.pdf
- Failure code: missing_provenance
- Response preview: | Com base nas informacoes limitadas disponiveis, as seguintes informações foram extraídas do documento "Dossiê Breguet": | Categoria | Detalhe |
| --- | --- | --- |
| Indício: Data | 3/7/24 |  |
| Indício: Emissor | Boutique Breguet, Bever
- Required fix (Gate F): Replace irrelevant citations (Breguet.pdf) with query-relevant evidence sources only.
- Required fix (Gate G): Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key).

### Q21
- Failed gates: F, G
- Issues: GATE_F_IRRELEVANT_SOURCE:Pedro-Gillet.pdf; GATE_G_PROVENANCE_LOCATION_WEAK
- Source names: Pedro-Gillet.pdf
- Failure code: missing_provenance
- Response preview: Com base nas informacoes limitadas disponiveis, o documento "Pedro-Gillet.pdf" é uma Nota Fiscal de Serviços eletrônica (NFS-e), e não uma Certidão de Nascimento. Portanto, não contém os campos civis solicitados. (Pedro-Gillet.pdf, c:1)
- Required fix (Gate F): Replace irrelevant citations (Pedro-Gillet.pdf) with query-relevant evidence sources only.
- Required fix (Gate G): Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key).

### Q22
- Failed gates: F, G, H
- Issues: GATE_F_IRRELEVANT_SOURCE:Pedro-Gillet.pdf,RF2_Gillet_Neto_Paulo.pdf,OBA_marketing_servicos (1).pdf; GATE_G_PROVENANCE_LOCATION_WEAK; GATE_H_FORMAT:ANALYTICAL_FORMAT_MISSING_REQUIRED_BLOCKS
- Source names: Pedro-Gillet.pdf, RF2_Gillet_Neto_Paulo.pdf, OBA_marketing_servicos (1).pdf
- Failure code: missing_provenance
- Response preview: Com base nas informacoes limitadas disponiveis, o documento "Pedro-Gillet.pdf" é uma Nota Fiscal de Serviços eletrônica (NFS-e), e não uma Certidão de Nascimento. (Pedro-Gillet.pdf, c:1)
- Required fix (Gate F): Replace irrelevant citations (Pedro-Gillet.pdf, RF2_Gillet_Neto_Paulo.pdf, OBA_marketing_servicos (1).pdf) with query-relevant evidence sources only.
- Required fix (Gate G): Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key).
- Required fix (Gate H): Restructure response into required analytical blocks with explicit evidence and source sections.

### Q23
- Failed gates: F, G
- Issues: GATE_F_IRRELEVANT_SOURCE:Pedro-Gillet.pdf,RF2_Gillet_Neto_Paulo.pdf; GATE_G_PROVENANCE_LOCATION_WEAK
- Source names: Pedro-Gillet.pdf, RF2_Gillet_Neto_Paulo.pdf
- Failure code: missing_provenance
- Response preview: Com base nas informacoes limitadas disponiveis, o documento "Certidão de quitação eleitoral" não foi encontrado no escopo atual. Portanto, não é possível extrair as informações solicitadas.
- Required fix (Gate F): Replace irrelevant citations (Pedro-Gillet.pdf, RF2_Gillet_Neto_Paulo.pdf) with query-relevant evidence sources only.
- Required fix (Gate G): Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key).

### Q24
- Failed gates: F, G
- Issues: GATE_F_IRRELEVANT_SOURCE:Pedro-Gillet.pdf,RF2_Gillet_Neto_Paulo.pdf; GATE_G_PROVENANCE_LOCATION_WEAK
- Source names: Pedro-Gillet.pdf, RF2_Gillet_Neto_Paulo.pdf
- Failure code: missing_provenance
- Response preview: Com base nas informacoes limitadas disponiveis, o documento "Certidão de quitação eleitoral" não foi encontrado no escopo atual. Portanto, não é possível explicar seu alcance jurídico.
- Required fix (Gate F): Replace irrelevant citations (Pedro-Gillet.pdf, RF2_Gillet_Neto_Paulo.pdf) with query-relevant evidence sources only.
- Required fix (Gate G): Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key).

### Q25
- Failed gates: F, G
- Issues: GATE_F_IRRELEVANT_SOURCE:RF2_Gillet_Neto_Paulo.pdf,Pedro-Gillet.pdf; GATE_G_PROVENANCE_LOCATION_WEAK
- Source names: RF2_Gillet_Neto_Paulo.pdf, Pedro-Gillet.pdf
- Failure code: missing_provenance
- Response preview: Com base nas informacoes limitadas disponiveis, o documento "Comprovante de voo LATAM" não foi encontrado no escopo atual. Portanto, não é possível extrair as informações solicitadas.
- Required fix (Gate F): Replace irrelevant citations (RF2_Gillet_Neto_Paulo.pdf, Pedro-Gillet.pdf) with query-relevant evidence sources only.
- Required fix (Gate G): Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key).

### Q26
- Failed gates: E, G
- Issues: GATE_E_LANGUAGE_MISMATCH; GATE_G_PROVENANCE_LOCATION_WEAK
- Source names: Comprovante-LATAM-LA9578465UHXQ.pdf
- Failure code: nav_pills_missing_buttons
- Response preview: Vou tentar uma abordagem diferente.
- Required fix (Gate E): Rewrite response fully in Portuguese; remove English fallback boilerplate; keep locale-consistent wording.
- Required fix (Gate G): Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key).

### Q27
- Failed gates: G
- Issues: GATE_G_PROVENANCE_LOCATION_WEAK
- Source names: exames-5.pdf
- Failure code: missing_provenance
- Response preview: | Exame | Valor Reportado | Unidade | Intervalo de Referência | Fora da Faixa |
| --- | --- | --- | --- | --- |
| Plaquetas | 228 x10^3/uL | x10^3/uL | 150000 - 450000 | Não (exames-5.pdf, c:1) |
| Vol. Médio Plaquetário | 11,5 | fL | 6,5 -
- Required fix (Gate G): Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key).

### Q28
- Failed gates: F, G, H
- Issues: GATE_F_IRRELEVANT_SOURCE:exames-5.pdf; GATE_G_PROVENANCE_LOCATION_WEAK; GATE_H_FORMAT:ANALYTICAL_FORMAT_MISSING_REQUIRED_HEADERS
- Source names: exames-5.pdf
- Failure code: missing_provenance
- Response preview: | Com base nas informacoes limitadas disponiveis, | Achado/Pergunta | Detalhe |
| --- | --- | --- |
| Achados para acompanhamento | Nenhum resultado fora da faixa de referência (exames-5.pdf) |  |
| Perguntas ao profissional | Não há questõ
- Required fix (Gate F): Replace irrelevant citations (exames-5.pdf) with query-relevant evidence sources only.
- Required fix (Gate G): Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key).
- Required fix (Gate H): Add required analytical headers (Direct Answer, Key Evidence, Sources Used) within response-length constraints.

### Q29
- Failed gates: F, G
- Issues: GATE_F_IRRELEVANT_SOURCE:RF2_Gillet_Neto_Paulo.pdf,Pedro-Gillet.pdf,OBA_marketing_servicos (1).pdf; GATE_G_PROVENANCE_LOCATION_WEAK
- Source names: RF2_Gillet_Neto_Paulo.pdf, Pedro-Gillet.pdf, OBA_marketing_servicos (1).pdf
- Failure code: missing_provenance
- Response preview: Com base nas informações limitadas disponíveis, o documento "Apresentação de negócio de self storage" não foi encontrado no escopo atual. Portanto, não é possível extrair as informações solicitadas.
- Required fix (Gate F): Replace irrelevant citations (RF2_Gillet_Neto_Paulo.pdf, Pedro-Gillet.pdf, OBA_marketing_servicos (1).pdf) with query-relevant evidence sources only.
- Required fix (Gate G): Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key).

### Q30
- Failed gates: G
- Issues: GATE_G_PROVENANCE_LOCATION_WEAK
- Source names: guarda bens self storage.pptx
- Failure code: missing_provenance
- Response preview: | Com base nas informacoes limitadas disponiveis, | Item | Detalhe |
| --- | --- | --- |
| Premissas de ocupação | Não detalhadas no documento (guarda bens self storage.pptx) |  |
| Premissas de preço | Não detalhadas no documento (guarda b
- Required fix (Gate G): Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key).

### Q31
- Failed gates: F, G
- Issues: GATE_F_IRRELEVANT_SOURCE:RF2_Gillet_Neto_Paulo.pdf; GATE_G_PROVENANCE_LOCATION_WEAK
- Source names: RF2_Gillet_Neto_Paulo.pdf
- Failure code: missing_provenance
- Response preview: Com base nas informacoes limitadas disponiveis, Com base nas informações limitadas disponíveis, o documento "Deck de investidores da Mayfair 2025" não foi encontrado no escopo atual. Portanto, não é possível extrair as informações solicitad
- Required fix (Gate F): Replace irrelevant citations (RF2_Gillet_Neto_Paulo.pdf) with query-relevant evidence sources only.
- Required fix (Gate G): Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key).

### Q32
- Failed gates: F, G, H
- Issues: GATE_F_IRRELEVANT_SOURCE:RF2_Gillet_Neto_Paulo.pdf; GATE_G_PROVENANCE_LOCATION_WEAK; GATE_H_FORMAT:ANALYTICAL_FORMAT_MISSING_REQUIRED_BLOCKS
- Source names: RF2_Gillet_Neto_Paulo.pdf
- Failure code: missing_provenance
- Response preview: Não encontrei detalhes específicos sobre "Deck de investidores da Mayfair 2025" nos seus documentos. Você pode me dizer qual arquivo devo verificar?
- Required fix (Gate F): Replace irrelevant citations (RF2_Gillet_Neto_Paulo.pdf) with query-relevant evidence sources only.
- Required fix (Gate G): Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key).
- Required fix (Gate H): Restructure response into required analytical blocks with explicit evidence and source sections.

### Q33
- Failed gates: G
- Issues: GATE_G_PROVENANCE_LOCATION_WEAK
- Source names: OBA_marketing_servicos (1).pdf
- Failure code: missing_provenance
- Response preview: Com base nas informacoes limitadas disponiveis, o documento "OBA_marketing_servicos (1).pdf" não detalha a oferta, público-alvo, diferenciais ou entregáveis prometidos. (OBA_marketing_servicos (1).pdf, c:1)
- Required fix (Gate G): Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key).

### Q34
- Failed gates: F, G
- Issues: GATE_F_IRRELEVANT_SOURCE:OBA_marketing_servicos (1).pdf,Pedro-Gillet.pdf,RF2_Gillet_Neto_Paulo.pdf; GATE_G_PROVENANCE_LOCATION_WEAK
- Source names: OBA_marketing_servicos (1).pdf, Pedro-Gillet.pdf, RF2_Gillet_Neto_Paulo.pdf
- Failure code: missing_provenance
- Response preview: Com base nas informacoes limitadas disponiveis, o documento "OBA_marketing_servicos (1).pdf" descreve problemas de serviço, não promessas vagas para conversão em KPIs. (OBA_marketing_servicos (1).pdf, c:0-1)
- Required fix (Gate F): Replace irrelevant citations (OBA_marketing_servicos (1).pdf, Pedro-Gillet.pdf, RF2_Gillet_Neto_Paulo.pdf) with query-relevant evidence sources only.
- Required fix (Gate G): Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key).

### Q35
- Failed gates: G
- Issues: GATE_G_PROVENANCE_LOCATION_WEAK
- Source names: Pedro-Gillet.pdf
- Failure code: missing_provenance
- Response preview: | Com base nas informacoes limitadas disponiveis, | Item | Detalhe |
| --- | --- | --- |
| Tipo documental | Nota Fiscal Eletrônica de Serviços (NFS-e) |  |
| Partes envolvidas | Usuário (prestador), Prefeitura de São Paulo |  |
| Finalidad
- Required fix (Gate G): Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key).

### Q36
- Failed gates: G
- Issues: GATE_G_PROVENANCE_LOCATION_WEAK
- Source names: Pedro-Gillet.pdf
- Failure code: missing_provenance
- Response preview: Com base nas informacoes limitadas disponiveis,
| Item | Detalhe |
| --- | --- |
| Obrigações |  |
| Usuário: pagar tributos devidos | (Pedro-Gillet.pdf, c:1) |
| Prefeitura: receber tributos | (Pedro-Gillet.pdf, c:1) |
| Prazos |  |
| Emis
- Required fix (Gate G): Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key).

### Q37
- Failed gates: G
- Issues: GATE_G_PROVENANCE_LOCATION_WEAK
- Source names: RF2_Gillet_Neto_Paulo.pdf
- Failure code: none
- Response preview: Com base nas informacoes limitadas disponiveis,
| Item | Detalhe |
| --- | --- |
| Estrutura | Formulário de Pedidos |
|  | Detalhes de produtos hospitality |
| Objetivo | Solicitar produtos de hospitality |
|  | Para Copa do Mundo FIFA 202
- Required fix (Gate G): Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key).

### Q38
- Failed gates: E, G
- Issues: GATE_E_LANGUAGE_MISMATCH; GATE_G_PROVENANCE_LOCATION_WEAK
- Source names: Pedro-Gillet.pdf, RF2_Gillet_Neto_Paulo.pdf
- Failure code: quality_gate_blocked
- Response preview: Tentando outro metodo agora.
- Required fix (Gate E): Rewrite response fully in Portuguese; remove English fallback boilerplate; keep locale-consistent wording.
- Required fix (Gate G): Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key).

### Q39
- Failed gates: F, G
- Issues: GATE_F_IRRELEVANT_SOURCE:SEVIS_RTI.pdf; GATE_G_PROVENANCE_LOCATION_WEAK
- Source names: SEVIS_RTI.pdf
- Failure code: missing_provenance
- Response preview: Com base nas informacoes limitadas disponiveis,
| Item | Detalhe |
| --- | --- |
| Instituição | Departamento de Estado e DHS |
| Identificadores | Não especificados no trecho |
| Status | Não especificado no trecho |
| Datas de programa | 
- Required fix (Gate F): Replace irrelevant citations (SEVIS_RTI.pdf) with query-relevant evidence sources only.
- Required fix (Gate G): Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key).

### Q40
- Failed gates: F, G
- Issues: GATE_F_IRRELEVANT_SOURCE:SEVIS_RTI.pdf; GATE_G_PROVENANCE_LOCATION_WEAK
- Source names: SEVIS_RTI.pdf
- Failure code: missing_provenance
- Response preview: Com base nas informacoes limitadas disponiveis,
| Item | Detalhe |
| --- | --- |
| Riscos de Conformidade |  |
| Não matricular até data início | Perda de status, deportação (SEVIS_RTI.pdf, c:5) |
| Emprego ilegal | Término de status F-1, d
- Required fix (Gate F): Replace irrelevant citations (SEVIS_RTI.pdf) with query-relevant evidence sources only.
- Required fix (Gate G): Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key).

### Q41
- Failed gates: F, G
- Issues: GATE_F_IRRELEVANT_SOURCE:Trabalho projeto .pdf; GATE_G_PROVENANCE_LOCATION_WEAK
- Source names: TRABALHO FINAL (1).PNG, Trabalho projeto .pdf
- Failure code: missing_provenance
- Response preview: Com base nas informacoes limitadas disponiveis,
| Item | Detalhe |
| --- | --- |
| Objetivo | Apresentar empresa e projeto |
| Entregáveis | Título, integrantes do grupo |
|  | Descritivo da empresa (histórico, ramo, etc.) |
|  | Descritivo
- Required fix (Gate F): Replace irrelevant citations (Trabalho projeto .pdf) with query-relevant evidence sources only.
- Required fix (Gate G): Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key).

### Q42
- Failed gates: F, G
- Issues: GATE_F_IRRELEVANT_SOURCE:RF2_Gillet_Neto_Paulo.pdf,Pedro-Gillet.pdf; GATE_G_PROVENANCE_LOCATION_WEAK
- Source names: RF2_Gillet_Neto_Paulo.pdf, Pedro-Gillet.pdf
- Failure code: missing_provenance
- Response preview: Com base nas informacoes limitadas disponiveis,
| Item | Condição de Aceite |
| --- | --- |
| Título | Título do trabalho presente |
| Integrantes do grupo | Nomes dos membros listados |
| Descritivo da empresa | Histórico, ramo, etc. descr
- Required fix (Gate F): Replace irrelevant citations (RF2_Gillet_Neto_Paulo.pdf, Pedro-Gillet.pdf) with query-relevant evidence sources only.
- Required fix (Gate G): Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key).

### Q43
- Failed gates: F, G
- Issues: GATE_F_IRRELEVANT_SOURCE:TRABALHO FINAL (1).PNG; GATE_G_PROVENANCE_LOCATION_WEAK
- Source names: TRABALHO FINAL (1).PNG, Trabalho projeto .pdf
- Failure code: missing_provenance
- Response preview: Com base nas informacoes limitadas disponiveis,
| Item | Detalhe |
| --- | --- |
| Problema | Necessidade de ampliar capacidade de armazenagem (Trabalho projeto.pdf, c:1) |
| Escopo | Ampliação de armazenagem, construção de mezanino (Trabal
- Required fix (Gate F): Replace irrelevant citations (TRABALHO FINAL (1).PNG) with query-relevant evidence sources only.
- Required fix (Gate G): Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key).

### Q44
- Failed gates: F, G
- Issues: GATE_F_IRRELEVANT_SOURCE:Trabalho projeto .pdf; GATE_G_PROVENANCE_LOCATION_WEAK
- Source names: Trabalho projeto .pdf
- Failure code: missing_provenance
- Response preview: Com base nas informacoes limitadas disponiveis,
| Item | Detalhe |
| --- | --- |
| Marcos | Engenharia do mezanino (Trabalho projeto.pdf, c:2) |
|  | Fabricação do mezanino (Trabalho projeto.pdf, c:2) |
|  | Montagem e testes do mezanino (T
- Required fix (Gate F): Replace irrelevant citations (Trabalho projeto .pdf) with query-relevant evidence sources only.
- Required fix (Gate G): Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key).

### Q45
- Failed gates: E, F, G
- Issues: GATE_E_LANGUAGE_MISMATCH; GATE_F_IRRELEVANT_SOURCE:SEVIS_RTI.pdf,Pedro-Gillet.pdf; GATE_G_PROVENANCE_LOCATION_WEAK
- Source names: SEVIS_RTI.pdf, Pedro-Gillet.pdf
- Failure code: quality_gate_blocked
- Response preview: Tentando outro metodo agora.
- Required fix (Gate E): Rewrite response fully in Portuguese; remove English fallback boilerplate; keep locale-consistent wording.
- Required fix (Gate F): Replace irrelevant citations (SEVIS_RTI.pdf, Pedro-Gillet.pdf) with query-relevant evidence sources only.
- Required fix (Gate G): Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key).

### Q46
- Failed gates: F, G
- Issues: GATE_F_IRRELEVANT_SOURCE:RF2_Gillet_Neto_Paulo.pdf; GATE_G_PROVENANCE_LOCATION_WEAK
- Source names: RF2_Gillet_Neto_Paulo.pdf
- Failure code: missing_provenance
- Response preview: Com base nas informacoes limitadas disponiveis,
| Item | Detalhe |
| --- | --- |
| Compromisso pagamento | Todas as vendas são finais (RF2_Gillet_Neto_Paulo.pdf, c:16) |
| Risco financeiro | Cancelamentos não permitidos (RF2_Gillet_Neto_Pau
- Required fix (Gate F): Replace irrelevant citations (RF2_Gillet_Neto_Paulo.pdf) with query-relevant evidence sources only.
- Required fix (Gate G): Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key).

### Q47
- Failed gates: F, G
- Issues: GATE_F_IRRELEVANT_SOURCE:SEVIS_RTI.pdf,AÉREO ALVARO + 2.pdf; GATE_G_PROVENANCE_LOCATION_WEAK
- Source names: SEVIS_RTI.pdf, AÉREO ALVARO + 2.pdf
- Failure code: missing_provenance
- Response preview: Com base nas informacoes limitadas disponiveis,
| Item | Detalhe |
| --- | --- |
| Narrativa |  |
| 10 Mai 2023 | Estudante atestou termos I-20 em LA. (SEVIS_RTI.pdf, c:2) |
| Reentrada EUA | Exige passaporte, visto F-1, I-20 endossado. (SE
- Required fix (Gate F): Replace irrelevant citations (SEVIS_RTI.pdf, AÉREO ALVARO + 2.pdf) with query-relevant evidence sources only.
- Required fix (Gate G): Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key).

### Q48
- Failed gates: F, G, H
- Issues: GATE_F_IRRELEVANT_SOURCE:Anotações Aula 2 (1).pdf,20260121 BESS - Preliminary Assessment of the Brazilian Market Potential 2.pdf; GATE_G_PROVENANCE_LOCATION_WEAK; GATE_H_FORMAT:ANALYTICAL_FORMAT_MISSING_REQUIRED_HEADERS
- Source names: Anotações Aula 2 (1).pdf, 20260121 BESS - Preliminary Assessment of the Brazilian Market Potential 2.pdf
- Failure code: missing_provenance
- Response preview: Com base nas informacoes limitadas disponiveis,
| Item | Detalhe |
| --- | --- |
| Tese | Avaliação potencial mercado BESS Brasil. (20260121 BESS..., c:0) |
| Mercado | Brasil, com oportunidades primárias identificadas. (20260121 BESS..., c
- Required fix (Gate F): Replace irrelevant citations (Anotações Aula 2 (1).pdf, 20260121 BESS - Preliminary Assessment of the Brazilian Market Potential 2.pdf) with query-relevant evidence sources only.
- Required fix (Gate G): Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key).
- Required fix (Gate H): Add required analytical headers (Direct Answer, Key Evidence, Sources Used) within response-length constraints.

### Q49
- Failed gates: F, G, H
- Issues: GATE_F_IRRELEVANT_SOURCE:Trabalho projeto .pdf; GATE_G_PROVENANCE_LOCATION_WEAK; GATE_H_FORMAT:ANALYTICAL_FORMAT_MISSING_REQUIRED_BLOCKS
- Source names: Trabalho projeto .pdf
- Failure code: missing_provenance
- Response preview: Com base nas informacoes limitadas disponiveis,
- Required fix (Gate F): Replace irrelevant citations (Trabalho projeto .pdf) with query-relevant evidence sources only.
- Required fix (Gate G): Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key).
- Required fix (Gate H): Restructure response into required analytical blocks with explicit evidence and source sections.

### Q50
- Failed gates: F, G
- Issues: GATE_F_IRRELEVANT_SOURCE:RF2_Gillet_Neto_Paulo.pdf,Pedro-Gillet.pdf; GATE_G_PROVENANCE_LOCATION_WEAK
- Source names: RF2_Gillet_Neto_Paulo.pdf, Pedro-Gillet.pdf
- Failure code: missing_provenance
- Response preview: | Com base nas informacoes limitadas disponiveis, | Título Documento | Responde Bem | Aberto | Prioridade |
| --- | --- | --- | --- | --- |
| Relatório Projeto | Marcos, dependências, riscos (Trabalho projeto.pdf, c:2) | Critérios de pronto
- Required fix (Gate F): Replace irrelevant citations (RF2_Gillet_Neto_Paulo.pdf, Pedro-Gillet.pdf) with query-relevant evidence sources only.
- Required fix (Gate G): Attach rich provenance location for cited sources (page/slide/sheet/cell/section or valid location key).

