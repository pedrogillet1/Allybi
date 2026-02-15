import type { Response } from 'express';

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Set HTTP-only auth cookies alongside JSON token responses.
 * Safari ITP can clear localStorage, so cookies provide a reliable fallback.
 * Same-origin (allybi.co) means SameSite=Lax works without issues.
 */
export function setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
  res.cookie('koda_at', accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 24 * 60 * 60 * 1000, // 24h — matches JWT_ACCESS_EXPIRY
  });

  res.cookie('koda_rt', refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7d — matches JWT_REFRESH_EXPIRY
  });
}

export function clearAuthCookies(res: Response) {
  res.clearCookie('koda_at', { path: '/' });
  res.clearCookie('koda_rt', { path: '/' });
}
