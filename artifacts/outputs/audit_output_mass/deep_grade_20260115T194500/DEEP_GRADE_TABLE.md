# Deep Grading Table - Human Simulation Run

**Run Date:** 2026-01-15T16:22:15Z
**Total Queries:** 50
**Overall Pass Rate:** 45/50 (90%)
**A-Grade Count:** 5
**Required for PASS:** 50/50 (100%)

---

## Rubric Dimensions

| Dim | Name | Description |
|-----|------|-------------|
| D1 | Intent | Correct intent classification (documents/excel/extraction/help/file_actions) |
| D2 | Sources | Sources present when doc-grounded answer expected |
| D3 | Citations | Citation markers ({{DOC::...}}) present when facts cited |
| D4 | Language | Language lock (PT→PT, EN→EN, no mid-switch) |
| D5 | Format | Formatting contract (bullets/tables/counts honored) |
| D6 | Complete | Answered actual question (no file list, no help template) |
| D7 | Memory | Follow-ups use prior context (lastDocumentIds) |
| D8 | UI Payload | done.fullAnswer exists, proper SSE structure |
| D9 | Latency | Not instant template when RAG expected |

**Legend:** ✓ = pass, ✗ = fail, - = N/A

---

## Per-Query Results

| ID | Grade | D1 | D2 | D3 | D4 | D5 | D6 | D7 | D8 | D9 | Primary Root Cause | Fix Location |
|----|-------|----|----|----|----|----|----|----|----|----|--------------------|--------------|
| q46 | C | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | - | ✓ | ✓ | Incomplete (hedges "não vejo") | kodaAnswerEngineV3.ts generateAnswer() |
| q01 | B | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | - | ✓ | ✓ | No bullet formatting | kodaFormattingPipelineV3.ts formatSimple() |
| q02 | B | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | - | ✓ | ✓ | Citation verbose | citation building cleanup |
| q03 | B | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | - | ✓ | ✓ | No bullet formatting | kodaFormattingPipelineV3.ts formatSimple() |
| **q04** | **D** | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | - | ✓ | ✗ | **Instant help template** | routingPriority.service.ts excel boost |
| q23 | B | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | - | ✓ | ✓ | PT fragments in EN | languageEnforcement.service.ts |
| q05 | B | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | - | ✓ | ✓ | Citation count low | citation building |
| q06 | B | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | Minor formatting | kodaFormattingPipelineV3.ts |
| **q28** | **F** | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | - | ✓ | ✓ | **Raw PT in EN answer** | languageEnforcement.service.ts sanitize() |
| q29 | B | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | - | ✓ | ✓ | PT quoted in EN | languageEnforcement.service.ts |
| q30 | B | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | - | ✓ | ✓ | Minor wordiness | answer style |
| q07 | C | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | - | ✓ | ✓ | Incomplete explanation | kodaAnswerEngineV3.ts depth |
| q47 | C | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | - | ✓ | ✓ | Incomplete (generic) | retrieval boost |
| q37 | B | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | - | ✓ | ✓ | PT quoted in EN | languageEnforcement.service.ts |
| **q08** | **A** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | - | ✓ | ✓ | - | - |
| q09 | B | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | - | ✓ | ✓ | Minor verbosity | answer style |
| q10 | B | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | - | ✓ | ✓ | Minor verbosity | answer style |
| q34 | B | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | Minor | - |
| q45 | B | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | - | ✓ | ✓ | Minor | - |
| q32 | B | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | - | ✓ | ✓ | Minor | - |
| q33 | B | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | - | ✓ | ✓ | Minor | - |
| q38 | B | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | - | ✓ | ✓ | Minor | - |
| q41 | B | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | - | ✓ | ✓ | PT quoted in EN | languageEnforcement.service.ts |
| q42 | B | ✓ | ✗ | ✗ | ✓ | ✓ | ✓ | - | ✓ | ✓ | Reasoning (no docs) | intentConfig.service.ts |
| q44 | B | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | - | ✓ | ✓ | "6 lines" not enforced | formatConstraintParser.ts |
| q31 | C | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | - | ✓ | ✓ | Too verbose | kodaFormattingPipelineV3.ts |
| q35 | C | ✓ | ✓ | ✓ | ✗ | ✓ | ✗ | - | ✓ | ✓ | PT terms in EN + verbose | languageEnforcement + format |
| q49 | B | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | - | ✓ | ✓ | PT terms in EN | languageEnforcement.service.ts |
| q50 | C | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | - | ✓ | ✓ | Too formal (not "chat") | answer_styles.json |
| q11 | C | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | - | ✓ | ✓ | Hedges "não vejo" | monthNormalization.service.ts |
| q12 | C | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | - | ✓ | ✓ | Wrong docs retrieved | kodaHybridSearch.service.ts |
| **q16** | **F** | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | ✓ | ✗ | **Help template (follow-up)** | decisionTree.service.ts:294 |
| q36 | C | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ | ✓ | Wrong docs (follow-up) | kodaRetrievalEngineV3.ts lastDocIds |
| q13 | C | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | - | ✓ | ✓ | Incomplete months list | retrieval depth |
| **q14** | **F** | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | ✓ | ✗ | **Help template (follow-up)** | decisionTree.service.ts:294 |
| q15 | C | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | - | ✓ | ✓ | Hedges + wrong field | monthNormalization.service.ts |
| q17 | C | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | - | ✓ | ✓ | Generic P&L definition | retrieval relevance |
| **q25** | **A** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | - | ✓ | ✓ | - | - |
| q26 | C | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | - | ✓ | ✓ | No month name | monthNormalization.service.ts |
| q27 | B | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | - | ✓ | ✓ | Minor | - |
| q43 | C | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | - | ✓ | ✓ | No Nov data | monthNormalization.service.ts |
| **q48** | **A** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | - | ✓ | ✓ | - | - |
| **q18** | **A** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | - | ✓ | ✓ | - | - |
| q19 | C | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ | ✓ | Wrong doc (Scrum not Guide) | kodaRetrievalEngineV3.ts lastDocIds |
| **q40** | **D** | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ | ✓ | **Follow-up wrong docs** | kodaRetrievalEngineV3.ts lastDocIds |
| q39 | B | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | - | ✓ | ✓ | Minor | - |
| **q21** | **A** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | - | ✓ | ✓ | - | - |
| q22 | C | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ | ✓ | Generic (no guide ref) | retrieval relevance |
| q20 | B | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | - | ✓ | ✓ | Minor | - |
| q24 | B | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | - | ✓ | ✓ | Minor | - |

---

## Grade Distribution

| Grade | Count | Queries |
|-------|-------|---------|
| A | 5 | q08, q18, q21, q25, q48 |
| B | 24 | q01-03, q05-06, q09-10, q20, q24, q27, q29-30, q32-34, q37-39, q41-42, q44-45, q49 |
| C | 16 | q07, q11-13, q15, q17, q19, q22, q26, q31, q35-36, q43, q46-47, q50 |
| D | 2 | q04, q40 |
| F | 3 | q14, q16, q28 |

---

## Critical Failures Breakdown

### F-Grade Queries (3)

| ID | Root Cause | Evidence | Fix |
|----|------------|----------|-----|
| q14 | Help template on follow-up | intent=`extraction`, sources=0, latency=9ms | decisionTree.service.ts:294 - add wasDocContext check for extraction |
| q16 | Help template on follow-up | intent=`extraction`, sources=0, latency=12ms | decisionTree.service.ts:294 - add wasDocContext check for extraction |
| q28 | Raw PT in EN answer | "aparência, cheiro e organização da loja" unquoted | languageEnforcement.service.ts - sanitize source fragments |

### D-Grade Queries (2)

| ID | Root Cause | Evidence | Fix |
|----|------------|----------|-----|
| q04 | Instant help template | intent=`excel`, sources=0, latency=10ms | routingPriority.service.ts - boost excel confidence |
| q40 | Follow-up wrong docs | refs Scrum chapter not Integration Guide | kodaRetrievalEngineV3.ts - use lastDocumentIds for boost |

---

## Dimension Failure Counts

| Dimension | Fail Count | % of 50 |
|-----------|------------|---------|
| D1 Intent | 3 | 6% |
| D2 Sources | 3 | 6% |
| D3 Citations | 3 | 6% |
| D4 Language | 8 | 16% |
| D5 Format | 8 | 16% |
| D6 Complete | 18 | 36% |
| D7 Memory | 6 | 12% |
| D8 UI Payload | 0 | 0% |
| D9 Latency | 3 | 6% |

---

## Root Cause Classification

| Category | Count | Queries |
|----------|-------|---------|
| routing | 3 | q04, q14, q16 |
| memory | 4 | q16, q19, q36, q40 |
| retrieval | 8 | q11-13, q15, q17, q22, q26, q43 |
| language | 8 | q23, q28-29, q35, q37, q41, q49, (implicit in others) |
| format | 8 | q01, q03, q31, q44, q50 |
| completeness | 10 | q07, q46-47, multiple C-grades |

---

## Evidence Snippets

### q14 (F) - Help Template
```
Query: "Abril e maio de 2024 foram muito ruins? Quanto foi o net income em cada um?"
Answer: "Sou Koda, um assistente de IA especializado em ajudá-lo a trabalhar com seus documentos..."
Intent: extraction (should inherit documents from q13)
Sources: 0, Latency: 9ms (INSTANT TEMPLATE)
```

### q16 (F) - Help Template
```
Query: "Com base nesses números, qual mês parece 'virada' do ano?"
Answer: "Sou Koda, um assistente de IA especializado em ajudá-lo..."
Intent: extraction (should inherit documents from q12)
Sources: 0, Latency: 12ms (INSTANT TEMPLATE)
```

### q28 (F) - Language Mix
```
Query: "In the marketing PDF, what does 'intangibility' lead customers to rely on?"
Answer: "...evaluate a service by 'aparência, cheiro e organização da loja' because..."
Expected: English translation or properly quoted
```

### q40 (D) - Wrong Docs
```
Query: "Por que o guia insiste em separar conteúdo de layout?"
Previous (q18): Integration Guide question
Answer: References "Capítulo 8 (Framework Scrum).pdf" instead of Integration Guide
Sources: 3 (WRONG ONES)
```

### q04 (D) - Retrieval Failure
```
Query: "Qual é o intervalo de tamanho dos boxes individuais?"
Previous (q03): Mentioned "1 m² a 200 m²" in answer
Answer: "Pesquisei mas não consegui localizar essa informação específica."
Intent: excel (misrouted from documents)
Sources: 0, Latency: 10ms
```
