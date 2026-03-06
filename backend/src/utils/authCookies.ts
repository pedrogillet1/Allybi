import type { Response } from "express";
import crypto from "crypto";

const isProduction = process.env.NODE_ENV === "production";
export const TWO_FACTOR_CHALLENGE_COOKIE = "koda_2fa_challenge";
const TWO_FACTOR_CHALLENGE_MAX_AGE_MS = 5 * 60 * 1000;

/**
 * Set HTTP-only auth cookies alongside JSON token responses.
 * Safari ITP can clear localStorage, so cookies provide a reliable fallback.
 * Same-origin (allybi.co) means SameSite=Lax works without issues.
 */
export function setAuthCookies(
  res: Response,
  accessToken: string,
  refreshToken: string,
) {
  const csrfToken = crypto.randomBytes(24).toString("base64url");

  res.cookie("koda_at", accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: 24 * 60 * 60 * 1000, // 24h — matches JWT_ACCESS_EXPIRY
  });

  res.cookie("koda_rt", refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7d — matches JWT_REFRESH_EXPIRY
  });

  // Double-submit CSRF token (readable by JS, validated against request header).
  res.cookie("koda_csrf", csrfToken, {
    httpOnly: false,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function clearAuthCookies(res: Response) {
  res.clearCookie("koda_at", { path: "/" });
  res.clearCookie("koda_rt", { path: "/" });
  res.clearCookie("koda_csrf", { path: "/" });
}

export function setTwoFactorChallengeCookie(
  res: Response,
  challengeToken: string,
) {
  res.cookie(TWO_FACTOR_CHALLENGE_COOKIE, challengeToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: TWO_FACTOR_CHALLENGE_MAX_AGE_MS,
  });
}

export function clearTwoFactorChallengeCookie(res: Response) {
  res.clearCookie(TWO_FACTOR_CHALLENGE_COOKIE, { path: "/" });
}
