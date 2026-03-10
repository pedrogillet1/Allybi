# Phase 8 Harsh Manual Grading — 40-Query Doc Regression

**Date:** 2026-03-10
**Grading criteria:** Correctness, completeness, specificity. Deductions for truncation, vagueness, non-answers, broken grammar.

## Summary

| Document | Harsh Avg | Auto-Grader Avg | Delta |
|---|---|---|---|
| BCB Reserve Requirements | 76.5 | 98.0 | -21.5 |
| Trade Act of 1974 | 75.0 | 100.0 | -25.0 |
| INPI Fee Schedule | 61.5 | 100.0 | -38.5 |
| CARES Act | 61.5 | 100.0 | -38.5 |
| **Overall** | **68.6** | **99.5** | **-30.9** |

## Issue Frequency

| Issue | Count | Queries |
|---|---|---|
| Mid-sentence truncation | 5 | Q7, Q21, Q23, Q27, Q29 |
| Non-answer ("not in excerpts") | 5 | Q17, Q26, Q29, Q30, Q40 |
| Vague/incomplete (no specifics) | 6 | Q24, Q25, Q34, Q35, Q38, Q39 |
| Broken grammar | 1 | Q32 |
| Fragmentary/disjointed | 2 | Q14, Q16 |

## Per-Query Harsh Grades

### BCB Reserve Requirements — 76.5/100

| Q | Harsh | Issue | Notes |
|---|---|---|---|
| Q1 | 90 | OK | Good: 21%, BRL 500k exemption, cycle |
| Q2 | 85 | OK | Correct but doesn't explain alignment |
| Q3 | 90 | OK | Correct BRL 500k deduction |
| Q4 | 75 | TRUNCATED | Cuts off at "Each tier has a maximum deduction limit" |
| Q5 | 80 | SHORT | Correct (Selic rate) but minimal detail |
| Q6 | 70 | INCOMPLETE | Only covers post-May 2012 rule, missing pre-May |
| Q7 | 30 | TRUNCATED | "the institutions subject to the requirement are:..." — no actual list |
| Q8 | 85 | OK | Good deduction mechanism explanation |
| Q9 | 75 | INCOMPLETE | Correct period but doesn't explain alignment |
| Q10 | 85 | OK | Selic rate, end-of-day balance, exemption |

### Trade Act of 1974 — 75.0/100

| Q | Harsh | Issue | Notes |
|---|---|---|---|
| Q11 | 85 | OK | Proclamation authority, modifications |
| Q12 | 85 | OK | TAA, reemployment, training |
| Q13 | 95 | OK | Comprehensive: mandatory bars, conditions, least-developed |
| Q14 | 70 | DISJOINTED | Mentions advisory committees/ITC but fragmentary |
| Q15 | 85 | OK | Serious injury standard, ITC, safeguards |
| Q16 | 65 | FRAGMENTARY | Incomplete, disjointed fragments |
| Q17 | 40 | NON-ANSWER | "don't contain the formula" — no answer provided |
| Q18 | 65 | TRUNCATED | Cuts off at staging description |
| Q19 | 80 | OK | Freedom of emigration condition |
| Q20 | 80 | OK | Ties benefits to narcotics cooperation |

### INPI Fee Schedule — 61.5/100

| Q | Harsh | Issue | Notes |
|---|---|---|---|
| Q21 | 70 | TRUNCATED | R$ 175 for PI, cuts off at "R$ 70." |
| Q22 | 90 | OK | Correct: 60% discount |
| Q23 | 65 | TRUNCATED | Cuts off at "R$ 1,000." — missing full schedule |
| Q24 | 60 | VAGUE | Mentions codes 389/394 but no actual fee amounts |
| Q25 | 50 | VAGUE | Doesn't state actual conditions for waiver |
| Q26 | 40 | NON-ANSWER | "not shown in the provided excerpts" |
| Q27 | 70 | TRUNCATED | Code 3019, truncated at "R$ 0." |
| Q28 | 95 | OK | Excellent comparison table |
| Q29 | 35 | NON-ANSWER | "shows these charges:..." — no charges listed |
| Q30 | 40 | NON-ANSWER | "don't show any line item" |

### CARES Act — 61.5/100

| Q | Harsh | Issue | Notes |
|---|---|---|---|
| Q31 | 80 | OK | Good PPP explanation |
| Q32 | 25 | BROKEN | "It the provisions" — broken grammar, non-answer |
| Q33 | 85 | OK | Good PUA coverage expansion |
| Q34 | 60 | VAGUE | Title IV mention but no airline-specific details |
| Q35 | 55 | VAGUE | No specifics about oversight mechanisms |
| Q36 | 90 | OK | Good: moratorium + forbearance + 180/360 day details |
| Q37 | 80 | OK | Telehealth: dialysis waiver, hospice. Some fragments |
| Q38 | 45 | VAGUE | Doesn't mention Special IG specifically |
| Q39 | 60 | VAGUE | No credit percentage or eligible employer criteria |
| Q40 | 35 | NON-ANSWER | "amounts aren't present in the provided evidence" |

## Latency Analysis

| Metric | Value |
|---|---|
| Average | 11.6s |
| Min | 8.7s (Q7) |
| Max | 18.4s (Q33) |
| Total | 466s (7.8 min) |
| Target | <6s |

## Root Cause Analysis

### Truncation (5 queries, avg harsh score 54/100)
Not a token budget issue — answers are 109-229 chars (well under 1600-token budget).
Likely cause: evidence snippets themselves are incomplete, or LLM is generating list starters ("the items are:...") and then running out of grounded evidence to continue.

### Non-answers (5 queries, avg harsh score 38/100)
The LLM correctly identifies when evidence doesn't contain the answer.
Possible cause: chunks covering those specific details were not retrieved, or document coverage gaps.

### Vagueness (6 queries, avg harsh score 55/100)
LLM provides correct framing but lacks specific numbers/details.
Likely cause: relevant evidence chunks not in top-K retrieval results.

### Latency (11.6s avg vs 6s target)
Retrieval phases are parallelized but external API calls (embedding generation, Pinecone, LLM) are the bottleneck. Pipeline: embedding (~1-2s) + retrieval (~3-5s) + LLM composition (~4-6s) + post-processing (~1s) ≈ 10-14s.
