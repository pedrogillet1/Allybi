// src/routes/user.routes.ts

import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { rateLimitMiddleware } from "../middleware/rateLimit.middleware";
import { updateProfile, changePassword, verifyProfilePhone } from "../controllers/user.controller";
import { validate } from "../middleware/validate.middleware";
import { userUpdateSchema, passwordChangeSchema } from "../schemas/request.schemas";

const router = Router();

router.patch(
  "/me",
  authMiddleware,
  rateLimitMiddleware,
  validate(userUpdateSchema),
  updateProfile
);

router.patch(
  "/me/password",
  authMiddleware,
  rateLimitMiddleware,
  validate(passwordChangeSchema),
  changePassword
);

router.post(
  "/me/verify-phone",
  authMiddleware,
  rateLimitMiddleware,
  verifyProfilePhone
);

export default router;
