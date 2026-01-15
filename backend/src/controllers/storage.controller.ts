import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Get user storage information
 * Returns the actual storage used by the user's documents
 */
export const getStorageInfo = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const userId = req.user.id;

    // Get total storage from all user's documents
    const result = await prisma.document.aggregate({
      where: {
        userId: userId,
      },
      _sum: {
        fileSize: true,
      },
    });

    const totalUsed = result._sum.fileSize || 0;

    // Get user's subscription tier to determine storage limit
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { subscriptionTier: true },
    });

    // Storage limits by tier (in bytes)
    const storageLimits: { [key: string]: number } = {
      free: 5 * 1024 * 1024 * 1024, // 5GB
      beta: 5 * 1024 * 1024 * 1024, // 5GB
      premium: 50 * 1024 * 1024 * 1024, // 50GB
      pro: 100 * 1024 * 1024 * 1024, // 100GB
      enterprise: 1000 * 1024 * 1024 * 1024, // 1TB
    };

    const tier = user?.subscriptionTier || 'free';
    const storageLimit = storageLimits[tier] || storageLimits.free;

    // Update user's storageUsedBytes field for consistency
    await prisma.user.update({
      where: { id: userId },
      data: { storageUsedBytes: totalUsed },
    });

    res.status(200).json({
      used: totalUsed,
      limit: storageLimit,
      tier: tier,
      percentage: (totalUsed / storageLimit) * 100,
    });
  } catch (error) {
    const err = error as Error;
    console.error('Get storage info error:', err);
    res.status(500).json({ error: 'Failed to retrieve storage information' });
  }
};

/**
 * Check if user has capacity for a new file
 */
export const checkCapacity = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { fileSize } = req.body;

    if (!fileSize || typeof fileSize !== 'number') {
      res.status(400).json({ error: 'fileSize is required and must be a number' });
      return;
    }

    const userId = req.user.id;

    // Get total storage from all user's documents
    const result = await prisma.document.aggregate({
      where: {
        userId: userId,
      },
      _sum: {
        fileSize: true,
      },
    });

    const totalUsed = result._sum.fileSize || 0;

    // Get user's subscription tier
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { subscriptionTier: true },
    });

    const storageLimits: { [key: string]: number } = {
      free: 5 * 1024 * 1024 * 1024, // 5GB
      beta: 5 * 1024 * 1024 * 1024, // 5GB
      premium: 50 * 1024 * 1024 * 1024, // 50GB
      pro: 100 * 1024 * 1024 * 1024, // 100GB
      enterprise: 1000 * 1024 * 1024 * 1024, // 1TB
    };

    const tier = user?.subscriptionTier || 'free';
    const storageLimit = storageLimits[tier] || storageLimits.free;

    const hasCapacity = (totalUsed + fileSize) <= storageLimit;
    const remaining = storageLimit - totalUsed;

    res.status(200).json({
      hasCapacity,
      remaining,
      used: totalUsed,
      limit: storageLimit,
      requested: fileSize,
    });
  } catch (error) {
    const err = error as Error;
    console.error('Check capacity error:', err);
    res.status(500).json({ error: 'Failed to check storage capacity' });
  }
};

/**
 * Recalculate storage for a user
 * Useful for ensuring consistency after bulk operations
 */
export const recalculateStorage = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const userId = req.user.id;

    // Get total storage from all user's documents
    const result = await prisma.document.aggregate({
      where: {
        userId: userId,
      },
      _sum: {
        fileSize: true,
      },
    });

    const totalUsed = result._sum.fileSize || 0;

    // Update user's storageUsedBytes field
    await prisma.user.update({
      where: { id: userId },
      data: { storageUsedBytes: totalUsed },
    });

    res.status(200).json({
      success: true,
      used: totalUsed,
      message: 'Storage recalculated successfully',
    });
  } catch (error) {
    const err = error as Error;
    console.error('Recalculate storage error:', err);
    res.status(500).json({ error: 'Failed to recalculate storage' });
  }
};
