import bcrypt from 'bcrypt';
import crypto from 'crypto';

const SALT_ROUNDS = 12;

/**
 * Generate a random salt
 */
export const generateSalt = (): string => {
  return crypto.randomBytes(16).toString('hex');
};

/**
 * Hash a password with a salt
 */
export const hashPassword = async (password: string): Promise<{ hash: string; salt: string }> => {
  const salt = generateSalt();
  const hash = await bcrypt.hash(password + salt, SALT_ROUNDS);
  return { hash, salt };
};

/**
 * Verify a password against a hash
 */
export const verifyPassword = async (
  password: string,
  hash: string,
  salt: string
): Promise<boolean> => {
  return bcrypt.compare(password + salt, hash);
};

/**
 * Validate password strength
 */
export const validatePasswordStrength = (password: string): { valid: boolean; message?: string } => {
  if (password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters long' };
  }

  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one uppercase letter' };
  }

  if (!/[a-z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one lowercase letter' };
  }

  if (!/[0-9]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one number' };
  }

  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one special character' };
  }

  return { valid: true };
};
