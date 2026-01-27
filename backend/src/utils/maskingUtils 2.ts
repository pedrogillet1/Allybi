/**
 * Masking Utilities for Password Recovery
 * Masks email and phone numbers for security while showing enough info for user recognition
 */

/**
 * Mask email address
 * Example: john.doe@gmail.com → joh•••••@g••••.com
 */
export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return email;

  const [local, domain] = email.split('@');
  if (!local || !domain) return email;

  const visibleLocal = local.substring(0, Math.min(3, local.length));
  const maskedLocal = visibleLocal + '•'.repeat(Math.max(local.length - 3, 0));

  const [domainName, tld] = domain.split('.');
  if (!domainName || !tld) return email;

  const visibleDomain = domainName[0];
  const maskedDomain = visibleDomain + '•'.repeat(Math.max(domainName.length - 1, 0));

  return `${maskedLocal}@${maskedDomain}.${tld}`;
}

/**
 * Mask phone number
 * Example: +12345678901 → +1 ••• •••• 901
 */
export function maskPhone(phone: string): string {
  if (!phone) return '';

  const cleaned = phone.replace(/[^\d+]/g, '');

  if (cleaned.length < 4) return phone;

  const countryCode = cleaned.substring(0, 2);
  const lastThree = cleaned.slice(-3);

  return `${countryCode} ••• •••• ${lastThree}`;
}

/**
 * Generate secure random token for reset links
 */
import crypto from 'crypto';

export function generateSecureToken(): string {
  return crypto.randomBytes(32).toString('hex');
}
