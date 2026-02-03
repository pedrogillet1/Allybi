# Koda Admin Dashboard SQL Layer

This directory contains SQL views and indexes for the Koda Admin Dashboard analytics system.

## Purpose

These SQL artifacts provide:
- **Pre-computed views** for fast dashboard queries
- **Optimized indexes** for telemetry table performance
- **Privacy-safe aggregates** (no PII exposed)
- **Deterministic outputs** for consistent analytics

## Directory Structure

```
db/
├── views/                           # SQL view definitions
│   ├── dau_view.sql                # Daily Active Users
│   ├── wau_view.sql                # Weekly/Monthly Active Users
│   ├── latency_view.sql            # Latency percentiles (LLM & E2E)
│   ├── cost_view.sql               # LLM cost & token usage
│   ├── reliability_view.sql        # Error rates & reliability KPIs
│   ├── admin_overview_daily.sql    # Combined overview metrics
│   ├── quality_by_domain_daily.sql # Answer quality by domain/intent
│   ├── intents_by_domain_daily.sql # Intent/domain distribution
│   ├── keywords_top_daily.sql      # Keyword analytics
│   └── patterns_top_daily.sql      # Pattern analytics
│
└── sql/
    ├── indexes/                     # Performance indexes
    │   ├── 001_telemetry_modelcall_indexes.sql
    │   ├── 002_telemetry_retrieval_indexes.sql
    │   ├── 003_telemetry_usage_indexes.sql
    │   ├── 004_telemetry_ingestion_indexes.sql
    │   ├── 005_query_telemetry_indexes.sql
    │   └── 006_token_usage_indexes.sql
    └── README.md                    # This file
```

## How Admin Dashboard Uses These Views

| Dashboard Tab | Primary Views |
|--------------|---------------|
| Overview | `admin_overview_daily`, `admin_dau_daily` |
| Users | `admin_dau_daily_combined`, `admin_wau_weekly` |
| Files | `admin_ingestion_reliability_by_type_daily` |
| Queries | `admin_quality_by_domain_daily`, `admin_intents_by_domain_daily` |
| Quality | `admin_quality_summary_daily`, `admin_quality_by_intent_daily` |
| LLM Cost | `admin_llm_cost_by_model_daily`, `admin_llm_cost_daily` |
| Reliability | `admin_llm_reliability_daily`, `admin_reliability_summary_daily` |
| Marketing | `admin_keywords_daily`, `admin_patterns_daily` |

## Relation to Prisma Models

These views query the following Prisma models (table names in parentheses):

| Prisma Model | Table Name | Used In Views |
|-------------|------------|---------------|
| `ModelCall` | `model_calls` | latency, cost, reliability |
| `UsageEvent` | `usage_events` | dau, wau |
| `RetrievalEvent` | `retrieval_events` | quality, intents, domains |
| `IngestionEvent` | `ingestion_events` | reliability, files |
| `QueryTelemetry` | `query_telemetry` | dau, keywords, patterns |
| `TokenUsage` | `token_usage` | cost |
| `Message` | `messages` | overview |
| `Document` | `documents` | overview |
| `ErrorLog` | `error_logs` | reliability |

## When to Regenerate Views

Regenerate views when:
1. **Schema changes**: A Prisma model's columns are renamed/added
2. **New analytics requirements**: Dashboard needs new metrics
3. **Performance optimization**: Query patterns change significantly

To regenerate, run the SQL files in order:
```bash
# From project root
psql $DATABASE_URL -f db/views/dau_view.sql
psql $DATABASE_URL -f db/views/wau_view.sql
# ... etc
```

Or use a migration tool to apply all at once.

## Safety Rules

### READ-ONLY
- All views are SELECT-only (no INSERT, UPDATE, DELETE)
- Views do not modify underlying data
- Safe to query at any time without locks

### NO PII
- Views output aggregates only (counts, rates, percentiles)
- No raw emails, IPs, queries, or file contents
- User identity limited to `userId` (UUID)

### DETERMINISTIC
- Same input data = same output
- No randomness or external dependencies
- UTC timestamps only

### INDEXED
- Views leverage existing indexes on telemetry tables
- Use `CONCURRENTLY` for index creation in production
- Partial indexes for common filter patterns

## Index Strategy

Indexes are designed for:

1. **Time-range scans**: All tables indexed on `at`/`timestamp` DESC
2. **User filtering**: Composite `(userId, timestamp)` indexes
3. **Dimension grouping**: Indexes on `domain`, `intent`, `provider`, `model`
4. **Error analysis**: Partial indexes for `status = 'fail'`
5. **Array search**: GIN indexes for `matchedKeywords`, `matchedPatterns`

## Performance Notes

### View Materialization
For high-traffic dashboards, consider materializing views:
```sql
CREATE MATERIALIZED VIEW admin_overview_daily_mat AS
SELECT * FROM admin_overview_daily;

-- Refresh periodically (e.g., every hour)
REFRESH MATERIALIZED VIEW CONCURRENTLY admin_overview_daily_mat;
```

### Query Caps
Dashboard services use `LIMIT` and `take` to cap result sets:
- List queries: max 200 rows
- Aggregates: scoped to time range
- Array scans: limited to 100k rows

### Connection Pooling
Use connection pooling (PgBouncer/Supabase pooler) for dashboard queries to avoid exhausting connections.

## Troubleshooting

### Slow Dashboard Queries
1. Check if indexes exist: `\di` in psql
2. Run `EXPLAIN ANALYZE` on slow queries
3. Consider adding missing composite indexes
4. Check for missing `WHERE` clauses on time range

### Missing Data in Views
1. Verify telemetry tables have data: `SELECT COUNT(*) FROM model_calls`
2. Check time range alignment (UTC vs local)
3. Ensure Prisma migrations have run

### Index Creation Failures
1. Use `CONCURRENTLY` to avoid locks
2. Check for existing indexes with same name
3. Verify table names match Prisma schema

## Changelog

| Date | Change |
|------|--------|
| 2024-02 | Initial views and indexes created |

---

**Maintained by**: Koda Backend Team
**Last Updated**: Auto-generated
