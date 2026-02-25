import { Router } from "express";

import { authMiddleware } from "../../../middleware/auth.middleware";
import { authorizeByMethod } from "../../../middleware/authorize.middleware";
import { rateLimitMiddleware } from "../../../middleware/rateLimit.middleware";
import { createIntegrationsController } from "../../../controllers/integrations.controller";

import { registerConnector } from "../../../services/connectors/connectorsRegistry";
import { GmailOAuthService } from "../../../services/connectors/gmail/gmailOAuth.service";
import { GmailClientService } from "../../../services/connectors/gmail/gmailClient.service";
import { GmailSyncService } from "../../../services/connectors/gmail/gmailSync.service";
import { OutlookOAuthService } from "../../../services/connectors/outlook/outlookOAuth.service";
import GraphClientService from "../../../services/connectors/outlook/graphClient.service";
import { OutlookSyncService } from "../../../services/connectors/outlook/outlookSync.service";
import { SlackOAuthService } from "../../../services/connectors/slack/slackOAuth.service";
import { SlackClientService } from "../../../services/connectors/slack/slackClient.service";
import { SlackSyncService } from "../../../services/connectors/slack/slackSync.service";
import SlackEventsController from "../../../services/connectors/slack/slackEvents.controller";
import crypto from "crypto";
import prisma from "../../../config/database";
import { TokenVaultService } from "../../../services/connectors/tokenVault.service";
import { PrismaDocumentService } from "../../../services/prismaDocument.service";

const router = Router();
const authorizeIntegrations = authorizeByMethod("integrations");

registerConnector("gmail", {
  capabilities: { oauth: true, sync: true, search: true },
  oauthService: new GmailOAuthService(),
  clientService: new GmailClientService(),
  syncService: new GmailSyncService(),
});

registerConnector("outlook", {
  capabilities: { oauth: true, sync: true, search: true },
  oauthService: new OutlookOAuthService(),
  clientService: new GraphClientService(),
  syncService: new OutlookSyncService(),
});

registerConnector("slack", {
  capabilities: { oauth: true, sync: true, search: true, realtime: true },
  oauthService: new SlackOAuthService(),
  clientService: new SlackClientService(),
  syncService: new SlackSyncService(),
});

const controller = createIntegrationsController();
const slackEvents = new SlackEventsController();
const tokenVault = new TokenVaultService();
const gmailOAuth = new GmailOAuthService();
const outlookOAuth = new OutlookOAuthService();
const gmailClient = new GmailClientService();
const graphClient = new GraphClientService();
const documentService = new PrismaDocumentService();

async function getConnectorAccessToken(
  userId: string,
  provider: "gmail" | "outlook",
): Promise<string> {
  try {
    return await tokenVault.getValidAccessToken(userId, provider);
  } catch (e) {
    // Best-effort refresh for email providers.
    if (provider === "outlook") {
      await outlookOAuth.refreshAccessToken(userId);
      return await tokenVault.getValidAccessToken(userId, provider);
    }
    await gmailOAuth.refreshAccessToken(userId);
    return await tokenVault.getValidAccessToken(userId, provider);
  }
}

function decodeBase64UrlToBuffer(data: string): Buffer {
  const normalized = String(data || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const pad =
    normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + pad, "base64");
}

function extractGmailAttachments(message: any): Array<{
  attachmentId: string;
  filename: string;
  mimeType: string;
  sizeBytes?: number;
  isInline?: boolean;
}> {
  const out: Array<{
    attachmentId: string;
    filename: string;
    mimeType: string;
    sizeBytes?: number;
    isInline?: boolean;
  }> = [];
  const walk = (part: any) => {
    if (!part) return;
    const filename = String(part.filename || "").trim();
    const attachmentId = String(part?.body?.attachmentId || "").trim();
    const mimeType =
      String(part.mimeType || "").trim() || "application/octet-stream";
    const sizeBytes =
      typeof part?.body?.size === "number" ? part.body.size : undefined;
    if (filename && attachmentId) {
      out.push({
        attachmentId,
        filename,
        mimeType,
        sizeBytes,
        isInline: false,
      });
    }
    const parts = Array.isArray(part.parts) ? part.parts : [];
    for (const c of parts) walk(c);
  };
  walk(message?.payload);
  // Dedupe by attachmentId.
  const seen = new Set<string>();
  return out.filter((a) => {
    if (seen.has(a.attachmentId)) return false;
    seen.add(a.attachmentId);
    return true;
  });
}

function emailSendSecret(): string {
  const s =
    process.env.CONNECTOR_ACTION_SECRET ||
    process.env.KODA_ACTION_SECRET ||
    process.env.JWT_ACCESS_SECRET ||
    process.env.ENCRYPTION_KEY ||
    "";
  if (!s.trim())
    throw new Error(
      "Missing CONNECTOR_ACTION_SECRET (or JWT_ACCESS_SECRET / ENCRYPTION_KEY).",
    );
  return s;
}

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function signEmailSendToken(payload: Record<string, unknown>): string {
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const sig = crypto
    .createHmac("sha256", emailSendSecret())
    .update(encoded)
    .digest();
  const sigUrl = base64UrlEncode(sig);
  return `${encoded}.${sigUrl}`;
}

// Slack Events API (public, signature-verified). Must be mounted under /api/integrations.
router.post("/slack/events", (req, res) => slackEvents.handle(req, res));
router.get("/slack/events/health", (req, res) => slackEvents.health(req, res));

// Mint a fresh EMAIL_SEND confirmation token for interactive draft editing in the UI.
// Frontend will then call /api/chat/... with { confirmationToken } to execute the send.
router.post(
  "/email/send-token",
  authMiddleware,
  authorizeIntegrations,
  rateLimitMiddleware,
  async (req: any, res) => {
    const userId = req.user?.id;
    if (!userId)
      return res.status(401).json({
        ok: false,
        error: { code: "AUTH_UNAUTHORIZED", message: "Not authenticated." },
      });

    try {
      const providerRaw = String(req.body?.provider || "").toLowerCase();
      if (providerRaw !== "gmail" && providerRaw !== "outlook") {
        return res.status(400).json({
          ok: false,
          error: {
            code: "UNSUPPORTED_PROVIDER",
            message: "Provider must be gmail or outlook.",
          },
        });
      }

      const to = String(req.body?.to || "").trim();
      if (!to) {
        return res.status(400).json({
          ok: false,
          error: {
            code: "RECIPIENT_REQUIRED",
            message: "Recipient (to) is required.",
          },
        });
      }

      const subject = String(req.body?.subject || "");
      const body = String(req.body?.body || "");
      const rawIds = Array.isArray(req.body?.attachmentDocumentIds)
        ? req.body.attachmentDocumentIds
        : [];
      const ids = rawIds
        .filter((x: any) => typeof x === "string" && x.trim())
        .map((s: string) => s.trim());

      // Limit attachments and ensure they belong to the user (and aren't connector artifacts).
      const MAX_ATTACHMENTS = 6;
      const uniqueIds: string[] = [];
      const seen = new Set<string>();
      for (const id of ids) {
        if (seen.has(id)) continue;
        seen.add(id);
        uniqueIds.push(id);
        if (uniqueIds.length >= MAX_ATTACHMENTS) break;
      }

      let verifiedIds: string[] = [];
      if (uniqueIds.length) {
        const docs = await prisma.document.findMany({
          where: {
            userId,
            id: { in: uniqueIds },
            parentVersionId: null,
            encryptedFilename: { not: { contains: "/connectors/" } },
          },
          select: { id: true },
        });
        const ok = new Set(docs.map((d: { id: string }) => d.id));
        verifiedIds = uniqueIds.filter((id) => ok.has(id));
      }

      const confirmationId = signEmailSendToken({
        v: 2,
        t: "email_send",
        userId,
        provider: providerRaw,
        to,
        subject,
        body,
        attachmentDocumentIds: verifiedIds,
        iat: Date.now(),
        exp: Date.now() + 10 * 60 * 1000,
      });

      return res.json({
        ok: true,
        data: {
          operator: "EMAIL_SEND",
          confirmationId,
        },
      });
    } catch (e: any) {
      return res.status(500).json({
        ok: false,
        error: {
          code: "TOKEN_MINT_FAILED",
          message: e?.message || "Failed to create confirmation token.",
        },
      });
    }
  },
);

// Fetch a full email message (with attachment metadata) for the preview UI.
router.get(
  "/email/messages/:provider/:messageId",
  authMiddleware,
  authorizeIntegrations,
  rateLimitMiddleware,
  async (req: any, res) => {
    const userId = req.user?.id;
    if (!userId)
      return res.status(401).json({
        ok: false,
        error: { code: "AUTH_UNAUTHORIZED", message: "Not authenticated." },
      });

    const provider = String(req.params.provider || "").toLowerCase();
    const messageId = String(req.params.messageId || "").trim();
    const includeBody = String(req.query?.includeBody || "").trim() === "1";
    if ((provider !== "gmail" && provider !== "outlook") || !messageId) {
      return res.status(400).json({
        ok: false,
        error: {
          code: "BAD_REQUEST",
          message: "provider and messageId are required.",
        },
      });
    }

    try {
      const accessToken = await getConnectorAccessToken(
        userId,
        provider as any,
      );
      if (provider === "gmail") {
        const msg = await gmailClient.getMessage(accessToken, messageId);
        const attachments = extractGmailAttachments(msg).map((a) => ({
          attachmentId: a.attachmentId,
          filename: a.filename,
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes,
          isInline: a.isInline,
        }));

        // Best-effort: include body text when requested (for preview UX).
        const bodyText = includeBody
          ? (() => {
              try {
                const headers = Array.isArray(msg?.payload?.headers)
                  ? msg.payload.headers
                  : [];
                const findHeader = (name: string): string | null => {
                  const target = String(name || "").toLowerCase();
                  const h = headers.find(
                    (x: any) => String(x?.name || "").toLowerCase() === target,
                  );
                  return typeof h?.value === "string" ? h.value : null;
                };

                const decodeBase64Url = (data: string): string => {
                  const s = String(data || "")
                    .replace(/-/g, "+")
                    .replace(/_/g, "/");
                  const pad =
                    s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
                  return Buffer.from(s + pad, "base64").toString("utf8");
                };

                const walk = (part: any): string[] => {
                  if (!part) return [];
                  const mime = String(part?.mimeType || "").toLowerCase();
                  if (mime === "text/plain" && part?.body?.data) {
                    return [decodeBase64Url(part.body.data)];
                  }
                  const parts = Array.isArray(part?.parts) ? part.parts : [];
                  return parts.flatMap(walk);
                };

                const textParts = walk(msg?.payload);
                const text = (textParts.join("\n\n") || "").trim();
                if (text) return text;

                // Fallback: Gmail snippet if no plain text part found.
                const snippet =
                  typeof msg?.snippet === "string" ? msg.snippet : "";
                return snippet.replace(/\s+/g, " ").trim();
              } catch {
                return "";
              }
            })()
          : undefined;

        return res.json({
          ok: true,
          data: {
            provider: "gmail",
            messageId,
            attachments,
            ...(includeBody ? { bodyText } : {}),
          },
        });
      }

      const msg = includeBody
        ? await graphClient.getMessage(accessToken, messageId)
        : null;
      const atts = await graphClient.listMessageAttachments(
        accessToken,
        messageId,
      );
      const attachments = (atts || [])
        .filter((a: any) =>
          String(a?.["@odata.type"] || "")
            .toLowerCase()
            .includes("fileattachment"),
        )
        .map((a: any) => ({
          attachmentId: String(a.id),
          filename: String(a.name || "attachment"),
          mimeType: String(a.contentType || "application/octet-stream"),
          sizeBytes: typeof a.size === "number" ? a.size : undefined,
          isInline: Boolean(a.isInline),
        }));

      return res.json({
        ok: true,
        data: {
          provider: "outlook",
          messageId,
          attachments,
          ...(includeBody && msg
            ? { bodyText: graphClient.getMessageText(msg) }
            : {}),
        },
      });
    } catch (e: any) {
      return res.status(500).json({
        ok: false,
        error: {
          code: "EMAIL_FETCH_FAILED",
          message: e?.message || "Failed to fetch email.",
        },
      });
    }
  },
);

// Save a single email attachment into Koda (creates a new Document).
router.post(
  "/email/attachments/save",
  authMiddleware,
  authorizeIntegrations,
  rateLimitMiddleware,
  async (req: any, res) => {
    const userId = req.user?.id;
    if (!userId)
      return res.status(401).json({
        ok: false,
        error: { code: "AUTH_UNAUTHORIZED", message: "Not authenticated." },
      });

    const provider = String(req.body?.provider || "").toLowerCase();
    const messageId = String(req.body?.messageId || "").trim();
    const attachmentId = String(req.body?.attachmentId || "").trim();
    const folderIdRaw = req.body?.folderId;
    const folderId =
      typeof folderIdRaw === "string" && folderIdRaw.trim()
        ? folderIdRaw.trim()
        : null;

    if (
      (provider !== "gmail" && provider !== "outlook") ||
      !messageId ||
      !attachmentId
    ) {
      return res.status(400).json({
        ok: false,
        error: {
          code: "BAD_REQUEST",
          message: "provider, messageId, and attachmentId are required.",
        },
      });
    }

    if (folderId) {
      const ok = await prisma.folder.findFirst({
        where: { id: folderId, userId },
        select: { id: true },
      });
      if (!ok) {
        return res.status(400).json({
          ok: false,
          error: {
            code: "INVALID_FOLDER",
            message: "Folder does not exist.",
          },
        });
      }
    }

    const MAX_BYTES = 25 * 1024 * 1024;

    try {
      const accessToken = await getConnectorAccessToken(
        userId,
        provider as any,
      );

      let filename = "attachment";
      let mimeType = "application/octet-stream";
      let buffer: Buffer | null = null;

      if (provider === "gmail") {
        const msg = await gmailClient.getMessage(accessToken, messageId);
        const attachments = extractGmailAttachments(msg);
        const meta = attachments.find((a) => a.attachmentId === attachmentId);
        if (!meta) {
          return res.status(404).json({
            ok: false,
            error: {
              code: "ATTACHMENT_NOT_FOUND",
              message: "Attachment not found on message.",
            },
          });
        }
        filename = meta.filename || filename;
        mimeType = meta.mimeType || mimeType;
        const att = await gmailClient.getAttachment(accessToken, {
          messageId,
          attachmentId,
        });
        buffer = decodeBase64UrlToBuffer(att.data);
      } else {
        const att = await graphClient.getMessageAttachment(
          accessToken,
          messageId,
          attachmentId,
        );
        const odata = String((att as any)?.["@odata.type"] || "").toLowerCase();
        if (!odata.includes("fileattachment")) {
          return res.status(400).json({
            ok: false,
            error: {
              code: "UNSUPPORTED_ATTACHMENT",
              message: "Only file attachments are supported right now.",
            },
          });
        }
        filename = String((att as any)?.name || filename);
        mimeType = String((att as any)?.contentType || mimeType);
        const contentBytes = String((att as any)?.contentBytes || "");
        if (!contentBytes) {
          return res.status(500).json({
            ok: false,
            error: {
              code: "EMPTY_ATTACHMENT",
              message: "Attachment content is missing.",
            },
          });
        }
        buffer = Buffer.from(contentBytes, "base64");
      }

      if (!buffer) {
        return res.status(500).json({
          ok: false,
          error: {
            code: "ATTACHMENT_DOWNLOAD_FAILED",
            message: "Failed to download attachment.",
          },
        });
      }
      if (buffer.length > MAX_BYTES) {
        return res.status(413).json({
          ok: false,
          error: {
            code: "ATTACHMENT_TOO_LARGE",
            message: "Attachment is too large (max 25MB).",
          },
        });
      }

      const doc = await documentService.upload({
        userId,
        data: {
          filename,
          mimeType,
          buffer,
          sizeBytes: buffer.length,
          folderId,
        } as any,
      });

      return res.json({ ok: true, data: { document: doc } });
    } catch (e: any) {
      return res.status(500).json({
        ok: false,
        error: {
          code: "SAVE_ATTACHMENT_FAILED",
          message: e?.message || "Failed to save attachment.",
        },
      });
    }
  },
);

router.post(
  "/email/attachments/save-all",
  authMiddleware,
  authorizeIntegrations,
  rateLimitMiddleware,
  async (req: any, res) => {
    const userId = req.user?.id;
    if (!userId)
      return res.status(401).json({
        ok: false,
        error: { code: "AUTH_UNAUTHORIZED", message: "Not authenticated." },
      });

    const provider = String(req.body?.provider || "").toLowerCase();
    const messageId = String(req.body?.messageId || "").trim();
    const attachmentIds = Array.isArray(req.body?.attachmentIds)
      ? req.body.attachmentIds
          .filter((x: any) => typeof x === "string" && x.trim())
          .map((s: string) => s.trim())
      : [];
    const folderIdRaw = req.body?.folderId;
    const folderId =
      typeof folderIdRaw === "string" && folderIdRaw.trim()
        ? folderIdRaw.trim()
        : null;

    if (
      (provider !== "gmail" && provider !== "outlook") ||
      !messageId ||
      attachmentIds.length === 0
    ) {
      return res.status(400).json({
        ok: false,
        error: {
          code: "BAD_REQUEST",
          message: "provider, messageId, and attachmentIds are required.",
        },
      });
    }

    if (folderId) {
      const ok = await prisma.folder.findFirst({
        where: { id: folderId, userId },
        select: { id: true },
      });
      if (!ok) {
        return res.status(400).json({
          ok: false,
          error: {
            code: "INVALID_FOLDER",
            message: "Folder does not exist.",
          },
        });
      }
    }

    const MAX_BYTES = 25 * 1024 * 1024;

    try {
      const accessToken = await getConnectorAccessToken(
        userId,
        provider as any,
      );
      const successes: any[] = [];
      const failures: any[] = [];

      let gmailMeta: any[] | null = null;
      if (provider === "gmail") {
        const msg = await gmailClient.getMessage(accessToken, messageId);
        gmailMeta = extractGmailAttachments(msg);
      }

      for (const attachmentId of attachmentIds.slice(0, 12)) {
        try {
          let filename = "attachment";
          let mimeType = "application/octet-stream";
          let buffer: Buffer | null = null;

          if (provider === "gmail") {
            const meta = (gmailMeta || []).find(
              (a) => a.attachmentId === attachmentId,
            );
            if (!meta) throw new Error("Attachment not found on message.");
            filename = meta.filename || filename;
            mimeType = meta.mimeType || mimeType;
            const att = await gmailClient.getAttachment(accessToken, {
              messageId,
              attachmentId,
            });
            buffer = decodeBase64UrlToBuffer(att.data);
          } else {
            const att = await graphClient.getMessageAttachment(
              accessToken,
              messageId,
              attachmentId,
            );
            const odata = String(
              (att as any)?.["@odata.type"] || "",
            ).toLowerCase();
            if (!odata.includes("fileattachment"))
              throw new Error("Only file attachments are supported right now.");
            filename = String((att as any)?.name || filename);
            mimeType = String((att as any)?.contentType || mimeType);
            const contentBytes = String((att as any)?.contentBytes || "");
            if (!contentBytes)
              throw new Error("Attachment content is missing.");
            buffer = Buffer.from(contentBytes, "base64");
          }

          if (!buffer) throw new Error("Failed to download attachment.");
          if (buffer.length > MAX_BYTES)
            throw new Error("Attachment is too large (max 25MB).");

          const doc = await documentService.upload({
            userId,
            data: {
              filename,
              mimeType,
              buffer,
              sizeBytes: buffer.length,
              folderId,
            } as any,
          });
          successes.push({ attachmentId, document: doc });
        } catch (err: any) {
          failures.push({ attachmentId, error: err?.message || "Failed" });
        }
      }

      return res.json({ ok: true, data: { successes, failures } });
    } catch (e: any) {
      return res.status(500).json({
        ok: false,
        error: {
          code: "SAVE_ATTACHMENTS_FAILED",
          message: e?.message || "Failed to save attachments.",
        },
      });
    }
  },
);

router.get(
  "/:provider/start",
  authMiddleware,
  authorizeIntegrations,
  rateLimitMiddleware,
  (req, res) => controller.startConnect(req, res),
);
router.get("/:provider/callback", rateLimitMiddleware, (req, res) =>
  controller.oauthCallback(req, res),
);
router.get(
  "/status",
  authMiddleware,
  authorizeIntegrations,
  rateLimitMiddleware,
  (req, res) => controller.status(req, res),
);
router.post(
  "/:provider/sync",
  authMiddleware,
  authorizeIntegrations,
  rateLimitMiddleware,
  (req, res) => controller.sync(req, res),
);
router.get(
  "/:provider/search",
  authMiddleware,
  authorizeIntegrations,
  rateLimitMiddleware,
  (req, res) => controller.search(req, res),
);
router.post(
  "/:provider/send",
  authMiddleware,
  authorizeIntegrations,
  rateLimitMiddleware,
  (req, res) => controller.send(req, res),
);
router.post(
  "/:provider/disconnect",
  authMiddleware,
  authorizeIntegrations,
  rateLimitMiddleware,
  (req, res) => controller.disconnect(req, res),
);

export default router;
