# Security Overview

## Architecture

Koda uses defense-in-depth with multiple security layers:

1. **Authentication**: bcrypt-12 password hashing, JWT with session binding, CSRF protection
2. **Authorization**: Per-user row-level security (RLS) in PostgreSQL
3. **Encryption at rest**: AES-256-GCM with HKDF-derived keys for all sensitive fields
4. **Encryption in transit**: TLS 1.2+ enforced, sslmode=require for database
5. **Key management**: GCP Secret Manager, key versioning, 90-day rotation policy
6. **Monitoring**: Sentry error tracking, audit logging, brute-force detection

## Data Protection

- All document content encrypted with AES-256-GCM before storage
- Vector embeddings stored without plaintext metadata in third-party services
- Verification codes SHA-256 hashed (never stored in plaintext)
- Refresh tokens HMAC-SHA256 hashed
- IP addresses anonymized with HMAC in audit logs
- Client-side encryption for cloud storage uploads

## CI/CD Security

- Automated secret scanning on every push
- npm audit for known vulnerabilities (high/critical blocking)
- SBOM generation (CycloneDX format)
- Trivy filesystem vulnerability scanning
- Unprotected route scanning
- Plaintext write detection

## Compliance

- LGPD-ready: Data encryption, access controls, audit trail
- GDPR principles: Data minimization, purpose limitation, storage limitation

## Reporting Vulnerabilities

Please report security vulnerabilities to: security@allybi.com

We follow responsible disclosure practices and will acknowledge receipt within 48 hours.
