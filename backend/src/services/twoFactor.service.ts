import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import prisma from '../config/database';
import { encrypt, decrypt } from '../utils/encryption';
import crypto from 'crypto';

/**
 * Enable 2FA for a user
 */
export const enable2FA = async (userId: string) => {
  // Check if 2FA is already enabled
  const existing2FA = await prisma.twoFactorAuth.findUnique({
    where: { userId },
  });

  if (existing2FA && existing2FA.isEnabled) {
    throw new Error('2FA is already enabled');
  }

  // Generate secret
  const secret = speakeasy.generateSecret({
    name: `Koda (${userId})`,
    length: 32,
  });

  // Generate backup codes (10 codes)
  const backupCodes: string[] = [];
  for (let i = 0; i < 10; i++) {
    backupCodes.push(crypto.randomBytes(4).toString('hex').toUpperCase());
  }

  // Encrypt secret and backup codes
  const encryptedSecret = encrypt(secret.base32);
  const encryptedBackupCodes = backupCodes.map((code) => encrypt(code));
  const backupCodesJson = JSON.stringify(encryptedBackupCodes);

  // Store in database (not enabled yet)
  if (existing2FA) {
    await prisma.twoFactorAuth.update({
      where: { userId },
      data: {
        secret: encryptedSecret,
        backupCodes: backupCodesJson,
        isEnabled: false,
      },
    });
  } else {
    await prisma.twoFactorAuth.create({
      data: {
        userId,
        secret: encryptedSecret,
        backupCodes: backupCodesJson,
        isEnabled: false,
      },
    });
  }

  // Generate QR code
  const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url!);

  return {
    secret: secret.base32,
    qrCode: qrCodeUrl,
    backupCodes,
  };
};

/**
 * Verify 2FA code and enable it
 */
export const verify2FA = async (userId: string, token: string) => {
  const twoFactorAuth = await prisma.twoFactorAuth.findUnique({
    where: { userId },
  });

  if (!twoFactorAuth || !twoFactorAuth.secret) {
    throw new Error('2FA not set up');
  }

  // Decrypt secret
  const secret = decrypt(twoFactorAuth.secret);

  // Verify token
  const verified = speakeasy.totp.verify({
    secret,
    encoding: 'base32',
    token,
    window: 2, // Allow 2 time steps before/after
  });

  if (!verified) {
    throw new Error('Invalid 2FA code');
  }

  // Enable 2FA
  await prisma.twoFactorAuth.update({
    where: { userId },
    data: { isEnabled: true },
  });

  return { success: true, message: '2FA enabled successfully' };
};

/**
 * Verify 2FA during login
 */
export const verify2FALogin = async (userId: string, token: string) => {
  const twoFactorAuth = await prisma.twoFactorAuth.findUnique({
    where: { userId },
  });

  if (!twoFactorAuth || !twoFactorAuth.isEnabled || !twoFactorAuth.secret) {
    throw new Error('2FA not enabled');
  }

  // Decrypt secret
  const secret = decrypt(twoFactorAuth.secret);

  // First, try to verify as TOTP token
  const verified = speakeasy.totp.verify({
    secret,
    encoding: 'base32',
    token,
    window: 2,
  });

  if (verified) {
    return { success: true };
  }

  // If TOTP fails, check backup codes
  if (!twoFactorAuth.backupCodes) {
    throw new Error('Invalid 2FA code or backup code');
  }
  const encryptedBackupCodes: string[] = JSON.parse(twoFactorAuth.backupCodes);
  const decryptedBackupCodes = encryptedBackupCodes.map((code) => decrypt(code));

  const backupCodeIndex = decryptedBackupCodes.indexOf(token.toUpperCase());

  if (backupCodeIndex !== -1) {
    // Remove used backup code
    const updatedBackupCodes = [...encryptedBackupCodes];
    updatedBackupCodes.splice(backupCodeIndex, 1);

    await prisma.twoFactorAuth.update({
      where: { userId },
      data: { backupCodes: JSON.stringify(updatedBackupCodes) },
    });

    return { success: true, usedBackupCode: true };
  }

  throw new Error('Invalid 2FA code or backup code');
};

/**
 * Disable 2FA
 */
export const disable2FA = async (userId: string, password: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user || !user.passwordHash || !user.salt) {
    throw new Error('Cannot disable 2FA');
  }

  // Verify password
  const bcrypt = require('bcrypt');
  const isValid = await bcrypt.compare(password + user.salt, user.passwordHash);

  if (!isValid) {
    throw new Error('Invalid password');
  }

  // Disable 2FA
  await prisma.twoFactorAuth.delete({
    where: { userId },
  });

  return { success: true, message: '2FA disabled successfully' };
};

/**
 * Get backup codes
 */
export const getBackupCodes = async (userId: string) => {
  const twoFactorAuth = await prisma.twoFactorAuth.findUnique({
    where: { userId },
  });

  if (!twoFactorAuth || !twoFactorAuth.backupCodes) {
    throw new Error('2FA not enabled');
  }

  const encryptedBackupCodes: string[] = JSON.parse(twoFactorAuth.backupCodes);
  const backupCodes = encryptedBackupCodes.map((code) => decrypt(code));

  return { backupCodes };
};
