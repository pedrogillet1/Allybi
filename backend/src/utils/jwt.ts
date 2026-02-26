import jwt from "jsonwebtoken";
import { config } from "../config/env";

export interface JWTPayload {
  userId: string;
  email: string;
  /** Session ID — binds the access token to a specific session */
  sid?: string;
  /** Session token version — allows instant revocation */
  sv?: number;
}

function resolveAllowedAlgorithms(): jwt.Algorithm[] {
  const raw = String(config.JWT_ALLOWED_ALGORITHMS || "HS256");
  const parsed = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean) as jwt.Algorithm[];
  return parsed.length > 0 ? parsed : ["HS256"];
}

function buildSharedSignOptions(expiresIn: string): jwt.SignOptions {
  const issuer = String(config.JWT_ISSUER || "").trim();
  const audience = String(config.JWT_AUDIENCE || "").trim();
  return {
    expiresIn: expiresIn as jwt.SignOptions["expiresIn"],
    algorithm: resolveAllowedAlgorithms()[0],
    ...(issuer ? { issuer } : {}),
    ...(audience ? { audience } : {}),
  };
}

function buildSharedVerifyOptions(): jwt.VerifyOptions {
  const issuer = String(config.JWT_ISSUER || "").trim();
  const audience = String(config.JWT_AUDIENCE || "").trim();
  return {
    algorithms: resolveAllowedAlgorithms(),
    ...(issuer ? { issuer } : {}),
    ...(audience ? { audience } : {}),
  };
}

/**
 * Generate access token (short-lived)
 * @param payload - JWT payload containing userId, email, and optionally sid/sv
 * @param expiresIn - Optional custom expiration time (e.g., '30d' for 30 days)
 */
export const generateAccessToken = (
  payload: JWTPayload,
  expiresIn?: string,
): string => {
  return jwt.sign(
    payload,
    config.JWT_ACCESS_SECRET,
    buildSharedSignOptions(expiresIn || (config.JWT_ACCESS_EXPIRY as string)),
  );
};

/**
 * Generate refresh token (long-lived)
 * @param payload - JWT payload containing userId and email
 * @param expiresIn - Optional custom expiration time (e.g., '30d' for 30 days)
 */
export const generateRefreshToken = (
  payload: JWTPayload,
  expiresIn?: string,
): string => {
  return jwt.sign(
    payload,
    config.JWT_REFRESH_SECRET,
    buildSharedSignOptions(expiresIn || (config.JWT_REFRESH_EXPIRY as string)),
  );
};

/**
 * Verify access token
 */
export const verifyAccessToken = (token: string): JWTPayload => {
  try {
    return jwt.verify(
      token,
      config.JWT_ACCESS_SECRET,
      buildSharedVerifyOptions(),
    ) as JWTPayload;
  } catch (error) {
    throw new Error("Invalid or expired access token");
  }
};

/**
 * Verify refresh token
 */
export const verifyRefreshToken = (token: string): JWTPayload => {
  try {
    return jwt.verify(
      token,
      config.JWT_REFRESH_SECRET,
      buildSharedVerifyOptions(),
    ) as JWTPayload;
  } catch (error) {
    throw new Error("Invalid or expired refresh token");
  }
};
