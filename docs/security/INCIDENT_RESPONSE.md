# Incident Response Runbook

## Severity Levels

| Level | Description | Response Time | Example |
|-------|-------------|---------------|---------|
| P0 - Critical | Active data breach, key compromise | Immediate | Master key exposed, database dump |
| P1 - High | Potential breach, auth bypass | < 1 hour | Brute force success, XSS confirmed |
| P2 - Medium | Vulnerability discovered, anomaly | < 4 hours | New CVE in dependency, unusual patterns |
| P3 - Low | Policy violation, minor issue | < 24 hours | Failed audit check, stale sessions |

## Phase 1: Detection

### Automated Alerts
- **Sentry**: Fatal/error level alerts for auth failures, key events
- **Audit Logs**: GCS append-only store with pattern detection
- **CI/CD**: Security scan failures block deployment

### Manual Indicators
- User reports of unauthorized access
- Unusual Pinecone query volume
- GCS access pattern anomalies
- Database query latency spikes

## Phase 2: Containment

### Immediate Actions
1. **Revoke sessions**: `UPDATE "Session" SET "isActive" = false WHERE ...`
2. **Rotate keys**: Generate new master key, deploy via Secret Manager
3. **Block IPs**: Cloud Armor / firewall rules
4. **Disable affected endpoints**: Feature flag or deploy with route removed

### Communication
- Internal: Notify engineering team immediately
- External: Prepare user notification within 72 hours (GDPR/LGPD)

## Phase 3: Eradication

1. Identify root cause from audit logs and Sentry traces
2. Patch vulnerability
3. Re-encrypt affected data with new key
4. Run key rotation worker for all records

## Phase 4: Recovery

1. Deploy patched code via Cloud Run
2. Verify all services healthy
3. Re-enable disabled features
4. Monitor for recurrence (48-hour watch period)

## Phase 5: Lessons Learned

1. Conduct post-mortem within 5 business days
2. Update threat model with new attack vector
3. Add detection rule for the attack pattern
4. Update this runbook with new procedures

## Emergency Contacts

| Role | Contact |
|------|---------|
| Security Lead | [Configure] |
| Cloud Admin | [Configure] |
| Legal/Privacy | [Configure] |
