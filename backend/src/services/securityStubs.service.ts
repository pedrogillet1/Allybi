/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                    ⚠️  PRODUCTION RISK - STUB FILE  ⚠️                     ║
 * ╠═══════════════════════════════════════════════════════════════════════════╣
 * ║ This file contains STUB implementations for deleted security services.    ║
 * ║                                                                           ║
 * ║ CRITICAL SECURITY WARNING:                                                ║
 * ║ - rbacService: Permission checks ALWAYS PASS (authorization bypass)       ║
 * ║ - twoFactorService: 2FA verification ALWAYS SUCCEEDS (auth bypass)        ║
 * ║ - auditLogService: No audit trail is recorded                             ║
 * ║ - gdprService: Data export/delete operations are NO-OPs                   ║
 * ║                                                                           ║
 * ║ PRODUCTION DEPLOYMENT:                                                    ║
 * ║ Set SECURITY_STUBS_ENABLED=false in production to throw errors            ║
 * ║ instead of silently bypassing security checks.                            ║
 * ║                                                                           ║
 * ║ TODO: Replace with real implementations before production use.            ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION & ERROR HANDLING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Feature flag to control stub behavior.
 * When false (production), critical security stubs will throw errors.
 * When true (development), stubs will silently pass (INSECURE).
 */
const SECURITY_STUBS_ENABLED = process.env.SECURITY_STUBS_ENABLED !== 'false';

/**
 * Custom error for unimplemented security features
 */
export class SecurityStubError extends Error {
  public readonly isSecurityStub = true;
  public readonly serviceName: string;
  public readonly methodName: string;

  constructor(serviceName: string, methodName: string) {
    super(
      `[SECURITY STUB] ${serviceName}.${methodName}() is not implemented. ` +
      `This is a stub that bypasses security checks. ` +
      `Set SECURITY_STUBS_ENABLED=true to allow stubs (INSECURE) or implement the real service.`
    );
    this.name = 'SecurityStubError';
    this.serviceName = serviceName;
    this.methodName = methodName;
  }
}

/**
 * Helper to create stub methods that either throw or return default values
 */
function createSecurityStub<T>(
  serviceName: string,
  methodName: string,
  defaultValue: T,
  isCritical: boolean = false
): T | never {
  if (!SECURITY_STUBS_ENABLED && isCritical) {
    throw new SecurityStubError(serviceName, methodName);
  }
  if (SECURITY_STUBS_ENABLED) {
    console.warn(`⚠️ [SECURITY STUB] ${serviceName}.${methodName}() called - returning mock data`);
  }
  return defaultValue;
}

// ═══════════════════════════════════════════════════════════════════════════
// Security Monitoring Service Stub
// ═══════════════════════════════════════════════════════════════════════════
export enum SecurityEventType {
  UNAUTHORIZED_ACCESS_ATTEMPT = 'UNAUTHORIZED_ACCESS_ATTEMPT',
  SUSPICIOUS_IP_BEHAVIOR = 'SUSPICIOUS_IP_BEHAVIOR',
  BRUTE_FORCE_DETECTED = 'BRUTE_FORCE_DETECTED',
  MASS_DOWNLOAD_DETECTED = 'MASS_DOWNLOAD_DETECTED',
  DATA_EXFILTRATION_ATTEMPT = 'DATA_EXFILTRATION_ATTEMPT',
}

export enum ThreatLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export const securityMonitoringService = {
  recordSecurityEvent: async (_event: any) => {},
  detectBruteForce: async (_userId: string, _ip: string) => ({ threatLevel: ThreatLevel.LOW, detected: false }),
  detectMassDownload: async (_userId: string, _ip: string) => ({ threatLevel: ThreatLevel.LOW, detected: false }),
  detectSuspiciousIP: async (_ip: string) => ({ threatLevel: ThreatLevel.LOW, detected: false }),
  detectUnauthorizedAccess: async (_userId: string) => ({ threatLevel: ThreatLevel.LOW, detected: false }),
  getRecentSecurityEvents: async (_limit: number) => [],
  getSecurityMetrics: async (_hours: number) => ({}),
};

export default securityMonitoringService;

// ═══════════════════════════════════════════════════════════════════════════
// Session Management Service Stub
// ═══════════════════════════════════════════════════════════════════════════
export const sessionManagementService = {
  getUserSessionSummary: async (_userId: string) => ({ activeSessions: 0, sessions: [] }),
  revokeSession: async (_sessionId: string, _userId: string) => true,
  invalidateAllUserSessions: async (_userId: string, _exceptSessionId?: string) => 0,
};

// ═══════════════════════════════════════════════════════════════════════════
// Brute Force Protection Service Stub
// ═══════════════════════════════════════════════════════════════════════════
export const bruteForceProtection = {
  unlock: (_identifier: string, _type: string) => true,
  getStatistics: () => ({ blockedIPs: 0, blockedUsers: 0 }),
};

// ═══════════════════════════════════════════════════════════════════════════
// Security Dashboard Service Stub
// ═══════════════════════════════════════════════════════════════════════════
export const securityDashboardService = {
  getSecurityOverview: async (_hours: number) => ({ status: 'ok', threats: 0 }),
  getSecurityTrends: async (_days: number) => ({ trends: [] }),
  getSecurityInsights: async () => [],
  getComplianceReport: async () => ({ compliant: true, issues: [] }),
  getRealtimeStatus: async () => ({ status: 'healthy' }),
};

// ═══════════════════════════════════════════════════════════════════════════
// Audit Log Service Stub - ⚠️ WARNING: No audit trail when stubbed
// ═══════════════════════════════════════════════════════════════════════════
export enum AuditAction {
  PERMISSION_REVOKE = 'PERMISSION_REVOKE',
  DOCUMENT_VIEW = 'DOCUMENT_VIEW',
  DOCUMENT_DOWNLOAD = 'DOCUMENT_DOWNLOAD',
  DOCUMENT_DELETE = 'DOCUMENT_DELETE',
}

export enum AuditStatus {
  SUCCESS = 'SUCCESS',
  FAILURE = 'FAILURE',
}

export const auditLogService = {
  logFromRequest: async (_req: any, _action: AuditAction, _status: AuditStatus, _resourceId?: string, _metadata?: any) => {
    console.warn(`⚠️ [SECURITY STUB] auditLogService.logFromRequest() - NO AUDIT TRAIL RECORDED for action: ${_action}`);
  },
  log: async (_params: any) => {
    console.warn(`⚠️ [SECURITY STUB] auditLogService.log() - NO AUDIT TRAIL RECORDED`);
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// RBAC Service Stub - ⚠️ CRITICAL: Authorization bypass when stubbed
// ═══════════════════════════════════════════════════════════════════════════
export const rbacService = {
  hasPermission: async (_userId: string, _permission: { resource: string; action: string }): Promise<boolean> => {
    if (!SECURITY_STUBS_ENABLED) {
      throw new SecurityStubError('rbacService', 'hasPermission');
    }
    console.warn(`⚠️ [SECURITY STUB] rbacService.hasPermission() - BYPASSING AUTHORIZATION CHECK`);
    return true;
  },
  hasAllPermissions: async (_userId: string, _permissions: Array<{ resource: string; action: string }>): Promise<boolean> => {
    if (!SECURITY_STUBS_ENABLED) {
      throw new SecurityStubError('rbacService', 'hasAllPermissions');
    }
    console.warn(`⚠️ [SECURITY STUB] rbacService.hasAllPermissions() - BYPASSING AUTHORIZATION CHECK`);
    return true;
  },
  hasAnyPermission: async (_userId: string, _permissions: Array<{ resource: string; action: string }>): Promise<boolean> => {
    if (!SECURITY_STUBS_ENABLED) {
      throw new SecurityStubError('rbacService', 'hasAnyPermission');
    }
    console.warn(`⚠️ [SECURITY STUB] rbacService.hasAnyPermission() - BYPASSING AUTHORIZATION CHECK`);
    return true;
  },
  getUserRoles: async (_userId: string) => {
    console.warn(`⚠️ [SECURITY STUB] rbacService.getUserRoles() - returning empty array`);
    return [] as any[];
  },
  getUserPermissions: async (_userId: string) => {
    console.warn(`⚠️ [SECURITY STUB] rbacService.getUserPermissions() - returning empty set`);
    return new Set<string>();
  },
  getAllRoles: async () => {
    console.warn(`⚠️ [SECURITY STUB] rbacService.getAllRoles() - returning empty array`);
    return [];
  },
  getAllPermissions: async () => {
    console.warn(`⚠️ [SECURITY STUB] rbacService.getAllPermissions() - returning empty array`);
    return [];
  },
  assignRole: async (_userId: string, _roleName: string, _assignedBy: string, _expiresAt?: Date): Promise<boolean> => {
    if (!SECURITY_STUBS_ENABLED) {
      throw new SecurityStubError('rbacService', 'assignRole');
    }
    console.warn(`⚠️ [SECURITY STUB] rbacService.assignRole() - NO-OP, role not actually assigned`);
    return true;
  },
  revokeRole: async (_userId: string, _roleName: string, _revokedBy: string): Promise<boolean> => {
    if (!SECURITY_STUBS_ENABLED) {
      throw new SecurityStubError('rbacService', 'revokeRole');
    }
    console.warn(`⚠️ [SECURITY STUB] rbacService.revokeRole() - NO-OP, role not actually revoked`);
    return true;
  },
  createRole: async (_name: string, _description: string, _permissions: string[], _createdBy: string) => {
    if (!SECURITY_STUBS_ENABLED) {
      throw new SecurityStubError('rbacService', 'createRole');
    }
    console.warn(`⚠️ [SECURITY STUB] rbacService.createRole() - NO-OP, role not actually created`);
    return {};
  },
  deleteRole: async (_roleId: string, _deletedBy: string): Promise<boolean> => {
    if (!SECURITY_STUBS_ENABLED) {
      throw new SecurityStubError('rbacService', 'deleteRole');
    }
    console.warn(`⚠️ [SECURITY STUB] rbacService.deleteRole() - NO-OP, role not actually deleted`);
    return true;
  },
  initializeSystemRoles: async () => {
    console.warn(`⚠️ [SECURITY STUB] rbacService.initializeSystemRoles() - NO-OP`);
  },
  clearAllCaches: () => {
    console.warn(`⚠️ [SECURITY STUB] rbacService.clearAllCaches() - NO-OP`);
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// Two Factor Authentication Service Stub - ⚠️ CRITICAL: Auth bypass when stubbed
// ═══════════════════════════════════════════════════════════════════════════
export const twoFactorService = {
  enable2FA: async (_userId: string) => {
    if (!SECURITY_STUBS_ENABLED) {
      throw new SecurityStubError('twoFactorService', 'enable2FA');
    }
    console.warn(`⚠️ [SECURITY STUB] twoFactorService.enable2FA() - returning fake 2FA setup`);
    return { secret: '', qrCode: '', backupCodes: [] as string[] };
  },
  verify2FA: async (_userId: string, _token: string): Promise<{ success: boolean }> => {
    if (!SECURITY_STUBS_ENABLED) {
      throw new SecurityStubError('twoFactorService', 'verify2FA');
    }
    console.warn(`⚠️ [SECURITY STUB] twoFactorService.verify2FA() - BYPASSING 2FA VERIFICATION`);
    return { success: true };
  },
  verify2FALogin: async (_userId: string, _token: string): Promise<{ success: boolean }> => {
    if (!SECURITY_STUBS_ENABLED) {
      throw new SecurityStubError('twoFactorService', 'verify2FALogin');
    }
    console.warn(`⚠️ [SECURITY STUB] twoFactorService.verify2FALogin() - BYPASSING 2FA LOGIN VERIFICATION`);
    return { success: true };
  },
  disable2FA: async (_userId: string, _password: string): Promise<{ success: boolean }> => {
    if (!SECURITY_STUBS_ENABLED) {
      throw new SecurityStubError('twoFactorService', 'disable2FA');
    }
    console.warn(`⚠️ [SECURITY STUB] twoFactorService.disable2FA() - NO-OP, 2FA not actually disabled`);
    return { success: true };
  },
  getBackupCodes: async (_userId: string) => {
    console.warn(`⚠️ [SECURITY STUB] twoFactorService.getBackupCodes() - returning empty backup codes`);
    return { codes: [] as string[] };
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// Notification Service Stub
// ═══════════════════════════════════════════════════════════════════════════
export const notificationService = {
  getUserNotifications: async (_userId: string, _limit?: number) => ({ notifications: [] as any[], unreadCount: 0 }),
  markNotificationAsRead: async (_notificationId: string, _userId: string) => {},
  markAllNotificationsAsRead: async (_userId: string) => {},
  deleteNotification: async (_notificationId: string, _userId: string) => {},
  triggerReminderNotification: async (_userId: string, _title: string) => {},
};

export const triggerReminderNotification = notificationService.triggerReminderNotification;

// ═══════════════════════════════════════════════════════════════════════════
// GDPR Service Stub - ⚠️ CRITICAL: Data operations are NO-OPs when stubbed
// ═══════════════════════════════════════════════════════════════════════════
export const gdprService = {
  exportUserData: async (_params: { userId: string; format?: string; includeDocuments?: boolean }): Promise<{
    success: boolean;
    exportId: string;
    downloadUrl: string;
    error?: string;
  }> => {
    if (!SECURITY_STUBS_ENABLED) {
      throw new SecurityStubError('gdprService', 'exportUserData');
    }
    console.warn(`⚠️ [SECURITY STUB] gdprService.exportUserData() - NO DATA ACTUALLY EXPORTED`);
    return {
      success: false,
      exportId: 'stub-not-implemented',
      downloadUrl: '',
      error: 'GDPR export is not implemented (stub service)',
    };
  },
  deleteUserData: async (_params: { userId: string; reason?: string; requestedBy: string }): Promise<{
    success: boolean;
    deletedData: any;
    error?: string;
  }> => {
    if (!SECURITY_STUBS_ENABLED) {
      throw new SecurityStubError('gdprService', 'deleteUserData');
    }
    console.warn(`⚠️ [SECURITY STUB] gdprService.deleteUserData() - NO DATA ACTUALLY DELETED`);
    return {
      success: false,
      deletedData: {},
      error: 'GDPR deletion is not implemented (stub service)',
    };
  },
  getComplianceReport: async (_userId: string) => {
    console.warn(`⚠️ [SECURITY STUB] gdprService.getComplianceReport() - returning stub compliance data`);
    return { compliant: true, isStub: true };
  },
  recordConsent: async (_userId: string, _consentType: string, _version: string) => {
    console.warn(`⚠️ [SECURITY STUB] gdprService.recordConsent() - NO-OP, consent not actually recorded`);
    return true;
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// Data Retention Service Stub
// ═══════════════════════════════════════════════════════════════════════════
export const dataRetentionService = {
  getRetentionStats: async () => ({ stats: {} }),
  getAllPolicies: () => [] as any[],
  cleanupDataType: async (_dataType: string) => ({ cleaned: 0 }),
  runAllCleanupTasks: async () => [] as any[],
};

// ═══════════════════════════════════════════════════════════════════════════
// Backup Encryption Service Stub
// ═══════════════════════════════════════════════════════════════════════════
export const backupEncryptionService = {
  createBackup: async (_options: any): Promise<{
    success: boolean;
    backupId: string;
    document_metadata: any;
    error?: string;
  }> => ({ success: true, backupId: 'stub', document_metadata: {} }),
  listBackups: async () => [] as any[],
  getBackupStats: async () => ({}),
};

// ═══════════════════════════════════════════════════════════════════════════
// Key Rotation Service Stub
// ═══════════════════════════════════════════════════════════════════════════
export const keyRotationService = {
  rotateMasterKey: async (_userId: string): Promise<{ success: boolean; error?: string }> => ({ success: true }),
  getRotationProgress: () => null as any,
  getKeyVersionInfo: async () => ({ version: 1 }),
  getRotationHistory: async () => [] as any[],
  testRotation: async () => true,
};

// ═══════════════════════════════════════════════════════════════════════════
// PII Service Stub
// ═══════════════════════════════════════════════════════════════════════════
export const piiService = {
  detectPII: (_text: string) => ({ hasPII: false, types: [] as string[] }),
  maskPII: (text: string, _options?: any) => text,
  getPIIStats: (_text: string) => ({ total: 0, byType: {} }),
};


// ═══════════════════════════════════════════════════════════════════════════
// Excel Cell Reader Service Stub
// ═══════════════════════════════════════════════════════════════════════════
export const excelCellReaderService = {
  readCell: async (_query: string) => ({
    success: false,
    error: 'Excel cell reader service has been disabled',
    value: null as string | number | null,
    message: 'Excel cell reader service has been disabled',
    cellAddress: null as string | null,
    sheetName: null as string | null,
    documentName: null as string | null
  }),
};

// Note: excelCellReaderService is exported as named export above
