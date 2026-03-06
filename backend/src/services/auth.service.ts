import crypto from "crypto";
import prisma from "../config/database";
import {
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
} from "../utils/password";
import { generateAccessToken, generateRefreshToken } from "../utils/jwt";

// ---------------------------------------------------------------------------
// HMAC-SHA256 session hashing (matching authBridge.ts pattern)
// ---------------------------------------------------------------------------
const REFRESH_TOKEN_PEPPER =
  process.env.KODA_REFRESH_PEPPER || process.env.JWT_REFRESH_SECRET || "";

function hmacSha256(input: string): string {
  return crypto
    .createHmac("sha256", REFRESH_TOKEN_PEPPER)
    .update(input)
    .digest("hex");
}

// ---------------------------------------------------------------------------
// Helper: create session with HMAC-hashed refresh token + session-bound access token
// ---------------------------------------------------------------------------
async function createSessionTokens(userId: string, email: string) {
  const refreshToken = generateRefreshToken({ userId, email });

  const session = await prisma.session.create({
    data: {
      userId,
      refreshTokenHash: hmacSha256(refreshToken),
      tokenVersion: 1,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      isActive: true,
    },
  });

  const accessToken = generateAccessToken({
    userId,
    email,
    sid: session.id,
    sv: session.tokenVersion,
  });

  return { accessToken, refreshToken };
}

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------
export interface RegisterInput {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  recoveryKeyHash?: string;
  masterKeyEncrypted?: string;
}

export interface LoginInput {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

// ---------------------------------------------------------------------------
// Register (creates PendingUser, sends email code)
// ---------------------------------------------------------------------------
export const registerUser = async ({
  email,
  password,
  firstName,
  lastName,
  name,
  recoveryKeyHash,
  masterKeyEncrypted,
}: RegisterInput) => {
  let parsedFirstName = firstName;
  let parsedLastName = lastName;

  if (name && !firstName && !lastName) {
    const nameParts = name.trim().split(/\s+/);
    if (nameParts.length === 1) {
      parsedFirstName = nameParts[0];
      parsedLastName = undefined;
    } else {
      parsedFirstName = nameParts[0];
      parsedLastName = nameParts.slice(1).join(" ");
    }
  }

  // Hash recovery key if provided
  let hashedRecoveryKey: string | null = null;
  if (recoveryKeyHash) {
    const { hash } = await hashPassword(recoveryKeyHash);
    hashedRecoveryKey = hash;
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new Error("Invalid email format");
  }

  // Validate password strength
  const passwordValidation = validatePasswordStrength(password);
  if (!passwordValidation.valid) {
    throw new Error(passwordValidation.message || "Invalid password");
  }

  // Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (existingUser) {
    throw new Error("User with this email already exists");
  }

  // Hash password
  const { hash, salt } = await hashPassword(password);

  // Delete any existing pending user
  await prisma.pendingUser.deleteMany({
    where: { email: email.toLowerCase() },
  });

  // Generate email verification code
  const emailService = await import("./email.service");
  const emailCode = emailService.generateVerificationCode();

  // Create pending user with 10-minute code expiry
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 10);

  await prisma.pendingUser.create({
    data: {
      email: email.toLowerCase(),
      passwordHash: hash,
      salt,
      firstName: parsedFirstName,
      lastName: parsedLastName,
      emailCode,
      expiresAt,
      recoveryKeyHash: hashedRecoveryKey || null,
      masterKeyEncrypted: masterKeyEncrypted || null,
    },
  });

  console.log(`Pending user created: ${email.toLowerCase()}`);

  // Send verification email
  try {
    await emailService.sendVerificationCodeEmail(
      email.toLowerCase(),
      emailCode,
    );
    console.log(`Verification code sent to ${email.toLowerCase()}`);
  } catch (error) {
    console.error("Failed to send verification email:", error);
    if (process.env.NODE_ENV !== "production") {
      console.log(
        `[DEV MODE] Verification code for ${email.toLowerCase()}: ${emailCode}`,
      );
    }
  }

  return {
    requiresVerification: true,
    email: email.toLowerCase(),
    message: "Please verify your email or phone to complete registration",
  };
};

// ---------------------------------------------------------------------------
// Verify email code for pending user -> create real user
// ---------------------------------------------------------------------------
export const verifyPendingUserEmail = async (email: string, code: string) => {
  const pendingUserService = await import("./pendingUser.service");

  const pendingUser = await pendingUserService.verifyPendingEmail(email, code);

  // Create the actual user
  const user = await prisma.user.create({
    data: {
      email: pendingUser.email,
      passwordHash: pendingUser.passwordHash,
      salt: pendingUser.salt,
      firstName: pendingUser.firstName,
      lastName: pendingUser.lastName,
      phoneNumber: null,
      isEmailVerified: true,
      isPhoneVerified: false,
      recoveryKeyHash: pendingUser.recoveryKeyHash || null,
      masterKeyEncrypted: pendingUser.masterKeyEncrypted || null,
    },
  });

  // Delete the pending user
  await pendingUserService.deletePendingUser(email);

  // Generate session tokens (HMAC pattern)
  const tokens = await createSessionTokens(user.id, user.email);

  return {
    success: true,
    message: "Email verified! Registration complete.",
    email: user.email,
    user: {
      id: user.id,
      email: user.email,
      isEmailVerified: user.isEmailVerified,
      isPhoneVerified: user.isPhoneVerified,
    },
    tokens,
  };
};

// ---------------------------------------------------------------------------
// Resend email verification code for pending user
// ---------------------------------------------------------------------------
export const resendPendingUserEmail = async (email: string) => {
  const pendingUserService = await import("./pendingUser.service");

  const { pendingUser, emailCode } =
    await pendingUserService.resendEmailCode(email);

  try {
    const emailService = await import("./email.service");
    await emailService.sendVerificationCodeEmail(email, emailCode);
    console.log(`Verification code resent to ${email}`);
  } catch (error) {
    console.error("Failed to resend verification email:", error);
    if (process.env.NODE_ENV !== "production") {
      console.log(
        `[DEV MODE] Would resend verification code ${emailCode} to ${email}`,
      );
    }
  }

  return {
    success: true,
    message: "Verification code resent to your email",
  };
};

// ---------------------------------------------------------------------------
// Add phone to pending user + send SMS code
// ---------------------------------------------------------------------------
export const addPhoneToPendingUser = async (
  email: string,
  phoneNumber: string,
) => {
  const pendingUserService = await import("./pendingUser.service");
  const smsService = await import("./sms.service");

  const formattedPhone = smsService.formatPhoneNumber(phoneNumber);
  if (!smsService.isValidPhoneNumber(formattedPhone)) {
    throw new Error("Invalid phone number format");
  }

  // Check if phone is already in use
  const existingUser = await prisma.user.findFirst({
    where: { phoneNumber: formattedPhone },
  });
  if (existingUser) {
    throw new Error("Phone number already in use");
  }

  const { pendingUser, phoneCode } = await pendingUserService.addPhoneToPending(
    email,
    formattedPhone,
  );

  if (process.env.NODE_ENV === "development") {
    const maskedNum =
      formattedPhone.slice(0, -4).replace(/\d/g, "*") +
      formattedPhone.slice(-4);
    console.log(`SMS Verification Code: ${phoneCode} for ${maskedNum}`);
  }

  try {
    await smsService.sendVerificationSMS(formattedPhone, phoneCode);
    const maskedSms =
      formattedPhone.slice(0, -4).replace(/\d/g, "*") +
      formattedPhone.slice(-4);
    console.log(`SMS sent successfully to ${maskedSms}`);
  } catch (error: any) {
    console.error(
      "Failed to send SMS (code still valid for testing):",
      error?.message || error,
    );
  }

  return {
    success: true,
    message: "Verification code sent to your phone",
  };
};

// ---------------------------------------------------------------------------
// Verify phone code for pending user -> create real user
// ---------------------------------------------------------------------------
export const verifyPendingUserPhone = async (email: string, code: string) => {
  const pendingUserService = await import("./pendingUser.service");

  const pendingUser = await pendingUserService.verifyPendingPhone(email, code);

  if (!pendingUser.phoneVerified) {
    throw new Error("Phone verification required");
  }

  // Create the actual user
  const user = await prisma.user.create({
    data: {
      email: pendingUser.email,
      passwordHash: pendingUser.passwordHash,
      salt: pendingUser.salt,
      firstName: pendingUser.firstName,
      lastName: pendingUser.lastName,
      phoneNumber: pendingUser.phoneNumber!,
      isEmailVerified: pendingUser.emailVerified || false,
      isPhoneVerified: true,
    },
  });

  // Delete the pending user
  await pendingUserService.deletePendingUser(email);

  // Generate session tokens (HMAC pattern)
  const tokens = await createSessionTokens(user.id, user.email);

  return {
    user: {
      id: user.id,
      email: user.email,
      phoneNumber: user.phoneNumber,
      isEmailVerified: user.isEmailVerified,
      isPhoneVerified: user.isPhoneVerified,
    },
    tokens,
  };
};

// ---------------------------------------------------------------------------
// Send email verification code (authenticated user)
// ---------------------------------------------------------------------------
export const sendEmailVerificationCode = async (userId: string) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("User not found");
  if (user.isEmailVerified) throw new Error("Email already verified");

  const token = generateSecureToken();
  await storeEmailVerificationToken(token, userId);

  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3001";
  const verificationLink = `${frontendUrl}/v/b8m3q6?token=${token}`;

  const emailService = await import("./email.service");
  const userName = user.firstName
    ? `${user.firstName} ${user.lastName || ""}`.trim()
    : "User";
  await emailService.sendVerificationEmail(
    user.email,
    userName,
    verificationLink,
  );

  return { success: true };
};

// ---------------------------------------------------------------------------
// Verify email code (authenticated user)
// ---------------------------------------------------------------------------
export const verifyEmailCode = async (userId: string, code: string) => {
  const verificationCode = await prisma.verificationCode.findFirst({
    where: {
      userId,
      type: "email",
      code,
      isUsed: false,
      expiresAt: { gte: new Date() },
    },
  });

  if (!verificationCode)
    throw new Error("Invalid or expired verification code");

  await prisma.verificationCode.update({
    where: { id: verificationCode.id },
    data: { isUsed: true },
  });

  const user = await prisma.user.update({
    where: { id: userId },
    data: { isEmailVerified: true },
  });

  const emailService = await import("./email.service");
  await emailService.sendWelcomeEmail(user.email, user.email.split("@")[0]);

  return { success: true };
};

// ---------------------------------------------------------------------------
// Send phone verification code (authenticated user)
// ---------------------------------------------------------------------------
export const sendPhoneVerificationCode = async (
  userId: string,
  phoneNumber: string,
) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("User not found");

  const smsService = await import("./sms.service");

  const formattedPhone = smsService.formatPhoneNumber(phoneNumber);
  if (!smsService.isValidPhoneNumber(formattedPhone)) {
    throw new Error("Invalid phone number format");
  }

  const existingUser = await prisma.user.findFirst({
    where: { phoneNumber: formattedPhone, id: { not: userId } },
  });
  if (existingUser) throw new Error("Phone number already in use");

  // Save phone number (unverified)
  await prisma.user.update({
    where: { id: userId },
    data: { phoneNumber: formattedPhone, isPhoneVerified: false },
  });

  // Generate 6-digit verification code
  const code = smsService.generateSMSCode();

  // Delete any existing unused phone verification codes for this user
  await prisma.verificationCode.deleteMany({
    where: { userId, type: "phone", isUsed: false },
  });

  // Store the verification code
  await prisma.verificationCode.create({
    data: {
      userId,
      type: "phone",
      code,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
    },
  });

  // Send SMS with the code
  await smsService.sendVerificationSMS(formattedPhone, code);

  return { success: true };
};

// ---------------------------------------------------------------------------
// Verify phone code (authenticated user)
// ---------------------------------------------------------------------------
export const verifyPhoneCode = async (userId: string, code: string) => {
  const result = await prisma.$transaction(async (tx) => {
    const verificationCode = await tx.verificationCode.findFirst({
      where: {
        userId,
        type: "phone",
        code,
        isUsed: false,
        expiresAt: { gte: new Date() },
      },
    });

    if (!verificationCode)
      throw new Error("Invalid or expired verification code");

    await tx.verificationCode.update({
      where: { id: verificationCode.id },
      data: { isUsed: true },
    });

    const updatedUser = await tx.user.update({
      where: { id: userId },
      data: { isPhoneVerified: true },
      select: { id: true, phoneNumber: true, isPhoneVerified: true },
    });

    return updatedUser;
  });

  if (process.env.NODE_ENV === "development") {
    const maskedPh = result.phoneNumber
      ? result.phoneNumber.slice(0, -4).replace(/\d/g, "*") +
        result.phoneNumber.slice(-4)
      : "unknown";
    console.log(`Phone verified successfully for user ${userId}: ${maskedPh}`);
  }

  return {
    success: true,
    phoneNumber: result.phoneNumber,
    isPhoneVerified: result.isPhoneVerified,
  };
};

// ---------------------------------------------------------------------------
// Verify email via magic link token
// ---------------------------------------------------------------------------
export const verifyEmailToken = async (token: string) => {
  const userId = await getUserFromEmailVerificationToken(token);
  if (!userId) throw new Error("Invalid or expired verification link");

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("User not found");
  if (user.isEmailVerified) {
    await deleteEmailVerificationToken(token);
    return { success: true, alreadyVerified: true };
  }

  await prisma.user.update({
    where: { id: userId },
    data: { isEmailVerified: true },
  });

  await deleteEmailVerificationToken(token);

  // Send welcome email
  const emailService = await import("./email.service");
  await emailService.sendWelcomeEmail(user.email, user.email.split("@")[0]);

  return { success: true };
};

// ---------------------------------------------------------------------------
// Verify phone via magic link token
// ---------------------------------------------------------------------------
export const verifyPhoneToken = async (token: string) => {
  const data = await getPhoneVerificationData(token);
  if (!data) throw new Error("Invalid or expired verification link");

  const user = await prisma.user.findUnique({ where: { id: data.userId } });
  if (!user) throw new Error("User not found");

  // Ensure phone still matches (user might have changed it since link was sent)
  if (user.phoneNumber !== data.phoneNumber) {
    await deletePhoneVerificationToken(token);
    throw new Error("Phone number has changed since this link was sent");
  }

  if (user.isPhoneVerified) {
    await deletePhoneVerificationToken(token);
    return { success: true, alreadyVerified: true };
  }

  await prisma.user.update({
    where: { id: data.userId },
    data: { isPhoneVerified: true },
  });

  await deletePhoneVerificationToken(token);
  return { success: true };
};

// ---------------------------------------------------------------------------
// Password Reset (code-based)
// ---------------------------------------------------------------------------
export const requestPasswordReset = async ({
  email,
  phoneNumber,
}: {
  email?: string;
  phoneNumber?: string;
}) => {
  const user = await prisma.user.findFirst({
    where: email ? { email: email.toLowerCase() } : { phoneNumber },
  });

  if (!user) {
    return {
      success: true,
      message: "If an account exists, a reset code will be sent",
    };
  }

  const emailService = await import("./email.service");
  const code = emailService.generateVerificationCode();

  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 10);

  await prisma.verificationCode.deleteMany({
    where: { userId: user.id, type: "password_reset", isUsed: false },
  });

  await prisma.verificationCode.create({
    data: { userId: user.id, type: "password_reset", code, expiresAt },
  });

  if (email && user.email) {
    try {
      await emailService.sendPasswordResetEmail(user.email, code);
      console.log(`Password reset code sent to ${user.email}`);
    } catch (error) {
      console.error("Failed to send password reset email:", error);
    }
  } else if (phoneNumber && user.phoneNumber) {
    try {
      const smsService = await import("./sms.service");
      await smsService.sendPasswordResetSMS(user.phoneNumber, code);
      const maskedResetPhone =
        user.phoneNumber!.slice(0, -4).replace(/\d/g, "*") +
        user.phoneNumber!.slice(-4);
      console.log(`Password reset code sent to ${maskedResetPhone}`);
    } catch (error) {
      console.error("Failed to send password reset SMS:", error);
    }
  }

  return {
    success: true,
    message: "If an account exists, a reset code will be sent",
  };
};

// ---------------------------------------------------------------------------
// Verify password reset code
// ---------------------------------------------------------------------------
export const verifyPasswordResetCode = async ({
  email,
  phoneNumber,
  code,
}: {
  email?: string;
  phoneNumber?: string;
  code: string;
}) => {
  const user = await prisma.user.findFirst({
    where: email ? { email: email.toLowerCase() } : { phoneNumber },
  });

  if (!user) throw new Error("Invalid verification code");

  const verificationCode = await prisma.verificationCode.findFirst({
    where: {
      userId: user.id,
      type: "password_reset",
      code,
      isUsed: false,
      expiresAt: { gte: new Date() },
    },
  });

  if (!verificationCode)
    throw new Error("Invalid or expired verification code");

  return { success: true, message: "Code verified successfully" };
};

// ---------------------------------------------------------------------------
// Reset password with verified code
// ---------------------------------------------------------------------------
export const resetPassword = async ({
  email,
  phoneNumber,
  code,
  newPassword,
}: {
  email?: string;
  phoneNumber?: string;
  code: string;
  newPassword: string;
}) => {
  const passwordValidation = validatePasswordStrength(newPassword);
  if (!passwordValidation.valid) {
    throw new Error(passwordValidation.message || "Invalid password");
  }

  const user = await prisma.user.findFirst({
    where: email ? { email: email.toLowerCase() } : { phoneNumber },
  });

  if (!user) throw new Error("Invalid verification code");

  const verificationCode = await prisma.verificationCode.findFirst({
    where: {
      userId: user.id,
      type: "password_reset",
      code,
      isUsed: false,
      expiresAt: { gte: new Date() },
    },
  });

  if (!verificationCode)
    throw new Error("Invalid or expired verification code");

  const { hash, salt } = await hashPassword(newPassword);

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: hash, salt },
  });

  await prisma.verificationCode.update({
    where: { id: verificationCode.id },
    data: { isUsed: true },
  });

  // Invalidate all existing sessions
  await prisma.session.updateMany({
    where: { userId: user.id },
    data: { isActive: false, revokedAt: new Date() },
  });

  return { success: true, message: "Password reset successfully" };
};

// ---------------------------------------------------------------------------
// Link-based Password Recovery
// ---------------------------------------------------------------------------
import { redisConnection } from "../config/redis";
import {
  generateSecureToken,
  maskEmail,
  maskPhone,
} from "../utils/maskingUtils";

// In-memory fallback when Redis is not available
const memoryStore = new Map<string, { value: string; expiresAt: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [key, data] of memoryStore.entries()) {
    if (data.expiresAt < now) {
      memoryStore.delete(key);
    }
  }
}, 60000);

async function storeInCache(
  key: string,
  value: string,
  ttlSeconds: number,
): Promise<void> {
  if (redisConnection) {
    try {
      await redisConnection.setex(key, ttlSeconds, value);
      return;
    } catch (error) {
      console.warn("Redis error, falling back to memory store:", error);
    }
  }
  memoryStore.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

async function getFromCache(key: string): Promise<string | null> {
  if (redisConnection) {
    try {
      return await redisConnection.get(key);
    } catch (error) {
      console.warn("Redis error, falling back to memory store:", error);
    }
  }
  const data = memoryStore.get(key);
  if (data && data.expiresAt > Date.now()) return data.value;
  return null;
}

async function deleteFromCache(key: string): Promise<void> {
  if (redisConnection) {
    try {
      await redisConnection.del(key);
    } catch {}
  }
  memoryStore.delete(key);
}

export async function storeResetToken(
  token: string,
  userId: string,
): Promise<void> {
  await storeInCache(`pwd-reset:${token}`, userId, 900);
}

export async function getUserFromResetToken(
  token: string,
): Promise<string | null> {
  return getFromCache(`pwd-reset:${token}`);
}

export async function deleteResetToken(token: string): Promise<void> {
  await deleteFromCache(`pwd-reset:${token}`);
}

// Email verification tokens (15 min TTL)
async function storeEmailVerificationToken(
  token: string,
  userId: string,
): Promise<void> {
  await storeInCache(`email-verify:${token}`, userId, 900);
}

async function getUserFromEmailVerificationToken(
  token: string,
): Promise<string | null> {
  return getFromCache(`email-verify:${token}`);
}

async function deleteEmailVerificationToken(token: string): Promise<void> {
  await deleteFromCache(`email-verify:${token}`);
}

// Phone verification tokens (15 min TTL) — store userId + phoneNumber as JSON
async function storePhoneVerificationToken(
  token: string,
  data: { userId: string; phoneNumber: string },
): Promise<void> {
  await storeInCache(`phone-verify:${token}`, JSON.stringify(data), 900);
}

async function getPhoneVerificationData(
  token: string,
): Promise<{ userId: string; phoneNumber: string } | null> {
  const raw = await getFromCache(`phone-verify:${token}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function deletePhoneVerificationToken(token: string): Promise<void> {
  await deleteFromCache(`phone-verify:${token}`);
}

export async function storeResetSession(
  sessionToken: string,
  userId: string,
): Promise<void> {
  await storeInCache(`reset-session:${sessionToken}`, userId, 300);
}

export async function getUserFromSessionToken(
  sessionToken: string,
): Promise<string | null> {
  return getFromCache(`reset-session:${sessionToken}`);
}

// ---------------------------------------------------------------------------
// Initiate forgot password (link-based)
// ---------------------------------------------------------------------------
export async function initiateForgotPassword(email: string) {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    select: {
      id: true,
      email: true,
      phoneNumber: true,
      isEmailVerified: true,
      isPhoneVerified: true,
    },
  });

  if (!user) {
    return {
      success: true,
      maskedEmail: maskEmail(email),
      maskedPhone: null,
      hasPhone: false,
      sessionToken: null,
    };
  }

  if (!user.isEmailVerified && !user.isPhoneVerified) {
    throw new Error("ACCOUNT_NOT_VERIFIED");
  }

  const maskedEmailValue = maskEmail(user.email);
  const maskedPhoneValue = user.phoneNumber
    ? maskPhone(user.phoneNumber)
    : null;

  const canUseEmail = user.isEmailVerified;
  const canUsePhone = !!user.phoneNumber && user.isPhoneVerified;
  const hasUnverifiedPhone = !!user.phoneNumber && !user.isPhoneVerified;

  const sessionToken = generateSecureToken();
  await storeResetSession(sessionToken, user.id);

  return {
    success: true,
    sessionToken,
    maskedEmail: maskedEmailValue,
    maskedPhone: maskedPhoneValue,
    hasPhone: canUsePhone,
    canUseEmail,
    canUsePhone,
    hasUnverifiedPhone,
  };
}

// ---------------------------------------------------------------------------
// Send reset link via email or SMS
// ---------------------------------------------------------------------------
export async function sendResetLink(
  sessionToken: string,
  method: "email" | "sms",
) {
  const userId = await getUserFromSessionToken(sessionToken);
  if (!userId) throw new Error("INVALID_OR_EXPIRED_SESSION");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      phoneNumber: true,
      isPhoneVerified: true,
      firstName: true,
      lastName: true,
    },
  });

  if (!user) throw new Error("USER_NOT_FOUND");

  const resetToken = generateSecureToken();
  await storeResetToken(resetToken, userId);

  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3001";
  const resetLink = `${frontendUrl}/r/s5n9p4?token=${resetToken}`;

  if (method === "email") {
    const emailService = await import("./email.service");
    await emailService.sendPasswordResetEmail(
      user.email,
      resetLink,
      user.firstName || "User",
    );
    return { success: true, method: "email" };
  } else if (method === "sms") {
    if (!user.phoneNumber || !user.isPhoneVerified) {
      throw new Error("NO_VERIFIED_PHONE");
    }
    const smsService = await import("./sms.service");
    await smsService.sendCustomSMS(
      user.phoneNumber,
      `KODA: Reset your password using this link:\n${resetLink}\n\nThis link expires in 15 minutes.`,
    );
    return { success: true, method: "sms" };
  } else {
    throw new Error("INVALID_METHOD");
  }
}

// ---------------------------------------------------------------------------
// Reset password with token (from link)
// ---------------------------------------------------------------------------
export async function resetPasswordWithToken(
  token: string,
  newPassword: string,
) {
  const userId = await getUserFromResetToken(token);
  if (!userId) throw new Error("INVALID_OR_EXPIRED_TOKEN");

  const passwordRegex =
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  if (!passwordRegex.test(newPassword)) throw new Error("WEAK_PASSWORD");

  const { hash: passwordHash, salt } = await hashPassword(newPassword);

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash, salt },
  });

  // Revoke all active sessions after a successful password reset.
  await prisma.session.updateMany({
    where: { userId },
    data: { isActive: false, revokedAt: new Date() },
  });

  await deleteResetToken(token);

  // Audit logging (optional, skip if service not available)
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const stubs = require("./securityStubs.service");
    if (stubs?.auditLogService) {
      await stubs.auditLogService.log({
        userId,
        action: "PASSWORD_RESET",
        status: "SUCCESS",
        resourceId: userId,
        document_metadata: { method: "token" },
      });
    }
  } catch {
    // Audit logging is optional
  }

  return { success: true };
}
