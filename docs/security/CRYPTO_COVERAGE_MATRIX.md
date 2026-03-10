# Crypto Coverage Matrix — Allybi Security Assurance Pack

**Generated**: 2026-03-09

---

## Encryption Primitives Inventory

| Component | Algorithm | Mode | Key Size | IV/Nonce | Integrity | File |
|-----------|-----------|------|----------|----------|-----------|------|
| Document field encryption | AES-256 | GCM (AEAD) | 256-bit | 12-byte random per-op | Auth tag | `encryption.service.ts` |
| Key derivation | HKDF | SHA-256 | 256-bit output | Salt (empty default!) | N/A | `hkdf.service.ts` |
| Master key wrapping (local) | AES-256-GCM | Same as above | 256-bit | 12-byte random | Auth tag | `keyManager.service.ts` |
| Master key wrapping (KMS) | Google Cloud KMS | Delegated | Managed | Managed | Managed | `keyManager.service.ts` |
| Refresh token storage | HMAC-SHA256 | N/A | Pepper-derived | N/A | MAC | `authBridge.ts:36-41` |
| Password hashing | bcrypt | Blowfish | 12 rounds | Salt (auto or custom) | N/A | `password.ts`, `authBridge.ts` |
| Link-based verification tokens | SHA-256 | Hash | N/A | N/A | Hash | `authBridge.ts:368` |
| Connector token encryption | AES-256-GCM | Envelope | Per-record random | 12-byte random | Auth tag | `tokenVault.service.ts` |
| 2FA secret encryption | AES-256-GCM | Via tenant key | Derived | 12-byte random | Auth tag | `twoFactor.service.ts:143` |
| Admin key comparison | Timing-safe equal | N/A | N/A | N/A | N/A | `adminKey.middleware.ts:12` |

---

## Field-Level Encryption Coverage

### Legend
- **ENC**: Encrypted at rest with AES-256-GCM
- **HASH**: Irreversibly hashed (bcrypt/HMAC/SHA-256)
- **PLAIN**: Stored in plaintext
- **NULL-ENC**: Plaintext field exists but nulled when encrypted mode active
- **N/A**: Not applicable

### Document Data

| Data Class | Location | At Rest | Key Owner | AAD Bound? | Rotation? | Plaintext Copy? | Finding |
|-----------|----------|---------|-----------|------------|-----------|----------------|---------|
| Document.displayTitle | Postgres | PLAIN | — | — | — | IS the plaintext | F-024 |
| Document.rawText | Postgres | PLAIN | — | — | — | IS the plaintext | F-024 |
| Document.previewText | Postgres | PLAIN | — | — | — | IS the plaintext | F-024 |
| Document.renderableContent | Postgres | PLAIN | — | — | — | IS the plaintext | F-024 |
| DocumentMetadata.extractedText | Postgres | NULL-ENC | — | — | — | Yes (when not nulled) | F-009 |
| DocumentMetadata.extractedTextEncrypted | Postgres | ENC | Document DEK | `doc:{userId}:{docId}:extractedText` | N | — | — |
| DocumentMetadata.entities | Postgres | NULL-ENC | — | — | — | Yes (when not nulled) | F-009 |
| DocumentMetadata.entitiesEncrypted | Postgres | ENC | Document DEK | `doc:{userId}:{docId}:entities` | N | — | — |
| DocumentMetadata.classification | Postgres | NULL-ENC | — | — | — | Yes (when not nulled) | F-009 |
| DocumentMetadata.classificationEncrypted | Postgres | ENC | Document DEK | `doc:{userId}:{docId}:classification` | N | — | — |
| DocumentMetadata.summary | Postgres | PLAIN | — | — | — | No encrypted counterpart | F-024 |
| DocumentMetadata.markdownContent | Postgres | PLAIN | — | — | — | No encrypted counterpart | F-024 |
| DocumentMetadata.slidesData | Postgres | PLAIN | — | — | — | No encrypted counterpart | F-024 |
| DocumentMetadata.pptxMetadata | Postgres | PLAIN | — | — | — | No encrypted counterpart | F-024 |
| DocumentChunk.text | Postgres | NULL-ENC | — | — | — | Yes (when not nulled) | F-009 |
| DocumentChunk.textEncrypted | Postgres | ENC | Document DEK | `chunk:{userId}:{docId}:{chunkId}:text` | N | — | — |
| DocumentChunk.valueRaw | Postgres | PLAIN | — | — | — | Numeric values | — |
| DocumentChunk.unitRaw | Postgres | PLAIN | — | — | — | Unit labels | — |
| DocumentEmbedding.content | Postgres | **PLAIN** | — | — | — | Full chunk content | **F-001** |
| DocumentEmbedding.chunkText | Postgres | **PLAIN** | — | — | — | Full chunk text | **F-001** |
| DocumentEmbedding.microSummary | Postgres | **PLAIN** | — | — | — | AI-generated summary | **F-001** |
| Pinecone vector metadata | Pinecone | **PLAIN** | — | — | — | Content + filename | **F-002** |
| GCS file bytes | GCS bucket | **PLAIN** (GCS-managed SSE) | Google-managed | — | — | Original file | **F-004** |

### Authentication Data

| Data Class | Location | At Rest | Key Owner | AAD Bound? | Rotation? | Plaintext Copy? | Finding |
|-----------|----------|---------|-----------|------------|-----------|----------------|---------|
| User.passwordHash | Postgres | HASH (bcrypt-12) | N/A | N/A | N/A | N | — |
| User.salt | Postgres | PLAIN | — | — | — | Salt only, not secret | — |
| User.tenantKeyEncrypted | Postgres | ENC | Master KEK | `tenantKey` info | N | N | — |
| Session.refreshTokenHash | Postgres | HASH (HMAC-SHA256) | Pepper | N/A | N/A | N | — |
| TwoFactorAuth.secretEncrypted | Postgres | ENC | Tenant key | Yes | N | Legacy `secret` field (migrated to null) | — |
| TwoFactorAuth.backupCodesEncrypted | Postgres | ENC | Tenant key | Yes | N | Legacy `backupCodes` field (migrated to null) | — |
| ConnectorToken.encryptedPayloadJson | Postgres | ENC | Per-record random DEK | `connector-token:{userId}:{provider}` | N | N | — |
| ConnectorToken.wrappedRecordKey | Postgres | ENC | Master KEK | — | N | N | — |
| VerificationCode.code (6-digit) | Postgres | **PLAIN** | — | — | — | Raw 6-digit code | **F-005** |
| VerificationCode.code (link-based) | Postgres | HASH (SHA-256) | N/A | N/A | N/A | N | — |
| PendingUser.emailCode | Postgres | **PLAIN** | — | — | — | Raw 6-digit code | **F-005** |
| PendingUser.phoneCode | Postgres | **PLAIN** | — | — | — | Raw 6-digit code | **F-005** |
| Admin.passwordHash | Postgres | HASH (bcrypt) | N/A | N/A | N/A | N | — |
| AdminSession.refreshTokenHash | Postgres | HASH | N/A | N/A | N/A | N | — |

### Transient / Cache / Queue Data

| Data Class | Location | At Rest | Encrypted? | TTL | Finding |
|-----------|----------|---------|------------|-----|---------|
| Cached embeddings | NodeCache (memory) | PLAIN | N | 3600s | F-003 |
| Cached search results | NodeCache (memory) | PLAIN | N | 300s | F-003 |
| Cached answers | NodeCache (memory) | PLAIN | N | 300s | F-003 |
| Cached document buffers | NodeCache (memory) | PLAIN | N | 1800s | F-003 |
| Cached query responses | NodeCache (memory) | PLAIN | N | 300s | F-003 |
| BullMQ document job data | Redis | PLAIN | N | 24h (complete) / 7d (fail) | F-010 |
| BullMQ connector job data | Redis | PLAIN | N | Same | F-010 |
| Verification token cache | Redis/memory | PLAIN | N | 900s | — |

### Operational Data

| Data Class | Location | At Rest | Encrypted? | Finding |
|-----------|----------|---------|------------|---------|
| AuditLog.ipAddress | Postgres | PLAIN | N | F-018 |
| AuditLog.userAgent | Postgres | PLAIN | N | F-018 |
| Session.ipAddress | Postgres | PLAIN | N | F-017 |
| Session.userAgent | Postgres | PLAIN | N | F-017 |
| Session.country | Postgres | PLAIN | N | F-017 |
| Session.city | Postgres | PLAIN | N | F-017 |

---

## Key Hierarchy Diagram

```
KODA_MASTER_KEY_BASE64 (env var / GCP KMS)
│   256-bit AES key loaded at startup
│   File: keyManager.service.ts
│
├── HKDF-SHA256(master, info="tenantKey") → Tenant KEK (per-user)
│   │   Stored: User.tenantKeyEncrypted (wrapped with master)
│   │   Cached: 5-min TTL in tenantKey.service.ts
│   │   File: tenantKey.service.ts
│   │
│   ├── HKDF-SHA256(tenant, info="documentKey:{docId}") → Document DEK
│   │       Stored: DocumentKey.wrappedKey (wrapped with tenant key)
│   │       Used for: extractedTextEncrypted, entitiesEncrypted,
│   │                  classificationEncrypted, textEncrypted (chunks),
│   │                  contentEncrypted (chat messages)
│   │       AAD: "doc:{userId}:{docId}:{field}" or "chunk:{userId}:{docId}:{chunkId}:{field}"
│   │       File: documentKey.service.ts, fieldEncryption.service.ts
│   │
│   └── Tenant key directly → 2FA encryption
│           Used for: secretEncrypted, backupCodesEncrypted
│           File: twoFactor.service.ts
│
├── Per-record random key → Connector token encryption
│       Generated: crypto.randomBytes(32) per ConnectorToken
│       Wrapped with: master key (or SHA-256 of ENCRYPTION_KEY fallback)
│       AAD: "connector-token:{userId}:{provider}"
│       File: tokenVault.service.ts
│
└── KODA_REFRESH_PEPPER (env var) → Refresh token HMAC
        Used for: HMAC-SHA256 of refresh tokens before storage
        File: authBridge.ts
```

---

## Coverage Summary

| Category | Total Fields | Encrypted | Hashed | Plaintext | Coverage |
|----------|-------------|-----------|--------|-----------|----------|
| Document content fields | 18 | 6 | 0 | 12 | **33%** |
| Auth credentials | 8 | 3 | 4 | 1 | **88%** |
| Connector tokens | 2 | 2 | 0 | 0 | **100%** |
| Chat messages | 2 | 2 | 0 | 0 | **100%** |
| 2FA secrets | 4 | 2 | 0 | 2 (legacy, migrated) | **100% (post-migration)** |
| Verification codes | 4 | 0 | 1 | 3 | **25%** |
| Session/Audit PII | 6 | 0 | 0 | 6 | **0%** |
| Cache/Queue content | 7 | 0 | 0 | 7 | **0%** |
| External stores (GCS/Pinecone) | 2 | 0 | 0 | 2 | **0%** |

**Overall document content encryption coverage: 33%**
**Overall credential encryption coverage: 88%**
**Overall cache/queue/external encryption: 0%**

---

*Every cell references the Evidence Ledger finding IDs. Verification commands are in EVIDENCE_LEDGER.md.*
