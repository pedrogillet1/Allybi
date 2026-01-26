/**
 * Pending User Service - Handles temporary user registration before email verification
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
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
// SERVICE METHODS
// ═══════════════════════════════════════════════════════════════════════════

export const createPendingUser = async (data: {
  email: string;
  passwordHash: string;
  salt: string;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  emailCode: string;
  recoveryKeyHash?: string;
  masterKeyEncrypted?: string;
}): Promise<PendingUser> => {
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 10); // 10 minute expiry

  const pendingUser = await prisma.pendingUser.create({
    data: {
      email: data.email,
      passwordHash: data.passwordHash,
      salt: data.salt,
      firstName: data.firstName || null,
      lastName: data.lastName || null,
      phoneNumber: data.phoneNumber || null,
      emailCode: data.emailCode,
      emailVerified: false,
      phoneVerified: false,
      expiresAt,
      recoveryKeyHash: data.recoveryKeyHash || null,
      masterKeyEncrypted: data.masterKeyEncrypted || null,
    },
  });

  return {
    email: pendingUser.email,
    passwordHash: pendingUser.passwordHash,
    salt: pendingUser.salt,
    firstName: pendingUser.firstName,
    lastName: pendingUser.lastName,
    phoneNumber: pendingUser.phoneNumber,
    emailVerified: pendingUser.emailVerified,
    phoneVerified: pendingUser.phoneVerified,
    recoveryKeyHash: pendingUser.recoveryKeyHash,
    masterKeyEncrypted: pendingUser.masterKeyEncrypted,
  };
};

export const getPendingUser = async (email: string): Promise<PendingUser | null> => {
  const pendingUser = await prisma.pendingUser.findUnique({
    where: { email },
  });

  if (!pendingUser) return null;

  return {
    email: pendingUser.email,
    passwordHash: pendingUser.passwordHash,
    salt: pendingUser.salt,
    firstName: pendingUser.firstName,
    lastName: pendingUser.lastName,
    phoneNumber: pendingUser.phoneNumber,
    emailVerified: pendingUser.emailVerified,
    phoneVerified: pendingUser.phoneVerified,
    recoveryKeyHash: pendingUser.recoveryKeyHash,
    masterKeyEncrypted: pendingUser.masterKeyEncrypted,
  };
};

export const deletePendingUser = async (email: string): Promise<void> => {
  await prisma.pendingUser.delete({
    where: { email },
  }).catch(() => {
    // Ignore if already deleted
  });
};

export const verifyPendingUserEmail = async (email: string, code: string): Promise<PendingUser> => {
  const pendingUser = await prisma.pendingUser.findUnique({
    where: { email },
  });

  if (!pendingUser) {
    throw new Error('No pending registration found for this email');
  }

  // Check if expired
  if (new Date() > pendingUser.expiresAt) {
    await prisma.pendingUser.delete({ where: { email } });
    throw new Error('Verification code has expired. Please register again.');
  }

  // Verify the code
  if (pendingUser.emailCode !== code) {
    throw new Error('Invalid verification code');
  }

  // Mark email as verified
  const updated = await prisma.pendingUser.update({
    where: { email },
    data: { emailVerified: true },
  });

  return {
    email: updated.email,
    passwordHash: updated.passwordHash,
    salt: updated.salt,
    firstName: updated.firstName,
    lastName: updated.lastName,
    phoneNumber: updated.phoneNumber,
    emailVerified: updated.emailVerified,
    phoneVerified: updated.phoneVerified,
    recoveryKeyHash: updated.recoveryKeyHash,
    masterKeyEncrypted: updated.masterKeyEncrypted,
  };
};

export const verifyPendingUserPhone = async (email: string, code: string): Promise<PendingUser> => {
  const pendingUser = await prisma.pendingUser.findUnique({
    where: { email },
  });

  if (!pendingUser) {
    throw new Error('No pending registration found for this email');
  }

  if (pendingUser.phoneCode !== code) {
    throw new Error('Invalid phone verification code');
  }

  const updated = await prisma.pendingUser.update({
    where: { email },
    data: { phoneVerified: true },
  });

  return {
    email: updated.email,
    passwordHash: updated.passwordHash,
    salt: updated.salt,
    firstName: updated.firstName,
    lastName: updated.lastName,
    phoneNumber: updated.phoneNumber,
    emailVerified: updated.emailVerified,
    phoneVerified: updated.phoneVerified,
    recoveryKeyHash: updated.recoveryKeyHash,
    masterKeyEncrypted: updated.masterKeyEncrypted,
  };
};

// Aliases for backward compatibility
export const verifyPendingEmail = verifyPendingUserEmail;
export const verifyPendingPhone = verifyPendingUserPhone;

export const resendEmailCode = async (email: string): Promise<{ success: boolean; pendingUser: PendingUser; emailCode: string }> => {
  const pendingUser = await prisma.pendingUser.findUnique({
    where: { email },
  });

  if (!pendingUser) {
    throw new Error('No pending registration found for this email');
  }

  // Generate new code
  const emailCode = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 10);

  const updated = await prisma.pendingUser.update({
    where: { email },
    data: { emailCode, expiresAt },
  });

  return {
    success: true,
    pendingUser: {
      email: updated.email,
      passwordHash: updated.passwordHash,
      salt: updated.salt,
      firstName: updated.firstName,
      lastName: updated.lastName,
      phoneNumber: updated.phoneNumber,
      emailVerified: updated.emailVerified,
      phoneVerified: updated.phoneVerified,
      recoveryKeyHash: updated.recoveryKeyHash,
      masterKeyEncrypted: updated.masterKeyEncrypted,
    },
    emailCode,
  };
};

export const addPhoneToPending = async (email: string, phone: string): Promise<{ success: boolean; pendingUser: PendingUser; phoneCode: string }> => {
  const pendingUser = await prisma.pendingUser.findUnique({
    where: { email },
  });

  if (!pendingUser) {
    throw new Error('No pending registration found for this email');
  }

  const phoneCode = Math.floor(100000 + Math.random() * 900000).toString();

  const updated = await prisma.pendingUser.update({
    where: { email },
    data: { phoneNumber: phone, phoneCode },
  });

  return {
    success: true,
    pendingUser: {
      email: updated.email,
      passwordHash: updated.passwordHash,
      salt: updated.salt,
      firstName: updated.firstName,
      lastName: updated.lastName,
      phoneNumber: updated.phoneNumber,
      emailVerified: updated.emailVerified,
      phoneVerified: updated.phoneVerified,
      recoveryKeyHash: updated.recoveryKeyHash,
      masterKeyEncrypted: updated.masterKeyEncrypted,
    },
    phoneCode,
  };
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
