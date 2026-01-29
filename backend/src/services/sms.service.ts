/**
 * SMS Service - Infobip Integration
 *
 * Provides SMS functionality for:
 * - Phone verification during registration
 * - Password reset via SMS
 * - 2FA verification codes
 *
 * @requires INFOBIP_API_KEY - Infobip API Key
 * @requires INFOBIP_BASE_URL - Infobip base URL
 */

import { config } from '../config/env';

// ============================================================================
// INFOBIP CLIENT INITIALIZATION
// ============================================================================

const infobipEnabled = !!(config.INFOBIP_API_KEY && config.INFOBIP_BASE_URL);

if (infobipEnabled) {
  console.log('✅ Infobip SMS service initialized');
} else {
  console.warn('⚠️ Infobip SMS service is disabled. Missing environment variables:');
  if (!config.INFOBIP_API_KEY) console.warn('   - INFOBIP_API_KEY');
  if (!config.INFOBIP_BASE_URL) console.warn('   - INFOBIP_BASE_URL');
}

// ============================================================================
// PHONE NUMBER VALIDATION & FORMATTING
// ============================================================================

/**
 * Format a phone number to E.164 format
 * E.164 format: +[country code][number] (e.g., +14155552671)
 */
export function formatPhoneNumber(phoneNumber: string): string {
  // Remove all non-digit characters except leading +
  let cleaned = phoneNumber.replace(/[^\d+]/g, '');

  // If it doesn't start with +, assume it needs country code
  if (!cleaned.startsWith('+')) {
    // If it starts with 00, replace with +
    if (cleaned.startsWith('00')) {
      cleaned = '+' + cleaned.substring(2);
    }
    // If it's a US number (10 digits), add +1
    else if (cleaned.length === 10) {
      cleaned = '+1' + cleaned;
    }
    // If it's a Brazilian number (11 digits starting with 9), add +55
    else if (cleaned.length === 11 && cleaned.startsWith('9')) {
      cleaned = '+55' + cleaned;
    }
    // If it's a Brazilian number with area code (11 digits), add +55
    else if (cleaned.length === 11) {
      cleaned = '+55' + cleaned;
    }
    // Otherwise, just add + prefix
    else {
      cleaned = '+' + cleaned;
    }
  }

  return cleaned;
}

/**
 * Validate phone number format
 * Returns true if the number appears to be a valid E.164 format
 */
export function isValidPhoneNumber(phoneNumber: string): boolean {
  const formatted = formatPhoneNumber(phoneNumber);
  const e164Regex = /^\+[1-9]\d{6,14}$/;
  return e164Regex.test(formatted);
}

/**
 * Generate a 6-digit verification code
 */
export function generateSMSCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ============================================================================
// SMS SENDING FUNCTIONS
// ============================================================================

/**
 * Send an SMS message via Infobip
 */
async function sendSMS(to: string, text: string): Promise<boolean> {
  if (!infobipEnabled) {
    console.warn('[SMS] Service disabled - message not sent');
    console.warn(`[SMS] To: ${to}`);
    console.warn(`[SMS] Body: ${text}`);
    return false;
  }

  const formattedNumber = formatPhoneNumber(to);

  if (!isValidPhoneNumber(formattedNumber)) {
    console.error(`[SMS] Invalid phone number format: ${to}`);
    throw new Error('Invalid phone number format');
  }

  try {
    const response = await fetch(`https://${config.INFOBIP_BASE_URL}/sms/2/text/advanced`, {
      method: 'POST',
      headers: {
        'Authorization': `App ${config.INFOBIP_API_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          {
            destinations: [{ to: formattedNumber }],
            text,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`❌ [SMS] Failed to send message to ${formattedNumber}: ${response.status} ${errorBody}`);
      throw new Error('Failed to send SMS');
    }

    const result = await response.json();
    const status = result?.messages?.[0]?.status;
    console.log(`✅ [SMS] Message sent to ${formattedNumber} — status: ${status?.name || 'unknown'}`);

    return true;
  } catch (error: any) {
    console.error(`❌ [SMS] Failed to send message to ${formattedNumber}:`, error.message);
    throw new Error('Failed to send SMS. Please try again later.');
  }
}

/**
 * Send verification SMS with a 6-digit code
 */
export async function sendVerificationSMS(phoneNumber: string, code: string): Promise<void> {
  const text = `Your Koda verification code is: ${code}. This code expires in 10 minutes.`;

  const sent = await sendSMS(phoneNumber, text);

  if (!sent && infobipEnabled) {
    throw new Error('Failed to send verification SMS');
  }
}

/**
 * Send password reset SMS with a 6-digit code
 */
export async function sendPasswordResetSMS(phoneNumber: string, code: string): Promise<void> {
  const text = `Your Koda password reset code is: ${code}. This code expires in 15 minutes.`;

  const sent = await sendSMS(phoneNumber, text);

  if (!sent && infobipEnabled) {
    throw new Error('Failed to send password reset SMS');
  }
}

/**
 * Send 2FA verification SMS
 */
export async function send2FASMS(phoneNumber: string, code: string): Promise<void> {
  const text = `Your Koda login code is: ${code}. This code expires in 5 minutes.`;

  const sent = await sendSMS(phoneNumber, text);

  if (!sent && infobipEnabled) {
    throw new Error('Failed to send 2FA SMS');
  }
}

/**
 * Send a custom SMS message
 */
export async function sendCustomSMS(phoneNumber: string, message: string): Promise<void> {
  const sent = await sendSMS(phoneNumber, message);

  if (!sent && infobipEnabled) {
    throw new Error('Failed to send SMS');
  }
}

// ============================================================================
// SERVICE STATUS
// ============================================================================

/**
 * Check if SMS service is enabled and configured
 */
export function isSMSServiceEnabled(): boolean {
  return infobipEnabled;
}

/**
 * Get SMS service status for debugging
 */
export function getSMSServiceStatus(): {
  enabled: boolean;
  configured: {
    apiKey: boolean;
    baseUrl: boolean;
  };
} {
  return {
    enabled: infobipEnabled,
    configured: {
      apiKey: !!config.INFOBIP_API_KEY,
      baseUrl: !!config.INFOBIP_BASE_URL,
    },
  };
}

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default {
  formatPhoneNumber,
  isValidPhoneNumber,
  generateSMSCode,
  sendVerificationSMS,
  sendPasswordResetSMS,
  send2FASMS,
  sendCustomSMS,
  isSMSServiceEnabled,
  getSMSServiceStatus,
};
