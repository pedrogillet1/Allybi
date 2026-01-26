# Koda Analytics Dashboard - Validation Checklist

This checklist ensures the analytics dashboard is complete and functioning correctly.

---

## Pre-Deployment Checklist

### 1. Database Setup

```bash
# Run Prisma migration to create QueryTelemetry table
cd backend
npx prisma migrate dev --name add_query_telemetry

# Verify table exists
npx prisma studio
# Navigate to QueryTelemetry model
```

- [ ] Migration runs without errors
- [ ] `query_telemetry` table exists in PostgreSQL
- [ ] All indexes are created (see schema.prisma)

---

### 2. Backend Endpoint Verification

Test each endpoint manually or with curl:

```bash
# Set your auth token
TOKEN="your-admin-jwt-token"
BASE_URL="http://localhost:3001/api/dashboard/analytics"

# Test Intent Analytics
curl -H "Authorization: Bearer $TOKEN" "$BASE_URL/intents?days=7"
# Expected: { success: true, data: { byIntent: [...], ... } }

# Test Retrieval Analytics
curl -H "Authorization: Bearer $TOKEN" "$BASE_URL/retrieval?days=7"
# Expected: { success: true, data: { chunksDistribution: [...], ... } }

# Test Quality Analytics
curl -H "Authorization: Bearer $TOKEN" "$BASE_URL/quality?days=7"
# Expected: { success: true, data: { usefulRate: ..., ... } }

# Test Language Analytics
curl -H "Authorization: Bearer $TOKEN" "$BASE_URL/language?days=7"
# Expected: { success: true, data: { byLanguage: [...], ... } }

# Test Performance Analytics
curl -H "Authorization: Bearer $TOKEN" "$BASE_URL/performance?days=7"
# Expected: { success: true, data: { latencyPercentiles: {...}, ... } }

# Test Telemetry Cost Analytics
curl -H "Authorization: Bearer $TOKEN" "$BASE_URL/telemetry-costs?days=30"
# Expected: { success: true, data: { totalCost: ..., ... } }

# Test Query List
curl -H "Authorization: Bearer $TOKEN" "$BASE_URL/queries?limit=10"
# Expected: { success: true, data: { queries: [...], total: ... } }

# Test Query Detail (use an ID from the list)
curl -H "Authorization: Bearer $TOKEN" "$BASE_URL/queries/QUERY_ID"
# Expected: { success: true, data: { id: ..., intent: {...}, ... } }
```

- [ ] `/intents` returns 200 with valid data
- [ ] `/retrieval` returns 200 with valid data
- [ ] `/quality` returns 200 with valid data
- [ ] `/language` returns 200 with valid data
- [ ] `/performance` returns 200 with valid data
- [ ] `/telemetry-costs` returns 200 with valid data
- [ ] `/queries` returns 200 with paginated list
- [ ] `/queries/:id` returns 200 with full telemetry
- [ ] All endpoints require admin authentication (401 without token)

---

### 3. Telemetry Capture Verification

Make a test query through the RAG pipeline and verify telemetry is captured:

```bash
# Make a test query (replace with your actual RAG endpoint)
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text": "What is the summary of my documents?", "userId": "test-user"}' \
  "http://localhost:3001/api/rag/stream"

# Check that telemetry was written
curl -H "Authorization: Bearer $TOKEN" "$BASE_URL/queries?limit=1"
# Should include the query you just made
```

- [ ] Test query creates a `QueryTelemetry` record
- [ ] Intent fields are populated correctly
- [ ] Retrieval fields are populated correctly
- [ ] Language fields are populated correctly
- [ ] Latency fields are populated correctly
- [ ] Token fields are populated correctly
- [ ] Streaming fields are populated correctly
- [ ] Pipeline fields are populated correctly

---

### 4. Frontend Verification

```bash
# Start the analytics dashboard
cd koda-analytics-dashboard
npm run dev
```

Open `http://localhost:5173` in browser:

- [ ] Dashboard loads without errors
- [ ] Environment switcher works (prod/staging/dev)
- [ ] Overview page shows data
- [ ] Can fetch control plane analytics (intent, retrieval, quality, etc.)
- [ ] Query list page loads
- [ ] Query detail modal shows full telemetry

---

### 5. Data Consistency Verification

```sql
-- Run these queries to verify data consistency

-- Total queries match overview count
SELECT COUNT(*) FROM query_telemetry;

-- Intent breakdown sums to total
SELECT intent, COUNT(*)
FROM query_telemetry
GROUP BY intent;

-- Useful rate calculation is correct
SELECT
  ROUND(100.0 * SUM(CASE WHEN "isUseful" THEN 1 ELSE 0 END) / COUNT(*), 2) as useful_rate
FROM query_telemetry;

-- Latency percentiles are reasonable
SELECT
  PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY "totalMs") as p50,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "totalMs") as p95,
  PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY "totalMs") as p99
FROM query_telemetry
WHERE "totalMs" IS NOT NULL;
```

- [ ] Query counts match between endpoints and DB
- [ ] Intent distribution sums to 100%
- [ ] Useful rate matches DB calculation
- [ ] Latency percentiles are computed correctly

---

### 6. Performance Verification

```bash
# Test response times (should all be <500ms)
time curl -H "Authorization: Bearer $TOKEN" "$BASE_URL/intents?days=7"
time curl -H "Authorization: Bearer $TOKEN" "$BASE_URL/quality?days=7"
time curl -H "Authorization: Bearer $TOKEN" "$BASE_URL/queries?limit=50"
```

- [ ] `/intents` responds in <500ms
- [ ] `/retrieval` responds in <500ms
- [ ] `/quality` responds in <500ms
- [ ] `/performance` responds in <500ms
- [ ] `/queries` responds in <500ms
- [ ] Cache is working (second request is faster)

---

### 7. Environment Switching Verification

- [ ] Switch to Production - data loads
- [ ] Switch to Staging - data loads (or shows empty)
- [ ] Switch to Development - data loads
- [ ] Token is correctly set per environment

---

### 8. Error Handling Verification

```bash
# Test error cases
curl -H "Authorization: Bearer invalid-token" "$BASE_URL/intents"
# Expected: 401 Unauthorized

curl "$BASE_URL/intents"
# Expected: 401 Unauthorized (no token)

curl -H "Authorization: Bearer $TOKEN" "$BASE_URL/queries/invalid-uuid"
# Expected: 404 or graceful error
```

- [ ] Invalid token returns 401
- [ ] Missing token returns 401
- [ ] Invalid query ID returns 404
- [ ] Network errors show toast in frontend

---

### 9. Coverage Completeness Check

Verify every metric in the coverage matrix is accessible:

**Intent Metrics:**
- [ ] Intent type breakdown visible
- [ ] Confidence scores visible
- [ ] Question type breakdown visible
- [ ] Domain breakdown visible
- [ ] Depth breakdown visible
- [ ] Multi-intent rate visible
- [ ] Classification time visible

**Retrieval Metrics:**
- [ ] Chunks distribution visible
- [ ] Thin retrieval rate visible
- [ ] Adequacy rate visible
- [ ] Evidence gate actions visible
- [ ] Relevance scores visible

**Quality Metrics:**
- [ ] Useful rate visible
- [ ] Fallback rate visible
- [ ] Failure categories visible
- [ ] Sources missing rate visible
- [ ] Citation count visible

**Language Metrics:**
- [ ] Language breakdown visible
- [ ] Source breakdown visible
- [ ] Mismatch rate visible
- [ ] Enforcement rate visible

**Performance Metrics:**
- [ ] Latency percentiles visible
- [ ] TTFT percentiles visible
- [ ] Stage breakdown visible
- [ ] SSE health visible
- [ ] Latency trend visible

**Cost Metrics:**
- [ ] Total cost visible
- [ ] Cost per query visible
- [ ] Model breakdown visible
- [ ] Token breakdown visible
- [ ] Daily trend visible

---

## Post-Deployment Monitoring

### Daily Checks

- [ ] Dashboard is accessible
- [ ] Telemetry is being captured (new queries appearing)
- [ ] No 500 errors in logs
- [ ] Cache is functioning (check cache stats endpoint)

### Weekly Checks

- [ ] Review quality trends (is useful rate improving?)
- [ ] Review latency trends (any degradation?)
- [ ] Review cost trends (any spikes?)
- [ ] Review failure categories (any new patterns?)

### Monthly Checks

- [ ] Clean up old telemetry data (>90 days)
- [ ] Review and update coverage matrix
- [ ] Identify any missing metrics
- [ ] Plan improvements based on insights

---

## Troubleshooting

### Issue: No telemetry data appearing

1. Check if TelemetryBuilder is being created in orchestrator
2. Check if `queryTelemetryService.save()` is being called
3. Check for errors in backend logs
4. Verify Prisma connection to database

### Issue: Dashboard showing stale data

1. Clear cache: POST `/api/dashboard/analytics/refresh`
2. Check cache stats: GET `/api/dashboard/analytics/cache-stats`
3. Verify frontend is calling refreshControlPlane()

### Issue: Percentile calculations wrong

1. Verify PostgreSQL has percentile_cont function
2. Check for NULL values in latency columns
3. Verify query time range is correct

### Issue: Slow endpoint responses

1. Check database indexes exist
2. Add EXPLAIN ANALYZE to slow queries
3. Consider adding more specific indexes
4. Increase cache TTL for expensive queries

---

## Definition of Done

The analytics dashboard is complete when:

1. **All 7 phases are implemented** (schema, service, endpoints, API client, context, matrix, checklist)
2. **All endpoints return valid data** (verified manually or with tests)
3. **Telemetry is captured for every query** (verified by making test queries)
4. **Dashboard shows all metrics from coverage matrix** (verified visually)
5. **Environment switching works** (verified manually)
6. **Performance is acceptable** (<500ms per endpoint)
7. **Error handling is robust** (401/404/500 cases handled)
8. **Documentation is complete** (coverage matrix + checklist)
