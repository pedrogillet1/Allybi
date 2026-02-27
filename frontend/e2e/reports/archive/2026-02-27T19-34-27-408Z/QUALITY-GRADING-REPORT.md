# Quality Grading Report: 100-Query Chat Test

**Date:** 2026-02-26
**Account:** test@koda.com
**Verdict: FAIL — Not ready for structured testing**

---

## Executive Summary

| Metric | Value | Grade |
|--------|-------|-------|
| Queries sent | 100 | - |
| Real responses | 46/100 | **F** |
| "Something went wrong" | 54/100 | **Critical** |
| Responses with sources | 0/100 | **F** |
| Truncated responses | 2/46 | Acceptable |
| Document-grounded answers | 0/46 | **F** |
| Average response time | 3.1s | OK |

---

## Critical Failures

### 1. RAG/Document Retrieval is Non-Functional (Grade: F)

**Every single response across all 100 queries failed to retrieve or reference any uploaded document content.**

The LLM responded purely from its general knowledge and the document *names* mentioned in the user's first message. It never accessed any document content. Evidence:

- **Q1:** "Para te dar uma visão geral, preciso ter acesso ao conteúdo dos documentos. No momento, não consigo visualizar..."
- **Q10-Q34:** Every Scrum chapter question got "não tive acesso ao conteúdo do documento"
- **Q36-Q46:** Every project work question got the same refusal
- **Zero source pills** rendered across all 100 queries

**Root cause:** The RAG pipeline is not retrieving document chunks for the test user's documents. The LLM correctly acknowledges it has no document access — this is honest but completely useless for a document Q&A product.

### 2. Total Backend Crash at Query 47 (Grade: F)

Queries 47-100 all returned "Something went wrong" (20 chars). The backend crashed due to `EADDRINUSE: address already in use :::5000` — nodemon detected file changes and restarted mid-test, but the previous process didn't release the port.

While this was triggered by a dev-environment issue (nodemon restart), it reveals:
- **No graceful shutdown** — the server doesn't release the port on restart
- **No error recovery** — once crashed, all subsequent queries fail silently
- **Generic error message** — user sees "Something went wrong" with zero actionable information

### 3. Zero Source Pills (Grade: F)

Source pills only render when `answerClass === 'DOCUMENT'` or `answerMode?.startsWith('doc_grounded')`. Since the RAG pipeline never engaged, these fields were never set, so no source pills appeared. The 3-source dedup fix (Task 6) and source ID fix are untestable until RAG works.

---

## Response Quality Grading (Q1-Q46)

### Tier 1: Partially Useful (Q1-Q9) — Grade: D+

These queries asked about document *names* only, so the LLM could answer from context:

| Q | Quality | Notes |
|---|---------|-------|
| Q1 | D | Correctly admits it can't access docs — but shouldn't this be the platform's job to retrieve them? |
| Q2 | C | Categorization by name is reasonable but superficial |
| Q3 | C- | Truncated mid-sentence. Answer cut off at "os mais estratégicos para" |
| Q4 | C | Reasonable guess based on names |
| Q5 | D | Truncated. Admits it can't provide a real summary |
| Q6 | C | Synthesizes previous answers into 3 sentences — decent format compliance |
| Q7 | C | Categories are reasonable guesses |
| Q8 | C+ | Best answer in the batch — thoughtful analysis of information density by format |
| Q9 | C | Practical recommendation, correctly identifies one-pager as quick read |

### Tier 2: Repetitive Refusals (Q10-Q46) — Grade: F

**36 consecutive "I can't access the document" responses.** Every single query from Q10 onward got essentially the same templated refusal:

> "Não consigo [action] porque não tive acesso ao conteúdo do documento."

This is:
- **Honest** — the LLM doesn't hallucinate content (good)
- **Useless** — the entire point of the product is document Q&A
- **Repetitive** — no variation in 36 responses
- **Missing escalation** — never suggests the user check document upload status, never offers alternative help

### Tier 3: Total Failure (Q47-Q100) — Grade: F

All returned "Something went wrong" — no content at all.

---

## Truncation Analysis

Only 2 responses were truncated (Q3, Q5):
- **Q3:** Cut off mid-sentence at "os mais estratégicos para" — the `maxResponseCharsHard` limit hit
- **Q5:** Cut off at "foram baseadas apenas nos nomes e tipos dos documentos" — same limit

The truncation UI label `(Response was truncated)` and failure code `TRUNCATED_RESPONSE` rendered correctly after our Task 5 fix. However, the truncation limit appears too aggressive — responses are being cut at ~150-180 chars of actual content, which is extremely short.

---

## Streaming Observability

- **x-request-id headers:** Could not verify from Playwright (would need network interception). The code changes are correct.
- **Response times:** Consistent 2-8s per query, reasonable for streaming.
- **No JS errors:** The frontend loaded and operated without crashes.

---

## Notification Service

- **Zero `/api/notifications` requests** in network traffic (verified by the localStorage-only rewrite). Task 7 working correctly.

---

## Blocker Summary

| # | Blocker | Severity | Fix Required |
|---|---------|----------|--------------|
| 1 | RAG retrieval not returning document chunks | **Critical** | Backend: debug why retrieval engine returns no results for test user's documents |
| 2 | Backend crash without graceful recovery | **High** | Server: add graceful shutdown handler, process signal handling |
| 3 | Truncation limit too aggressive (~150 chars) | **High** | Check `truncation_and_limits` bank — `maxResponseCharsHard` is cutting responses mid-sentence |
| 4 | "Something went wrong" with no details | **Medium** | Frontend: surface error codes/messages instead of generic string |
| 5 | No source pills testable until RAG works | **Blocked** | Depends on #1 |
| 6 | Same refusal repeated 36 times without variation | **Low** | LLM prompt: add escalation/help suggestions after 2+ refusals |

---

## What Works

1. Login flow operates correctly
2. Chat UI sends/receives messages without JS errors
3. Streaming renders in real-time
4. Truncation and failure metadata now surface correctly (Task 5 fix verified)
5. Notification service no longer makes phantom API calls (Task 7 verified)
6. Build succeeds with no missing imports (Task 1 fix verified)

---

## Recommendation

**Do NOT proceed with structured Allybi testing until:**
1. RAG retrieval is confirmed working for the test account's documents
2. Truncation limits are reviewed and increased
3. The backend crash recovery is addressed

The frontend is mechanically functional — it sends queries, renders responses, handles streaming. But the product is non-functional for its core use case (document Q&A) because the backend RAG pipeline returns nothing.
