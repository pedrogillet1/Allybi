/**
 * Security Types and Enums
 * Shared types used across security services to avoid circular dependencies
 */

export enum ThreatLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum SecurityEventType {
  // Authentication Threats
  BRUTE_FORCE_ATTEMPT = 'brute_force_attempt',
  CREDENTIAL_STUFFING = 'credential_stuffing',
  ACCOUNT_TAKEOVER_ATTEMPT = 'account_takeover_attempt',
  SUSPICIOUS_LOGIN = 'suspicious_login',
  SUSPICIOUS_LOGIN_LOCATION = 'suspicious_login_location',
  IMPOSSIBLE_TRAVEL = 'impossible_travel',
  SESSION_HIJACKING = 'session_hijacking',

  // Access Violations
  UNAUTHORIZED_ACCESS_ATTEMPT = 'unauthorized_access_attempt',
  PRIVILEGE_ESCALATION = 'privilege_escalation',
  PRIVILEGE_ESCALATION_ATTEMPT = 'privilege_escalation_attempt',
  CROSS_USER_ACCESS_ATTEMPT = 'cross_user_access_attempt',
  MASS_DATA_EXFILTRATION = 'mass_data_exfiltration',

  // Suspicious Patterns
  RAPID_REQUESTS = 'rapid_requests',
  ABNORMAL_ACTIVITY_PATTERN = 'abnormal_activity_pattern',
  SUSPICIOUS_IP_BEHAVIOR = 'suspicious_ip_behavior',
  SUSPICIOUS_ACTIVITY = 'suspicious_activity',
  BOT_DETECTED = 'bot_detected',

  // System Security
  SQL_INJECTION_ATTEMPT = 'sql_injection_attempt',
  XSS_ATTEMPT = 'xss_attempt',
  PATH_TRAVERSAL_ATTEMPT = 'path_traversal_attempt',
  CSRF_DETECTED = 'csrf_detected',
  MALWARE_DETECTED = 'malware_detected',
  DATA_BREACH_ATTEMPT = 'data_breach_attempt',

  // Policy Violations
  CONCURRENT_SESSION_VIOLATION = 'concurrent_session_violation',
  DOWNLOAD_LIMIT_EXCEEDED = 'download_limit_exceeded',
  STORAGE_QUOTA_ABUSE = 'storage_quota_abuse',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  ACCOUNT_LOCKOUT = 'account_lockout',
  PASSWORD_RESET_ABUSE = 'password_reset_abuse',
  IP_BLACKLISTED = 'ip_blacklisted',
  GEO_ANOMALY = 'geo_anomaly',
}
