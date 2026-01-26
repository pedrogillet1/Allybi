import jwt from 'jsonwebtoken';
import { config } from '../config/env';

export interface JWTPayload {
  userId: string;
  email: string;
}

/**
 * Generate access token (short-lived)
 * @param payload - JWT payload containing userId and email
 * @param expiresIn - Optional custom expiration time (e.g., '30d' for 30 days)
 */
export const generateAccessToken = (payload: JWTPayload, expiresIn?: string): string => {
  return jwt.sign(payload, config.JWT_ACCESS_SECRET, {
    expiresIn: expiresIn || (config.JWT_ACCESS_EXPIRY as string),
  } as jwt.SignOptions);
};

/**
 * Generate refresh token (long-lived)
 * @param payload - JWT payload containing userId and email
 * @param expiresIn - Optional custom expiration time (e.g., '30d' for 30 days)
 */
export const generateRefreshToken = (payload: JWTPayload, expiresIn?: string): string => {
  return jwt.sign(payload, config.JWT_REFRESH_SECRET, {
    expiresIn: expiresIn || (config.JWT_REFRESH_EXPIRY as string),
  } as jwt.SignOptions);
};

/**
 * Verify access token
 */
export const verifyAccessToken = (token: string): JWTPayload => {
  try {
    return jwt.verify(token, config.JWT_ACCESS_SECRET) as JWTPayload;
  } catch (error) {
    throw new Error('Invalid or expired access token');
  }
};

/**
 * Verify refresh token
 */
export const verifyRefreshToken = (token: string): JWTPayload => {
  try {
    return jwt.verify(token, config.JWT_REFRESH_SECRET) as JWTPayload;
  } catch (error) {
    throw new Error('Invalid or expired refresh token');
  }
};
