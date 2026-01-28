# Telemetry (Admin Dashboard)

This document describes the **minimal telemetry layer** used to power Koda’s admin dashboard without changing core product behavior. Telemetry must be **fail-open** (never break chat/document flows) and **deterministic** (stable event names and fields).

---

## Goals

Telemetry exists to answer:

- Who is using Koda and how often?
- What files are being uploaded and what’s failing in extraction/indexing?
- What are users asking (intent/domain), and how good is grounding (evidence)?
- What is LLM usage (provider/model/tokens/latency/errors)?

This is the **50% coverage set** (highest value / lowest risk).

---

## Non-goals

Telemetry does **not**:

- Store full raw user document contents
- Replace audit/security systems
- Control routing or policy decisions
- Block requests if telemetry fails

---

## Core Principles

### 1) Fail-open

Telemetry must **never throw** up the call stack.

- If DB is slow/down → drop event
- If createMany fails → swallow
- Do not block user flows

### 2) Minimal & stable schemas

Event type strings and fields must be stable. Changing them breaks dashboards and historical comparability.

### 3) No sensitive raw text by default

Queries and filenames should be stored as:

- hashes
- short previews (optional, off by default)
- extracted keywords

Use `telemetry.redaction.ts`.

---

## What we store (50% coverage)

Telemetry is stored in **four event tables**:

1) `UsageEvent`  
2) `ModelCall`  
3) `RetrievalEvent`  
4) `IngestionEvent`

These are enough to monitor product usage, costs, and answer quality.

---

## Event Types

### UsageEvent

Tracks high-level user actions.

Examples:
- `CHAT_MESSAGE_SENT`
- `CONVERSATION_CREATED`
- `DOCUMENT_UPLOADED`
- `DOCUMENT_PREVIEW_OPENED`
- `REGENERATE_USED`
- `COPY_USED`

Fields:
- userId, tenantId, at
- optional: conversationId, documentId, deviceType, locale
- optional: meta JSON

### ModelCall

Tracks every LLM call.

Fields:
- provider, model
- stage (pipeline stage)
- tokens (prompt/completion/total)
- latency (firstTokenMs, durationMs)
- status ok/fail, errorCode
- traceId, turnId

### RetrievalEvent

Tracks grounding quality per answer.

Fields:
- operator, intent, domain
- docLockEnabled
- strategy
- candidates, selected, evidenceStrength
- refined, wrongDocPrevented
- sourcesCount, navPillsUsed
- fallbackReasonCode
- traceId, turnId, conversationId

### IngestionEvent

Tracks upload/extraction/indexing.

Fields:
- filename (optional), mimeType, sizeBytes
- extractionMethod, pages, ocrUsed, ocrConfidence
- extractedTextLength, tablesExtracted
- chunkCount
- embeddingProvider, embeddingModel
- durationMs
- status ok/fail, errorCode

---

## Where telemetry is captured

Telemetry is intentionally added at **a few high-leverage points**:

### Chat
- When a user sends a message
- When a conversation is created
- When user uses regenerate/copy buttons

### Retrieval / Quality
- After retrieval selection and evidence gating
- When fallback triggers due to weak/no evidence

### LLM
- Before and after provider calls (Gemini/OpenAI/local)
- Capture tokens, latency, errors

### Documents
- After upload begins and completes
- On extraction errors or indexing errors

---

## How telemetry powers the Admin Dashboard

Backend exposes read-only admin endpoints:

- `/api/admin/telemetry/overview`
- `/api/admin/telemetry/users`
- `/api/admin/telemetry/files`
- `/api/admin/telemetry/queries`
- `/api/admin/telemetry/quality`
- `/api/admin/telemetry/llm`
- `/api/admin/telemetry/errors`
- `/api/admin/telemetry/timeseries`

Aggregations are computed in `telemetry.aggregations.ts`.

---

## Privacy / redaction

By default:

- Do not store raw query text
- Do not store raw document text
- Store keyword tokens + stable hash signatures

Use:
- `services/telemetry/telemetry.redaction.ts`

Recommended:
- `allowPreview=false`
- store `hash + keywords + length`

---

## Retention

Suggested retention (can be changed later):

- Keep raw events 30–90 days
- Roll up into daily aggregates later
- Add pruning job only when volume requires it

---

## Testing requirements (minimum)

Add tests/probes that ensure:

- Telemetry writes never throw
- Admin routes require admin middleware
- Aggregations return stable shapes even with empty data

---

## Files / ownership map

- **Write path**
  - `telemetry.service.ts` (writes)
  - `telemetry.capture.ts` (build helpers)
  - `telemetry.redaction.ts` (privacy)
  - `telemetry.types.ts` (type contracts)
  - `telemetry.constants.ts` (stable enums)

- **Read path**
  - `telemetry.aggregations.ts` (queries)
  - `adminTelemetryApp.service.ts` (orchestrates)
  - `adminTelemetry.controller.ts` (HTTP)
  - `adminTelemetry.routes.ts` (routing)

---

## Next expansions (100% later)

When you’re ready:
- Add per-document “source usage”
- Add session-level timing (time to first answer)
- Add richer security audit logs
- Add stored aggregates tables for speed

This is intentionally out-of-scope for the MVP telemetry set.
