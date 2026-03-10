# Threat Model

## System Overview

Koda is a document-intelligence SaaS platform. Users upload documents (PDF, DOCX, XLSX, PPTX, images), which are processed, embedded, and queryable via AI chat.

## Threat Actors

| Actor | Capability | Motivation |
|-------|-----------|------------|
| External attacker | Network access, common tools | Data theft, ransomware |
| Malicious user | Valid account, API access | Cross-tenant access, data exfiltration |
| Insider (compromised dev) | Code access, secrets knowledge | Sabotage, data theft |
| Supply chain | Compromised npm package | Crypto mining, backdoor |

## Attack Surfaces

### 1. Authentication Layer
- **Threats**: Brute force, credential stuffing, session hijacking
- **Mitigations**: bcrypt-12, rate limiting, session limits (max 10), HMAC tokens, token reuse detection

### 2. Document Upload Pipeline
- **Threats**: Malicious files, path traversal, SSRF via document links
- **Mitigations**: File type validation, size limits, content scanning, sandboxed processing

### 3. Encryption Layer
- **Threats**: Key compromise, weak crypto, plaintext leakage
- **Mitigations**: AES-256-GCM with AAD, HKDF key derivation, key versioning, field-level encryption

### 4. Vector Store (Pinecone)
- **Threats**: Metadata leakage, embedding inversion
- **Mitigations**: No plaintext in metadata, user-scoped namespaces, API key rotation

### 5. Cloud Storage (GCS)
- **Threats**: Bucket misconfiguration, unencrypted data at rest
- **Mitigations**: Client-side encryption, private buckets, retention lock for audit logs

### 6. Database (PostgreSQL)
- **Threats**: SQL injection, cross-tenant data access, backup exposure
- **Mitigations**: Prisma ORM (parameterized), RLS policies, sslmode=require, encrypted fields

### 7. CI/CD Pipeline
- **Threats**: Supply chain attacks, secret leakage, backdoor in dependencies
- **Mitigations**: npm audit, Trivy scan, SBOM generation, secret scanning, no .env in repo

### 8. API Layer
- **Threats**: XSS, CSRF, injection, IDOR
- **Mitigations**: Helmet headers, CSRF tokens, input validation, user-scoped queries

## Data Classification

| Class | Examples | Protection |
|-------|----------|-----------|
| Critical | Master key, user passwords | Secret Manager, bcrypt-12 |
| Sensitive | Document content, chat messages | AES-256-GCM field encryption |
| Internal | User email, session data | TLS, access control |
| Public | Landing page content | Standard web security |

## Risk Register

| Risk | Likelihood | Impact | Status |
|------|-----------|--------|--------|
| Cross-tenant data access | Low | Critical | Mitigated (RLS) |
| Master key compromise | Very Low | Critical | Mitigated (Secret Manager + rotation) |
| Plaintext in Pinecone | Medium | High | Mitigated (metadata stripped) |
| Supply chain attack | Low | High | Mitigated (npm audit + Trivy) |
| Brute force auth | Medium | Medium | Mitigated (rate limit + alerting) |
