# Quality Test Grade Report

**Timestamp:** 2026-01-17T03:29:49.127Z
**Conversation ID:** comprehensive-1768620400534

## Overall Results

| Metric | Value |
|--------|-------|
| Total Queries | 50 |
| Passed | 41 |
| Failed | 9 |
| Pass Rate | 82.0% |
| Threshold | 90% |
| Status | ❌ FAILED |
| Avg Latency | 3371ms |

## Results by Category

| Category | Passed | Failed | Rate |
|----------|--------|--------|------|
| file_listing | 2 | 4 | 33% |
| summary | 1 | 3 | 25% |
| file_actions | 5 | 1 | 83% |
| formatting_table | 3 | 1 | 75% |
| followup_pronoun | 3 | 0 | 100% |
| finance_month | 2 | 0 | 100% |
| formatting_constraint | 2 | 0 | 100% |
| extraction | 4 | 0 | 100% |
| locator | 5 | 0 | 100% |
| legal_extraction | 5 | 0 | 100% |
| doc_stats | 3 | 0 | 100% |
| excel_structure | 3 | 0 | 100% |
| finance_quarter | 1 | 0 | 100% |
| calculation | 1 | 0 | 100% |
| finance_extraction | 1 | 0 | 100% |

## Failure Breakdown

- **FORMAT_VIOLATION**: 4 occurrences
- **METADATA_LEAK**: 4 occurrences
- **LANGUAGE_MISMATCH**: 2 occurrences
- **INTENT_MISMATCH**: 1 occurrences

## Failed Queries Detail

### q08: Resume o projeto da Guarda Bens em 5 bullets.
- **Category:** summary
- **Expected:** intent=any, format=5_bullets
- **Got:** intent=documents
- **Failures:** FORMAT_VIOLATION: Expected 5 bullets, got 1
- **Answer Preview:** Aqui está um do projeto da Guarda Bens:
1. A **Guarda Bens Self Storage** é uma empresa fundada em **2012** que atua no segmento de self-storage, oferecendo soluções de armazenagem seguras e acessívei...

### q13: What documents do I have about contracts?
- **Category:** file_listing
- **Expected:** intent=file_actions, format=any
- **Got:** intent=file_actions
- **Failures:** METADATA_LEAK: Internal UUIDs exposed in response
- **Answer Preview:** You have 48 file(s):
1. {{DOC::id=a1da8222-9d0a-48f6-ad1d-2ffb122f980f::name="2511.11383v1_Optimal%20Dividend%20Reinsurance%20and%20Capital%20Injectio.pdf"::ctx=list}}
2. {{DOC::id=822df976-ebea-44b8-...

### q16: Summarize the Rosewood Fund document in exactly 5 bullets.
- **Category:** summary
- **Expected:** intent=any, format=5_bullets
- **Got:** intent=file_actions
- **Failures:** FORMAT_VIOLATION: Expected 5 bullets, got 0
- **Answer Preview:** I couldn't find a folder named "exactly 5 bullets."....

### q19: Liste os meus arquivos PDF.
- **Category:** file_listing
- **Expected:** intent=file_actions, format=any
- **Got:** intent=file_actions
- **Failures:** LANGUAGE_MISMATCH: PT query answered in EN; METADATA_LEAK: Internal UUIDs exposed in response
- **Answer Preview:** Found 20 pdf files:

1. **2511.11383v1_Optimal Dividend Reinsurance and Capital Injectio.pdf** {{DOC::id=a1da8222-9d0a-48f6-ad1d-2ffb122f980f::name="2511.11383v1_Optimal%20Dividend%20Reinsurance%20and...

### q27: List my documents sorted by date (newest first).
- **Category:** file_listing
- **Expected:** intent=file_actions, format=any
- **Got:** intent=file_actions
- **Failures:** METADATA_LEAK: Internal UUIDs exposed in response
- **Answer Preview:** You have 48 file(s):
1. {{DOC::id=a1da8222-9d0a-48f6-ad1d-2ffb122f980f::name="2511.11383v1_Optimal%20Dividend%20Reinsurance%20and%20Capital%20Injectio.pdf"::ctx=list}}
2. {{DOC::id=822df976-ebea-44b8-...

### q32: Resuma as métricas de marketing em 3 pontos.
- **Category:** summary
- **Expected:** intent=any, format=3_bullets
- **Got:** intent=documents
- **Failures:** FORMAT_VIOLATION: Expected 3 bullets, got 1
- **Answer Preview:** Aqui estão as métricas de marketing relevantes:
1. **Percepção de Qualidade no Acesso**: A qualidade do estacionamento e a clareza do acesso são métricas importantes, pois um estacionamento ruim e con...

### q39: Mostre apenas os arquivos Word.
- **Category:** file_actions
- **Expected:** intent=file_actions, format=any
- **Got:** intent=documents
- **Failures:** INTENT_MISMATCH: Expected file_actions, got documents
- **Answer Preview:** Não foram encontrados arquivos Word no contexto fornecido....

### q43: Quais documentos tenho sobre finanças?
- **Category:** file_listing
- **Expected:** intent=file_actions, format=any
- **Got:** intent=file_actions
- **Failures:** LANGUAGE_MISMATCH: PT query answered in EN; METADATA_LEAK: Internal UUIDs exposed in response
- **Answer Preview:** Aqui está um resumo dos seus 48 documentos:
**Other Files** (5)
1. {{DOC::37569d86-c327-4199-bfc0-aaa2cb266ddd::Financ_as_II_Aula_12__Gabarito_b.xlsx}}
2. {{DOC::09c4c21d-3693-4bfc-8d4f-5f1b1c8d256f::...

### q47: Crie uma tabela comparando receitas e despesas por trimestre.
- **Category:** formatting_table
- **Expected:** intent=any, format=table
- **Got:** intent=documents
- **Failures:** FORMAT_VIOLATION: Expected table format, none detected
- **Answer Preview:** **Step 1:**
Entendo que você gostaria que eu explicasse de forma diferente. Aqui está o que eu disse antes: Found 5 XLSX and XLS and CSV file(s):
1.
2.
3.
4.
5. **Step 2:**
Com base nos documentos, es...


## Next Steps to Reach 100%

Based on the failures above:
1. Fix intent routing for file_actions vs documents
2. Fix language detection/response matching
3. Enforce formatting constraints (bullets, sentences, tables)
4. Pronoun resolution OK
5. Response coverage OK
