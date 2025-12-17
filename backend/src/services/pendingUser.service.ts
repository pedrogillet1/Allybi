/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                    ⚠️  REMOVED SERVICE - STUB FILE  ⚠️                     ║
 * ╠═══════════════════════════════════════════════════════════════════════════╣
 * ║ This service has been REMOVED and is no longer functional.                ║
 * ║                                                                           ║
 * ║ PRODUCTION WARNING:                                                       ║
 * ║ All methods will throw PendingUserServiceRemovedError.                    ║
 * ║                                                                           ║
 * ║ If you need pending user functionality, you must:                         ║
 * ║ 1. Implement a new pending user service                                   ║
 * ║ 2. Or use an alternative user registration flow                           ║
 * ║                                                                           ║
 * ║ MIGRATION PATH:                                                           ║
 * ║ - Consider using direct user creation with email verification             ║
 * ║ - Or implement Redis-based temporary user storage                         ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

// ═══════════════════════════════════════════════════════════════════════════
// CUSTOM ERROR
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Error thrown when pending user service methods are called
 */
export class PendingUserServiceRemovedError extends Error {
  public readonly isServiceRemoved = true;
  public readonly methodName: string;

  constructor(methodName: string) {
    super(
      `[REMOVED SERVICE] pendingUser.${methodName}() is no longer available. ` +
      `The pending user service has been removed. ` +
      `Please implement an alternative user registration flow.`
    );
    this.name = 'PendingUserServiceRemovedError';
    this.methodName = methodName;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS (kept for backward compatibility)
// ═══════════════════════════════════════════════════════════════════════════

export interface PendingUser {
  email: string;
  passwordHash: string;
  salt: string;
  firstName: string | null;
  lastName: string | null;
  phoneNumber: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
  recoveryKeyHash: string | null;
  masterKeyEncrypted: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// STUB METHODS - All throw PendingUserServiceRemovedError
// ═══════════════════════════════════════════════════════════════════════════

export const createPendingUser = async (_data?: any): Promise<PendingUser> => {
  throw new PendingUserServiceRemovedError('createPendingUser');
};

export const getPendingUser = async (_email?: string): Promise<PendingUser | null> => {
  throw new PendingUserServiceRemovedError('getPendingUser');
};

export const deletePendingUser = async (_email?: string): Promise<void> => {
  throw new PendingUserServiceRemovedError('deletePendingUser');
};

export const verifyPendingUserEmail = async (_email: string, _code: string): Promise<PendingUser> => {
  throw new PendingUserServiceRemovedError('verifyPendingUserEmail');
};

export const verifyPendingUserPhone = async (_email: string, _code: string): Promise<PendingUser> => {
  throw new PendingUserServiceRemovedError('verifyPendingUserPhone');
};

// Alias for backward compatibility
export const verifyPendingEmail = verifyPendingUserEmail;
export const verifyPendingPhone = verifyPendingUserPhone;

export const resendEmailCode = async (_email: string): Promise<{ success: boolean; pendingUser: PendingUser; emailCode: string }> => {
  throw new PendingUserServiceRemovedError('resendEmailCode');
};

export const addPhoneToPending = async (_email: string, _phone: string): Promise<{ success: boolean; pendingUser: PendingUser; phoneCode: string }> => {
  throw new PendingUserServiceRemovedError('addPhoneToPending');
};

export default {
  createPendingUser,
  getPendingUser,
  deletePendingUser,
  verifyPendingUserEmail,
  verifyPendingUserPhone,
  verifyPendingEmail,
  verifyPendingPhone,
  resendEmailCode,
  addPhoneToPending,
};
