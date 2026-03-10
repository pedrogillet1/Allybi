import { Request, Response } from "express";
import prisma from "../config/database";
import crypto from "crypto";
import bcrypt from "bcrypt";

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

/**
 * Update user profile
 */
export const updateProfile = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { firstName, lastName, phoneNumber, profileImage } = req.body;

    // Get current user data
    const currentUser = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { phoneNumber: true, email: true },
    });

    if (!currentUser) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    let needsPhoneVerification = false;

    // If phone number is being updated and is different from current phone
    if (phoneNumber && phoneNumber !== currentUser.phoneNumber) {
      // Check if another user has this phone number
      const existingUserWithPhone = await prisma.user.findUnique({
        where: { phoneNumber },
        select: { id: true },
      });

      if (existingUserWithPhone && existingUserWithPhone.id !== req.user.id) {
        res.status(400).json({
          error: "Phone number already in use",
          field: "phoneNumber",
        });
        return;
      }

      needsPhoneVerification = true;
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

    // Send magic link for phone verification if needed
    if (needsPhoneVerification) {
      const authService = await import("../services/auth.service");
      await authService.sendPhoneVerificationCode(req.user.id, phoneNumber);
    }

    res.status(200).json({
      message: "Profile updated successfully",
      user: updatedUser,
      needsPhoneVerification,
    });
  } catch (error) {
    const err = error as Error;
    console.error("Error updating profile:", error);
    res.status(500).json({ error: "Failed to update profile" });
  }
};

/**
 * Change user password
 */
export const changePassword = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { currentPassword, newPassword } = req.body;

    if (!newPassword) {
      res.status(400).json({ error: "New password is required" });
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
      res.status(404).json({ error: "User not found" });
      return;
    }

    const isOAuthUser = !user.passwordHash || !user.salt;

    // If user has a password, verify current password
    if (!isOAuthUser) {
      if (!currentPassword) {
        res.status(400).json({ error: "Current password is required" });
        return;
      }

      if (!user.salt || !user.passwordHash) {
        res.status(400).json({ error: "User account has no password set" });
        return;
      }

      // Extract after null check to narrow types
      const salt = user.salt;
      const passwordHash = user.passwordHash;

      // Verify current password (try new-style first, then legacy with salt)
      let isPasswordValid = await bcrypt.compare(
        currentPassword,
        passwordHash,
      );
      if (!isPasswordValid && salt) {
        // Legacy fallback: old hashes used password+salt
        isPasswordValid = await bcrypt.compare(
          currentPassword + salt,
          passwordHash,
        );
      }

      if (!isPasswordValid) {
        res.status(401).json({ error: "Current password is incorrect" });
        return;
      }
    }

    // Validate new password
    if (newPassword.length < 8) {
      res
        .status(400)
        .json({ error: "New password must be at least 8 characters" });
      return;
    }

    if (!/[!@#$%^&*(),.?":{}|<>0-9]/.test(newPassword)) {
      res
        .status(400)
        .json({ error: "New password must contain a symbol or number" });
      return;
    }

    // Check if password contains name or email
    const email = user.email.toLowerCase();
    const firstName = user.firstName?.toLowerCase() || "";
    const lastName = user.lastName?.toLowerCase() || "";
    const passwordLower = newPassword.toLowerCase();

    if (
      email.includes(passwordLower) ||
      passwordLower.includes(email.split("@")[0]) ||
      (firstName && passwordLower.includes(firstName)) ||
      (lastName && passwordLower.includes(lastName))
    ) {
      res
        .status(400)
        .json({ error: "Password must not contain your name or email" });
      return;
    }

    // Hash new password using bcrypt-12 with built-in salt
    const newPasswordHash = await bcrypt.hash(newPassword, 12);

    // Update password
    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        passwordHash: newPasswordHash,
        salt: "", // salt embedded in bcrypt hash; field kept for schema compat
      },
    });

    const message = isOAuthUser
      ? "Password set successfully! You can now login with email and password."
      : "Password changed successfully";

    res.status(200).json({ message });
  } catch (error) {
    const err = error as Error;
    console.error("Error changing password:", error);
    res.status(500).json({ error: "Failed to change password" });
  }
};

/**
 * Verify phone number with verification code
 */
export const verifyProfilePhone = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { code } = req.body;

    if (!code) {
      res.status(400).json({ error: "Verification code is required" });
      return;
    }

    // Find verification code by hashed value
    const codeHash = sha256(code);
    const verificationRecord = await prisma.verificationCode.findFirst({
      where: {
        userId: req.user.id,
        type: "phone",
        code: codeHash,
        isUsed: false,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (!verificationRecord) {
      res.status(400).json({ error: "Invalid verification code" });
      return;
    }

    // Check if code expired
    if (verificationRecord.expiresAt < new Date()) {
      res.status(400).json({ error: "Verification code has expired" });
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

    res.status(200).json({
      message: "Phone number verified successfully",
      user: updatedUser,
    });
  } catch (error) {
    console.error("Error verifying phone:", error);
    res.status(500).json({ error: "Failed to verify phone number" });
  }
};
