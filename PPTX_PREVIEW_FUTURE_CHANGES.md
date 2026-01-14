# PPTX Preview System - Future Changes Guide

**Audience:** Future engineers working on PPTX preview or related systems
**Purpose:** Prevent silent degradation when making changes
**Last Updated:** 2026-01-14

---

## ⚠️ READ THIS FIRST

The PPTX preview system is **production-hardened** with drift detection, contract tests, and safety nets. This document tells you what to update when making changes that could affect it.

---

## 📐 WHAT MUST BE UPDATED IF...

### 1. Adding a New Storage Provider (e.g. Azure Blob, Cloudflare R2)

**Files to Update:**
- `backend/src/config/storage.ts` - Add new provider config
- `backend/src/services/pptxPreview.utils.ts` - Update `validateStoragePath()` to accept new path prefixes
- `backend/src/tests/pptxPreview.utils.test.ts` - Add test cases for new provider paths
- `PPTX_DRIFT_DETECTION.md` - Update "Signing Drift" section with new provider troubleshooting

**Validation Checklist:**
- [ ] `validateStoragePath()` accepts new provider paths (e.g. `azure://container/path`)
- [ ] Signed URL generation works for new provider
- [ ] Retry logic handles new provider transient errors
- [ ] Cache keys work with new provider paths
- [ ] Contract tests pass (no API shape changes)
- [ ] Canary check runs successfully with test document on new provider

**Example:**
```typescript
// In validateStoragePath()
const validPrefixes = [
  'slides/',
  'documents/',
  's3://',
  'gcs://',
  'azure://',  // ✅ ADD THIS
];
```

---

### 2. Expanding Preview Types (DOCX, XLSX, PDF Native)

**Files to Update:**
- `backend/src/schemas/pptxPreview.schema.ts` - Add new preview types to `PreviewType` enum
- `backend/src/services/pptxPreviewPlan.service.ts` - Add decision logic for new types
- `backend/src/tests/__snapshots__/pptx-preview-plan.snapshot.json` - Add new types to `validPreviewTypes`
- `backend/src/tests/pptxPreview.contract.test.ts` - Add test cases for new types
- `frontend/src/components/PPTXPreview.jsx` - Handle new preview types in UI
- `PPTX_DRIFT_DETECTION.md` - Add drift detection for new types

**Contract Rules to Maintain:**
- If `assetsReady=true`, there MUST be a way to fetch/render the preview
- All new types MUST have a `reason` field explaining why this type was chosen
- Pagination MUST work for all list-based preview types (slides, sheets, pages)

**Example:**
```typescript
// Add to PreviewType enum
export type PreviewType =
  | 'pptx-pdf'
  | 'pptx-slides'
  | 'pptx-processing'
  | 'pptx-unsupported'
  | 'docx-pdf'        // ✅ ADD THIS
  | 'docx-pages'      // ✅ ADD THIS
  | 'xlsx-preview';   // ✅ ADD THIS
```

---

### 3. Changing Auth Model (e.g. API Keys, OAuth, Multi-Tenancy)

**Files to Update:**
- `backend/src/controllers/document.controller.ts` - Update `req.user` access checks
- `backend/src/services/pptxSignedUrlCache.service.ts` - Update cache key to include new auth context
- `backend/src/scripts/canary-pptx-preview.ts` - Update auth header generation
- `.github/workflows/pptx-preview-gate.yml` - Update CI auth if needed

**Critical:**
- Cache keys MUST include user/tenant identifier to prevent cross-user data leaks
- Signed URLs MUST respect new auth boundaries (don't serve user A's images to user B)
- Correlation IDs MUST include auth context for audit trails

**Example:**
```typescript
// If adding tenantId
const cacheKey = `${docId}:${storagePath}:${userId}:${tenantId}`;  // ✅ ADD tenantId
```

---

### 4. Refactoring Frontend Preview Component

**Files to Update:**
- `frontend/src/components/PPTXPreview.jsx` - The component itself
- `backend/src/tests/__snapshots__/pptx-slides-response.snapshot.json` - If API contract changes
- `.github/workflows/pptx-preview-gate.yml` - Ensure frontend build still passes

**Contract Rules to Maintain:**
- MUST check `slide.hasImage` before rendering `<img src={slide.imageUrl}>`
- MUST handle `hasImage=false` gracefully (show text content or placeholder)
- MUST implement retry logic if image fails to load
- MUST show safety net banner if ALL slides have `hasImage=false`
- MUST send `x-request-id` correlation ID in API calls

**Banned Patterns:**
```jsx
// ❌ BAD: Assumes imageUrl always exists
<img src={slide.imageUrl} />

// ✅ GOOD: Checks hasImage first
{slide.hasImage && slide.imageUrl && (
  <img src={slide.imageUrl} onError={handleRetry} />
)}
```

---

### 5. Changing Slide Image Storage Format (WebP, AVIF, SVG)

**Files to Update:**
- `backend/src/services/ingestion/pptxImageExtractor.service.ts` - Update image generation
- `backend/src/services/pptxPreview.utils.ts` - Update `validateStoragePath()` to accept new extensions
- `frontend/src/components/PPTXPreview.jsx` - Ensure `<img>` supports new formats
- `backend/src/tests/pptxPreview.utils.test.ts` - Add test cases for new extensions

**Validation:**
- Signed URL generation works for new format
- Browser compatibility checked (WebP: 97%, AVIF: 86% as of 2024)
- File size reduction measured (should be smaller than PNG)
- Contract tests still pass

**Example:**
```typescript
// In validateStoragePath()
const validExtensions = [
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',  // ✅ ADD THIS
  '.avif'   // ✅ ADD THIS
];
```

---

### 6. Adding Real-Time Updates (WebSockets, Server-Sent Events)

**Files to Update:**
- `backend/src/services/pptxPreviewPlan.service.ts` - Emit events when preview generation completes
- `frontend/src/components/PPTXPreview.jsx` - Subscribe to events, refresh preview
- `backend/src/services/pptxSignedUrlCache.service.ts` - Invalidate cache on updates

**Critical:**
- Cache invalidation MUST happen when new images are generated
- Correlation ID MUST be included in WebSocket messages for tracing
- Frontend MUST handle reconnection gracefully

**Example:**
```typescript
// When preview completes
webSocketService.emit('preview:ready', {
  documentId,
  previewType: 'pptx-slides',
  correlationId: requestId
});

// Frontend listens
socket.on('preview:ready', ({ documentId }) => {
  if (documentId === pptxDocument.id) {
    fetchSlidesPage(1); // Refresh
  }
});
```

---

### 7. Migrating to a Different Database (e.g. Postgres → MongoDB)

**Files to Update:**
- `backend/src/services/pptxPreviewPlan.service.ts` - Update database queries
- `backend/src/controllers/document.controller.ts` - Update metadata access
- `backend/src/tests/pptxPreview.utils.test.ts` - Update mock data structure

**Critical:**
- `slidesData` field MUST remain JSON-parseable array
- `slideGenerationStatus` MUST remain string with values: `pending`, `processing`, `completed`, `failed`
- Preview plan logic MUST NOT change (contract tests will catch this)

---

## 🚫 DO NOT LIST

### Never Store Signed URLs in Database

**Why:** Signed URLs expire (60 minutes for PPTX previews). Storing them causes:
- Stale URLs served to users
- Cache invalidation nightmares
- Drift between DB and actual files

**Instead:** Always store `storagePath`, generate signed URLs on-demand with caching

```typescript
// ❌ BAD: Storing signed URL
await prisma.slide.update({
  where: { id },
  data: { imageUrl: signedUrl }  // URL expires in 60 minutes!
});

// ✅ GOOD: Storing storage path
await prisma.slide.update({
  where: { id },
  data: { storagePath: 'slides/doc123/slide-1.png' }  // Never expires
});
```

---

### Never Bypass `validateStoragePath()`

**Why:** Prevents path traversal attacks

```typescript
// ❌ BAD: Direct file access
const signedUrl = await getSignedUrl(userProvidedPath);  // Vulnerable!

// ✅ GOOD: Validate first
const validation = validateStoragePath(userProvidedPath);
if (!validation.isValid) {
  return { error: 'Invalid path', hasImage: false };
}
const signedUrl = await getSignedUrl(validation.sanitizedPath);
```

---

### Never Skip Contract Tests

**Why:** Contract tests are regression locks. If they fail, you're breaking the API.

```bash
# ❌ BAD: Skipping contract tests
npm test -- --testPathIgnorePatterns=contract

# ✅ GOOD: Run all tests
npm test
```

If contract tests fail:
1. Check if API shape changed (breaking change?)
2. Update snapshots IF change is intentional: Update `lastUpdated` field in snapshots
3. Coordinate with frontend team if `PreviewPlan` or `SlidesResponse` shape changed

---

### Never Disable Drift Detection

**Why:** Drift metrics catch silent degradation before users notice

```typescript
// ❌ BAD: Removing drift detection
// if (hasImage && !imageUrl) {
//   incrementCounter('pptx_contract_violation_total', {...});
// }

// ✅ GOOD: Keep drift detection
if (hasImage && !imageUrl) {
  console.error('🚨 [CONTRACT_VIOLATION] ...');
  incrementCounter('pptx_contract_violation_total', {...});
  return { imageUrl: null, hasImage: false, error: '...' };
}
```

---

### Never Throw Errors in Drift Detection

**Why:** Drift detection is non-crashing. It logs and returns safe fallbacks.

```typescript
// ❌ BAD: Throwing in production
if (contractViolation) {
  throw new Error('Contract violated!');  // Crashes user request!
}

// ✅ GOOD: Log and fallback
if (contractViolation) {
  console.error('🚨 [CONTRACT_VIOLATION] ...');
  incrementCounter('pptx_contract_violation_total', {...});
  return safeFallback;  // Keep serving requests
}
```

---

### Never Remove Pagination

**Why:** Large PPTX decks (100+ slides) will timeout without pagination

```typescript
// ❌ BAD: Loading all slides at once
const allSlides = await getAllSlides(documentId);  // 100 slides = 5s load time!

// ✅ GOOD: Paginated loading
const pageSlides = await getSlidesPage(documentId, page, pageSize);  // 10 slides = 300ms
```

---

## 🧪 TESTING CHECKLIST BEFORE DEPLOYING CHANGES

### 1. Run All Tests
```bash
cd backend
npm test -- pptxPreview.utils.test.ts         # Unit tests (22 tests)
npm test -- pptxPreview.contract.test.ts      # Contract tests (regression lock)
```

### 2. Run Canary Check
```bash
cd backend
export CANARY_PPTX_DOC_ID="<test-doc-id>"
export CANARY_AUTH_TOKEN="<valid-jwt-token>"
npm run canary:pptx --verbose
```

**Expected Output:**
```
✅ Preview Plan Endpoint: PASS
✅ Slides Endpoint (Pagination): PASS
✅ Image URL Accessibility: PASS
✅ Drift Metrics (Zero Degradation): PASS

Passed: 4/4
```

### 3. Check Drift Metrics in Production
```bash
curl https://your-domain.com/api/metrics | \
  jq '.counters | to_entries | map(select(.key | contains("drift") or contains("violation")))'
```

**Expected:** Empty object `{}`

If non-zero, investigate logs:
```bash
grep -E "CONTRACT_VIOLATION|PLAN_DRIFT|SIGNING_DRIFT" backend.log
```

### 4. Verify Frontend Safety Net
1. Create a test PPTX with all slides having `hasImage=false`
2. Open preview in UI
3. Should show: "Preview Unavailable. Please download the original file."

### 5. CI Gate Must Pass
- GitHub Actions workflow `.github/workflows/pptx-preview-gate.yml` must pass
- Check: Unit tests, contract tests, backend build, frontend build

---

## 📚 RELATED DOCUMENTATION

- `PRODUCTION_RUNBOOK_PPTX_PREVIEW.md` - Operational guide (850 lines)
- `PPTX_DRIFT_DETECTION.md` - Drift metrics and alert rules
- `FINAL_PRODUCTION_CHECKLIST.md` - Deployment checklist
- `backend/src/tests/__snapshots__/*.snapshot.json` - API contract snapshots

---

## 🆘 WHO TO ASK

### API Contract Changes
**Contact:** Backend team lead
**Why:** API changes affect frontend, mobile apps, and third-party integrations

### Storage Provider Changes
**Contact:** Infrastructure team
**Why:** IAM roles, service accounts, and network firewalls may need updates

### Drift Metrics Alerts Firing
**Contact:** On-call engineer
**Escalation:** If drift > 0 for > 30 minutes, page on-call

### Frontend Preview Refactoring
**Contact:** Frontend team lead
**Why:** Must maintain `hasImage` checks and safety nets

---

## 📊 MONITORING DASHBOARD

**Metrics to Watch:**
- `pptx_slides_duration_ms` (p95) - Should be < 500ms
- `pptx_signed_url_generated_total{status="cached"}` - Should be > 70% of total
- `pptx_errors_total` - Should be < 0.1% of requests
- `pptx_contract_violation_total` - **MUST be 0**
- `pptx_plan_drift_total` - **MUST be 0**
- `pptx_signing_drift_total` - Should be < 5/hour

**Dashboards:**
- Grafana: `PPTX Preview Health`
- Datadog: `PPTX Preview Monitoring`

---

## 🚀 FUTURE ENHANCEMENTS (IDEAS FOR LATER)

### Short-Term (Next Quarter)
- [ ] WebP image format for smaller file sizes
- [ ] Redis cache for distributed environments
- [ ] Real-time preview updates via WebSockets
- [ ] Thumbnail generation for slide navigation

### Long-Term (Next Year)
- [ ] DOCX and XLSX preview support
- [ ] Video slide support (embedded videos)
- [ ] Collaborative annotations on slides
- [ ] AI-generated slide summaries

---

**Remember:** This system is production-hardened. Don't bypass safety mechanisms. If you're unsure, ask.

**Last Updated:** 2026-01-14
**Maintainer:** Backend Team
