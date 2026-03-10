# Data Flow Map — Allybi Security Assurance Pack

**Generated**: 2026-03-09
**Scope**: All sensitive data assets traced from creation through deletion

---

## Data Lifecycle Matrix

| Asset | Created | Stored (Persistent) | Encrypted? | Cached | Logged | Sent External | Deleted | Findings |
|-------|---------|-------------------|------------|--------|--------|---------------|---------|----------|
| Raw upload bytes | `presigned-urls.routes.ts` | GCS bucket via `gcsStorage.service.ts:117` | N (GCS-managed only) | NodeCache 30min `cache.service.ts:237` | N | GCS (HTTPS) | On doc delete + orphan cleanup daily 3AM | F-004 |
| Extracted text | `extractionStep.service.ts` | `DocumentMetadata.extractedText` / `extractedTextEncrypted` | PARTIAL (both exist) | N | N | N | Cascade on doc delete | F-009 |
| Document chunks | `chunkingStep.service.ts` | `DocumentChunk.text` / `textEncrypted` | PARTIAL (encrypted mode nulls text) | N | N | N | Cascade on doc delete | F-009 |
| Embedding vectors | `vectorEmbedding.service.ts` | Pinecone + `DocumentEmbedding` table | N (both plaintext) | NodeCache 1h `cache.service.ts:66` | N | Pinecone API (HTTPS) | On doc delete | F-001, F-002 |
| Pinecone metadata | `pinecone.mappers.ts:20` | Pinecone managed index | N | N | N | Pinecone (HTTPS) | `deleteDocumentEmbeddings()` | F-002 |
| Chat messages (user) | `POST /api/chat/chat` | `Message.contentEncrypted` via `encryptedChatRepo.service.ts` | Y (AES-256-GCM) | N | N (response bodies not logged) | LLM API (HTTPS) | Cascade on conversation delete | Clean |
| Chat responses (AI) | LLM gateway response | `Message.contentEncrypted` | Y (AES-256-GCM) | NodeCache 5min `cache.service.ts:117` | N | N (client only) | Cascade on conversation delete | F-003 |
| 2FA secrets | `twoFactor.service.ts:132` | `TwoFactorAuth.secretEncrypted` | Y (tenant key) | N | N | N (QR code to client once) | On 2FA disable + user cascade | Clean |
| Connector tokens | OAuth callback services | `ConnectorToken.encryptedPayloadJson` | Y (envelope, AAD-bound) | N | N | External APIs (HTTPS bearer) | Explicit disconnect + invalid_grant | Clean |
| JWT access tokens | `jwt.ts:48` | Not stored server-side (stateless) | N/A | N | Redacted | Client (HTTP-only cookie `koda_at`) | JWT expiry + session revocation | Clean |
| Refresh tokens | `jwt.ts:64` | `Session.refreshTokenHash` (HMAC-SHA256) | Y (hashed) | N | Redacted | Client (HTTP-only cookie `koda_rt`) | Rotation + logout + reuse detection | Clean |
| User passwords | Registration/reset | `User.passwordHash` (bcrypt-12) | Y (hashed) | N | Redacted | N | N/A (irreversible) | F-021 |
| Admin credentials | Admin model + env | `Admin.passwordHash` + `KODA_ADMIN_KEY` env | Y (hashed) / plaintext env | N | Username logged, password not | N | N/A | F-013 |
| Audit logs | `auditLog.middleware.ts:99` | `AuditLog` PostgreSQL table | N | N | Self (is the log) | N | NEVER (no retention policy) | F-016, F-018 |
| Session data | Login/OAuth/refresh | `Session` PostgreSQL table | N | N | N | N | Soft-delete only (isActive=false) | F-017 |
| BullMQ job payloads | `jobHelpers.service.ts:11` | Redis via BullMQ | N | N | Job IDs only | Redis (TLS if rediss://) | `removeOnComplete: 24h, removeOnFail: 7d` | F-010 |
| Cache entries | Various cache.service methods | In-process NodeCache | N | Self | Debug-level key only | N | TTL-based (5min-30min) + manual invalidation | F-003 |
| GCS stored files | Presigned URL upload | GCS bucket `users/{userId}/docs/{docId}/` | N (GCS-managed only) | N | N | GCS (HTTPS signed URLs, 30min TTL) | Doc delete + orphan cleanup | F-004 |
| Backup data | N/A | N/A | N/A | N/A | N/A | N/A | N/A | F-019 |
| Verification codes | `auth.service.ts:137` | `VerificationCode.code` (plaintext) / `PendingUser.emailCode` | N (6-digit), Y (link-based: SHA-256) | Redis/memory (TTL 900s) | SMS code logged WITHOUT guard (line 286) | Infobip email/SMS (HTTPS) | Marked used + TTL + pre-issue delete | F-005, F-006 |

---

## Trust Boundary Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT BROWSER                           │
│  JWT (koda_at cookie) + CSRF token (koda_csrf cookie + header)  │
└─────────────────────┬───────────────────────────────────────────┘
                      │ HTTPS (TLS 1.2+)
┌─────────────────────▼───────────────────────────────────────────┐
│                     CLOUD RUN (Express)                          │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐    │
│  │ Auth         │  │ Chat         │  │ Ingestion          │    │
│  │ Middleware   │──│ Runtime      │  │ Pipeline           │    │
│  │ (JWT verify) │  │ (LLM calls)  │  │ (extract/chunk/    │    │
│  └──────────────┘  └──────┬───────┘  │  embed/encrypt)    │    │
│                           │          └─────────┬──────────┘    │
│  ┌────────────────────────┼────────────────────┼─────────┐    │
│  │              IN-MEMORY (NodeCache)                      │    │
│  │  answers(5min) embeddings(1h) fileBuffers(30min)       │    │
│  │  ALL PLAINTEXT — Finding F-003                         │    │
│  └────────────────────────┼────────────────────┼─────────┘    │
└───────────────────────────┼────────────────────┼──────────────┘
                            │                    │
         ┌──────────────────┼─────┐              │
         │                  │     │              │
    ┌────▼────┐  ┌─────────▼┐  ┌─▼──────────┐ ┌▼──────────────┐
    │PostgreSQL│  │  Redis   │  │   GCS      │ │  Pinecone     │
    │(Supabase)│  │(BullMQ)  │  │  Bucket    │ │  (Vector DB)  │
    │          │  │          │  │            │ │               │
    │ Encrypted│  │ Plaintext│  │ Plaintext  │ │ Plaintext     │
    │ fields + │  │ job data │  │ file bytes │ │ metadata +    │
    │ Plaintext│  │ F-010    │  │ F-004      │ │ content F-002 │
    │ copies   │  │          │  │            │ │               │
    │ F-001,   │  └──────────┘  └────────────┘ └───────────────┘
    │ F-009    │
    └──────────┘
         │
    ┌────▼──────────────────────┐
    │  LLM APIs (HTTPS)         │
    │  Google Gemini / OpenAI   │
    │  Plaintext prompts +      │
    │  evidence in transit      │
    │  (zero-retention assumed) │
    └───────────────────────────┘
```

---

## Data Deletion Completeness

| Asset | DB Deleted? | GCS Deleted? | Pinecone Deleted? | Redis Deleted? | Cache Purged? | Complete? |
|-------|------------|-------------|-------------------|---------------|---------------|-----------|
| Document | Cascade delete | `gcsStorage.deleteFile()` | `deleteDocumentEmbeddings()` | Job TTL (24h/7d) | `invalidateDocumentCache()` | PARTIAL — Redis job data may linger |
| Conversation | Cascade delete | N/A | N/A | N/A | N/A | YES |
| User account | Cascade all relations | Manual per-doc | Manual per-doc | N/A | N/A | PARTIAL — GCS/Pinecone orphans possible |
| Session | Soft-delete only | N/A | N/A | N/A | N/A | NO — never hard-deleted (F-017) |
| Audit logs | NEVER | N/A | N/A | N/A | N/A | NO — no retention policy (F-016) |

---

*Every cell in this matrix maps to a specific file:line reference in the Evidence Ledger.*
