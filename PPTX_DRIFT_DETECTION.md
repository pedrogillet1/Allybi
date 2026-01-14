# PPTX Preview Drift Detection System

**Purpose:** Detect silent degradation before it impacts users
**Created:** 2026-01-14
**Status:** ACTIVE

---

## 📊 DRIFT METRICS

### 1. `pptx_contract_violation_total`

**What it detects:** Internal logic bugs where function contracts are violated

**Types:**
- `empty_url_with_hasImage`: Function returns `hasImage=true` but `imageUrl` is null/empty

**Labels:**
```
type: empty_url_with_hasImage
docId: <first 8 chars>
```

**Alert Threshold:** `> 0` sustained for 5 minutes
**Severity:** CRITICAL
**Action:** Investigate immediately - indicates code regression

**Example Log:**
```
🚨 [CONTRACT_VIOLATION] hasImage=true but imageUrl is empty!
docId=a1b2c3d4, slideNumber=3, userId=user123, requestId=req-uuid-here
```

---

### 2. `pptx_plan_drift_total`

**What it detects:** Metadata says assets are ready but actual files/paths are missing

**Types:**
- `slides_ready_no_paths`: `slideGenerationStatus=completed` but slides have no `storagePath`/`imageUrl`

**Labels:**
```
type: slides_ready_no_paths
docId: <first 8 chars>
```

**Alert Threshold:** `> 1/min` sustained for 10 minutes
**Severity:** HIGH
**Action:** Check ingestion pipeline - metadata and file generation are out of sync

**Example Log:**
```
🚨 [PLAN_DRIFT] Plan says assetsReady=true for slides but NO slides have storage paths!
docId=a1b2c3d4, slideCount=12, slideGenerationStatus=completed
```

**Root Causes:**
- Ingestion worker died after updating metadata but before uploading images
- Storage bucket purge deleted files but not metadata
- Database restore from backup missing recent file uploads

---

### 3. `pptx_signing_drift_total`

**What it detects:** File exists in storage but signed URL generation fails repeatedly

**Labels:**
```
attempts: 2 (number of retries before giving up)
docId: <first 8 chars>
```

**Alert Threshold:** `> 5/hour`
**Severity:** HIGH
**Action:** Check storage provider auth, IAM roles, or API changes

**Example Log:**
```
🚨 [SIGNING_DRIFT] File exists but signing failed after 2 attempts!
storagePath=slides/doc123/slide-1.png, docId=a1b2c3d4, userId=user123,
requestId=req-uuid, error=Access denied: invalid service account
```

**Root Causes:**
- Storage provider API changes (e.g. GCS requires new auth scope)
- IAM role permissions changed
- Service account key expired
- Network firewall blocking signed URL generation endpoint

---

## 🔍 MONITORING QUERIES

### Check All Drift Metrics
```bash
curl -s http://localhost:5000/api/metrics | \
  jq '.counters | to_entries | map(select(.key | contains("drift") or contains("violation"))) | from_entries'
```

**Expected Output (Healthy):**
```json
{}
```

**Unhealthy Output:**
```json
{
  "pptx_contract_violation_total{type=\"empty_url_with_hasImage\",docId=\"a1b2c3d4\"}": 3,
  "pptx_plan_drift_total{type=\"slides_ready_no_paths\",docId=\"x9y8z7w6\"}": 12
}
```

---

### Grep Logs for Drift Events
```bash
# All drift events
grep -E "CONTRACT_VIOLATION|PLAN_DRIFT|SIGNING_DRIFT" backend.log

# Count by type (last hour)
grep -E "CONTRACT_VIOLATION|PLAN_DRIFT|SIGNING_DRIFT" backend.log | \
  awk '{print $NF}' | sort | uniq -c
```

---

### Find Affected Documents
```bash
# Extract docIds from drift logs
grep "PLAN_DRIFT" backend.log | \
  grep -oP 'docId=\K[a-f0-9]+' | \
  sort | uniq
```

---

## 🚨 ALERT RULES

### Prometheus/Grafana Alerts

```yaml
# Contract Violation - CRITICAL
- alert: PPTXContractViolation
  expr: rate(pptx_contract_violation_total[5m]) > 0
  for: 5m
  labels:
    severity: critical
    component: pptx-preview
  annotations:
    summary: "PPTX Preview contract violation detected"
    description: "Internal logic bug: {{ $labels.type }} detected for docId {{ $labels.docId }}"

# Plan Drift - HIGH
- alert: PPTXPlanDrift
  expr: rate(pptx_plan_drift_total[10m]) > 0.1  # > 1 per minute
  for: 10m
  labels:
    severity: high
    component: pptx-preview
  annotations:
    summary: "PPTX Preview plan drift detected"
    description: "Metadata/file mismatch: {{ $labels.type }} for docId {{ $labels.docId }}"

# Signing Drift - HIGH
- alert: PPTXSigningDrift
  expr: rate(pptx_signing_drift_total[1h]) > 5
  for: 15m
  labels:
    severity: high
    component: pptx-preview
  annotations:
    summary: "PPTX signed URL generation failing"
    description: "Storage provider issue: {{ $labels.attempts }} attempts failed for docId {{ $labels.docId }}"
```

---

### Datadog Monitors

```javascript
// Contract Violation
sum(last_5m):sum:pptx.contract_violation.total{*}.as_count() > 0
Message: "CRITICAL: PPTX contract violation detected. Check logs for [CONTRACT_VIOLATION]"

// Plan Drift
sum(last_10m):sum:pptx.plan_drift.total{*}.as_rate() > 1
Message: "HIGH: PPTX plan drift detected. Metadata and files out of sync."

// Signing Drift
sum(last_1h):sum:pptx.signing_drift.total{*}.as_count() > 5
Message: "HIGH: PPTX signed URL generation failing. Check storage provider auth."
```

---

## 🛠️ TROUBLESHOOTING PLAYBOOK

### Contract Violation (`pptx_contract_violation_total`)

**Step 1:** Find the affected request
```bash
grep "CONTRACT_VIOLATION" backend.log | tail -1
```

**Step 2:** Extract `requestId` and `docId`

**Step 3:** Check code changes
```bash
git log --since="7 days ago" -- backend/src/services/pptxPreview.utils.ts
```

**Step 4:** Review recent deployments - likely a code regression

**Step 5:** If persistent, disable feature flag:
```bash
export PPTX_PREVIEW_HARDENING_ENABLED=false
pm2 restart backend
```

---

### Plan Drift (`pptx_plan_drift_total`)

**Step 1:** Find affected documents
```bash
grep "PLAN_DRIFT" backend.log | grep -oP 'docId=\K[a-f0-9]+' | sort | uniq
```

**Step 2:** Check database metadata for one docId
```sql
SELECT metadata->'slideGenerationStatus', metadata->'slidesData'
FROM document_metadata
WHERE "documentId" = '<docId>';
```

**Step 3:** Verify files don't exist
```bash
# If using GCS
gsutil ls gs://koda-user-file/slides/<docId>/

# If using S3
aws s3 ls s3://koda-user-file/slides/<docId>/
```

**Step 4:** If files missing, check:
- Recent storage bucket purges
- Ingestion worker crash logs (around time of upload)
- Database restores (backup older than file upload?)

**Step 5:** Remediation options:
1. Reprocess document: `POST /api/documents/{id}/retry-preview`
2. Mark for regeneration: Update `slideGenerationStatus` to `pending`
3. If widespread, run batch reprocessing job

---

### Signing Drift (`pptx_signing_drift_total`)

**Step 1:** Check error message
```bash
grep "SIGNING_DRIFT" backend.log | tail -5
```

**Step 2:** Test signed URL generation manually
```bash
# For GCS
gsutil signurl -d 1h <service-account-key>.json gs://koda-user-file/slides/test.png

# For S3
aws s3 presign s3://koda-user-file/slides/test.png --expires-in 3600
```

**Step 3:** If manual signing works, check:
- Service account permissions in code vs CLI
- IAM role attached to backend pods/VMs
- Recent storage provider API changes

**Step 4:** If manual signing fails:
- Service account key expired? Rotate keys
- IAM policy changed? Restore `storage.objects.get` permission
- Firewall blocking signed URL API endpoint?

**Step 5:** Monitor after fix:
```bash
watch -n 5 'curl -s http://localhost:5000/api/metrics | jq ".counters" | grep signing_drift'
```

---

## 📈 HISTORICAL ANALYSIS

### Weekly Drift Report
```bash
#!/bin/bash
# Generate weekly drift report

echo "=== PPTX Drift Report (Last 7 Days) ==="
echo ""

echo "Contract Violations:"
grep "CONTRACT_VIOLATION" backend.log.* backend.log | wc -l

echo "Plan Drift Events:"
grep "PLAN_DRIFT" backend.log.* backend.log | wc -l

echo "Signing Drift Events:"
grep "SIGNING_DRIFT" backend.log.* backend.log | wc -l

echo ""
echo "Top Affected Documents (Plan Drift):"
grep "PLAN_DRIFT" backend.log.* backend.log | \
  grep -oP 'docId=\K[a-f0-9]+' | \
  sort | uniq -c | sort -rn | head -10
```

---

## 🔒 NON-CRASHING GUARANTEES

**IMPORTANT:** All drift detection is NON-CRASHING

- Drift counters increment
- Logs are emitted with 🚨 emoji for greppability
- **System continues serving requests**
- No exceptions thrown to user

**Example:**
```typescript
if (contractViolation) {
  console.error('🚨 [CONTRACT_VIOLATION] ...');
  incrementCounter('pptx_contract_violation_total', {...});
  // Return safe fallback - DO NOT THROW
  return { imageUrl: null, hasImage: false, error: '...' };
}
```

---

## 📋 MAINTENANCE CHECKLIST

### Weekly
- [ ] Check drift metrics: `curl /api/metrics | jq '.counters' | grep -i drift`
- [ ] Review drift logs: `grep -E "DRIFT|VIOLATION" backend.log | wc -l`
- [ ] If count > 0, investigate using playbook above

### Monthly
- [ ] Run drift report script
- [ ] Review alert thresholds (adjust if false positives)
- [ ] Check if new preview types need drift detection

### After Code Changes
- [ ] Search codebase for `hasImage` assignments - ensure contract honored
- [ ] Verify `assetsReady=true` only set when files actually exist
- [ ] Test signed URL generation in all environments

---

## 🎯 SUCCESS CRITERIA

**Healthy System:**
```json
{
  "pptx_contract_violation_total": 0,
  "pptx_plan_drift_total": 0,
  "pptx_signing_drift_total": 0
}
```

**Degrading System:**
```json
{
  "pptx_contract_violation_total{...}": 5,   // Code regression
  "pptx_plan_drift_total{...}": 23,          // Ingestion issues
  "pptx_signing_drift_total{...}": 12        // Storage auth issues
}
```

---

**Status:** ACTIVE
**Owner:** Backend Team
**Escalation:** If any drift metric > 0 for >30 minutes, escalate to oncall
