// src/routes/user.routes.ts

import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { rateLimitMiddleware } from "../middleware/rateLimit.middleware";
import { updateProfile, changePassword, verifyProfilePhone } from "../controllers/user.controller";

const router = Router();

router.patch(
  "/me",
  authMiddleware,
  rateLimitMiddleware,
  updateProfile
);

router.patch(
  "/me/password",
  authMiddleware,
  rateLimitMiddleware,
  changePassword
);

router.post(
  "/me/verify-phone",
  authMiddleware,
  rateLimitMiddleware,
  verifyProfilePhone
);

export default router;
