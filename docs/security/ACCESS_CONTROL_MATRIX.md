# Access Control Matrix — Allybi Security Assurance Pack

**Generated**: 2026-03-09

---

## Actors

| Actor | Auth Mechanism | Enforcement File |
|-------|---------------|-----------------|
| Anonymous | None | N/A |
| Authenticated User | JWT (`authenticateToken` middleware) | `auth.middleware.ts` |
| Admin | Admin JWT + API key + owner ID + IP allowlist | `requireAdmin.guard.ts`, `adminKey.middleware.ts` |
| Service Role (DB) | Postgres `service_role` | Migration SQL |
| Worker (BullMQ) | Implicit (same process / Redis queue) | No explicit auth |
| OAuth Integration | Provider-specific callback | `auth.routes.ts` |

---

## Route × Auth Matrix

### Public Routes (No Auth Required)

| Route | Method | Middleware | Rate Limited | Purpose |
|-------|--------|-----------|-------------|---------|
| `/api/health` | GET | None | No | Health check |
| `/api/ready` | GET | None | No | Readiness check |
| `/api/health/retrieval` | GET | None | No | Retrieval health |
| `/api/health/queue` | GET | None | No | Queue stats |
| `/api/version` | GET | None | No | Version info |
| `/api/auth/signup` | POST | `authLimiter` + `validate` | Yes (100/15min) | Registration |
| `/api/auth/register` | POST | `authLimiter` + `validate` | Yes | Registration alias |
| `/api/auth/login` | POST | `authLimiter` + `validate` | Yes | Login |
| `/api/auth/refresh` | POST | `authLimiter` + `validate` | Yes | Token refresh |
| `/api/auth/pending/*` | POST | `authLimiter` | Yes | Pending user verification |
| `/api/auth/forgot-password` | POST | `authLimiter` | Yes | Password reset init |
| `/api/auth/verify-reset-code` | POST | `twoFactorLimiter` | Yes | OTP verify |
| `/api/auth/reset-password` | POST | `authLimiter` | Yes | Password reset |
| `/api/auth/google` | GET | `authLimiter` | Yes | Google OAuth init |
| `/api/auth/google/callback` | GET | Passport | No | Google OAuth callback |
| `/api/auth/apple` | GET | `authLimiter` | Yes | Apple OAuth init |
| `/api/auth/apple/callback` | POST | `authLimiter` | Yes | Apple OAuth callback |
| `/api/auth/logout` | POST | `optionalAuth` | No | Logout |
| `/api/auth/health` | GET | None | No | Auth health |
| `/api/recovery-verification/*` | POST | `authLimiter` | Yes | Recovery flow |

### Authenticated Routes (JWT Required)

| Route Prefix | Method(s) | Middleware | Resource Scoping | Test Exists? |
|-------------|-----------|-----------|-----------------|-------------|
| `/api/auth/me` | GET | `authenticateToken` | Own user only | UNKNOWN |
| `/api/auth/session/bootstrap` | GET | `authenticateToken` | Own user only | UNKNOWN |
| `/api/auth/verify/*` | POST | `authenticateToken` | Own user (req.user.id) | UNKNOWN |
| `/api/auth/2fa/*` | POST | `authenticateToken` | Own user (req.user.id) | `security-auth.cert.test.ts` |
| `/api/chat/*` | ALL | `authenticateToken` | userId from JWT | `chat.test.ts` |
| `/api/documents/*` | ALL | `authMiddleware` | userId filtering per query | UNKNOWN |
| `/api/presigned-urls/*` | ALL | `authMiddleware` + `presignedUrlLimiter` | userId from JWT | UNKNOWN |
| `/api/multipart-upload/*` | ALL | `authMiddleware` | userId from JWT | UNKNOWN |
| `/api/folders/*` | ALL | `authenticateToken` | userId filtering per query | UNKNOWN |
| `/api/integrations/*` | ALL | `authenticateToken` | userId filtering per query | UNKNOWN |
| `/api/editing/*` | ALL | `authenticateToken` | Document ownership check | UNKNOWN |
| `/api/editor-session/*` | ALL | `authenticateToken` | Document ownership check | UNKNOWN |
| `/api/search/*` | ALL | `authenticateToken` | userId scoping | UNKNOWN |
| `/api/telemetry/*` | ALL | `authenticateToken` | userId scoping | UNKNOWN |
| `/api/users/*` | ALL | `authenticateToken` | Own user only | UNKNOWN |

### Admin Routes (Multi-Factor Required)

| Route Prefix | Method(s) | Middleware Stack | IP Allowlist | Purpose |
|-------------|-----------|-----------------|-------------|---------|
| `/api/admin/*` | ALL | `requireAdmin` guard | Yes (if configured) | Admin dashboard API |
| `/api/dashboard/*` | ALL | Same as admin | Yes | Dashboard alias |

**Admin guard checks (in order)**:
1. `KODA_OWNER_USER_ID` match (env var)
2. `X-KODA-ADMIN-KEY` header with timing-safe comparison
3. Admin JWT token verification (separate signing secret)
4. IP allowlist check (if `KODA_ADMIN_IP_ALLOWLIST` set)

---

## Actor × Resource Permission Matrix

| | Documents | Chunks | Embeddings | Chat | File Upload | File Download | Admin API | User Settings | Connectors | 2FA | Retrieval |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **Anonymous** | DENIED | DENIED | DENIED | DENIED | DENIED | DENIED | DENIED | DENIED | DENIED | DENIED | DENIED |
| **Auth User** | OWN | OWN | OWN | OWN | OWN | OWN (signed URL) | DENIED | OWN | OWN | OWN | OWN (scoped) |
| **Admin** | ALL (read) | ALL (read) | ALL (read) | ALL (read) | DENIED | DENIED | ALLOWED | ALL (read) | ALL (read) | N/A | ALL (read) |
| **Worker** | ALL* | ALL* | ALL* | N/A | N/A | ALL* | N/A | N/A | N/A | N/A | N/A |
| **Service Role (DB)** | ALL** | ALL** | ALL** | ALL** | N/A | N/A | ALL** | ALL** | ALL** | ALL** | ALL** |

\* Workers run in same process, access DB with service_role credentials. No separate auth boundary.
\** RLS enabled but policy is `USING (true)` — effectively ALL access. See Finding F-011.

**OWN** = Resource filtered by `userId` match from JWT. Enforcement is in application code (service layer WHERE clauses), NOT in database RLS policies.

---

## RBAC Policy Matrix

**Evidence**: `backend/src/config/` or `backend/src/middleware/` — RBAC configuration

| Role | chat | documents | editing | integrations | rag | telemetry | admin |
|------|------|-----------|---------|-------------|-----|-----------|-------|
| admin | read,write | read,write,delete | read,write | read,write,connect | read,write | read,write,manage | read,write,manage |
| user | read,write | read,write,delete | read,write | read,write,connect | read,write | read | — |
| analyst | read | read | read | read | read,write | read,write | — |
| editor | read,write | read,write | read,write | — | read | read | — |
| viewer | read | read | — | — | read | — | — |
| service | read,write | read,write | read,write | read,write | read,write | read,write | — |

---

## Gaps Identified

| Gap | Severity | Description |
|-----|----------|-------------|
| No cross-tenant isolation tests | P1 | No automated test verifies User A cannot access User B's documents |
| Worker has implicit full access | P2 | BullMQ workers run with service_role DB credentials, no auth boundary |
| RLS decorative | P1 | `service_role_all USING (true)` grants full access — see F-011 |
| Many routes marked UNKNOWN for tests | P2 | Cannot confirm test coverage for most authenticated routes |
| No ABAC for documents | P3 | No viewer/editor/commenter sharing model per document |
| No account lockout policy visible | P2 | Rate limiting exists but no explicit lockout after N failures |

---

*Test status marked UNKNOWN where test files could not be confirmed to cover the specific route. These need manual verification.*
