/**
 * Email Service - Infobip Integration
 *
 * Provides email functionality for:
 * - Email verification during registration
 * - Password reset emails
 * - Welcome emails
 * - Document share notifications
 */

import { config } from '../config/env';

const INFOBIP_BASE_URL = config.INFOBIP_BASE_URL;
const INFOBIP_API_KEY = config.INFOBIP_API_KEY;
const fromEmail = `Koda <${config.EMAIL_FROM || 'info@getkoda.ai'}>`;

const emailServiceEnabled = !!(INFOBIP_BASE_URL && INFOBIP_API_KEY);

if (!emailServiceEnabled) {
  console.warn('⚠️ Infobip email service is disabled. Missing INFOBIP_API_KEY or INFOBIP_BASE_URL.');
} else {
  console.log('✅ Infobip email service initialized');
}

/**
 * Sends an email using the Infobip Email API.
 */
export const sendEmail = async (to: string, subject: string, html: string): Promise<boolean> => {
  if (!emailServiceEnabled) {
    console.error('Email service is disabled. Cannot send email.');
    console.log(`--- EMAIL TO: ${to} ---`);
    console.log(`--- SUBJECT: ${subject} ---`);
    console.log('----------------------');
    return false;
  }

  try {
    // Infobip Email API requires multipart/form-data
    const boundary = '----InfobipBoundary' + Date.now();
    const parts = [
      `--${boundary}\r\nContent-Disposition: form-data; name="from"\r\n\r\n${fromEmail}`,
      `--${boundary}\r\nContent-Disposition: form-data; name="to"\r\n\r\n${to}`,
      `--${boundary}\r\nContent-Disposition: form-data; name="subject"\r\n\r\n${subject}`,
      `--${boundary}\r\nContent-Disposition: form-data; name="html"\r\n\r\n${html}`,
      `--${boundary}--`,
    ];
    const body = parts.join('\r\n');

    const response = await fetch(`https://${INFOBIP_BASE_URL}/email/3/send`, {
      method: 'POST',
      headers: {
        'Authorization': `App ${INFOBIP_API_KEY}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Accept': 'application/json',
      },
      body,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`❌ Failed to send email to ${to}: ${response.status} ${errorBody}`);
      return false;
    }

    console.log(`✅ Email sent successfully to ${to}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to send email to ${to}:`, error);
    return false;
  }
};

/**
 * Sends a verification email to a new user.
 */
export const sendVerificationEmail = async (to: string, name: string, verificationLink: string): Promise<void> => {
  const subject = 'Verify Your Email Address for Koda';
  const html = `
    <div style="font-family: sans-serif; padding: 20px; color: #333;">
      <h2>Welcome to Koda, ${name}!</h2>
      <p>Please click the button below to verify your email address and complete your registration.</p>
      <a href="${verificationLink}" style="background-color: #000; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
        Verify Email
      </a>
      <p>This link will expire in 24 hours.</p>
      <p>If you did not sign up for Koda, please ignore this email.</p>
    </div>
  `;
  await sendEmail(to, subject, html);
};

/**
 * Sends a password reset email with link.
 */
export async function sendPasswordResetEmail(
  email: string,
  resetLink: string,
  firstName: string = 'User'
): Promise<void> {
  const subject = 'Reset Your Password - Koda';
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: 'Arial', sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #181818; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-radius: 0 0 8px 8px; }
          .button {
            display: inline-block;
            padding: 14px 32px;
            background: #181818;
            color: white;
            text-decoration: none;
            border-radius: 8px;
            margin: 20px 0;
            font-weight: 600;
          }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0;">Reset Your Password</h1>
          </div>
          <div class="content">
            <p>Hi ${firstName},</p>
            <p>We received a request to reset your password for your Koda account.</p>
            <p>Click the button below to reset your password:</p>
            <p style="text-align: center;">
              <a href="${resetLink}" class="button">Reset Password</a>
            </p>
            <p style="color: #666; font-size: 14px;">Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #666; font-size: 12px;">${resetLink}</p>
            <p style="color: #D92D20; font-weight: 600; margin-top: 20px;">⚠️ This link will expire in 15 minutes.</p>
            <p style="margin-top: 20px;">If you didn't request a password reset, you can safely ignore this email.</p>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} Koda. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  console.log(`📧 Sending password reset email to ${email}...`);
  const success = await sendEmail(email, subject, html);

  if (!success) {
    throw new Error('Failed to send password reset email');
  }

  console.log(`✅ Password reset email sent successfully to ${email}`);
}

/**
 * Sends a welcome email to a newly verified user.
 */
export const sendWelcomeEmail = async (to: string, name: string): Promise<void> => {
  const subject = 'Welcome to Koda!';
  const html = `
    <div style="font-family: sans-serif; padding: 20px; color: #333;">
      <h2>Welcome to Koda, ${name}!</h2>
      <p>Your account has been successfully created.</p>
      <p>You can now start uploading and managing your documents.</p>
      <a href="${process.env.FRONTEND_URL || 'http://localhost:3001'}" style="background-color: #000; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
        Get Started
      </a>
    </div>
  `;
  await sendEmail(to, subject, html);
};

/** Email Service - Legacy class for compatibility */
class EmailService {
  async sendEmail(to: string, subject: string, body: string) {
    return sendEmail(to, subject, body);
  }
  async sendBulkEmail(recipients: string[], subject: string, body: string) {
    const promises = recipients.map(recipient => sendEmail(recipient, subject, body));
    const results = await Promise.all(promises);
    return results.every(result => result);
  }
}

export const sendDocumentShareEmail = async (to: string, documentName: string, sharedBy: string) => {
  const subject = `${sharedBy} shared a document with you`;
  const html = `
    <div style="font-family: sans-serif; padding: 20px; color: #333;">
      <h2>New Document Shared</h2>
      <p>${sharedBy} has shared "${documentName}" with you on Koda.</p>
      <a href="${process.env.FRONTEND_URL}/documents" style="background-color: #000; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
        View Document
      </a>
    </div>
  `;
  return sendEmail(to, subject, html);
};

export const generateVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Sends a verification CODE email (for pending user registration).
 */
export const sendVerificationCodeEmail = async (to: string, code: string): Promise<void> => {
  const subject = 'Your Koda verification code';
  const html = `
    <div style="font-family: sans-serif; padding: 20px; color: #333;">
      <p>Your Koda verification code is: <strong>${code}</strong></p>
      <p>This code expires in 10 minutes.</p>
      <p>If you didn't request this code, you can safely ignore this email.</p>
    </div>
  `;

  await sendEmail(to, subject, html);
};

export default new EmailService();
