import type { NextFunction, Request, Response } from "express";
import { OAuth2Client } from "google-auth-library";
import { getAdminIdentityProvider } from "../config/runtimeMode";

type IapJwtPayload = {
  email?: string;
  sub?: string;
  iss?: string;
};

export type AdminIdentity = {
  provider: "iap";
  email: string;
  subject: string;
};

let oauthClient: OAuth2Client | null = null;

function getOauthClient(): OAuth2Client {
  if (!oauthClient) {
    oauthClient = new OAuth2Client();
  }
  return oauthClient;
}

function getIapAudience(): string {
  const audience = String(process.env.KODA_IAP_AUDIENCE || "").trim();
  if (!audience) {
    throw new Error(
      "KODA_IAP_AUDIENCE is required when KODA_ADMIN_IDENTITY_PROVIDER=iap",
    );
  }
  return audience;
}

function extractIdentityHeaders(req: Request): {
  assertion: string;
  emailHeader: string;
} {
  const assertion = String(req.header("X-Goog-IAP-JWT-Assertion") || "").trim();
  const emailHeader = String(
    req.header("X-Goog-Authenticated-User-Email") || "",
  ).trim();
  return { assertion, emailHeader };
}

export async function verifyIapIdentityRequest(
  req: Request,
): Promise<AdminIdentity | null> {
  if (getAdminIdentityProvider() !== "iap") {
    return null;
  }

  const { assertion, emailHeader } = extractIdentityHeaders(req);
  if (!assertion) return null;

  const client = getOauthClient();
  const keys = await client.getIapPublicKeys();
  const ticket = await client.verifySignedJwtWithCertsAsync(
    assertion,
    keys.pubkeys,
    getIapAudience(),
    ["https://cloud.google.com/iap"],
  );

  const payload = (ticket.getPayload() || {}) as IapJwtPayload;
  const email = String(
    payload.email ||
      emailHeader.replace(/^accounts\.google\.com:/, ""),
  ).trim();
  const subject = String(payload.sub || "").trim();

  if (!email || !subject) {
    return null;
  }

  return {
    provider: "iap",
    email,
    subject,
  };
}

export async function requireIapIdentity(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const identity = await verifyIapIdentityRequest(req);
    if (!identity) {
      res.status(401).json({ ok: false, code: "ADMIN_IAP_REQUIRED" });
      return;
    }
    (req as Request & { adminIdentity?: AdminIdentity }).adminIdentity = identity;
    next();
  } catch (error) {
    res.status(401).json({
      ok: false,
      code: "ADMIN_IAP_INVALID",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
