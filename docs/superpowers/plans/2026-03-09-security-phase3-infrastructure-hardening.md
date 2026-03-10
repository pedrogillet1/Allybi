# Security Phase 3: Infrastructure Hardening — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Database-level tenant isolation, immutable audit logs, session cleanup, audit PII encryption, backup automation, unified password hashing, CI security gates.

**Architecture:** Postgres RLS policies enforce per-user row isolation at the database layer (defense-in-depth behind application-layer filtering). Audit logs move to append-only GCS bucket. Session cleanup via scheduled cron. CI pipeline gains npm audit, SBOM, and container scanning.

**Tech Stack:** PostgreSQL RLS, GCS retention locks, bcrypt, GitHub Actions, Trivy, CycloneDX

**Estimated Effort:** ~9 working days

**Dependencies:** Phase 0 (CI gates must be blocking first)

**Findings Addressed:** F-011, F-016, F-017, F-018, F-021, F-023

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `backend/prisma/migrations/YYYYMMDD_real_rls_policies/` | Create | Per-user RLS policies |
| `backend/prisma/schema.prisma` | Modify | Annotations for RLS-enabled tables |
| `backend/src/middleware/auditLog.middleware.ts` | Modify | Write to append-only GCS + encrypt PII |
| `backend/src/services/security/auditStore.service.ts` | Create | GCS append-only audit writer |
| `backend/src/services/security/auditStore.service.test.ts` | Create | Unit tests |
| `backend/src/queues/workers/sessionCleanup.worker.ts` | Create | Hard-delete expired sessions |
| `backend/src/utils/password.ts` | Modify | Remove dual-hashing paths |
| `backend/src/bootstrap/authBridge.ts` | Modify | Unify to standard bcrypt |
| `.github/workflows/security-scan.yml` | Modify | Add npm audit, SBOM, Trivy |
| `backend/src/tests/security/cross-tenant-access.test.ts` | Create | RLS verification test |

---

## Task 1: Implement Per-User RLS Policies (T-3.1, Finding F-011)

**Context:** RLS is enabled on 73 tables but with `USING (true)` — effectively no isolation. Replace with real per-user policies.

**Files:**
- Create: Prisma migration with SQL RLS policies

- [ ] **Step 1: Write the cross-tenant access test first**

```typescript
// backend/src/tests/security/cross-tenant-access.test.ts
import { describe, expect, test, beforeAll, afterAll } from "@jest/globals";

/**
 * Cross-tenant access test
 *
 * Tests that Postgres RLS policies prevent User A from accessing User B's data.
 * This test requires a real database connection with RLS policies applied.
 *
 * NOTE: This is an integration test — requires database access.
 * Run separately: npx jest src/tests/security/cross-tenant-access.test.ts
 */
describe("Cross-tenant RLS isolation", () => {
  // These tests verify that:
  // 1. User A can only see their own documents
  // 2. User A cannot see User B's documents
  // 3. Service role can see all documents (for admin/worker operations)

  test("placeholder: RLS policies block cross-user document access", () => {
    // Implementation depends on being able to set the Postgres session variable
    // SET app.current_user_id = 'user-a-id';
    // SELECT * FROM documents; -- should only return User A's docs
    expect(true).toBe(true); // Placeholder until RLS migration exists
  });
});
```

- [ ] **Step 2: Create the RLS migration**

Create a raw SQL migration that:

1. Creates a function to get current user from session variable:
```sql
CREATE OR REPLACE FUNCTION current_app_user_id() RETURNS TEXT AS $$
  SELECT current_setting('app.current_user_id', true);
$$ LANGUAGE sql STABLE;
```

2. Drops the existing permissive policies:
```sql
DROP POLICY IF EXISTS service_role_all ON documents;
```

3. Creates real per-user policies on key tables:
```sql
-- Documents: users can only see their own
CREATE POLICY user_isolation ON documents
  FOR ALL
  TO authenticated_role
  USING (user_id = current_app_user_id());

-- Service role retains full access for admin/workers
CREATE POLICY service_full_access ON documents
  FOR ALL
  TO service_role
  USING (true);
```

4. Apply same pattern to: `documents`, `document_metadata`, `document_chunks`, `document_embeddings`, `conversations`, `messages`, `sessions`, `folders`, `connector_tokens`, `two_factor_auth`

- [ ] **Step 3: Update Prisma client initialization to set session variable**

In the request middleware or Prisma client extension, set the user ID:

```typescript
// Before each query in authenticated context:
await prisma.$executeRaw`SELECT set_config('app.current_user_id', ${userId}, true)`;
```

- [ ] **Step 4: Update cross-tenant test with real assertions, run tests**

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/migrations/ backend/src/tests/security/cross-tenant-access.test.ts
git commit -m "$(cat <<'EOF'
feat(security): implement per-user RLS policies (F-011)

Replace USING(true) with real user isolation on 10 tables.
Session variable app.current_user_id set per-request.
Service role retains full access for admin/worker operations.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Move Audit Logs to Append-Only Store (T-3.2, Finding F-016)

**Context:** Audit logs are in Postgres and can be deleted by anyone with DB access. Move to GCS with retention lock.

**Files:**
- Create: `backend/src/services/security/auditStore.service.ts`
- Modify: `backend/src/middleware/auditLog.middleware.ts`

- [ ] **Step 1: Write the audit store service**

```typescript
// backend/src/services/security/auditStore.service.ts
import { Storage } from "@google-cloud/storage";

const AUDIT_BUCKET = process.env.KODA_AUDIT_BUCKET || "koda-audit-logs";

export class AuditStoreService {
  private storage: Storage;

  constructor() {
    this.storage = new Storage();
  }

  async writeAuditEntry(entry: {
    timestamp: string;
    userId: string;
    action: string;
    resource: string;
    ipHash: string;  // Hashed IP, not raw
    status: string;
    details: Record<string, unknown>;
  }): Promise<void> {
    const date = new Date().toISOString().slice(0, 10);
    const filename = `audit/${date}/${entry.userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.json`;
    const file = this.storage.bucket(AUDIT_BUCKET).file(filename);
    await file.save(JSON.stringify(entry), {
      contentType: "application/json",
      resumable: false,
    });
  }
}
```

- [ ] **Step 2: Modify auditLog middleware to write to GCS**

```typescript
// In auditLog.middleware.ts, after writing to Prisma (keep as cache):
if (process.env.NODE_ENV === "production") {
  const auditStore = new AuditStoreService();
  await auditStore.writeAuditEntry({
    timestamp: new Date().toISOString(),
    userId: userId || "anonymous",
    action,
    resource,
    ipHash: hashIp(ipAddress),  // Hash before storing
    status,
    details,
  }).catch(err => logger.error("Audit GCS write failed", err));
}
```

- [ ] **Step 3: Configure GCS bucket with retention lock**

Document the GCS bucket setup (manual or Terraform):
```bash
# Create bucket with retention lock
gsutil mb gs://koda-audit-logs
gsutil retention set 365d gs://koda-audit-logs
gsutil retention lock gs://koda-audit-logs
```

- [ ] **Step 4: Test and commit**

```bash
git add backend/src/services/security/auditStore.service.ts backend/src/middleware/auditLog.middleware.ts
git commit -m "$(cat <<'EOF'
feat(security): move audit logs to append-only GCS bucket (F-016)

Audit entries written to GCS bucket with retention lock in production.
Postgres table retained as queryable cache. IP addresses hashed before
storage.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Add Session Hard-Deletion Scheduler (T-3.3, Finding F-017)

**Files:**
- Create: `backend/src/queues/workers/sessionCleanup.worker.ts`

- [ ] **Step 1: Implement the cleanup cron**

```typescript
// backend/src/queues/workers/sessionCleanup.worker.ts
import cron from "node-cron";
import prisma from "../../config/database";
import { logger } from "../../utils/logger";

/**
 * Hard-delete expired sessions older than 30 days.
 * Runs daily at 2 AM.
 */
export function startSessionCleanupCron(): void {
  cron.schedule("0 2 * * *", async () => {
    try {
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const result = await prisma.session.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: cutoff } },
            { isActive: false, updatedAt: { lt: cutoff } },
          ],
        },
      });
      logger.info(`[SessionCleanup] Deleted ${result.count} expired sessions`);
    } catch (err) {
      logger.error("[SessionCleanup] Failed", err);
    }
  });
}
```

- [ ] **Step 2: Wire into worker startup**

- [ ] **Step 3: Test and commit**

```bash
git add backend/src/queues/workers/sessionCleanup.worker.ts
git commit -m "$(cat <<'EOF'
feat(security): add daily session hard-deletion cron (F-017)

Expired sessions older than 30 days are hard-deleted daily at 2 AM.
Cleans up both expired and deactivated sessions.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Encrypt Audit PII (T-3.4, Finding F-018)

**Files:**
- Modify: `backend/src/middleware/auditLog.middleware.ts`

- [ ] **Step 1: Hash IP addresses before storage**

```typescript
import crypto from "crypto";

function hashIp(ip: string): string {
  const salt = process.env.KODA_AUDIT_SALT || "audit-ip-salt";
  return crypto.createHmac("sha256", salt).update(ip).digest("hex").slice(0, 16);
}

// In the audit log creation:
// BEFORE: ipAddress: req.ip
// AFTER:  ipAddress: hashIp(req.ip || "unknown")
```

- [ ] **Step 2: Test and commit**

```bash
git add backend/src/middleware/auditLog.middleware.ts
git commit -m "$(cat <<'EOF'
fix(security): hash IP addresses in audit logs (F-018)

IP addresses are now HMAC-SHA256 hashed before writing to audit log.
Preserves ability to detect patterns (same hash = same IP) without
storing raw PII.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Enable GCS Bucket Versioning + Retention (T-3.5, Finding F-019)

- [ ] **Step 1: Document the GCS configuration steps**

This is a manual/Terraform step, not a code change. Document in `docs/security/BACKUP_SETUP.md`:

```markdown
# Backup Setup

## GCS Bucket Configuration
1. Enable versioning: `gsutil versioning set on gs://BUCKET_NAME`
2. Set retention: `gsutil retention set 90d gs://BUCKET_NAME`
3. Lock retention: `gsutil retention lock gs://BUCKET_NAME`
4. Verify: `gsutil retention get gs://BUCKET_NAME`

## Database Backups
- Supabase managed backups: verify schedule in Supabase dashboard
- Consider pg_dump for additional local backups
```

- [ ] **Step 2: Commit**

```bash
git add docs/security/BACKUP_SETUP.md
git commit -m "$(cat <<'EOF'
docs(security): add backup setup guide for GCS + database (F-019)

Documents GCS bucket versioning, retention lock configuration,
and database backup verification steps.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Unify Password Hashing (T-3.6, Finding F-021)

**Context:** `password.ts` uses `bcrypt(password + salt)` while `authBridge.ts` has a different hashing path. Unify to a single standard bcrypt approach.

**Files:**
- Modify: `backend/src/utils/password.ts`
- Modify: `backend/src/bootstrap/authBridge.ts`

- [ ] **Step 1: Audit both hashing paths**

```bash
grep -n "bcrypt\|hashPassword\|verifyPassword" backend/src/utils/password.ts backend/src/bootstrap/authBridge.ts
```

- [ ] **Step 2: Standardize on bcrypt-12 with built-in salt**

The cleanest approach is to use bcrypt's built-in salt generation (standard practice) rather than `password + custom_salt`:

```typescript
// Standard bcrypt (password.ts):
export async function hashPassword(password: string): Promise<{ hash: string }> {
  const hash = await bcrypt.hash(password, 12);
  return { hash };
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
```

**IMPORTANT:** This requires a migration strategy — existing users have hashes with the `password + salt` format. Add a migration-on-login approach:

```typescript
// On successful login with old format, re-hash with new format
if (user.salt && await bcrypt.compare(password + user.salt, user.passwordHash)) {
  // Migrate to new format
  const { hash } = await hashPassword(password);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hash, salt: null } });
  return true;
}
```

- [ ] **Step 3: Test and commit**

```bash
git add backend/src/utils/password.ts backend/src/bootstrap/authBridge.ts
git commit -m "$(cat <<'EOF'
fix(security): unify password hashing to standard bcrypt-12 (F-021)

Single hashing path using bcrypt with built-in salt. Legacy users
with custom salt are migrated on next login. No disruption to
existing sessions.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Add npm audit + SBOM + Image Scanning to CI (T-3.7, Finding F-023)

**Files:**
- Modify: `.github/workflows/security-scan.yml`

- [ ] **Step 1: Add npm audit step**

```yaml
      - name: npm audit (high/critical)
        run: npm audit --audit-level=high --omit=dev
```

- [ ] **Step 2: Add SBOM generation**

```yaml
      - name: Generate SBOM
        run: npx @cyclonedx/cyclonedx-npm --output-file sbom.json
      - name: Upload SBOM artifact
        uses: actions/upload-artifact@v4
        with:
          name: sbom
          path: backend/sbom.json
```

- [ ] **Step 3: Add container image scanning (if Dockerfile exists)**

```yaml
      - name: Trivy container scan
        if: hashFiles('backend/Dockerfile') != ''
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'fs'
          scan-ref: 'backend/'
          severity: 'CRITICAL,HIGH'
          exit-code: '1'
```

- [ ] **Step 4: Verify and commit**

```bash
git add .github/workflows/security-scan.yml
git commit -m "$(cat <<'EOF'
feat(ci): add npm audit, SBOM generation, and Trivy scanning (F-023)

Security pipeline now includes:
- npm audit (blocks on high/critical)
- CycloneDX SBOM generation (uploaded as artifact)
- Trivy filesystem scan for vulnerabilities

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Do Not Break Checklist

After Phase 3, verify:
- [ ] All existing queries still work with RLS policies (test every route)
- [ ] Admin dashboard still accessible (service_role bypasses RLS)
- [ ] BullMQ workers still process jobs (service_role)
- [ ] Login works with both old (salt) and new (standard bcrypt) password formats
- [ ] Audit logs still queryable from Postgres (cache) and durable in GCS
- [ ] CI pipeline completes without false positive blocks
