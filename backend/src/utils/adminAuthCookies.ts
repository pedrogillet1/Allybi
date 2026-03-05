import type { Request, Response } from "express";
import crypto from "crypto";

const isProduction = process.env.NODE_ENV === "production";

export function setAdminAuthCookies(
  res: Response,
  accessToken: string,
  refreshToken: string,
) {
  const csrfToken = crypto.randomBytes(24).toString("base64url");

  res.cookie("koda_admin_at", accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: 24 * 60 * 60 * 1000,
  });

  res.cookie("koda_admin_rt", refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.cookie("koda_admin_csrf", csrfToken, {
    httpOnly: false,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function clearAdminAuthCookies(res: Response) {
  res.clearCookie("koda_admin_at", { path: "/" });
  res.clearCookie("koda_admin_rt", { path: "/" });
  res.clearCookie("koda_admin_csrf", { path: "/" });
}

export function getAdminTokensFromCookies(req: Request): {
  accessToken: string | null;
  refreshToken: string | null;
} {
  return {
    accessToken: req.cookies?.koda_admin_at ?? null,
    refreshToken: req.cookies?.koda_admin_rt ?? null,
  };
}
