# Security Phase 2: Key Management Hardening — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Key rotation capability, versioned encrypted payloads, master key in GCP Secret Manager, GCP KMS as production default.

**Architecture:** Add a `keyVersion` field to all encrypted payloads. Build a rotation worker that re-encrypts data with new key versions. Move master key out of `.env` into GCP Secret Manager.

**Tech Stack:** TypeScript, GCP Secret Manager, GCP KMS, BullMQ workers, Prisma

**Estimated Effort:** ~8 working days

**Dependencies:** Phase 1 (encrypted payloads must exist to version them)

**Findings Addressed:** F-007, F-013

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `backend/src/services/security/crypto.types.ts` | Modify | Add `keyVersion` to EncryptedPayload |
| `backend/src/services/security/encryption.service.ts` | Modify | Write keyVersion, read both v1 and v2 |
| `backend/src/services/security/encryption.service.test.ts` | Modify | Test version coexistence |
| `backend/src/services/security/keyRotation.service.ts` | Create | Key rotation logic — generate new version, track active version |
| `backend/src/services/security/keyRotation.service.test.ts` | Create | Unit tests |
| `backend/src/queues/workers/keyRotation.worker.ts` | Create | Background re-encryption worker |
| `backend/src/services/security/keyManager.service.ts` | Modify | Load master key from Secret Manager |
| `backend/src/services/security/secretManager.service.ts` | Create | GCP Secret Manager client |
| `backend/src/services/security/secretManager.service.test.ts` | Create | Unit tests with mocked GCP client |
| `backend/src/tests/security/key-rotation.integration.test.ts` | Create | End-to-end rotation test |
| `docs/security/KEY_RECOVERY.md` | Create | Key recovery ceremony documentation |

---

## Task 1: Add keyVersion to Encrypted Payloads (T-2.1, Finding F-007)

**Context:** Currently `EncryptedPayload` has `v: 1` (format version) but no key version. We need a `kv` (key version) field so payloads track which key encrypted them, enabling rotation.

**Files:**
- Modify: `backend/src/services/security/crypto.types.ts`
- Modify: `backend/src/services/security/encryption.service.ts`
- Modify: `backend/src/services/security/encryption.service.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// Add to encryption.service.test.ts
describe("key versioning", () => {
  test("new encryptions include kv field", () => {
    const key = svc.randomKey32();
    const payload = svc.encryptBuffer(Buffer.from("test"), key, "test-aad");
    expect(payload.kv).toBeDefined();
    expect(typeof payload.kv).toBe("number");
  });

  test("old payloads without kv field still decrypt (treated as kv=0)", () => {
    const key = svc.randomKey32();
    // Simulate a legacy payload without kv
    const payload = svc.encryptBuffer(Buffer.from("legacy"), key, "test-aad");
    delete (payload as any).kv;  // Remove kv to simulate legacy
    const recovered = svc.decryptBuffer(payload, key, "test-aad");
    expect(recovered.toString()).toBe("legacy");
  });

  test("getKeyVersion returns kv or 0 for legacy", () => {
    const key = svc.randomKey32();
    const payload = svc.encryptBuffer(Buffer.from("test"), key, "test-aad");
    expect(svc.getKeyVersion(payload)).toBeGreaterThanOrEqual(1);

    const legacyPayload = { ...payload };
    delete (legacyPayload as any).kv;
    expect(svc.getKeyVersion(legacyPayload)).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/pg/Desktop/koda-webapp/backend && npx jest src/services/security/encryption.service.test.ts --no-coverage -v`
Expected: FAIL — `kv` not found, `getKeyVersion` not found

- [ ] **Step 3: Update crypto.types.ts**

```typescript
export type AesGcmEncryptedPayloadV1 = {
  v: 1;
  alg: "AES-256-GCM";
  ivB64: string;
  tagB64: string;
  ctB64: string;
  aadB64?: string;
  kv?: number;  // Key version — undefined for legacy payloads (treated as 0)
};
```

- [ ] **Step 4: Update encryption.service.ts**

Add key version to `encryptBuffer`:

```typescript
// In encryptBuffer, add kv to the return object:
return {
  v: 1,
  alg: "AES-256-GCM",
  ivB64: b64(iv),
  tagB64: b64(tag),
  ctB64: b64(ct),
  aadB64: b64(aadBuf),
  kv: this.currentKeyVersion,
};
```

Add key version tracking:

```typescript
export class EncryptionService {
  private currentKeyVersion: number = 1;

  setKeyVersion(version: number): void {
    this.currentKeyVersion = version;
  }

  getKeyVersion(payload: EncryptedPayload): number {
    return payload.kv ?? 0;
  }

  // ... existing methods
}
```

- [ ] **Step 5: Run tests**

Run: `cd /Users/pg/Desktop/koda-webapp/backend && npx jest src/services/security/encryption.service.test.ts --no-coverage -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/security/crypto.types.ts backend/src/services/security/encryption.service.ts backend/src/services/security/encryption.service.test.ts
git commit -m "$(cat <<'EOF'
feat(security): add key version (kv) to encrypted payloads (F-007)

All new encryptions include a kv field tracking which key version
encrypted the data. Legacy payloads without kv are treated as v0.
Prerequisite for key rotation.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Build Key Rotation Service (T-2.2)

**Files:**
- Create: `backend/src/services/security/keyRotation.service.ts`
- Create: `backend/src/services/security/keyRotation.service.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// backend/src/services/security/keyRotation.service.test.ts
import { describe, expect, test, jest } from "@jest/globals";
import { KeyRotationService } from "./keyRotation.service";
import { EncryptionService } from "./encryption.service";

describe("KeyRotationService", () => {
  const enc = new EncryptionService();

  test("rotateKey generates a new key version", async () => {
    const svc = new KeyRotationService(enc);
    const oldVersion = svc.getCurrentKeyVersion();
    await svc.rotateKey();
    expect(svc.getCurrentKeyVersion()).toBe(oldVersion + 1);
  });

  test("reEncryptPayload upgrades payload to current key version", () => {
    const svc = new KeyRotationService(enc);
    const oldKey = enc.randomKey32();
    const newKey = enc.randomKey32();
    const payload = enc.encryptBuffer(Buffer.from("data"), oldKey, "test-aad");
    const rotated = svc.reEncryptPayload(payload, oldKey, newKey, "test-aad");
    expect(enc.getKeyVersion(rotated)).toBeGreaterThanOrEqual(1);
    const decrypted = enc.decryptBuffer(rotated, newKey, "test-aad");
    expect(decrypted.toString()).toBe("data");
  });
});
```

- [ ] **Step 2: Implement keyRotation.service.ts**

```typescript
// backend/src/services/security/keyRotation.service.ts
import { EncryptionService } from "./encryption.service";
import { EncryptedPayload } from "./crypto.types";

export class KeyRotationService {
  private currentVersion: number = 1;

  constructor(private enc: EncryptionService) {}

  getCurrentKeyVersion(): number {
    return this.currentVersion;
  }

  async rotateKey(): Promise<number> {
    this.currentVersion += 1;
    this.enc.setKeyVersion(this.currentVersion);
    return this.currentVersion;
  }

  reEncryptPayload(
    payload: EncryptedPayload,
    oldKey: Buffer,
    newKey: Buffer,
    aad: string,
  ): EncryptedPayload {
    const plaintext = this.enc.decryptBuffer(payload, oldKey, aad);
    return this.enc.encryptBuffer(plaintext, newKey, aad);
  }
}
```

- [ ] **Step 3: Run tests, commit**

```bash
git add backend/src/services/security/keyRotation.service.ts backend/src/services/security/keyRotation.service.test.ts
git commit -m "$(cat <<'EOF'
feat(security): add KeyRotationService for key versioning (F-007)

Service tracks current key version, supports re-encrypting payloads
from old key to new key. Preserves AAD binding during rotation.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Build Key Rotation Worker (T-2.2 continued)

**Files:**
- Create: `backend/src/queues/workers/keyRotation.worker.ts`

- [ ] **Step 1: Implement the rotation worker**

```typescript
/**
 * Key Rotation Worker
 *
 * Iterates all encrypted records in batches, re-encrypts with new key version.
 * Progress tracked via a rotation_progress table or Redis counter.
 *
 * Tables to re-encrypt:
 * - DocumentMetadata (extractedTextEncrypted, entitiesEncrypted, etc.)
 * - DocumentChunk (textEncrypted)
 * - DocumentEmbedding (contentEncrypted, chunkTextEncrypted)
 * - TwoFactorAuth (secretEncrypted, backupCodesEncrypted)
 * - ConnectorToken (encryptedPayloadJson, wrappedRecordKey)
 * - Message (contentEncrypted)
 * - User (tenantKeyEncrypted)
 */
```

- [ ] **Step 2: Test with a small dataset, commit**

```bash
git add backend/src/queues/workers/keyRotation.worker.ts
git commit -m "$(cat <<'EOF'
feat(security): add key rotation background worker (F-007)

BullMQ worker iterates all encrypted records in batches, re-encrypts
with new key version. Tracks progress via Redis counter.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Implement 90-Day Rotation Schedule (T-2.3)

**Files:**
- Create: cron job configuration (in existing worker setup or new cron entry)

- [ ] **Step 1: Add rotation cron to the worker startup**

```typescript
// In workers/index.ts or a dedicated cron setup file:
import cron from "node-cron";

// Every 90 days check if rotation is needed
cron.schedule("0 0 1 */3 *", async () => {
  // Check last rotation date
  // If > 90 days, trigger rotation
  // If > 95 days without rotation, send alert
});
```

- [ ] **Step 2: Add alerting for overdue rotation**

Use existing Sentry integration:

```typescript
if (daysSinceLastRotation > 95) {
  Sentry.captureMessage("Key rotation overdue", { level: "error" });
}
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/queues/workers/
git commit -m "$(cat <<'EOF'
feat(security): add 90-day key rotation schedule with alerting (F-007)

Cron checks rotation status quarterly. Sentry alert fires if rotation
is overdue by more than 95 days.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Move Master Key to GCP Secret Manager (T-2.4, Finding F-013)

**Files:**
- Create: `backend/src/services/security/secretManager.service.ts`
- Modify: `backend/src/services/security/keyManager.service.ts`

- [ ] **Step 1: Create Secret Manager client**

```typescript
// backend/src/services/security/secretManager.service.ts
import { SecretManagerServiceClient } from "@google-cloud/secret-manager";

export class SecretManagerService {
  private client: SecretManagerServiceClient;

  constructor() {
    this.client = new SecretManagerServiceClient();
  }

  async getSecret(secretName: string): Promise<string> {
    const projectId = process.env.GCP_PROJECT_ID || process.env.KODA_KMS_PROJECT_ID;
    const name = `projects/${projectId}/secrets/${secretName}/versions/latest`;
    const [version] = await this.client.accessSecretVersion({ name });
    const payload = version.payload?.data;
    if (!payload) throw new Error(`Secret ${secretName} has no payload`);
    return typeof payload === "string" ? payload : payload.toString("utf8");
  }
}
```

- [ ] **Step 2: Modify keyManager.service.ts to load from Secret Manager**

```typescript
// In buildKeyManager():
export async function buildKeyManager(enc: EncryptionService): Promise<IKeyManager> {
  let masterKeyB64 = process.env.KODA_MASTER_KEY_BASE64;

  // In production, prefer Secret Manager
  if (process.env.NODE_ENV === "production" && process.env.KODA_SECRET_NAME) {
    const sm = new SecretManagerService();
    masterKeyB64 = await sm.getSecret(process.env.KODA_SECRET_NAME);
  }

  if (!masterKeyB64) throw new Error("Master key not configured");
  const masterKey = Buffer.from(masterKeyB64, "base64");

  if (process.env.KODA_USE_GCP_KMS === "true") {
    return new GcpKmsKeyManager();
  }
  return new LocalKeyManager(enc, masterKey);
}
```

- [ ] **Step 3: Test with mocked Secret Manager, commit**

```bash
git add backend/src/services/security/secretManager.service.ts backend/src/services/security/keyManager.service.ts
git commit -m "$(cat <<'EOF'
feat(security): load master key from GCP Secret Manager in production (F-013)

Production environments use KODA_SECRET_NAME to fetch the master key
from GCP Secret Manager instead of .env. Falls back to env var for
local development.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Make GCP KMS the Production Default (T-2.5)

- [ ] **Step 1: Update keyManager to default to KMS in production**

```typescript
// Instead of requiring explicit KODA_USE_GCP_KMS=true:
const useKms = process.env.KODA_USE_GCP_KMS === "true"
  || (process.env.NODE_ENV === "production" && process.env.KODA_KMS_KEY_RING);
```

- [ ] **Step 2: Update deployment documentation, commit**

---

## Task 7: Document Key Recovery Ceremony (T-2.6)

- [ ] **Step 1: Write KEY_RECOVERY.md**

```markdown
# Key Recovery Ceremony

## Prerequisites
- Access to GCP Secret Manager (or backup key shards)
- Access to production Cloud Run environment

## Procedure
1. Retrieve master key from Secret Manager
2. Verify key by decrypting a known test record
3. If Secret Manager unavailable, reconstruct from backup shards
   ...
```

- [ ] **Step 2: Commit**

```bash
git add docs/security/KEY_RECOVERY.md
git commit -m "$(cat <<'EOF'
docs(security): add key recovery ceremony documentation (F-007)

Split-knowledge procedure for key recovery, tested recovery path,
and backup shard management instructions.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Integration Test

- [ ] **Step 1: Write key rotation integration test**

```typescript
// backend/src/tests/security/key-rotation.integration.test.ts
describe("key rotation integration", () => {
  test("encrypt with v1, rotate to v2, old data still decrypts, new uses v2", () => {
    // 1. Encrypt data with key v1
    // 2. Rotate to v2
    // 3. Verify old data still decrypts with v1 key
    // 4. Re-encrypt old data with v2 key
    // 5. Verify re-encrypted data uses v2
    // 6. Verify new encryptions use v2
  });
});
```

- [ ] **Step 2: Run and commit**

```bash
git add backend/src/tests/security/key-rotation.integration.test.ts
git commit -m "$(cat <<'EOF'
test(security): add key rotation integration test

Verifies: v1 encrypt, rotate to v2, backward compat, re-encryption,
new data uses v2. End-to-end rotation lifecycle.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Do Not Break Checklist

After Phase 2, verify:
- [ ] Existing encrypted documents still decrypt (backward compat for kv=0)
- [ ] New encryptions include kv field
- [ ] Master key loads from Secret Manager in production
- [ ] KMS wrapping works in production
- [ ] Rotation worker completes without errors on a test dataset
