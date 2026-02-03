// dashboard/src/admin/guards/ipAllowlist.guard.ts
//
// Restrict access by client IP address.
// - Uses x-forwarded-for if present (behind proxies)
// - Supports CIDR ranges and single IPs
//
// Env:
// - ADMIN_IP_ALLOWLIST="1.2.3.4, 10.0.0.0/8, 192.168.0.0/16"
//
// Notes:
// - In production behind a proxy, ensure Express "trust proxy" is configured.

import type { Request, Response, NextFunction } from 'express';

export function ipAllowlistGuard(req: Request, res: Response, next: NextFunction) {
  const raw = String(process.env.ADMIN_IP_ALLOWLIST || '').trim();
  if (!raw) {
    // If not configured, do not block (or change to fail-closed if you prefer)
    return next();
  }

  const allowlist = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const ip = getClientIp(req);
  if (!ip) return res.status(401).json({ ok: false, code: 'IP_UNAVAILABLE' });

  const ok = allowlist.some((rule) => matchesIp(rule, ip));
  if (!ok) return res.status(403).json({ ok: false, code: 'IP_NOT_ALLOWED', ip });

  next();
}

function getClientIp(req: Request): string | null {
  // Try proxy header first
  const xff = String(req.headers['x-forwarded-for'] || '').trim();
  if (xff) {
    // first in list is original client
    const first = xff.split(',')[0]?.trim();
    return first || null;
  }

  // Express ip (honors trust proxy)
  const ip = (req as any).ip ? String((req as any).ip) : '';
  if (ip) return normalizeIp(ip);

  // Node socket
  const remote = (req.socket?.remoteAddress ? String(req.socket.remoteAddress) : '').trim();
  return remote ? normalizeIp(remote) : null;
}

function normalizeIp(ip: string): string {
  // Handle IPv6 mapped IPv4: ::ffff:127.0.0.1
  if (ip.startsWith('::ffff:')) return ip.slice(7);
  return ip;
}

/* ---------------- CIDR matching (minimal) ---------------- */

function matchesIp(rule: string, ip: string): boolean {
  const r = rule.trim();
  const target = normalizeIp(ip);

  if (r.includes('/')) {
    const [base, bitsStr] = r.split('/');
    const bits = Number(bitsStr);
    if (!Number.isFinite(bits)) return false;
    return matchCidr(normalizeIp(base), bits, target);
  }

  return normalizeIp(r) === target;
}

function matchCidr(baseIp: string, bits: number, ip: string): boolean {
  const base = ipv4ToInt(baseIp);
  const val = ipv4ToInt(ip);
  if (base === null || val === null) return false;

  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (base & mask) === (val & mask);
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return null;
  return ((nums[0] << 24) | (nums[1] << 16) | (nums[2] << 8) | nums[3]) >>> 0;
}
