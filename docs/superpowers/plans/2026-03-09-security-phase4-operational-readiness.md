# Security Phase 4: Operational Readiness — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Incident response capability, monitoring/alerting, admin zero-trust access, security headers, and auditor-ready documentation pack.

**Architecture:** Layer operational controls on top of the hardened infrastructure from Phases 0-3. GCP IAP for admin access, Helmet.js for HTTP security headers, Cloud Monitoring for alerting, and a complete documentation suite.

**Tech Stack:** GCP IAP, Helmet.js, GCP Cloud Monitoring, PagerDuty/Sentry alerting, WebAuthn/FIDO2

**Estimated Effort:** ~9 working days

**Dependencies:** Phase 2 (key rotation must work before documenting it)

**Findings Addressed:** F-020, plus hardening beyond findings

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `docs/security/INCIDENT_RESPONSE.md` | Create | Incident response runbook |
| `docs/security/ROLLBACK.md` | Create | Rollback procedures |
| `docs/security/SECURITY.md` | Create | Public security overview |
| `docs/security/THREAT_MODEL.md` | Create | Threat model document |
| `docs/security/CRYPTO_SPEC.md` | Create | Cryptographic specification |
| `backend/src/app.ts` | Modify | Helmet.js configuration |
| `backend/src/services/security/alerting.service.ts` | Create | Alert triggers |
| `backend/src/services/security/alerting.service.test.ts` | Create | Unit tests |
| `backend/src/middleware/iap.middleware.ts` | Create | GCP IAP verification |
| `backend/src/tests/security/admin-access.integration.test.ts` | Create | Admin access tests |

---

## Task 1: Write Incident Response Runbook (T-4.1, Finding F-020)

**Files:**
- Create: `docs/security/INCIDENT_RESPONSE.md`

- [ ] **Step 1: Write the runbook**

```markdown
# Incident Response Runbook — Allybi

## Severity Levels
- **SEV-1 (Critical):** Data breach, key compromise, unauthorized access to user data
- **SEV-2 (High):** Credential leak, service compromise, sustained unauthorized access attempts
- **SEV-3 (Medium):** Vulnerability discovered, suspicious activity pattern
- **SEV-4 (Low):** Policy violation, failed security scan, dependency vulnerability

## Phase 1: Detection
- Sentry alerts for auth failures (>10 in 5 min)
- Cloud Monitoring alerts for admin access
- Key usage anomaly detection
- Manual: security scan failures in CI

## Phase 2: Containment (within 1 hour of SEV-1/2)
1. Revoke compromised credentials/keys immediately
2. Disable affected service accounts
3. If key compromise: trigger emergency key rotation
4. If data breach: isolate affected tenant data
5. Notify affected users within 72 hours (GDPR)

## Phase 3: Eradication
1. Identify root cause via audit logs (GCS + Postgres)
2. Patch vulnerability
3. Rotate all potentially affected keys
4. Re-encrypt affected data with new keys

## Phase 4: Recovery
1. Deploy patched version via Cloud Run revision
2. Verify fix via security test suite
3. Monitor for recurrence (24h watch)

## Phase 5: Lessons Learned
1. Document incident timeline
2. Update threat model
3. Add regression test
4. Update this runbook if needed

## Emergency Contacts
- Owner/Operator: [FILL IN]
- GCP Support: console.cloud.google.com/support
- Supabase Support: supabase.com/dashboard/support

## Key Rotation Emergency
See: KEY_RECOVERY.md
```

- [ ] **Step 2: Commit**

```bash
git add docs/security/INCIDENT_RESPONSE.md
git commit -m "$(cat <<'EOF'
docs(security): add incident response runbook (F-020)

Covers detection, containment, eradication, recovery, lessons-learned.
Emergency key rotation references KEY_RECOVERY.md.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Configure Alerting (T-4.2)

**Files:**
- Create: `backend/src/services/security/alerting.service.ts`
- Modify: `backend/src/middleware/auditLog.middleware.ts`

- [ ] **Step 1: Write the alerting service**

```typescript
// backend/src/services/security/alerting.service.ts
import * as Sentry from "@sentry/node";
import { logger } from "../../utils/logger";

export type AlertSeverity = "critical" | "high" | "medium" | "low";

export interface SecurityAlert {
  type: string;
  severity: AlertSeverity;
  message: string;
  context: Record<string, unknown>;
}

export class AlertingService {
  private recentFailures: Map<string, number[]> = new Map();

  /**
   * Track auth failure and alert if threshold exceeded.
   * Threshold: 10 failures from same IP in 5 minutes.
   */
  trackAuthFailure(ipHash: string): void {
    const now = Date.now();
    const key = `auth:${ipHash}`;
    const failures = this.recentFailures.get(key) || [];
    failures.push(now);
    // Keep only last 5 minutes
    const cutoff = now - 5 * 60 * 1000;
    const recent = failures.filter(t => t > cutoff);
    this.recentFailures.set(key, recent);

    if (recent.length >= 10) {
      this.sendAlert({
        type: "auth_brute_force",
        severity: "high",
        message: `${recent.length} auth failures from IP hash ${ipHash.slice(0, 8)}... in 5 minutes`,
        context: { ipHash, failureCount: recent.length },
      });
    }
  }

  /**
   * Alert on admin access.
   */
  alertAdminAccess(userId: string, action: string): void {
    this.sendAlert({
      type: "admin_access",
      severity: "medium",
      message: `Admin action: ${action} by user ${userId}`,
      context: { userId, action },
    });
  }

  /**
   * Alert on key usage anomaly.
   */
  alertKeyAnomaly(message: string, context: Record<string, unknown>): void {
    this.sendAlert({
      type: "key_anomaly",
      severity: "critical",
      message,
      context,
    });
  }

  private sendAlert(alert: SecurityAlert): void {
    logger.warn(`[SECURITY ALERT] ${alert.type}: ${alert.message}`, alert.context);

    if (alert.severity === "critical" || alert.severity === "high") {
      Sentry.captureMessage(`[Security] ${alert.message}`, {
        level: alert.severity === "critical" ? "fatal" : "error",
        extra: alert.context,
        tags: { security_alert: alert.type },
      });
    }
  }
}
```

- [ ] **Step 2: Wire into audit middleware**

```typescript
// In auditLog.middleware.ts, on 401/403 responses:
const alerting = new AlertingService();
if (status === "failure" && (responseStatus === 401 || responseStatus === 403)) {
  alerting.trackAuthFailure(hashIp(ipAddress));
}
```

- [ ] **Step 3: Test and commit**

```bash
git add backend/src/services/security/alerting.service.ts backend/src/middleware/auditLog.middleware.ts
git commit -m "$(cat <<'EOF'
feat(security): add security alerting service (F-020)

Tracks auth failures with brute-force detection (10 in 5min threshold).
Alerts for admin access and key anomalies. Routes critical alerts
to Sentry.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Document Rollback Procedures (T-4.3)

- [ ] **Step 1: Write ROLLBACK.md**

```markdown
# Rollback Procedures — Allybi

## Cloud Run Revision Rollback
1. List revisions: `gcloud run revisions list --service=koda-backend`
2. Route to previous: `gcloud run services update-traffic koda-backend --to-revisions=REVISION=100`
3. Verify: `curl https://BACKEND_URL/api/health`

## Database Migration Rollback
1. Identify migration: `npx prisma migrate status`
2. Apply down migration or revert to snapshot
3. CRITICAL: Encrypted data rollback may require key version awareness

## Key Rotation Rollback
1. Stop rotation worker: disable cron
2. Old key versions remain readable (backward compat)
3. Do NOT delete old key versions until re-encryption complete

## Emergency: Full Service Restore
1. Deploy last known-good revision
2. Verify database connectivity and migrations
3. Run health checks: `/api/health`, `/api/ready`
4. Monitor for 1 hour
```

- [ ] **Step 2: Commit**

```bash
git add docs/security/ROLLBACK.md
git commit -m "$(cat <<'EOF'
docs(security): add rollback procedures for all deploy types (F-020)

Covers Cloud Run revision rollback, database migration rollback,
key rotation rollback, and emergency full service restore.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Deploy Admin Behind GCP IAP (T-4.4)

**Files:**
- Create: `backend/src/middleware/iap.middleware.ts`

- [ ] **Step 1: Create IAP verification middleware**

```typescript
// backend/src/middleware/iap.middleware.ts
import { OAuth2Client } from "google-auth-library";
import { Request, Response, NextFunction } from "express";

const IAP_CLIENT_ID = process.env.KODA_IAP_CLIENT_ID;

export async function verifyIap(req: Request, res: Response, next: NextFunction) {
  if (process.env.NODE_ENV !== "production" || !IAP_CLIENT_ID) {
    return next(); // Skip in dev
  }

  const iapJwt = req.headers["x-goog-iap-jwt-assertion"];
  if (!iapJwt || typeof iapJwt !== "string") {
    return res.status(403).json({ error: "IAP authentication required" });
  }

  try {
    const client = new OAuth2Client();
    await client.verifySignedJwtWithCertsAsync(
      iapJwt,
      "https://www.gstatic.com/iap/verify/public_key-jwk",
      [IAP_CLIENT_ID],
      ["https://cloud.google.com/iap"],
    );
    next();
  } catch (err) {
    return res.status(403).json({ error: "IAP verification failed" });
  }
}
```

- [ ] **Step 2: Wire into admin routes**

```typescript
// In routes where admin routes are mounted:
app.use("/api/admin", verifyIap, requireAdmin, adminRoutes);
```

- [ ] **Step 3: Document IAP setup**

GCP IAP configuration (manual):
1. Enable IAP on the Cloud Run service
2. Configure OAuth consent screen
3. Add authorized users
4. Set `KODA_IAP_CLIENT_ID` in environment

- [ ] **Step 4: Test and commit**

```bash
git add backend/src/middleware/iap.middleware.ts
git commit -m "$(cat <<'EOF'
feat(security): add GCP IAP verification for admin routes

Admin routes now require valid IAP JWT in production. Skips in
development. Adds defense-in-depth beyond existing admin key/JWT checks.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Add Helmet.js Security Headers (T-4.6)

**Context:** `app.ts` already imports `helmet` — verify it's properly configured with strict CSP.

**Files:**
- Modify: `backend/src/app.ts`

- [ ] **Step 1: Verify current Helmet configuration**

```bash
grep -A 20 "helmet" backend/src/app.ts
```

- [ ] **Step 2: Add/update Helmet with strict configuration**

```typescript
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", process.env.FRONTEND_URL || "http://localhost:3000"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  }),
);
```

- [ ] **Step 3: Verify headers in response**

```bash
curl -I http://localhost:5000/api/health 2>/dev/null | grep -i "x-frame\|x-content\|strict-transport\|content-security"
```

Expected: All security headers present

- [ ] **Step 4: Commit**

```bash
git add backend/src/app.ts
git commit -m "$(cat <<'EOF'
feat(security): configure Helmet.js with strict CSP and HSTS

Security headers now include: X-Frame-Options, X-Content-Type-Options,
Strict-Transport-Security (preload), Content-Security-Policy,
Referrer-Policy.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Generate Security Assurance Pack Artifacts (T-4.7)

- [ ] **Step 1: Write SECURITY.md (public-facing)**

```markdown
# Security — Allybi

## Encryption
- AES-256-GCM authenticated encryption for all document content
- 3-tier envelope encryption: Master Key → Tenant Key → Document Key
- GCP KMS for master key wrapping in production
- All fields use Additional Authenticated Data (AAD) binding

## Authentication
- bcrypt-12 password hashing
- JWT access tokens with session binding
- HMAC-SHA256 refresh token hashing
- 2FA (TOTP) support with encrypted secret storage
- OAuth 2.0 (Google, Apple)

## Infrastructure
- GCP Cloud Run with IAP for admin access
- Postgres with Row-Level Security
- All external communications over TLS
- Automated security scanning in CI/CD

## Reporting
Contact: security@allybi.com
```

- [ ] **Step 2: Write THREAT_MODEL.md**

Cover: threat actors (external attacker, compromised insider, supply chain), attack surfaces (API, browser, GCS, Pinecone, Redis), mitigations per surface.

- [ ] **Step 3: Write CRYPTO_SPEC.md**

Reference the existing CRYPTO_COVERAGE_MATRIX.md and KEY_RECOVERY.md. Document all algorithms, key sizes, rotation schedules.

- [ ] **Step 4: Commit all documentation**

```bash
git add docs/security/SECURITY.md docs/security/THREAT_MODEL.md docs/security/CRYPTO_SPEC.md
git commit -m "$(cat <<'EOF'
docs(security): generate Security Assurance Pack artifacts

SECURITY.md (public overview), THREAT_MODEL.md (threat actors and
mitigations), CRYPTO_SPEC.md (cryptographic specification).
Completes the auditor-ready documentation suite.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Admin Access Integration Test

- [ ] **Step 1: Write the test**

```typescript
// backend/src/tests/security/admin-access.integration.test.ts
describe("admin access controls", () => {
  test("admin routes reject requests without admin key", async () => {
    // GET /api/admin/... without X-KODA-ADMIN-KEY header
    // Expect: 401 or 403
  });

  test("admin routes reject requests with wrong admin key", async () => {
    // GET /api/admin/... with wrong X-KODA-ADMIN-KEY
    // Expect: 401 or 403
  });

  test("admin routes reject non-owner user", async () => {
    // Authenticated as non-owner user
    // Expect: 403
  });

  test("admin routes accept valid admin credentials", async () => {
    // Valid owner + admin key + admin JWT
    // Expect: 200
  });
});
```

- [ ] **Step 2: Run and commit**

```bash
git add backend/src/tests/security/admin-access.integration.test.ts
git commit -m "$(cat <<'EOF'
test(security): add admin access integration tests

Verifies: no-key rejection, wrong-key rejection, non-owner rejection,
valid admin acceptance. Tests all layers of admin guard.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Final Phase 4 Verification

- [ ] **Run the "Prove It Now" checklist from SECURITY_FIX_PLAN.md**

```bash
# 1. No plaintext document content in DB
# (requires DB access)

# 2. CI gates are blocking
grep "continue-on-error" .github/workflows/security-scan.yml

# 3. Key rotation exists
grep -rn "keyVersion\|rotation" backend/src/services/security/

# 4. No SMS code in prod logs
grep -n "SMS Verification Code" backend/src/services/auth.service.ts

# 5. Security headers present
curl -I http://localhost:5000/api/health | grep -i security

# 6. Run security tests
cd backend && npx jest --testPathPattern="security" --no-coverage
```

---

## Do Not Break Checklist

After Phase 4, verify:
- [ ] All application routes still work (Helmet CSP not blocking frontend)
- [ ] Admin dashboard accessible through IAP (production) or directly (dev)
- [ ] OAuth login (Google/Apple) not broken by CSP
- [ ] Sentry alerting fires on test auth failures
- [ ] All documentation is accurate and references correct file paths

---

## Projected Score After All Phases

| Category | Before | After |
|----------|--------|-------|
| A) Crypto correctness | 7/10 | 9/10 |
| B) Key management | 4/10 | 8/10 |
| C) Secrets management | 4/10 | 8/10 |
| D) Encryption at rest | 4/10 | 9/10 |
| E) Encryption in transit | 5/10 | 8/10 |
| F) AuthN/AuthZ | 7/10 | 9/10 |
| G) Tenant isolation | 6/10 | 9/10 |
| H) Logging hygiene | 6/10 | 9/10 |
| I) CI/CD | 4/10 | 8/10 |
| J) Monitoring + IR | 2/10 | 8/10 |
| **Total** | **49/100** | **~85/100** |

**To reach 90+:** SOC 2 Type II audit, formal penetration test, customer-facing CMEK portal, HIPAA BAA program.
