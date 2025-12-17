# Stub Services Documentation

> **Last Updated:** December 2024
> **Status:** Production Risk Assessment Required

This document catalogs all stub/placeholder services in the KODA backend and their associated risks.

---

## Table of Contents

1. [Overview](#overview)
2. [Critical Security Stubs](#critical-security-stubs)
3. [Removed Services](#removed-services)
4. [Disabled Service Stubs](#disabled-service-stubs)
5. [Configuration Reference](#configuration-reference)
6. [Migration Guide](#migration-guide)

---

## Overview

The following services contain stub implementations that may silently bypass functionality or return mock data. Each stub service is controlled by environment variables that determine behavior in different environments.

### Risk Levels

| Level | Description |
|-------|-------------|
| **CRITICAL** | Security bypass - must be replaced before production |
| **HIGH** | Functional bypass - will cause incorrect behavior |
| **MEDIUM** | Data loss - tracking/analytics not persisted |
| **LOW** | Cosmetic - non-essential functionality missing |

---

## Critical Security Stubs

### `securityStubs.service.ts`

**Risk Level:** CRITICAL
**Control:** `SECURITY_STUBS_ENABLED` environment variable

#### Affected Services

| Service | Method | Risk | Description |
|---------|--------|------|-------------|
| `rbacService` | `hasPermission()` | CRITICAL | Returns `true` - bypasses authorization |
| `rbacService` | `hasAllPermissions()` | CRITICAL | Returns `true` - bypasses authorization |
| `rbacService` | `hasAnyPermission()` | CRITICAL | Returns `true` - bypasses authorization |
| `rbacService` | `assignRole()` | HIGH | No-op - roles not actually assigned |
| `rbacService` | `revokeRole()` | HIGH | No-op - roles not actually revoked |
| `twoFactorService` | `verify2FA()` | CRITICAL | Returns success - bypasses 2FA |
| `twoFactorService` | `verify2FALogin()` | CRITICAL | Returns success - bypasses 2FA login |
| `twoFactorService` | `enable2FA()` | HIGH | Returns fake setup data |
| `gdprService` | `exportUserData()` | HIGH | No-op - GDPR compliance violated |
| `gdprService` | `deleteUserData()` | HIGH | No-op - GDPR compliance violated |
| `auditLogService` | `log()` | MEDIUM | No audit trail recorded |
| `securityMonitoringService` | All methods | MEDIUM | No threat detection |

#### Production Configuration

```bash
# REQUIRED for production - throws errors instead of bypassing
SECURITY_STUBS_ENABLED=false
```

#### Error Handling

When `SECURITY_STUBS_ENABLED=false`, critical methods throw `SecurityStubError`:

```typescript
try {
  await rbacService.hasPermission(userId, permission);
} catch (error) {
  if (error instanceof SecurityStubError) {
    // Handle unimplemented security service
    console.error('Security service not implemented:', error.serviceName);
  }
}
```

---

## Removed Services

### `pendingUser.service.ts`

**Risk Level:** HIGH
**Status:** Service completely removed - all methods throw errors

#### Impact

This service was used for multi-step user registration. All methods now throw `PendingUserServiceRemovedError`.

#### Affected Methods

- `createPendingUser()` - Throws immediately
- `getPendingUser()` - Throws immediately
- `deletePendingUser()` - Throws immediately
- `verifyPendingUserEmail()` - Throws immediately
- `verifyPendingUserPhone()` - Throws immediately
- `resendEmailCode()` - Throws immediately
- `addPhoneToPending()` - Throws immediately

#### Migration Path

1. **Option A:** Implement direct user creation with email verification token
2. **Option B:** Use Redis-based temporary storage for pending registrations
3. **Option C:** Implement a new `PendingUserService` backed by database

---

## Disabled Service Stubs

### `sms.service.ts`

**Risk Level:** HIGH
**Control:** `SMS_REQUIRED` environment variable

#### Behavior

| `SMS_REQUIRED` | Behavior when Twilio not configured |
|----------------|-------------------------------------|
| `true` (default) | Throws `SMSServiceDisabledError` |
| `false` | Returns `{ sent: false, disabled: true }` with warning |

#### Configuration

```bash
# Development - allows silent skip (NOT recommended for production)
SMS_REQUIRED=false

# Production - throws error if SMS cannot be sent
SMS_REQUIRED=true  # or simply don't set (default is true)
```

#### Required Environment Variables

```bash
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+1234567890
```

---

### `analyticsEngine.service.ts`

**Risk Level:** MEDIUM
**Control:** `ANALYTICS_TRACKING_ENABLED` environment variable

#### Stubbed Services

| Service | Description |
|---------|-------------|
| `aggregationService` | Daily/weekly/monthly analytics aggregation |
| `analyticsTrackingService` | Event tracking, feedback recording, RAG metrics |

#### Behavior

| `ANALYTICS_TRACKING_ENABLED` | Behavior |
|------------------------------|----------|
| `true` (default) | Returns mock data with console warnings |
| `false` | Throws `AnalyticsStubError` |

#### Fire-and-Forget Methods

These methods never throw, only log warnings:
- `incrementConversationMessages()`
- `recordRAGQuery()`

#### Configuration

```bash
# Development - allows stubs with warnings
ANALYTICS_TRACKING_ENABLED=true

# Production - throws error for unimplemented tracking
ANALYTICS_TRACKING_ENABLED=false
```

---

## Configuration Reference

### Environment Variables Summary

| Variable | Default | Description |
|----------|---------|-------------|
| `SECURITY_STUBS_ENABLED` | `true` | Allow security stub bypass (INSECURE) |
| `SMS_REQUIRED` | `true` | Require SMS to be configured |
| `ANALYTICS_TRACKING_ENABLED` | `true` | Allow analytics stub data |

### Recommended Production Configuration

```bash
# Security - MUST be false in production
SECURITY_STUBS_ENABLED=false

# SMS - true to ensure verification works
SMS_REQUIRED=true
TWILIO_ACCOUNT_SID=xxx
TWILIO_AUTH_TOKEN=xxx
TWILIO_PHONE_NUMBER=xxx

# Analytics - false to catch unimplemented tracking
ANALYTICS_TRACKING_ENABLED=false
```

---

## Migration Guide

### Implementing Real Services

#### 1. RBAC Service

Replace `securityStubs.service.ts` exports with real implementation:

```typescript
// services/rbac.service.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const rbacService = {
  async hasPermission(userId: string, permission: { resource: string; action: string }) {
    const userRoles = await prisma.userRole.findMany({
      where: { userId },
      include: { role: { include: { permissions: true } } }
    });

    return userRoles.some(ur =>
      ur.role.permissions.some(p =>
        p.resource === permission.resource && p.action === permission.action
      )
    );
  },
  // ... implement other methods
};
```

#### 2. Two-Factor Authentication

Implement using `speakeasy` or similar library:

```typescript
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';

export const twoFactorService = {
  async enable2FA(userId: string) {
    const secret = speakeasy.generateSecret({ name: 'KODA' });
    const qrCode = await QRCode.toDataURL(secret.otpauth_url);
    // Store secret in database
    return { secret: secret.base32, qrCode, backupCodes: generateBackupCodes() };
  },

  async verify2FA(userId: string, token: string) {
    const user = await getUser(userId);
    return speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token
    });
  }
};
```

#### 3. Analytics Tracking

Implement real database writes or use analytics service:

```typescript
export const analyticsTrackingService = {
  async trackEvent(params: TrackEventParams) {
    await prisma.analyticsEvent.create({
      data: {
        eventType: params.type,
        userId: params.userId,
        metadata: params.metadata,
        timestamp: new Date()
      }
    });
    return { success: true, id: event.id };
  }
};
```

---

## Verification Checklist

Before deploying to production, verify:

- [ ] `SECURITY_STUBS_ENABLED=false` is set
- [ ] All RBAC endpoints return 403 when unauthorized
- [ ] 2FA verification actually validates tokens
- [ ] SMS messages are actually sent
- [ ] GDPR export/delete operations work correctly
- [ ] Audit logs are being recorded
- [ ] Analytics events are being persisted

---

## Custom Errors Reference

| Error Class | Service | Description |
|-------------|---------|-------------|
| `SecurityStubError` | securityStubs | Thrown when security stub called in production mode |
| `PendingUserServiceRemovedError` | pendingUser | Thrown when removed service method called |
| `SMSServiceDisabledError` | sms | Thrown when SMS required but not configured |
| `AnalyticsStubError` | analyticsEngine | Thrown when analytics stub called in production mode |

All errors have `isXxxStub` or `isServiceRemoved` boolean properties for easy identification.
