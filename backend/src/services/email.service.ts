import sgMail from '@sendgrid/mail';
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.SENDGRID_API_KEY) {
  console.warn('⚠️  SENDGRID_API_KEY is not set. Email service will be disabled.');
} else {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

const emailServiceEnabled = !!process.env.SENDGRID_API_KEY;
const fromEmail = process.env.EMAIL_FROM || 'noreply@koda.app';

/**
 * Sends an email using the SendGrid service.
 * @param to - The recipient's email address.
 * @param subject - The subject of the email.
 * @param html - The HTML body of the email.
 */
export const sendEmail = async (to: string, subject: string, html: string): Promise<boolean> => {
  if (!emailServiceEnabled) {
    console.error('Email service is disabled. Cannot send email.');
    // In development, you might want to log the email content
    console.log(`--- EMAIL TO: ${to} ---`);
    console.log(`--- SUBJECT: ${subject} ---`);
    console.log(html);
    console.log('----------------------');
    return false;
  }

  try {
    await sgMail.send({
      from: fromEmail,
      to,
      subject,
      html,
    });
    console.log(`✅ Email sent successfully to ${to}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to send email to ${to}:`, error);
    return false;
  }
};

/**
 * Sends a verification email to a new user.
 * @param to - The recipient's email address.
 * @param name - The user's name.
 * @param verificationLink - The email verification link.
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
 * Sends a password reset email with link (NOT CODE).
 * @param email - The recipient's email address.
 * @param resetLink - Password reset link.
 * @param firstName - User's first name.
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
 * @param to - The recipient's email address.
 * @param name - The user's name.
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
 * @param to - The recipient's email address.
 * @param code - The 6-digit verification code.
 */
export const sendVerificationCodeEmail = async (to: string, code: string): Promise<void> => {
  const subject = 'Verify Your Email - Koda';
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: 'Arial', sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #181818; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-radius: 0 0 8px 8px; }
          .code-box {
            background: #F5F5F5;
            border: 2px solid #E6E6EC;
            border-radius: 12px;
            padding: 24px;
            text-align: center;
            margin: 24px 0;
          }
          .code {
            font-size: 36px;
            font-weight: 700;
            letter-spacing: 8px;
            color: #181818;
            font-family: 'Courier New', monospace;
          }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0;">Verify Your Email</h1>
          </div>
          <div class="content">
            <p>Welcome to Koda!</p>
            <p>Please use the verification code below to complete your registration:</p>
            <div class="code-box">
              <div class="code">${code}</div>
            </div>
            <p style="color: #666; font-size: 14px; text-align: center;">Enter this code in the app to verify your email address.</p>
            <p style="color: #D92D20; font-weight: 600; margin-top: 20px;">⚠️ This code expires in 10 minutes.</p>
            <p style="margin-top: 20px;">If you didn't request this code, you can safely ignore this email.</p>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} Koda. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  await sendEmail(to, subject, html);
};

export default new EmailService();
