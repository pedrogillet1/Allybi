import speakeasy from "speakeasy";
import QRCode from "qrcode";
import prisma from "../config/database";
import crypto from "crypto";
import { EncryptionService } from "./security/encryption.service";
import { TenantKeyService } from "./security/tenantKey.service";
import { TwoFactorCryptoService } from "./security/twoFactorCrypto.service";
import { config } from "../config/env";

const encryptionService = new EncryptionService();
const tenantKeyService = new TenantKeyService(prisma as any, encryptionService);
const twoFactorCrypto = new TwoFactorCryptoService(encryptionService);

const LEGACY_ALGORITHM = "aes-256-gcm";
const LEGACY_IV_LENGTH = 16;
const LEGACY_SALT_LENGTH = 64;
const LEGACY_TAG_LENGTH = 16;

function decryptLegacyCiphertext(encryptedData: string): string {
  const buffer = Buffer.from(encryptedData, "base64");
  const salt = buffer.subarray(0, LEGACY_SALT_LENGTH);
  const iv = buffer.subarray(
    LEGACY_SALT_LENGTH,
    LEGACY_SALT_LENGTH + LEGACY_IV_LENGTH,
  );
  const tag = buffer.subarray(
    LEGACY_SALT_LENGTH + LEGACY_IV_LENGTH,
    LEGACY_SALT_LENGTH + LEGACY_IV_LENGTH + LEGACY_TAG_LENGTH,
  );
  const encrypted = buffer.subarray(
    LEGACY_SALT_LENGTH + LEGACY_IV_LENGTH + LEGACY_TAG_LENGTH,
  );

  const key = crypto.pbkdf2Sync(
    config.ENCRYPTION_KEY,
    salt,
    100000,
    32,
    "sha512",
  );
  const decipher = crypto.createDecipheriv(LEGACY_ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  return decipher.update(encrypted) + decipher.final("utf8");
}

async function decryptSecretForUser(
  userId: string,
  twoFactorAuth: { secretEncrypted: string | null; secret: string | null },
) {
  const tenantKey = await tenantKeyService.getTenantKey(userId);
  if (twoFactorAuth.secretEncrypted) {
    return twoFactorCrypto.decryptSecret(
      userId,
      twoFactorAuth.secretEncrypted,
      tenantKey,
    );
  }
  if (twoFactorAuth.secret) {
    const legacySecret = decryptLegacyCiphertext(twoFactorAuth.secret);
    const secretEncrypted = twoFactorCrypto.encryptSecret(
      userId,
      legacySecret,
      tenantKey,
    );
    await prisma.twoFactorAuth.update({
      where: { userId },
      data: {
        secretEncrypted,
        secret: null,
      },
    });
    return legacySecret;
  }
  throw new Error("2FA not set up");
}

async function decryptBackupCodesForUser(
  userId: string,
  twoFactorAuth: {
    backupCodesEncrypted: string | null;
    backupCodes: string | null;
  },
) {
  const tenantKey = await tenantKeyService.getTenantKey(userId);
  if (twoFactorAuth.backupCodesEncrypted) {
    const backupCodesJson = twoFactorCrypto.decryptBackupCodes(
      userId,
      twoFactorAuth.backupCodesEncrypted,
      tenantKey,
    );
    return JSON.parse(backupCodesJson) as string[];
  }
  if (twoFactorAuth.backupCodes) {
    const encryptedBackupCodes: string[] = JSON.parse(
      twoFactorAuth.backupCodes,
    );
    const legacyCodes = encryptedBackupCodes.map((code) =>
      decryptLegacyCiphertext(code),
    );
    const backupCodesEncrypted = twoFactorCrypto.encryptBackupCodes(
      userId,
      JSON.stringify(legacyCodes),
      tenantKey,
    );
    await prisma.twoFactorAuth.update({
      where: { userId },
      data: {
        backupCodesEncrypted,
        backupCodes: null,
      },
    });
    return legacyCodes;
  }
  return [];
}

/**
 * Enable 2FA for a user
 */
export const enable2FA = async (userId: string) => {
  // Check if 2FA is already enabled
  const existing2FA = await prisma.twoFactorAuth.findUnique({
    where: { userId },
  });

  if (existing2FA && existing2FA.isEnabled) {
    throw new Error("2FA is already enabled");
  }

  // Generate secret
  const secret = speakeasy.generateSecret({
    name: `Koda (${userId})`,
    length: 32,
  });

  // Generate backup codes (10 codes)
  const backupCodes: string[] = [];
  for (let i = 0; i < 10; i++) {
    backupCodes.push(crypto.randomBytes(4).toString("hex").toUpperCase());
  }

  const tenantKey = await tenantKeyService.getTenantKey(userId);
  const secretEncrypted = twoFactorCrypto.encryptSecret(
    userId,
    secret.base32,
    tenantKey,
  );
  const backupCodesEncrypted = twoFactorCrypto.encryptBackupCodes(
    userId,
    JSON.stringify(backupCodes),
    tenantKey,
  );

  // Store in database (not enabled yet)
  if (existing2FA) {
    await prisma.twoFactorAuth.update({
      where: { userId },
      data: {
        secretEncrypted,
        backupCodesEncrypted,
        secret: null,
        backupCodes: null,
        isEnabled: false,
      },
    });
  } else {
    await prisma.twoFactorAuth.create({
      data: {
        userId,
        secretEncrypted,
        backupCodesEncrypted,
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

  if (!twoFactorAuth) {
    throw new Error("2FA not set up");
  }

  const secret = await decryptSecretForUser(userId, twoFactorAuth);

  // Verify token
  const verified = speakeasy.totp.verify({
    secret,
    encoding: "base32",
    token,
    window: 2, // Allow 2 time steps before/after
  });

  if (!verified) {
    throw new Error("Invalid 2FA code");
  }

  // Enable 2FA
  await prisma.twoFactorAuth.update({
    where: { userId },
    data: { isEnabled: true },
  });

  return { success: true, message: "2FA enabled successfully" };
};

/**
 * Verify 2FA during login
 */
export const verify2FALogin = async (userId: string, token: string) => {
  const twoFactorAuth = await prisma.twoFactorAuth.findUnique({
    where: { userId },
  });

  if (!twoFactorAuth || !twoFactorAuth.isEnabled) {
    throw new Error("2FA not enabled");
  }

  const secret = await decryptSecretForUser(userId, twoFactorAuth);

  // First, try to verify as TOTP token
  const verified = speakeasy.totp.verify({
    secret,
    encoding: "base32",
    token,
    window: 2,
  });

  if (verified) {
    return { success: true };
  }

  // If TOTP fails, check backup codes
  if (!twoFactorAuth.backupCodes && !twoFactorAuth.backupCodesEncrypted) {
    throw new Error("Invalid 2FA code or backup code");
  }
  const decryptedBackupCodes = await decryptBackupCodesForUser(
    userId,
    twoFactorAuth,
  );

  const backupCodeIndex = decryptedBackupCodes.indexOf(token.toUpperCase());

  if (backupCodeIndex !== -1) {
    const tenantKey = await tenantKeyService.getTenantKey(userId);
    const updatedBackupCodes = [...decryptedBackupCodes];
    updatedBackupCodes.splice(backupCodeIndex, 1);
    const backupCodesEncrypted = twoFactorCrypto.encryptBackupCodes(
      userId,
      JSON.stringify(updatedBackupCodes),
      tenantKey,
    );

    await prisma.twoFactorAuth.update({
      where: { userId },
      data: {
        backupCodesEncrypted,
        backupCodes: null,
      },
    });

    return { success: true, usedBackupCode: true };
  }

  throw new Error("Invalid 2FA code or backup code");
};

/**
 * Disable 2FA
 */
export const disable2FA = async (userId: string, password: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user || !user.passwordHash) {
    throw new Error("Cannot disable 2FA");
  }

  // Verify password (try new-style first, then legacy with salt)
  const bcrypt = require("bcrypt");
  let isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid && user.salt) {
    // Legacy fallback: old hashes used password+salt
    isValid = await bcrypt.compare(password + user.salt, user.passwordHash);
  }

  if (!isValid) {
    throw new Error("Invalid password");
  }

  // Disable 2FA
  await prisma.twoFactorAuth.delete({
    where: { userId },
  });

  return { success: true, message: "2FA disabled successfully" };
};

/**
 * Get backup codes
 */
export const getBackupCodes = async (userId: string) => {
  const twoFactorAuth = await prisma.twoFactorAuth.findUnique({
    where: { userId },
  });

  if (
    !twoFactorAuth ||
    (!twoFactorAuth.backupCodes && !twoFactorAuth.backupCodesEncrypted)
  ) {
    throw new Error("2FA not enabled");
  }

  const backupCodes = await decryptBackupCodesForUser(userId, twoFactorAuth);

  return { backupCodes };
};
