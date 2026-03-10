# Cryptographic Specification

## Algorithms

| Purpose | Algorithm | Key Size | Notes |
|---------|-----------|----------|-------|
| Symmetric encryption | AES-256-GCM | 256 bits | Authenticated encryption with AAD |
| Key derivation | HKDF-SHA256 | 256 bits output | RFC 5869 |
| Password hashing | bcrypt | 12 rounds | Built-in salt |
| Token hashing | HMAC-SHA256 | 256 bits | For refresh tokens |
| Code hashing | SHA-256 | 256 bits | One-way, for verification codes |
| IP anonymization | HMAC-SHA256 | 128 bits (truncated) | For audit log privacy |

## Key Hierarchy

```
Master Key (KODA_MASTER_KEY_BASE64)
  |-- HKDF -> Document encryption keys (per-user, per-document)
  |-- HKDF -> Field encryption keys (per-field)
  |-- HKDF -> Cache encryption keys
  +-- HKDF -> GCS encryption keys
```

## Encrypted Payload Format (v1)

```json
{
  "v": 1,
  "alg": "AES-256-GCM",
  "ivB64": "<12-byte IV, base64>",
  "tagB64": "<16-byte auth tag, base64>",
  "ctB64": "<ciphertext, base64>",
  "aadB64": "<AAD, base64>",
  "kv": 1
}
```

### Fields
- `v`: Payload format version (always 1)
- `alg`: Algorithm identifier
- `ivB64`: 12-byte random IV (never reused)
- `tagB64`: 16-byte GCM authentication tag
- `ctB64`: Encrypted ciphertext
- `aadB64`: Additional Authenticated Data (required, not encrypted)
- `kv`: Key version (for rotation support)

## AAD Convention

Format: `{purpose}:{userId}:{entityId}:{extra}`

Examples:
- `doc:user123:doc456:content` -- document content encryption
- `field:user123:embed789:chunkText` -- field-level encryption
- `msg:conv123:msg456` -- chat message encryption
- `gcs:user123:filename.pdf` -- GCS file encryption
- `download:user123:doc456` -- document download encryption

## Key Rotation

1. New key version assigned (increment `KODA_KEY_VERSION`)
2. Old key kept as `KODA_MASTER_KEY_V{n}_BASE64`
3. Background worker re-encrypts records batch-by-batch
4. `kv` field in payload tracks which version encrypted each record
5. Decryption reads `kv` to select correct key
6. After migration: old key env var removed

## Security Properties

- **Confidentiality**: AES-256-GCM encryption
- **Integrity**: GCM authentication tag
- **Authenticity**: AAD binds ciphertext to context (prevents copy-paste attacks)
- **Forward secrecy**: Key rotation limits exposure window
- **Non-reuse**: Random 12-byte IV per encryption operation
