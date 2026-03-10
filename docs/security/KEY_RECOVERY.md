# Key Recovery Procedures

## Master Key (KODA_MASTER_KEY_BASE64)

### Storage
- **Production**: GCP Secret Manager (`projects/PROJECT_ID/secrets/KODA_MASTER_KEY_BASE64`)
- **Backup**: Encrypted export in offline storage (see below)

### Rotation Procedure
1. Generate new master key: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
2. Store as new version in Secret Manager
3. Set `KODA_KEY_VERSION` to new version number
4. Set `KODA_MASTER_KEY_V{old}_BASE64` to the previous key
5. Run key rotation worker to re-encrypt all records
6. After all records migrated, remove old key env var

### Recovery from Lost Key
- If master key is lost, ALL encrypted data is unrecoverable
- Maintain at minimum 2 independent backups of the master key
- Test key recovery quarterly

### Emergency Revocation
1. Rotate master key immediately
2. Re-encrypt all data with new key
3. Purge old key from all systems
4. Review audit logs for unauthorized access

## Tenant Keys
- Derived from master key via HKDF
- No separate backup needed — derivable from master key + salt
- Salt stored alongside encrypted payload

## Key Version History
| Version | Created | Status | Notes |
|---------|---------|--------|-------|
| 1 | Initial | Active | First production key |
