/// <reference path="../types/express.d.ts" />
import { Request, Response } from 'express';
import * as twoFactorService from '../services/twoFactor.service';

/**
 * Enable 2FA
 */
export const enable2FA = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user || !(req.user as any).id) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const result = await twoFactorService.enable2FA((req.user as any).id);

    res.status(200).json({
      message: 'Scan the QR code with your authenticator app',
      secret: result.secret,
      qrCode: result.qrCode,
      backupCodes: result.backupCodes,
    });
  } catch (error) {
    const err = error as Error;
    res.status(400).json({ error: err.message });
  }
};

/**
 * Verify and activate 2FA
 */
export const verify2FA = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user || !(req.user as any).id) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { token } = req.body;

    if (!token) {
      res.status(400).json({ error: 'Token is required' });
      return;
    }

    const result = await twoFactorService.verify2FA((req.user as any).id, token);

    res.status(200).json(result);
  } catch (error) {
    const err = error as Error;
    res.status(400).json({ error: err.message });
  }
};

/**
 * Verify 2FA during login
 */
export const verify2FALogin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, token } = req.body;

    if (!userId || !token) {
      res.status(400).json({ error: 'User ID and token are required' });
      return;
    }

    const result = await twoFactorService.verify2FALogin(userId, token);

    res.status(200).json(result);
  } catch (error) {
    const err = error as Error;
    res.status(401).json({ error: err.message });
  }
};

/**
 * Disable 2FA
 */
export const disable2FA = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user || !(req.user as any).id) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { password } = req.body;

    if (!password) {
      res.status(400).json({ error: 'Password is required' });
      return;
    }

    const result = await twoFactorService.disable2FA((req.user as any).id, password);

    res.status(200).json(result);
  } catch (error) {
    const err = error as Error;
    res.status(400).json({ error: err.message });
  }
};

/**
 * Get backup codes
 */
export const getBackupCodes = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user || !(req.user as any).id) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const result = await twoFactorService.getBackupCodes((req.user as any).id);

    res.status(200).json(result);
  } catch (error) {
    const err = error as Error;
    res.status(400).json({ error: err.message });
  }
};
