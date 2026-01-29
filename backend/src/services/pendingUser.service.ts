import prisma from '../config/database';
import crypto from 'crypto';

/**
 * Generate a 6-digit verification code
 */
export const generateVerificationCode = (): string => {
  return crypto.randomInt(100000, 999999).toString();
};

/**
 * Create a pending user
 */
export const createPendingUser = async (data: {
  email: string;
  passwordHash: string;
  salt: string;
}) => {
  // Delete any existing pending user with same email
  await prisma.pendingUser.deleteMany({
    where: { email: data.email.toLowerCase() },
  });

  const emailCode = generateVerificationCode();
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24); // 24 hours to verify

  const pendingUser = await prisma.pendingUser.create({
    data: {
      email: data.email.toLowerCase(),
      passwordHash: data.passwordHash,
      salt: data.salt,
      emailCode,
      expiresAt,
    },
  });

  return { pendingUser, emailCode };
};

/**
 * Verify email code for pending user
 */
export const verifyPendingEmail = async (email: string, code: string) => {
  const pendingUser = await prisma.pendingUser.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (!pendingUser) {
    throw new Error('No pending registration found');
  }

  if (pendingUser.expiresAt < new Date()) {
    // Delete expired pending user
    await prisma.pendingUser.delete({
      where: { id: pendingUser.id },
    });
    throw new Error('Registration expired. Please sign up again.');
  }

  if (pendingUser.emailCode !== code) {
    throw new Error('Invalid verification code');
  }

  // Mark email as verified
  const updated = await prisma.pendingUser.update({
    where: { id: pendingUser.id },
    data: {
      emailVerified: true,
      emailCode: null, // Clear the code after verification
    },
  });

  return updated;
};

/**
 * Resend email verification code for pending user
 */
export const resendEmailCode = async (email: string) => {
  const pendingUser = await prisma.pendingUser.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (!pendingUser) {
    throw new Error('No pending registration found');
  }

  if (pendingUser.expiresAt < new Date()) {
    // Delete expired pending user
    await prisma.pendingUser.delete({
      where: { id: pendingUser.id },
    });
    throw new Error('Registration expired. Please sign up again.');
  }

  if (pendingUser.emailVerified) {
    throw new Error('Email already verified');
  }

  // Generate new verification code
  const emailCode = generateVerificationCode();

  // Update pending user with new code
  const updated = await prisma.pendingUser.update({
    where: { id: pendingUser.id },
    data: { emailCode },
  });

  return { pendingUser: updated, emailCode };
};

/**
 * Add phone number to pending user
 */
export const addPhoneToPending = async (email: string, phoneNumber: string) => {
  const pendingUser = await prisma.pendingUser.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (!pendingUser) {
    throw new Error('No pending registration found');
  }

  if (!pendingUser.emailVerified) {
    throw new Error('Please verify your email first');
  }

  if (pendingUser.expiresAt < new Date()) {
    await prisma.pendingUser.delete({
      where: { id: pendingUser.id },
    });
    throw new Error('Registration expired. Please sign up again.');
  }

  const phoneCode = generateVerificationCode();

  const updated = await prisma.pendingUser.update({
    where: { id: pendingUser.id },
    data: { phoneNumber, phoneCode },
  });

  return { pendingUser: updated, phoneCode };
};

/**
 * Verify phone code for pending user
 */
export const verifyPendingPhone = async (email: string, code: string) => {
  const pendingUser = await prisma.pendingUser.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (!pendingUser) {
    throw new Error('No pending registration found');
  }

  if (!pendingUser.emailVerified) {
    throw new Error('Please verify your email first');
  }

  if (pendingUser.expiresAt < new Date()) {
    await prisma.pendingUser.delete({
      where: { id: pendingUser.id },
    });
    throw new Error('Registration expired. Please sign up again.');
  }

  if (pendingUser.phoneCode !== code) {
    throw new Error('Invalid verification code');
  }

  // Mark phone as verified
  const updated = await prisma.pendingUser.update({
    where: { id: pendingUser.id },
    data: {
      phoneVerified: true,
      phoneCode: null, // Clear the code
    },
  });

  return updated;
};

/**
 * Get pending user by email
 */
export const getPendingUser = async (email: string) => {
  return prisma.pendingUser.findUnique({
    where: { email: email.toLowerCase() },
  });
};

/**
 * Delete pending user
 */
export const deletePendingUser = async (email: string) => {
  return prisma.pendingUser.deleteMany({
    where: { email: email.toLowerCase() },
  });
};
