# B-Grade Queries Summary

**Count:** 24 queries
**Common Issue:** Minor formatting, language mixing (quoted PT in EN), or verbosity

---

## B-Grade Query List

| ID | Query | Primary Issue | Fix Category |
|----|-------|---------------|--------------|
| q01 | "Resume o projeto apresentado..." | No bullet formatting | format |
| q02 | "Em que ano a Guarda Bens surgiu?" | Citation verbose | citation_cleanup |
| q03 | "Quais serviços aparecem no portfólio..." | No bullet formatting | format |
| q05 | "O que significa 'intangibilidade'..." | Citation count low | citation |
| q06 | "Me dá exemplos do que no documento..." | Minor formatting | format |
| q09 | "Quais desafios o documento aponta?" | Minor verbosity | style |
| q10 | "Quais metodologias são mencionadas..." | Minor verbosity | style |
| q20 | "No arquivo de análise do mezanino..." | Minor | none |
| q23 | "What service types are listed..." | PT fragments in EN | language |
| q24 | "If I'm the project owner..." | Minor | none |
| q27 | "Give me a quick story of the year..." | Minor | none |
| q29 | "What examples in the PDF reduce..." | PT quoted in EN | language |
| q30 | "What's a 'positive' example..." | Minor wordiness | style |
| q32 | "Quais aprendizados o documento..." | Minor | none |
| q33 | "What's the practical takeaway..." | Minor | none |
| q34 | "Isso parece Scrum mesmo..." | Minor | none |
| q37 | "Does the marketing PDF mention..." | PT quoted in EN | language |
| q38 | "Me dá um checklist rápido..." | Minor | none |
| q39 | "What files does the integration guide..." | Minor | none |
| q41 | "Give me the single biggest operational..." | PT quoted in EN | language |
| q42 | "Se eu for cliente durante a obra..." | Reasoning (no docs needed) | intent |
| q44 | "Me diga os desafios e como mitigaria..." | "6 linhas" not enforced | format_count |
| q45 | "What is PERT/CPM being used for..." | Minor | none |
| q49 | "If I wanted to turn this project deck..." | PT terms in EN | language |

---

## Root Cause Breakdown

| Root Cause | Count | Queries |
|------------|-------|---------|
| Language mixing (PT in EN) | 6 | q23, q29, q37, q41, q49, (q33 implicit) |
| Minor formatting | 4 | q01, q03, q06, q44 |
| Minor verbosity/style | 4 | q09, q10, q30, (others) |
| Citation issues | 2 | q02, q05 |
| Intent (reasoning) | 1 | q42 |
| No issue (near-A) | 7 | q20, q24, q27, q32-34, q38-39, q45 |

---

## Fixes to Upgrade B→A

### Priority 1: Language Lock Enforcement (6 queries)

**File:** `languageEnforcement.service.ts`

When answering in English about Portuguese documents, either:
1. Translate all quoted text, OR
2. Add translation in parentheses after quotes

Example fix for q29:
```
BEFORE: "Cliente entra frustrado e já desconfiado da qualidade"
AFTER: "Cliente entra frustrado..." (The customer enters frustrated and already distrustful of the quality)
```

### Priority 2: Bullet/List Formatting (4 queries)

**File:** `kodaFormattingPipelineV3.ts`

Detect when answer lists items and auto-format as bullets:
- q01: Summary should have bullet points
- q03: Services should be bulleted list
- q44: Should enforce "6 linhas" constraint

### Priority 3: Verbosity Control (4 queries)

**File:** `answer_styles.json`

Reduce maximum length for summary-type questions. Add style rule:
```json
{
  "summary_max_words": 150,
  "explanation_max_words": 250
}
```

---

## Near-A Queries (Minor Polish Needed)

These 7 queries are already very close to A-grade:

| ID | What's Needed |
|----|---------------|
| q20 | Slightly more specific citations |
| q24 | Minor wordiness reduction |
| q27 | None - borderline A |
| q32 | None - borderline A |
| q33 | None - borderline A |
| q34 | None - borderline A |
| q38 | None - borderline A |
| q39 | None - borderline A |
| q45 | None - borderline A |

---

## Expected Upgrade Path

With language + formatting fixes:
- q23, q29, q37, q41, q49 → A (language lock)
- q01, q03, q06, q44 → A (formatting)
- 7 near-A queries → A (minimal changes)
- Remaining 6 need style tuning
