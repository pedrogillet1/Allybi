/**
 * SMS Service - Twilio Integration
 *
 * Provides SMS functionality for:
 * - Phone verification during registration
 * - Password reset via SMS
 * - 2FA verification codes
 *
 * @requires TWILIO_ACCOUNT_SID - Twilio Account SID
 * @requires TWILIO_AUTH_TOKEN - Twilio Auth Token
 * @requires TWILIO_PHONE_NUMBER - Twilio phone number (sender)
 *
 * CONFIGURATION:
 * - SMS_REQUIRED=true: Throws error if SMS cannot be sent (production recommended)
 * - SMS_REQUIRED=false: Silently skips SMS when disabled (development only)
 */

import { config } from '../config/env';

// ============================================================================
// CUSTOM ERRORS
// ============================================================================

/**
 * Error thrown when SMS service is disabled but SMS is required
 */
export class SMSServiceDisabledError extends Error {
  public readonly isSMSDisabled = true;
  public readonly missingConfig: string[];

  constructor(missingConfig: string[]) {
    super(
      `SMS service is disabled. Missing configuration: ${missingConfig.join(', ')}. ` +
      `Set SMS_REQUIRED=false to allow silent skip (INSECURE for production).`
    );
    this.name = 'SMSServiceDisabledError';
    this.missingConfig = missingConfig;
  }
}

/**
 * Result of SMS send attempt
 */
export interface SMSSendResult {
  sent: boolean;
  disabled: boolean;
  error?: string;
  messageId?: string;
}

/**
 * Whether SMS is required for operations (default: true in production)
 * When true, throws SMSServiceDisabledError if SMS cannot be sent
 * When false, silently returns false (development mode)
 */
const SMS_REQUIRED = process.env.SMS_REQUIRED !== 'false';

// Use require to avoid esModuleInterop issues with Twilio
const twilio = require('twilio');

// ============================================================================
// TWILIO CLIENT INITIALIZATION
// ============================================================================

const twilioEnabled = !!(
  config.TWILIO_ACCOUNT_SID &&
  config.TWILIO_AUTH_TOKEN &&
  config.TWILIO_PHONE_NUMBER
);

let twilioClient: any = null;

if (twilioEnabled) {
  twilioClient = twilio(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN);
  console.log('✅ Twilio SMS service initialized');
} else {
  console.warn('⚠️ Twilio SMS service is disabled. Missing environment variables:');
  if (!config.TWILIO_ACCOUNT_SID) console.warn('   - TWILIO_ACCOUNT_SID');
  if (!config.TWILIO_AUTH_TOKEN) console.warn('   - TWILIO_AUTH_TOKEN');
  if (!config.TWILIO_PHONE_NUMBER) console.warn('   - TWILIO_PHONE_NUMBER');
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

  // E.164 format: + followed by 7-15 digits
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
 * Get list of missing Twilio configuration items
 */
function getMissingTwilioConfig(): string[] {
  const missing: string[] = [];
  if (!config.TWILIO_ACCOUNT_SID) missing.push('TWILIO_ACCOUNT_SID');
  if (!config.TWILIO_AUTH_TOKEN) missing.push('TWILIO_AUTH_TOKEN');
  if (!config.TWILIO_PHONE_NUMBER) missing.push('TWILIO_PHONE_NUMBER');
  return missing;
}

/**
 * Send an SMS message via Twilio
 *
 * @throws SMSServiceDisabledError if SMS is disabled and SMS_REQUIRED=true
 * @returns SMSSendResult with detailed status information
 */
async function sendSMS(to: string, body: string): Promise<SMSSendResult> {
  if (!twilioEnabled || !twilioClient) {
    const missingConfig = getMissingTwilioConfig();

    // If SMS is required, throw an error
    if (SMS_REQUIRED) {
      throw new SMSServiceDisabledError(missingConfig);
    }

    // Otherwise, log warning and return explicit disabled status
    console.warn(`⚠️ [SMS] Service disabled - message NOT sent (SMS_REQUIRED=false)`);
    console.warn(`   To: ${to}`);
    console.warn(`   Missing config: ${missingConfig.join(', ')}`);

    return {
      sent: false,
      disabled: true,
      error: `SMS service disabled. Missing: ${missingConfig.join(', ')}`,
    };
  }

  const formattedNumber = formatPhoneNumber(to);

  if (!isValidPhoneNumber(formattedNumber)) {
    console.error(`[SMS] Invalid phone number format: ${to}`);
    throw new Error('Invalid phone number format');
  }

  try {
    const message = await twilioClient.messages.create({
      body,
      from: config.TWILIO_PHONE_NUMBER,
      to: formattedNumber,
    });

    console.log(`✅ [SMS] Message sent successfully`);
    console.log(`   SID: ${message.sid}`);
    console.log(`   To: ${formattedNumber}`);
    console.log(`   Status: ${message.status}`);

    return {
      sent: true,
      disabled: false,
      messageId: message.sid,
    };
  } catch (error: any) {
    console.error(`❌ [SMS] Failed to send message to ${formattedNumber}:`, error.message);

    // Provide helpful error messages for common Twilio errors
    if (error.code === 21211) {
      throw new Error('Invalid phone number. Please check the number and try again.');
    } else if (error.code === 21608) {
      throw new Error('This phone number is not verified. Please verify it in your Twilio console for trial accounts.');
    } else if (error.code === 21610) {
      throw new Error('This phone number has opted out of receiving messages.');
    } else if (error.code === 21614) {
      throw new Error('Invalid destination phone number.');
    } else if (error.code === 21408) {
      throw new Error('SMS is not available for this region.');
    }

    throw new Error('Failed to send SMS. Please try again later.');
  }
}

/**
 * Send verification SMS with a 6-digit code
 *
 * @throws SMSServiceDisabledError if SMS is disabled and SMS_REQUIRED=true
 * @returns SMSSendResult with status information
 */
export async function sendVerificationSMS(phoneNumber: string, code: string): Promise<SMSSendResult> {
  const body = `Your KODA verification code is: ${code}\n\nThis code expires in 10 minutes. Do not share this code with anyone.`;

  const result = await sendSMS(phoneNumber, body);

  if (!result.sent && !result.disabled) {
    throw new Error('Failed to send verification SMS');
  }

  return result;
}

/**
 * Send password reset SMS with a 6-digit code
 *
 * @throws SMSServiceDisabledError if SMS is disabled and SMS_REQUIRED=true
 * @returns SMSSendResult with status information
 */
export async function sendPasswordResetSMS(phoneNumber: string, code: string): Promise<SMSSendResult> {
  const body = `Your KODA password reset code is: ${code}\n\nThis code expires in 15 minutes. If you didn't request this, please ignore this message.`;

  const result = await sendSMS(phoneNumber, body);

  if (!result.sent && !result.disabled) {
    throw new Error('Failed to send password reset SMS');
  }

  return result;
}

/**
 * Send 2FA verification SMS
 *
 * @throws SMSServiceDisabledError if SMS is disabled and SMS_REQUIRED=true
 * @returns SMSSendResult with status information
 */
export async function send2FASMS(phoneNumber: string, code: string): Promise<SMSSendResult> {
  const body = `Your KODA login code is: ${code}\n\nThis code expires in 5 minutes.`;

  const result = await sendSMS(phoneNumber, body);

  if (!result.sent && !result.disabled) {
    throw new Error('Failed to send 2FA SMS');
  }

  return result;
}

/**
 * Send a custom SMS message
 *
 * @throws SMSServiceDisabledError if SMS is disabled and SMS_REQUIRED=true
 * @returns SMSSendResult with status information
 */
export async function sendCustomSMS(phoneNumber: string, message: string): Promise<SMSSendResult> {
  const result = await sendSMS(phoneNumber, message);

  if (!result.sent && !result.disabled) {
    throw new Error('Failed to send SMS');
  }

  return result;
}

// ============================================================================
// SERVICE STATUS
// ============================================================================

/**
 * Check if SMS service is enabled and configured
 */
export function isSMSServiceEnabled(): boolean {
  return twilioEnabled;
}

/**
 * Get SMS service status for debugging
 */
export function getSMSServiceStatus(): {
  enabled: boolean;
  configured: {
    accountSid: boolean;
    authToken: boolean;
    phoneNumber: boolean;
  };
} {
  return {
    enabled: twilioEnabled,
    configured: {
      accountSid: !!config.TWILIO_ACCOUNT_SID,
      authToken: !!config.TWILIO_AUTH_TOKEN,
      phoneNumber: !!config.TWILIO_PHONE_NUMBER,
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
