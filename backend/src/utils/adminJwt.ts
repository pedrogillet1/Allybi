import jwt from "jsonwebtoken";
import { config } from "../config/env";

export interface AdminJWTPayload {
  adminId: string;
  username: string;
  role: string;
  isAdmin: true;
}

export const generateAdminAccessToken = (payload: AdminJWTPayload): string => {
  return jwt.sign(payload, config.JWT_ADMIN_ACCESS_SECRET, {
    expiresIn: config.JWT_ADMIN_ACCESS_EXPIRY as string,
  } as jwt.SignOptions);
};

export const generateAdminRefreshToken = (payload: AdminJWTPayload): string => {
  return jwt.sign(payload, config.JWT_ADMIN_REFRESH_SECRET, {
    expiresIn: config.JWT_ADMIN_REFRESH_EXPIRY as string,
  } as jwt.SignOptions);
};

export const verifyAdminAccessToken = (token: string): AdminJWTPayload => {
  try {
    const decoded = jwt.verify(
      token,
      config.JWT_ADMIN_ACCESS_SECRET,
    ) as AdminJWTPayload;
    if (decoded.isAdmin !== true) {
      throw new Error("Not an admin token");
    }
    return decoded;
  } catch (error) {
    throw new Error("Invalid or expired admin access token");
  }
};

export const verifyAdminRefreshToken = (token: string): AdminJWTPayload => {
  try {
    const decoded = jwt.verify(
      token,
      config.JWT_ADMIN_REFRESH_SECRET,
    ) as AdminJWTPayload;
    if (decoded.isAdmin !== true) {
      throw new Error("Not an admin token");
    }
    return decoded;
  } catch (error) {
    throw new Error("Invalid or expired admin refresh token");
  }
};
