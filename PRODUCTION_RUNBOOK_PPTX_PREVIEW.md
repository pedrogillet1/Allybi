# PPTX Preview System - Production Runbook

**Last Updated:** 2026-01-14
**System:** PPTX Preview with Production Hardening
**Status:** Production Ready

---

## 📖 TABLE OF CONTENTS

1. [System Overview](#system-overview)
2. [Endpoints & API Contracts](#endpoints--api-contracts)
3. [Feature Flag & Kill Switch](#feature-flag--kill-switch)
4. [Common Failures & Diagnosis](#common-failures--diagnosis)
5. [Monitoring & Metrics](#monitoring--metrics)
6. [Troubleshooting Playbook](#troubleshooting-playbook)
7. [Rollback Procedures](#rollback-procedures)
8. [Performance Tuning](#performance-tuning)

---

## 1. SYSTEM OVERVIEW

### Architecture

```
┌──────────────┐     ┌─────────────────┐     ┌──────────────┐
│   Frontend   │────▶│  /api/preview   │────▶│ getPreview   │
│ PPTXPreview  │     │  /api/slides    │     │ getPPTXSlides│
└──────────────┘     └─────────────────┘     └───────┬──────┘
                                                      │
                     ┌────────────────────────────────┴────────────┐
                     │                                             │
          ┌──────────▼──────────┐                     ┌───────────▼─────────┐
          │ pptxPreviewPlan     │                     │  pptxPreview.utils  │
          │ (Canonical Decision)│                     │  (URL Generation)   │
          └─────────────────────┘                     └──────────┬──────────┘
                                                                 │
                               ┌─────────────────────────────────┴────────┐
                               │                                          │
                    ┌──────────▼──────────┐                  ┌───────────▼────────┐
                    │ signedUrlCache      │                  │ pptxMetrics         │
                    │ (55min TTL)         │                  │ (Observability)     │
                    └─────────────────────┘                  └────────────────────┘
```

### Components

| Component | Purpose | Location |
|-----------|---------|----------|
| **Correlation ID Middleware** | Request tracing | `middleware/correlationId.middleware.ts` |
| **Metrics Service** | Lightweight metrics | `services/pptxPreviewMetrics.service.ts` |
| **Signed URL Cache** | 55min cache for URLs | `services/pptxSignedUrlCache.service.ts` |
| **Preview Utils** | Path validation, retry logic | `services/pptxPreview.utils.ts` |
| **Preview Plan Service** | Canonical decision | `services/pptxPreviewPlan.service.ts` |
| **Rate Limiter** | 60 req/min per user | `middleware/rateLimit.middleware.ts` |

---

## 2. ENDPOINTS & API CONTRACTS

### GET /api/documents/:id/preview

**Purpose:** Get preview plan (which preview system to use)

**Response:**
```json
{
  "previewType": "pptx-pdf" | "pptx-slides" | "pptx-processing" | "pptx-unsupported",
  "reason": "PDF_READY" | "PDF_FAILED_SLIDES_READY" | ...,
  "assetsReady": boolean,
  "previewUrl": "/api/documents/:id/preview-pdf" | "/api/documents/:id/slides",
  "totalSlides": number,
  "canRetry": boolean
}
```

**Headers:**
- `x-request-id` (optional): Client correlation ID
- `X-Request-ID` (response): Server correlation ID

### GET /api/documents/:id/slides

**Purpose:** Get paginated PPTX slides with signed URLs

**Query Parameters:**
- `page` (default: 1): Page number
- `pageSize` (default: 10, max: 50): Slides per page

**Response:**
```json
{
  "success": true,
  "slides": [
    {
      "slideNumber": 1,
      "content": "Text content",
      "textCount": 150,
      "storagePath": "slides/doc-123/slide-1-composite.png",
      "imageUrl": "https://s3.../slide-1.png?signature=...",
      "hasImage": true
    }
  ],
  "totalSlides": 50,
  "page": 1,
  "pageSize": 10,
  "totalPages": 5,
  "metadata": {}
}
```

**Contract Guarantees:**
- If `hasImage === true`, `imageUrl` MUST be non-null
- `imageUrl` is fresh (generated within last 55 minutes if cached)
- `storagePath` is validated (no path traversal)

### GET /api/metrics (Protected)

**Purpose:** Get PPTX preview metrics

**Query Parameters:**
- `format` (default: json): `json` | `prometheus`

**Response (JSON):**
```json
{
  "counters": {
    "pptx_slides_total{docId=\"abc12345\"}": 150,
    "pptx_signed_url_generated_total{status=\"success\"}": 1200,
    "pptx_signed_url_generated_total{status=\"cached\"}": 3500,
    "pptx_missing_object_total": 5,
    "pptx_backfill_total": 25,
    "pptx_errors_total{stage=\"url_generation\"}": 2
  },
  "timers": {
    "pptx_slides_duration_ms": {
      "count": 150,
      "avg": 234.5,
      "min": 50,
      "max": 1200,
      "p95": 450
    },
    "pptx_signed_url_duration_ms{source=\"cache\"}": {
      "count": 3500,
      "avg": 2.1,
      "p95": 5
    }
  },
  "cache": {
    "size": 1250,
    "keys": ["doc-123:slides/...", ...]
  },
  "timestamp": "2026-01-14T12:00:00.000Z"
}
```

---

## 3. FEATURE FLAG & KILL SWITCH

### Environment Variable

```bash
PPTX_PREVIEW_HARDENING_ENABLED=true  # default
```

### Disabling the Feature

```bash
# Add to .env or set environment variable
PPTX_PREVIEW_HARDENING_ENABLED=false
```

**Effect:**
- All `/api/documents/:id/slides` requests return 503
- Message: "Feature is currently disabled. Please download the file to view."
- Users can still download files
- No downtime required

### When to Disable

1. **Storage outage:** S3/GCS unavailable
2. **High error rate:** > 10% failures in metrics
3. **Performance degradation:** p95 > 2000ms
4. **Security incident:** Path traversal detected

### Re-enabling

```bash
PPTX_PREVIEW_HARDENING_ENABLED=true
# Restart application or reload config
```

---

## 4. COMMON FAILURES & DIAGNOSIS

### Issue 1: Images Not Loading (403 Errors)

**Symptoms:**
- Browser shows 403 Forbidden for image URLs
- Network tab shows failed image requests

**Diagnosis:**
```bash
# Check logs for SIGNED_URL errors
grep "[SIGNED_URL]" backend.log | grep "❌" | tail -20

# Check for specific document
grep "doc-abc12345" backend.log | grep "SIGNED_URL"

# Check cache statistics
curl http://localhost:5000/api/metrics | jq '.cache'
```

**Likely Causes:**
1. Signed URL expired (shouldn't happen with 55min cache)
2. S3/GCS credentials invalid
3. File deleted from storage

**Resolution:**
```bash
# Regenerate slides
curl -X POST http://localhost:5000/api/documents/{id}/regenerate-slides \
  -H "Authorization: Bearer $TOKEN"

# Clear cache for document
# (requires app restart or manual cache invalidation)

# Verify S3 credentials
aws s3 ls s3://your-bucket/slides/
```

### Issue 2: Blank Slides / Missing Images

**Symptoms:**
- `hasImage: false` for slides that should have images
- No 403 errors, just blank slides

**Diagnosis:**
```bash
# Check for MISSING_OBJECT logs
grep "\\[MISSING_OBJECT\\]" backend.log | tail -20

# Check specific document
grep "doc-abc12345" backend.log | grep "MISSING_OBJECT"

# Verify file existence in storage
aws s3 ls s3://your-bucket/slides/doc-abc12345/
```

**Likely Causes:**
1. Files never uploaded during ingestion
2. Files deleted from storage
3. Path mismatch in metadata

**Resolution:**
```bash
# Regenerate slides from source PPTX
curl -X POST http://localhost:5000/api/documents/{id}/regenerate-slides \
  -H "Authorization: Bearer $TOKEN"

# Check ingestion logs
grep "doc-abc12345" backend.log | grep "\\[EXTRACTION\\]"
```

### Issue 3: Slow Response Times

**Symptoms:**
- Requests take > 1 second
- p95 latency > 1000ms in metrics

**Diagnosis:**
```bash
# Check metrics
curl http://localhost:5000/api/metrics | jq '.timers'

# Check for backfill operations (one-time cost)
grep "\\[BACKFILL\\]" backend.log | tail -50

# Check cache hit rate
curl http://localhost:5000/api/metrics | \
  jq '.counters | to_entries | map(select(.key | contains("signed_url")))'
```

**Likely Causes:**
1. Large deck (50+ slides) without pagination
2. Cache not warmed (first access)
3. Backfill operation in progress
4. S3/GCS latency

**Resolution:**
```bash
# Ensure frontend uses pagination
# Check frontend is passing page/pageSize params

# Warm cache by accessing all pages
for page in {1..5}; do
  curl "http://localhost:5000/api/documents/{id}/slides?page=$page&pageSize=10" \
    -H "Authorization: Bearer $TOKEN" > /dev/null
done

# Monitor improvement
watch -n 1 'curl -s http://localhost:5000/api/metrics | jq ".timers.pptx_slides_duration_ms.avg"'
```

### Issue 4: Rate Limiting (429 Errors)

**Symptoms:**
- 429 Too Many Requests
- `RateLimitError` in logs

**Diagnosis:**
```bash
# Check rate limit headers in response
curl -I http://localhost:5000/api/documents/{id}/slides \
  -H "Authorization: Bearer $TOKEN"

# Headers to look for:
# X-RateLimit-Limit: 60
# X-RateLimit-Remaining: 0
# X-RateLimit-Reset: 1610000000
```

**Resolution:**
1. Wait for rate limit window to reset (1 minute)
2. Reduce request frequency in frontend
3. Increase limit if legitimate high usage

```typescript
// In rateLimit.middleware.ts
export const pptxPreviewLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120, // Increase from 60
  // ...
});
```

---

## 5. MONITORING & METRICS

### Key Metrics to Watch

| Metric | Threshold | Action |
|--------|-----------|--------|
| `pptx_errors_total` | > 10/min | Investigate logs, consider kill switch |
| `pptx_slides_duration_ms.p95` | > 1000ms | Check cache hit rate, S3 latency |
| `pptx_missing_object_total` | > 5% of requests | Storage issue, regenerate slides |
| `pptx_signed_url_generated_total{status="cached"}` | < 50% | Cache not warming, check TTL |
| `pptx_backfill_total` | Increasing | Old docs being accessed, expected |

### Log Grep Commands

**With Correlation ID:**
```bash
# Track a single request end-to-end
REQUEST_ID="abc-123-def"
grep "\\[$REQUEST_ID\\]" backend.log

# All errors for a document
DOC_ID="doc-abc12345"
grep "$DOC_ID" backend.log | grep "❌"

# Cache hits vs misses
grep "\\[SIGNED_URL\\] Cache hit" backend.log | wc -l
grep "\\[SIGNED_URL\\] Generated" backend.log | wc -l

# Backfill operations
grep "\\[BACKFILL\\] Persisting" backend.log | tail -20

# Performance tracking
grep "✅ \\[PPTX_SLIDES\\] Completed" backend.log | \
  awk '{print $(NF-2)}' | \
  sed 's/ms//' | \
  awk '{sum+=$1; count++} END {print "Avg:", sum/count, "ms"}'
```

### Dashboarding (if using Grafana/Prometheus)

**Prometheus Queries:**
```promql
# Error rate
rate(pptx_errors_total[5m])

# P95 latency
histogram_quantile(0.95, pptx_slides_duration_ms)

# Cache hit ratio
rate(pptx_signed_url_generated_total{status="cached"}[5m]) /
  rate(pptx_signed_url_generated_total[5m])

# Backfill rate (should decrease over time)
rate(pptx_backfill_total[1h])
```

---

## 6. TROUBLESHOOTING PLAYBOOK

### Scenario A: Spike in 403 Errors

**Steps:**
1. Check if S3/GCS credentials expired
2. Verify bucket permissions
3. Check if files exist in storage
4. Regenerate signed URLs by clearing cache (restart app)

**Commands:**
```bash
# Check S3 access
aws s3 ls s3://your-bucket/slides/ | head

# Check recent 403s
grep "403" backend.log | grep "slides" | tail -20

# Restart to clear cache
pm2 restart backend
```

### Scenario B: Entire Preview System Down

**Steps:**
1. Check if feature flag disabled
2. Check database connectivity
3. Check S3/GCS connectivity
4. Enable kill switch if needed

**Commands:**
```bash
# Check feature flag
grep "PPTX_PREVIEW_HARDENING_ENABLED" .env

# Test database
psql $DATABASE_URL -c "SELECT COUNT(*) FROM Document LIMIT 1;"

# Test S3
aws s3 ls s3://your-bucket/ --max-items 1

# Enable kill switch
echo "PPTX_PREVIEW_HARDENING_ENABLED=false" >> .env
pm2 restart backend
```

### Scenario C: Memory Leak / High Memory Usage

**Symptoms:**
- Node process memory > 2GB
- OOM errors

**Diagnosis:**
```bash
# Check cache size
curl http://localhost:5000/api/metrics | jq '.cache.size'

# Monitor memory
while true; do
  ps aux | grep "node.*server.js" | awk '{print $6/1024 " MB"}'
  sleep 5
done
```

**Resolution:**
```bash
# Restart application
pm2 restart backend

# Reduce cache size (if needed)
# Edit signedUrlCache.service.ts
# Change MAX_VALUES from 1000 to 500
```

### Scenario D: Database Backfill Storm

**Symptoms:**
- Many `[BACKFILL]` logs
- Database write load spike

**Diagnosis:**
```bash
# Count backfill operations
grep "\\[BACKFILL\\] Persisting" backend.log | wc -l

# Check unique documents being backfilled
grep "\\[BACKFILL\\]" backend.log | \
  grep -oP 'doc-[a-z0-9]+' | sort -u | wc -l
```

**Expected Behavior:**
- Backfills occur on first access to old documents
- Each document backfilled only once
- Rate should decrease over time

**Action:**
- Monitor database write IOPS
- If excessive, consider batch backfill script (future enhancement)

---

## 7. ROLLBACK PROCEDURES

### Emergency Rollback (Kill Switch)

**Fastest:** Use feature flag (no deployment)
```bash
# Set environment variable
export PPTX_PREVIEW_HARDENING_ENABLED=false

# Or add to .env
echo "PPTX_PREVIEW_HARDENING_ENABLED=false" >> .env

# Restart
pm2 restart backend

# Verify
curl http://localhost:5000/api/documents/{id}/slides
# Should return 503 with message
```

### Git Revert (Full Rollback)

```bash
# Find commit before production hardening
git log --oneline | grep "production hardening"

# Revert to previous version
git revert <commit-hash>

# Or hard reset (if safe)
git reset --hard <commit-before-hardening>

# Rebuild and deploy
cd backend && npm run build
pm2 restart backend
```

### Partial Rollback (Disable Specific Features)

**Disable Pagination (revert to full load):**
```typescript
// In document.controller.ts getPPTXSlides
// Remove pagination logic, process all slides
const processedSlides = await Promise.all(
  slidesData.map(async (slide: any, index: number) => {
    // ... existing logic
  })
);
```

**Disable Caching:**
```typescript
// In pptxPreview.utils.ts generateSlideImageUrl
// Comment out cache lookup and set sections
// if (docId) {
//   const cached = signedUrlCache.get(...);
//   ...
// }
```

**Disable Metrics:**
```typescript
// In document.controller.ts
// Remove all incrementCounter and recordTiming calls
```

---

## 8. PERFORMANCE TUNING

### Cache Tuning

**Current Settings:**
- TTL: 55 minutes
- Max values for p95: 1000 per metric

**Adjust for High Traffic:**
```typescript
// signedUrlCache.service.ts
private readonly TTL_MS = 50 * 60 * 1000; // Reduce to 50min
```

**Adjust for Low Memory:**
```typescript
// pptxPreviewMetrics.service.ts
private readonly MAX_VALUES = 500; // Reduce from 1000
```

### Pagination Tuning

**Current Settings:**
- Default page size: 10
- Max page size: 50

**Adjust for Performance:**
```typescript
// document.controller.ts getPPTXSlides
const pageSizeNum = Math.min(20, Math.max(1, parseInt(pageSize as string, 10) || 10));
// Reduce max from 50 to 20 if needed
```

### Rate Limit Tuning

**Current Settings:**
- 60 requests/minute per user

**Adjust for Legitimate High Usage:**
```typescript
// rateLimit.middleware.ts
export const pptxPreviewLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120, // Increase from 60
  // ...
});
```

---

## QUICK REFERENCE CARD

### Essential Commands

```bash
# Check feature status
echo $PPTX_PREVIEW_HARDENING_ENABLED

# View metrics
curl http://localhost:5000/api/metrics | jq

# Check recent errors
grep "❌" backend.log | tail -20

# Check specific document
grep "doc-abc12345" backend.log

# Regenerate slides
curl -X POST http://localhost:5000/api/documents/{id}/regenerate-slides \
  -H "Authorization: Bearer $TOKEN"

# Kill switch (emergency)
export PPTX_PREVIEW_HARDENING_ENABLED=false && pm2 restart backend
```

### Log Tags Reference

- `[PREVIEW_PLAN]` - Preview decision logic
- `[PPTX_SLIDES]` - Slide retrieval
- `[SIGNED_URL]` - URL generation
- `[BACKFILL]` - Self-healing
- `[MISSING_OBJECT]` - File not found
- `[RESOLVE]` - Path resolution
- `♻️` - Cache hit
- `✅` - Success
- `❌` - Error
- `⚠️` - Warning

---

## 🚫 SECTION 9: WHEN NOT TO TOUCH THIS SYSTEM

### ⚠️ THIS IS A FROZEN SUBSYSTEM

The PPTX preview system is **production-hardened, contract-locked, and drift-protected**. It is designed to run for years without modification.

**Do NOT touch this system unless:**
- You are adding a new storage provider (S3 → GCS → Azure)
- You are expanding preview types (DOCX, XLSX parity)
- You are fixing a confirmed production bug (with drift metrics evidence)
- You are coordinating a planned API change (with frontend team approval)

---

### ❌ COMMON ANTI-PATTERNS (DO NOT DO THESE)

#### 1. "Just Reuse imageUrl"
```typescript
// ❌ NEVER DO THIS
const slide = await prisma.slide.findUnique({ where: { id } });
return slide.imageUrl; // Signed URLs expire in 60 minutes!
```

**Why it's wrong:**
- Signed URLs expire (60-minute TTL)
- Causes 403 errors for users after expiration
- Defeats the purpose of `storagePath` field

**Correct approach:**
```typescript
// ✅ ALWAYS DO THIS
const slide = await prisma.slide.findUnique({ where: { id } });
const signedUrl = await generateSlideImageUrl(
  slide.storagePath,
  slide.slideNumber,
  documentId,
  userId,
  requestId
);
return signedUrl;
```

---

#### 2. "Quick Fix" Without Running Tests
```bash
# ❌ NEVER DO THIS
git commit -m "quick fix for pptx preview" && git push
```

**Why it's wrong:**
- Breaks API contracts silently
- Triggers drift detection in production
- CI gate will catch it, but now you've wasted CI time

**Correct approach:**
```bash
# ✅ ALWAYS DO THIS
npm test -- pptxPreview.utils.test.ts          # Unit tests
npm test -- pptxPreview.contract.test.ts       # Contract tests
npm run canary:pptx -- --doc-id=<id> --verbose # Canary check
git commit && git push
```

---

#### 3. "Temporary Bypass" of Validation
```typescript
// ❌ NEVER DO THIS
// const validation = validateStoragePath(path);
// if (!validation.isValid) return error;
const signedUrl = await getSignedUrl(userProvidedPath); // Direct access!
```

**Why it's wrong:**
- Opens path traversal vulnerability
- Allows `../../etc/passwd` or `../../../admin-files/`
- Bypasses security layer

**Correct approach:**
```typescript
// ✅ ALWAYS DO THIS
const validation = validateStoragePath(path);
if (!validation.isValid) {
  incrementCounter('pptx_errors_total', { stage: 'validation' });
  return { error: 'Invalid path', hasImage: false };
}
const signedUrl = await getSignedUrl(validation.sanitizedPath);
```

---

#### 4. "Remove This Old Code"
```typescript
// ❌ NEVER DO THIS
// Removing drift detection because "it's not firing anyway"
// if (hasImage && !imageUrl) {
//   incrementCounter('pptx_contract_violation_total', {...});
// }
```

**Why it's wrong:**
- Drift detection is PROACTIVE, not reactive
- It catches bugs BEFORE they reach users
- If it's not firing, that's GOOD (system is healthy)

**Correct approach:**
- If drift counters are always zero, celebrate!
- Do NOT remove them
- They are insurance against future regressions

---

#### 5. "Disable CI to Merge Faster"
```yaml
# ❌ NEVER DO THIS in .github/workflows/pptx-preview-gate.yml
# jobs:
#   pptx-preview-tests:
#     runs-on: ubuntu-latest
#     continue-on-error: true  # <- DON'T ADD THIS
```

**Why it's wrong:**
- CI gate is the last line of defense
- Contract tests catch breaking changes
- Disabling them silently ships bugs

**Correct approach:**
- If CI fails, FIX THE CODE
- Don't bypass the gate
- If test is flaky, fix the test (not the gate)

---

### ✅ WHEN YOU **SHOULD** TOUCH THIS SYSTEM

#### Scenario 1: Adding a New Storage Provider
**Example:** Migrating from GCS to Azure Blob Storage

**Checklist:**
- [ ] Update `validateStoragePath()` to accept `azure://` prefix
- [ ] Update `getSignedUrl()` to handle Azure auth
- [ ] Add test cases for Azure paths
- [ ] Update `PPTX_PREVIEW_FUTURE_CHANGES.md`
- [ ] Run canary check with test document on Azure
- [ ] Update golden snapshots if response shape changed
- [ ] Deploy with feature flag (test in staging first)

**See:** `PPTX_PREVIEW_FUTURE_CHANGES.md` Section 1

---

#### Scenario 2: Fixing a Confirmed Production Bug
**Example:** Drift metrics show `pptx_contract_violation_total > 0`

**Checklist:**
- [ ] Confirm bug with logs: `grep CONTRACT_VIOLATION backend.log`
- [ ] Reproduce locally with affected document ID
- [ ] Write failing test that captures the bug
- [ ] Fix code to make test pass
- [ ] Run full test suite + canary check
- [ ] Deploy fix
- [ ] Monitor drift metrics return to zero

---

#### Scenario 3: Coordinated API Change
**Example:** Adding `thumbnailUrl` field to slide response

**Checklist:**
- [ ] Coordinate with frontend team (they consume this API)
- [ ] Update `SlidesResponseSchema` in `pptxPreview.schema.ts`
- [ ] Update golden snapshot `pptx-slides-response.snapshot.json`
- [ ] Update `lastUpdated` field in snapshot
- [ ] Run contract tests (will fail until snapshot updated)
- [ ] Update frontend to use new field
- [ ] Deploy backend → wait 1 day → deploy frontend (backward compatible)

**See:** `PPTX_PREVIEW_FUTURE_CHANGES.md` Section 4

---

### 🚨 EXPLICIT WARNINGS

#### NEVER Store Signed URLs in Database
```typescript
// ❌ FATAL ERROR
await prisma.slide.update({
  where: { id },
  data: { imageUrl: signedUrl }  // URL expires in 60 minutes!
});
```

**Why:** Signed URLs have 60-minute TTL. Storing them causes 403 errors after expiration.

**Correct:** Store `storagePath`, generate signed URLs on-demand with caching.

---

#### NEVER Bypass validateStoragePath()
```typescript
// ❌ SECURITY VULNERABILITY
const url = await getSignedUrl(req.body.path);  // User can provide ../../etc/passwd
```

**Why:** Opens path traversal attacks.

**Correct:** Always validate first:
```typescript
const validation = validateStoragePath(req.body.path);
if (!validation.isValid) return error;
```

---

#### NEVER Remove Drift Counters
```typescript
// ❌ DON'T REMOVE THIS
incrementCounter('pptx_contract_violation_total', {...});
```

**Why:** Drift detection is proactive insurance. If counters are zero, that's healthy.

---

### 📊 MONITORING REFERENCE

Before touching this system, verify it's healthy:

```bash
# Check drift metrics (should be zero)
curl -s http://localhost:5000/api/metrics | \
  jq '.counters | to_entries | map(select(.key | contains("drift") or contains("violation")))'

# If empty {}, system is healthy
```

**Unhealthy Output:**
```json
{
  "pptx_contract_violation_total{...}": 5,
  "pptx_plan_drift_total{...}": 12
}
```

**Action:** Investigate logs before making changes:
```bash
grep -E "CONTRACT_VIOLATION|PLAN_DRIFT|SIGNING_DRIFT" backend.log
```

---

### 🔒 FREEZE TEST

A freeze test (`pptxPreview.freeze.test.ts`) will fail if:
- Core modules are deleted
- Drift counters are removed
- Contract tests are deleted
- Golden snapshots are deleted
- Canary script is removed

**If freeze test fails:**
1. Read the error message (it explains what you removed)
2. Ask: "Do I really need to change this?"
3. If yes, update the freeze test AND documentation
4. If no, revert your changes

---

### 📚 DOCUMENTATION TO UPDATE

If you modify this system, update ALL of these:

1. **Golden Snapshots** (`backend/src/tests/__snapshots__/pptx-*.snapshot.json`)
   - Update `lastUpdated` field
   - Add new required fields
   - Run contract tests to verify

2. **Canary Script** (`backend/src/scripts/canary-pptx-preview.ts`)
   - Add checks for new endpoints
   - Update expected response shapes

3. **Future Changes Guide** (`PPTX_PREVIEW_FUTURE_CHANGES.md`)
   - Add section for your change type
   - Explain what future engineers need to know

4. **Freeze Test** (`backend/src/tests/pptxPreview.freeze.test.ts`)
   - Add checks for new critical components
   - Remove checks for obsolete components

5. **This Runbook**
   - Update troubleshooting if new failure modes introduced
   - Add new log tags if needed

---

### 💬 WHO TO ASK

**Before making changes, ask:**

| Change Type | Contact |
|-------------|---------|
| API contract changes | Frontend team + Backend team lead |
| Storage provider changes | Infrastructure team |
| Security (path validation) | Security team |
| Drift metrics alerts firing | On-call engineer |
| "Can I remove this?" | Backend team lead (answer is usually "no") |

---

### 🎯 REMEMBER

**This system is frozen for a reason:**
- It's production-hardened (22 passing tests)
- It's contract-locked (golden snapshots)
- It's drift-protected (3 drift metrics)
- It's battle-tested (deployed in production)
- It works (don't fix what isn't broken)

**If you're thinking "I'll just...":**
- Stop.
- Read `PPTX_PREVIEW_FUTURE_CHANGES.md`
- Run the checklist above
- Ask for review

**The freeze is not a barrier — it's a safety net.**

---

**End of Runbook**
For updates or issues, see: `VERIFICATION_AUDIT_REPORT.md`, `PPTX_PREVIEW_HARDENING.md`, `PPTX_PREVIEW_FUTURE_CHANGES.md`
