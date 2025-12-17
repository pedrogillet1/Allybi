import { Request, Response } from 'express';
import prisma from '../config/database';
import crypto from 'crypto';
import bcrypt from 'bcrypt';

/**
 * Update user profile
 */
export const updateProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { firstName, lastName, phoneNumber, profileImage } = req.body;

    // Get current user data
    const currentUser = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { phoneNumber: true, email: true },
    });

    if (!currentUser) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    let needsPhoneVerification = false;
    let verification_codes: string | undefined;

    // If phone number is being updated and is different from current phone
    if (phoneNumber && phoneNumber !== currentUser.phoneNumber) {
      // Check if another user has this phone number
      const existingUserWithPhone = await prisma.user.findUnique({
        where: { phoneNumber },
        select: { id: true },
      });

      if (existingUserWithPhone && existingUserWithPhone.id !== req.user.id) {
        res.status(400).json({
          error: 'Phone number already in use',
          field: 'phoneNumber'
        });
        return;
      }

      // Generate verification code - SMS service removed, use random code
      const generateSMSCode = () => Math.floor(100000 + Math.random() * 900000).toString();
      verification_codes = generateSMSCode();
      needsPhoneVerification = true;

      console.log(`📱 Phone verification code for ${req.user.id}: ${verification_codes}`);

      // Create verification code entry
      await prisma.verificationCode.create({
        data: {
          userId: req.user.id,
          type: 'phone',
          code: verification_codes,
          expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
        },
      });

      // SMS service removed - log code for dev mode
      console.log(`📧 [DEV MODE] Verification code for ${phoneNumber}: ${verification_codes}`);
    }

    // Update user in database
    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        firstName: firstName || null,
        lastName: lastName || null,
        phoneNumber: phoneNumber || null,
        profileImage: profileImage || null,
        // If phone changed, set verification to false
        ...(needsPhoneVerification && {
          isPhoneVerified: false,
        }),
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
        profileImage: true,
        isEmailVerified: true,
        isPhoneVerified: true,
      },
    });

    res.status(200).json({
      message: 'Profile updated successfully',
      user: updatedUser,
      needsPhoneVerification,
    });
  } catch (error) {
    const err = error as Error;
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
};

/**
 * Change user password
 */
export const changePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { currentPassword, newPassword } = req.body;

    if (!newPassword) {
      res.status(400).json({ error: 'New password is required' });
      return;
    }

    // Get user with password hash and salt
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        passwordHash: true,
        salt: true,
        googleId: true,
        appleId: true,
      },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const isOAuthUser = !user.passwordHash || !user.salt;

    // If user has a password, verify current password
    if (!isOAuthUser) {
      if (!currentPassword) {
        res.status(400).json({ error: 'Current password is required' });
        return;
      }

      if (!user.salt || !user.passwordHash) {
        res.status(400).json({ error: 'User account has no password set' });
        return;
      }

      // Extract after null check to narrow types
      const salt = user.salt;
      const passwordHash = user.passwordHash;

      // Verify current password using bcrypt
      const isPasswordValid = await bcrypt.compare(
        currentPassword + salt,
        passwordHash
      );

      if (!isPasswordValid) {
        res.status(401).json({ error: 'Current password is incorrect' });
        return;
      }
    }

    // Validate new password
    if (newPassword.length < 8) {
      res.status(400).json({ error: 'New password must be at least 8 characters' });
      return;
    }

    if (!/[!@#$%^&*(),.?":{}|<>0-9]/.test(newPassword)) {
      res.status(400).json({ error: 'New password must contain a symbol or number' });
      return;
    }

    // Check if password contains name or email
    const email = user.email.toLowerCase();
    const firstName = user.firstName?.toLowerCase() || '';
    const lastName = user.lastName?.toLowerCase() || '';
    const passwordLower = newPassword.toLowerCase();

    if (
      email.includes(passwordLower) ||
      passwordLower.includes(email.split('@')[0]) ||
      (firstName && passwordLower.includes(firstName)) ||
      (lastName && passwordLower.includes(lastName))
    ) {
      res.status(400).json({ error: 'Password must not contain your name or email' });
      return;
    }

    // Generate new salt and hash using bcrypt
    const newSalt = crypto.randomBytes(16).toString('hex');
    const newPasswordHash = await bcrypt.hash(newPassword + newSalt, 12);

    // Update password
    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        passwordHash: newPasswordHash,
        salt: newSalt,
      },
    });

    const message = isOAuthUser
      ? 'Password set successfully! You can now login with email and password.'
      : 'Password changed successfully';

    res.status(200).json({ message });
  } catch (error) {
    const err = error as Error;
    console.error('Error changing password:', error);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Verify phone number with verification code
 */
export const verifyProfilePhone = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { code } = req.body;

    if (!code) {
      res.status(400).json({ error: 'Verification code is required' });
      return;
    }

    // Find verification code
    const verificationRecord = await prisma.verificationCode.findFirst({
      where: {
        userId: req.user.id,
        type: 'phone',
        code,
        isUsed: false,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!verificationRecord) {
      res.status(400).json({ error: 'Invalid verification code' });
      return;
    }

    // Check if code expired
    if (verificationRecord.expiresAt < new Date()) {
      res.status(400).json({ error: 'Verification code has expired' });
      return;
    }

    // Mark code as used
    await prisma.verificationCode.update({
      where: { id: verificationRecord.id },
      data: { isUsed: true },
    });

    // Update user - mark phone as verified
    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        isPhoneVerified: true,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
        profileImage: true,
        isEmailVerified: true,
        isPhoneVerified: true,
      },
    });

    console.log(`✅ Phone verified for user ${req.user.id}`);

    res.status(200).json({
      message: 'Phone number verified successfully',
      user: updatedUser,
    });
  } catch (error) {
    console.error('Error verifying phone:', error);
    res.status(500).json({ error: 'Failed to verify phone number' });
  }
};
