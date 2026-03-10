import bcrypt from "bcrypt";

const SALT_ROUNDS = 12;

/**
 * Hash a password using bcrypt-12 with built-in salt.
 * The returned `salt` field is always empty — kept for DB schema compatibility.
 */
export const hashPassword = async (
  password: string,
): Promise<{ hash: string; salt: string }> => {
  const hash = await bcrypt.hash(password, SALT_ROUNDS);
  return { hash, salt: "" }; // salt embedded in bcrypt hash; field kept for schema compat
};

/**
 * Verify a password against a hash.
 * Migration path: if salt is non-empty, this is a legacy hash (password+salt was hashed).
 */
export const verifyPassword = async (
  password: string,
  hash: string,
  salt: string,
): Promise<boolean> => {
  // Migration path: if salt is non-empty, this is a legacy hash (password+salt was hashed)
  if (salt && salt.length > 0) {
    return bcrypt.compare(password + salt, hash);
  }
  return bcrypt.compare(password, hash);
};

/**
 * Validate password strength
 */
export const validatePasswordStrength = (
  password: string,
): { valid: boolean; message?: string } => {
  if (password.length < 8) {
    return {
      valid: false,
      message: "Password must be at least 8 characters long",
    };
  }

  if (!/[A-Z]/.test(password)) {
    return {
      valid: false,
      message: "Password must contain at least one uppercase letter",
    };
  }

  if (!/[a-z]/.test(password)) {
    return {
      valid: false,
      message: "Password must contain at least one lowercase letter",
    };
  }

  if (!/[0-9]/.test(password)) {
    return {
      valid: false,
      message: "Password must contain at least one number",
    };
  }

  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    return {
      valid: false,
      message: "Password must contain at least one special character",
    };
  }

  return { valid: true };
};
