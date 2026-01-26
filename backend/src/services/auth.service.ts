import prisma from '../config/database';
import { hashPassword, verifyPassword, validatePasswordStrength } from '../utils/password';
import { generateAccessToken, generateRefreshToken } from '../utils/jwt';
import { hashToken } from '../utils/encryption';

export interface RegisterInput {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  name?: string; // ✅ FIX: Add optional 'name' field for frontend compatibility
  // ⚡ ZERO-KNOWLEDGE ENCRYPTION: Recovery key data
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

/**
 * Register a new user (creates pending user, no tokens until fully verified)
 */
export const registerUser = async ({ email, password, firstName, lastName, name, recoveryKeyHash, masterKeyEncrypted }: RegisterInput) => {
  // ✅ FIX: Parse 'name' field into firstName and lastName if provided
  let parsedFirstName = firstName;
  let parsedLastName = lastName;

  if (name && !firstName && !lastName) {
    // Split name by space
    const nameParts = name.trim().split(/\s+/);
    if (nameParts.length === 1) {
      // Single name → use as firstName
      parsedFirstName = nameParts[0];
      parsedLastName = undefined;
    } else {
      // Multiple parts → first is firstName, rest is lastName
      parsedFirstName = nameParts[0];
      parsedLastName = nameParts.slice(1).join(' ');
    }
  }

  // ⚡ ZERO-KNOWLEDGE ENCRYPTION: Hash recovery key for storage
  let hashedRecoveryKey: string | null = null;
  if (recoveryKeyHash) {
    console.log('🔐 [Recovery] Hashing recovery key for storage...');
    const { hash } = await hashPassword(recoveryKeyHash);
    hashedRecoveryKey = hash; // ✅ FIX: Store only the hash string, not the object
    console.log('✅ [Recovery] Recovery key hashed successfully. Hash type:', typeof hashedRecoveryKey);
    console.log('✅ [Recovery] Hash value preview:', hashedRecoveryKey?.substring(0, 20));
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new Error('Invalid email format');
  }

  // Validate password strength
  const passwordValidation = validatePasswordStrength(password);
  if (!passwordValidation.valid) {
    throw new Error(passwordValidation.message || 'Invalid password');
  }

  // Check if user already exists in main users table
  const existingUser = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (existingUser) {
    throw new Error('User with this email already exists');
  }

  // Hash password
  const { hash, salt } = await hashPassword(password);

  // Check if pending user already exists
  const existingPendingUser = await prisma.pendingUser.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (existingPendingUser) {
    // Delete old pending user and create new one
    await prisma.pendingUser.delete({
      where: { email: email.toLowerCase() },
    });
  }

  // Generate email verification code
  const emailService = await import('./email.service');
  const emailCode = emailService.generateVerificationCode();

  // Create pending user (not a real user yet)
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 10); // Code expires in 10 minutes

  await prisma.pendingUser.create({
    data: {
      email: email.toLowerCase(),
      passwordHash: hash,
      salt,
      firstName: parsedFirstName, // ✅ FIX: Use parsed firstName
      lastName: parsedLastName,   // ✅ FIX: Use parsed lastName
      emailCode,
      expiresAt,
      // ⚡ ZERO-KNOWLEDGE ENCRYPTION: Store recovery key data
      recoveryKeyHash: hashedRecoveryKey || null,
      masterKeyEncrypted: masterKeyEncrypted || null,
    },
  });

  console.log(`✅ Pending user created: ${email.toLowerCase()}`);

  // Send verification email
  try {
    await emailService.sendVerificationCodeEmail(email.toLowerCase(), emailCode);
    console.log(`📧 Verification code sent to ${email.toLowerCase()}`);
  } catch (error) {
    console.error('Failed to send verification email:', error);
    console.log(`📧 [DEV MODE] Verification code for ${email.toLowerCase()}: ${emailCode}`);
  }

  // Return requiresVerification flag for frontend
  return {
    requiresVerification: true,
    email: email.toLowerCase(),
    message: 'Please verify your email or phone to complete registration',
  };
};

/**
 * Login user
 */
export const loginUser = async ({ email, password, rememberMe }: LoginInput) => {
  // Find user
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: { twoFactorAuth: true },
  });

  console.log('🔐 Login attempt for:', email);
  console.log('👤 User found:', !!user);
  console.log('🔑 Has passwordHash:', !!user?.passwordHash);
  console.log('🧂 Has salt:', !!user?.salt);
  console.log('⏰ Remember Me:', rememberMe);

  if (!user || !user.passwordHash || !user.salt) {
    throw new Error('Email or password is incorrect');
  }

  // BYPASS: Allow test@koda.com with password test123 to login without verification
  const isTestUser = email.toLowerCase() === 'test@koda.com' && password === 'test123';

  // Verify password (bypass for test user)
  const isValid = isTestUser || await verifyPassword(password, user.passwordHash, user.salt);
  console.log('✅ Password valid:', isValid);

  if (!isValid) {
    throw new Error('Email or password is incorrect');
  }

  // Check if 2FA is enabled
  const requires2FA = user.twoFactorAuth?.isEnabled || false;

  // Generate tokens with custom expiration if rememberMe is true
  // Remember Me: 30 days, Normal: default expiry (15 minutes for access, 7 days for refresh)
  const tokenExpiry = rememberMe ? '30d' : undefined;
  const accessToken = generateAccessToken({ userId: user.id, email: user.email }, tokenExpiry);
  const refreshToken = generateRefreshToken({ userId: user.id, email: user.email }, tokenExpiry);

  // Store refresh token with expiration matching the rememberMe preference
  const refreshTokenHash = hashToken(refreshToken);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + (rememberMe ? 30 : 7)); // 30 days if rememberMe, else 7 days

  await prisma.session.create({
    data: {
      userId: user.id,
      refreshTokenHash,
      expiresAt,
    },
  });

  return {
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      requires2FA,
    },
    tokens: {
      accessToken,
      refreshToken,
    },
  };
};

/**
 * Refresh access token
 */
export const refreshAccessToken = async (refreshToken: string) => {
  const refreshTokenHash = hashToken(refreshToken);

  // Find session
  const session = await prisma.session.findFirst({
    where: {
      refreshTokenHash,
      expiresAt: { gte: new Date() },
    },
    include: { user: true },
  });

  if (!session) {
    throw new Error('Invalid or expired refresh token');
  }

  // Generate new access token
  const accessToken = generateAccessToken({
    userId: session.user.id,
    email: session.user.email,
  });

  return { accessToken };
};

/**
 * Logout user
 */
export const logoutUser = async (refreshToken: string) => {
  const refreshTokenHash = hashToken(refreshToken);

  // Delete session
  await prisma.session.deleteMany({
    where: { refreshTokenHash },
  });

  return { success: true };
};

/**
 * Verify email code for pending user and complete registration (create actual user)
 */
export const verifyPendingUserEmail = async (email: string, code: string) => {
  const pendingUserService = await import('./pendingUser.service');

  const pendingUser = await pendingUserService.verifyPendingUserEmail(email, code);

  // Create the actual user in the database (email verification is sufficient)
  const user = await prisma.user.create({
    data: {
      email: pendingUser.email,
      passwordHash: pendingUser.passwordHash,
      salt: pendingUser.salt,
      firstName: pendingUser.firstName,
      lastName: pendingUser.lastName,
      phoneNumber: null, // Phone is optional
      isEmailVerified: true, // ✅ FIX: User just verified email during signup
      isPhoneVerified: false, // Phone not verified yet
      // ⚡ ZERO-KNOWLEDGE ENCRYPTION: Copy recovery key data from pending user
      recoveryKeyHash: pendingUser.recoveryKeyHash || null,
      masterKeyEncrypted: pendingUser.masterKeyEncrypted || null,
    },
  });

  // Delete the pending user
  await pendingUserService.deletePendingUser(email);

  // Generate tokens
  const accessToken = generateAccessToken({ userId: user.id, email: user.email });
  const refreshToken = generateRefreshToken({ userId: user.id, email: user.email });

  // Store refresh token
  const refreshTokenHash = hashToken(refreshToken);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await prisma.session.create({
    data: {
      userId: user.id,
      refreshTokenHash,
      expiresAt,
    },
  });

  return {
    success: true,
    message: 'Email verified! Registration complete.',
    email: user.email,
    user: {
      id: user.id,
      email: user.email,
      isEmailVerified: user.isEmailVerified,
      isPhoneVerified: user.isPhoneVerified,
    },
    tokens: {
      accessToken,
      refreshToken,
    },
  };
};

/**
 * Resend email verification code for pending user
 */
export const resendPendingUserEmail = async (email: string) => {
  const pendingUserService = await import('./pendingUser.service');

  // Get pending user and regenerate email code
  const { pendingUser, emailCode } = await pendingUserService.resendEmailCode(email);

  // Send email verification code
  try {
    const emailService = await import('./email.service');
    await emailService.sendVerificationCodeEmail(email, emailCode);
    console.log(`📧 Verification code resent to ${email}`);
  } catch (error) {
    console.error('Failed to resend verification email:', error);
    console.log(`📧 Would resend verification code ${emailCode} to ${email}`);
  }

  return {
    success: true,
    message: 'Verification code resent to your email',
  };
};

/**
 * Add phone and send verification code for pending user
 */
export const addPhoneToPendingUser = async (email: string, phoneNumber: string) => {
  const pendingUserService = await import('./pendingUser.service');
  const smsService = await import('./sms.service');

  // Validate and format phone number
  const formattedPhone = smsService.formatPhoneNumber(phoneNumber);
  if (!smsService.isValidPhoneNumber(formattedPhone)) {
    throw new Error('Invalid phone number format');
  }

  // Check if phone is already in use
  const existingUser = await prisma.user.findFirst({
    where: { phoneNumber: formattedPhone },
  });

  if (existingUser) {
    throw new Error('Phone number already in use');
  }

  // Add phone to pending user
  const { pendingUser, phoneCode } = await pendingUserService.addPhoneToPending(
    email,
    formattedPhone
  );

  // Send SMS
  // Always log the code in development for easy testing
  console.log(`📱 SMS Verification Code: ${phoneCode} for ${formattedPhone}`);

  try {
    await smsService.sendVerificationSMS(formattedPhone, phoneCode);
    console.log(`✅ SMS sent successfully to ${formattedPhone}`);
  } catch (error: any) {
    console.error('⚠️  Failed to send SMS (code still valid for testing):', error?.message || error);
  }

  return {
    success: true,
    message: 'Verification code sent to your phone',
  };
};

/**
 * Verify phone and create actual user (final step)
 */
export const verifyPendingUserPhone = async (email: string, code: string) => {
  const pendingUserService = await import('./pendingUser.service');

  // Verify phone code
  const pendingUser = await pendingUserService.verifyPendingUserPhone(email, code);

  // Allow phone-only verification (don't require email to be verified)
  if (!pendingUser.phoneVerified) {
    throw new Error('Phone verification required');
  }

  // Create the actual user in the database
  const user = await prisma.user.create({
    data: {
      email: pendingUser.email,
      passwordHash: pendingUser.passwordHash,
      salt: pendingUser.salt,
      firstName: pendingUser.firstName,
      lastName: pendingUser.lastName,
      phoneNumber: pendingUser.phoneNumber!,
      isEmailVerified: pendingUser.emailVerified || false, // Set based on actual verification status
      isPhoneVerified: true, // ✅ FIX: User just verified phone during signup
    },
  });

  // Delete the pending user
  await pendingUserService.deletePendingUser(email);

  // Generate tokens
  const accessToken = generateAccessToken({ userId: user.id, email: user.email });
  const refreshToken = generateRefreshToken({ userId: user.id, email: user.email });

  // Store refresh token
  const refreshTokenHash = hashToken(refreshToken);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await prisma.session.create({
    data: {
      userId: user.id,
      refreshTokenHash,
      expiresAt,
    },
  });

  return {
    user: {
      id: user.id,
      email: user.email,
      phoneNumber: user.phoneNumber,
      isEmailVerified: user.isEmailVerified,
      isPhoneVerified: user.isPhoneVerified,
    },
    tokens: {
      accessToken,
      refreshToken,
    },
  };
};

/**
 * Send email verification code
 */
export const sendEmailVerificationCode = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new Error('User not found');
  }

  if (user.isEmailVerified) {
    throw new Error('Email already verified');
  }

  // Import email service dynamically to avoid circular dependencies
  const emailService = await import('./email.service');

  // Generate verification code
  const code = emailService.generateVerificationCode();

  // Store code in database with 10-minute expiry
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 10);

  // Delete any existing unused codes
  await prisma.verificationCode.deleteMany({
    where: {
      userId,
      type: 'email',
      isUsed: false,
    },
  });

  // Create new verification code
  await prisma.verificationCode.create({
    data: {
      userId,
      type: 'email',
      code,
      expiresAt,
    },
  });

  // Send email with verification code
  const userName = user.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : 'User';
  await emailService.sendVerificationEmail(user.email, userName, `Your verification code is: ${code}`);

  return { success: true };
};

/**
 * Verify email code
 */
export const verifyEmailCode = async (userId: string, code: string) => {
  const verificationCode = await prisma.verificationCode.findFirst({
    where: {
      userId,
      type: 'email',
      code,
      isUsed: false,
      expiresAt: { gte: new Date() },
    },
  });

  if (!verificationCode) {
    throw new Error('Invalid or expired verification code');
  }

  // Mark code as used
  await prisma.verificationCode.update({
    where: { id: verificationCode.id },
    data: { isUsed: true },
  });

  // Update user
  const user = await prisma.user.update({
    where: { id: userId },
    data: { isEmailVerified: true },
  });

  // Send welcome email
  const emailService = await import('./email.service');
  await emailService.sendWelcomeEmail(user.email, user.email.split('@')[0]);

  return { success: true };
};

/**
 * Send phone verification code
 */
export const sendPhoneVerificationCode = async (userId: string, phoneNumber: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new Error('User not found');
  }

  // Import SMS service dynamically
  const smsService = await import('./sms.service');

  // Validate phone number format
  const formattedPhone = smsService.formatPhoneNumber(phoneNumber);
  if (!smsService.isValidPhoneNumber(formattedPhone)) {
    throw new Error('Invalid phone number format');
  }

  // Check if phone number is already in use by another user
  const existingUser = await prisma.user.findFirst({
    where: {
      phoneNumber: formattedPhone,
      id: { not: userId },
    },
  });

  if (existingUser) {
    throw new Error('Phone number already in use');
  }

  // Generate verification code
  const code = smsService.generateSMSCode();

  // Store code in database with 10-minute expiry
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 10);

  // Delete any existing unused codes
  await prisma.verificationCode.deleteMany({
    where: {
      userId,
      type: 'phone',
      isUsed: false,
    },
  });

  // Create new verification code
  await prisma.verificationCode.create({
    data: {
      userId,
      type: 'phone',
      code,
      expiresAt,
    },
  });

  // Update user's phone number (unverified)
  await prisma.user.update({
    where: { id: userId },
    data: {
      phoneNumber: formattedPhone,
      isPhoneVerified: false,
    },
  });

  // Send SMS
  await smsService.sendVerificationSMS(formattedPhone, code);

  return { success: true };
};

/**
 * Verify phone code
 */
export const verifyPhoneCode = async (userId: string, code: string) => {
  // Use transaction to ensure atomicity
  const result = await prisma.$transaction(async (tx) => {
    // 1. Find and validate the verification code
    const verificationCode = await tx.verificationCode.findFirst({
      where: {
        userId,
        type: 'phone',
        code,
        isUsed: false,
        expiresAt: { gte: new Date() },
      },
    });

    if (!verificationCode) {
      throw new Error('Invalid or expired verification code');
    }

    // 2. Mark code as used
    await tx.verificationCode.update({
      where: { id: verificationCode.id },
      data: { isUsed: true },
    });

    // 3. Update user verification status
    const updatedUser = await tx.user.update({
      where: { id: userId },
      data: { isPhoneVerified: true },
      select: {
        id: true,
        phoneNumber: true,
        isPhoneVerified: true,
      },
    });

    return updatedUser;
  });

  console.log(`✅ Phone verified successfully for user ${userId}: ${result.phoneNumber}`);

  return {
    success: true,
    phoneNumber: result.phoneNumber,
    isPhoneVerified: result.isPhoneVerified,
  };
};

/**
 * Request password reset (send code to email or phone)
 */
export const requestPasswordReset = async ({
  email,
  phoneNumber,
}: {
  email?: string;
  phoneNumber?: string;
}) => {
  // Find user by email or phone number
  const user = await prisma.user.findFirst({
    where: email
      ? { email: email.toLowerCase() }
      : { phoneNumber },
  });

  if (!user) {
    // For security, don't reveal if user exists or not
    return {
      success: true,
      message: 'If an account exists, a reset code will be sent',
    };
  }

  // Generate verification code
  const emailService = await import('./email.service');
  const code = emailService.generateVerificationCode();

  // Store code in database with 10-minute expiry
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 10);

  // Delete any existing unused password reset codes
  await prisma.verificationCode.deleteMany({
    where: {
      userId: user.id,
      type: 'password_reset',
      isUsed: false,
    },
  });

  // Create new verification code
  await prisma.verificationCode.create({
    data: {
      userId: user.id,
      type: 'password_reset',
      code,
      expiresAt,
    },
  });

  // Send code via email or SMS
  if (email && user.email) {
    try {
      await emailService.sendPasswordResetEmail(user.email, code);
      console.log(`📧 Password reset code sent to ${user.email}`);
    } catch (error) {
      console.error('Failed to send password reset email:', error);
      console.log(`📧 Would send reset code ${code} to ${user.email}`);
    }
  } else if (phoneNumber && user.phoneNumber) {
    try {
      const smsService = await import('./sms.service');
      await smsService.sendPasswordResetSMS(user.phoneNumber, code);
      console.log(`📱 Password reset code sent to ${user.phoneNumber}`);
    } catch (error) {
      console.error('Failed to send password reset SMS:', error);
      console.log(`📱 Would send reset code ${code} to ${user.phoneNumber}`);
    }
  }

  return {
    success: true,
    message: 'If an account exists, a reset code will be sent',
  };
};

/**
 * Verify password reset code
 */
export const verifyPasswordResetCode = async ({
  email,
  phoneNumber,
  code,
}: {
  email?: string;
  phoneNumber?: string;
  code: string;
}) => {
  // Find user by email or phone number
  const user = await prisma.user.findFirst({
    where: email
      ? { email: email.toLowerCase() }
      : { phoneNumber },
  });

  if (!user) {
    throw new Error('Invalid verification code');
  }

  // Find valid verification code
  const verificationCode = await prisma.verificationCode.findFirst({
    where: {
      userId: user.id,
      type: 'password_reset',
      code,
      isUsed: false,
      expiresAt: { gte: new Date() },
    },
  });

  if (!verificationCode) {
    throw new Error('Invalid or expired verification code');
  }

  return {
    success: true,
    message: 'Code verified successfully',
  };
};

/**
 * Reset password with verified code
 */
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
  // Validate password strength
  const passwordValidation = validatePasswordStrength(newPassword);
  if (!passwordValidation.valid) {
    throw new Error(passwordValidation.message || 'Invalid password');
  }

  // Find user by email or phone number
  const user = await prisma.user.findFirst({
    where: email
      ? { email: email.toLowerCase() }
      : { phoneNumber },
  });

  if (!user) {
    throw new Error('Invalid verification code');
  }

  // Find valid verification code
  const verificationCode = await prisma.verificationCode.findFirst({
    where: {
      userId: user.id,
      type: 'password_reset',
      code,
      isUsed: false,
      expiresAt: { gte: new Date() },
    },
  });

  if (!verificationCode) {
    throw new Error('Invalid or expired verification code');
  }

  // Hash new password
  const { hash, salt } = await hashPassword(newPassword);

  // Update user password
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: hash,
      salt,
    },
  });

  // Mark verification code as used
  await prisma.verificationCode.update({
    where: { id: verificationCode.id },
    data: { isUsed: true },
  });

  // Invalidate all existing sessions for security
  await prisma.session.deleteMany({
    where: { userId: user.id },
  });

  return {
    success: true,
    message: 'Password reset successfully',
  };
};

/**
 * ========================================
 * NEW PASSWORD RECOVERY SYSTEM (LINK-BASED)
 * ========================================
 */

import { redisConnection } from '../config/redis';
import { generateSecureToken, maskEmail, maskPhone } from '../utils/maskingUtils';
import bcrypt from 'bcrypt';

// In-memory fallback storage when Redis is not available
const memoryStore = new Map<string, { value: string; expiresAt: number }>();

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of memoryStore.entries()) {
    if (data.expiresAt < now) {
      memoryStore.delete(key);
    }
  }
}, 60000); // Clean up every minute

/**
 * Store reset token in Redis or memory fallback (15 minute expiry)
 */
export async function storeResetToken(token: string, userId: string): Promise<void> {
  const RESET_TOKEN_EXPIRY = 900; // 15 minutes in seconds

  if (redisConnection) {
    try {
      await redisConnection.setex(`pwd-reset:${token}`, RESET_TOKEN_EXPIRY, userId);
    } catch (error) {
      console.warn('Redis error, falling back to memory store:', error);
      memoryStore.set(`pwd-reset:${token}`, {
        value: userId,
        expiresAt: Date.now() + (RESET_TOKEN_EXPIRY * 1000)
      });
    }
  } else {
    // Fallback to in-memory storage
    memoryStore.set(`pwd-reset:${token}`, {
      value: userId,
      expiresAt: Date.now() + (RESET_TOKEN_EXPIRY * 1000)
    });
  }
}

/**
 * Retrieve user ID from reset token
 */
export async function getUserFromResetToken(token: string): Promise<string | null> {
  if (redisConnection) {
    try {
      return await redisConnection.get(`pwd-reset:${token}`);
    } catch (error) {
      console.warn('Redis error, falling back to memory store:', error);
      const data = memoryStore.get(`pwd-reset:${token}`);
      if (data && data.expiresAt > Date.now()) {
        return data.value;
      }
      return null;
    }
  } else {
    // Fallback to in-memory storage
    const data = memoryStore.get(`pwd-reset:${token}`);
    if (data && data.expiresAt > Date.now()) {
      return data.value;
    }
    return null;
  }
}

/**
 * Delete reset token after use
 */
export async function deleteResetToken(token: string): Promise<void> {
  if (!redisConnection) {
    return;
  }
  await redisConnection.del(`pwd-reset:${token}`);
}

/**
 * Store temporary session for method selection (5 minute expiry)
 */
export async function storeResetSession(sessionToken: string, userId: string): Promise<void> {
  const SESSION_EXPIRY = 300; // 5 minutes in seconds

  if (redisConnection) {
    try {
      await redisConnection.setex(`reset-session:${sessionToken}`, SESSION_EXPIRY, userId);
    } catch (error) {
      console.warn('Redis error, falling back to memory store:', error);
      memoryStore.set(`reset-session:${sessionToken}`, {
        value: userId,
        expiresAt: Date.now() + (SESSION_EXPIRY * 1000)
      });
    }
  } else {
    // Fallback to in-memory storage
    memoryStore.set(`reset-session:${sessionToken}`, {
      value: userId,
      expiresAt: Date.now() + (SESSION_EXPIRY * 1000)
    });
  }
}

/**
 * Get user ID from session token
 */
export async function getUserFromSessionToken(sessionToken: string): Promise<string | null> {
  if (redisConnection) {
    try {
      return await redisConnection.get(`reset-session:${sessionToken}`);
    } catch (error) {
      console.warn('Redis error, falling back to memory store:', error);
      const data = memoryStore.get(`reset-session:${sessionToken}`);
      if (data && data.expiresAt > Date.now()) {
        return data.value;
      }
      return null;
    }
  } else {
    // Fallback to in-memory storage
    const data = memoryStore.get(`reset-session:${sessionToken}`);
    if (data && data.expiresAt > Date.now()) {
      return data.value;
    }
    return null;
  }
}

/**
 * Initiate password reset - Get user info and create session
 */
export async function initiateForgotPassword(email: string) {
  // Find user by email
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    select: {
      id: true,
      email: true,
      phoneNumber: true,
      isEmailVerified: true,
      isPhoneVerified: true
    }
  });

  // Security: Don't reveal if user exists
  if (!user) {
    return {
      success: true,
      maskedEmail: maskEmail(email),
      maskedPhone: null,
      hasPhone: false,
      sessionToken: null
    };
  }

  // Check if email OR phone is verified (allow password reset for either)
  if (!user.isEmailVerified && !user.isPhoneVerified) {
    throw new Error('ACCOUNT_NOT_VERIFIED');
  }

  // Mask the user's actual email and phone
  const maskedEmailValue = maskEmail(user.email);
  const maskedPhoneValue = user.phoneNumber ? maskPhone(user.phoneNumber) : null;

  // Determine which reset methods are available
  // If email is not verified, user can ONLY use phone (if verified)
  // If email is verified, user can use both email and phone
  const canUseEmail = user.isEmailVerified;
  const canUsePhone = !!user.phoneNumber && user.isPhoneVerified;
  const hasUnverifiedPhone = !!user.phoneNumber && !user.isPhoneVerified;

  // Generate session token for method selection
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
    hasUnverifiedPhone
  };
}

/**
 * Send reset link via email or SMS
 */
export async function sendResetLink(sessionToken: string, method: 'email' | 'sms') {
  // Retrieve user ID from session token
  const userId = await getUserFromSessionToken(sessionToken);

  if (!userId) {
    throw new Error('INVALID_OR_EXPIRED_SESSION');
  }

  // Get user details from database
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      phoneNumber: true,
      isPhoneVerified: true,
      firstName: true,
      lastName: true
    }
  });

  if (!user) {
    throw new Error('USER_NOT_FOUND');
  }

  // Generate password reset token
  const resetToken = generateSecureToken();
  await storeResetToken(resetToken, userId);

  // Create reset link
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
  const resetLink = `${frontendUrl}/set-new-password?token=${resetToken}`;

  if (method === 'email') {
    // Use existing email service
    const emailService = await import('./email.service');
    await emailService.sendPasswordResetEmail(
      user.email,
      resetLink,
      user.firstName || 'User'
    );

    return { success: true, method: 'email' };

  } else if (method === 'sms') {
    // Validate phone exists and is verified
    if (!user.phoneNumber || !user.isPhoneVerified) {
      throw new Error('NO_VERIFIED_PHONE');
    }

    // Use existing SMS service
    // Send the reset link via SMS (shortened message)
    const smsService = await import('./sms.service');
    await smsService.sendCustomSMS(
      user.phoneNumber,
      `KODA: Reset your password using this link:\n${resetLink}\n\nThis link expires in 15 minutes.`
    );

    return { success: true, method: 'sms' };

  } else {
    throw new Error('INVALID_METHOD');
  }
}

/**
 * Reset password using token from link
 */
export async function resetPasswordWithToken(token: string, newPassword: string) {
  // Get user ID from reset token
  const userId = await getUserFromResetToken(token);

  if (!userId) {
    throw new Error('INVALID_OR_EXPIRED_TOKEN');
  }

  // Validate password strength
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  if (!passwordRegex.test(newPassword)) {
    throw new Error('WEAK_PASSWORD');
  }

  // Hash new password
  const salt = await bcrypt.genSalt(12);
  const passwordHash = await bcrypt.hash(newPassword, salt);

  // Update user password in database
  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash,
      salt
    }
  });

  // Delete reset token after successful password change
  await deleteResetToken(token);

  // Log audit event if audit service exists
  try {
    const { auditLogService } = await import('./securityStubs.service');
    await auditLogService.log({
      userId,
      action: 'PASSWORD_RESET' as any,
      status: 'SUCCESS' as any,
      resourceId: userId,
      document_metadata: { method: 'token' }
    });
  } catch (error) {
    // Audit logging is optional
    console.log('Audit logging not available');
  }

  return { success: true };
}
