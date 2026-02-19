import { Router } from "express";
import type { Request, Response } from "express";
import { authLimiter } from "../middleware/rateLimit.middleware";
import * as authService from "../services/auth.service";

const router = Router();

router.get(
  "/verify-email",
  authLimiter,
  async (req: Request, res: Response) => {
    try {
      const token = req.query.token as string;
      if (!token)
        return res
          .status(400)
          .json({ success: false, error: "Token is required" });
      const result = await authService.verifyEmailToken(token);
      return res.status(200).json(result);
    } catch (e: any) {
      return res.status(400).json({ success: false, error: e.message });
    }
  },
);

router.get(
  "/verify-phone",
  authLimiter,
  async (req: Request, res: Response) => {
    try {
      const token = req.query.token as string;
      if (!token)
        return res
          .status(400)
          .json({ success: false, error: "Token is required" });
      const result = await authService.verifyPhoneToken(token);
      return res.status(200).json(result);
    } catch (e: any) {
      return res.status(400).json({ success: false, error: e.message });
    }
  },
);

export default router;
