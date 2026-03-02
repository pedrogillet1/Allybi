import { describe, expect, test, jest, beforeEach, afterEach } from "@jest/globals";

jest.mock("../../config/database", () => ({
  __esModule: true,
  default: {
    document: { updateMany: jest.fn() },
  },
}));
jest.mock("../security/tenantKey.service", () => ({
  TenantKeyService: jest.fn(),
}));
jest.mock("../security/envelope.service", () => ({
  EnvelopeService: jest.fn(),
}));
jest.mock("./documentKey.service", () => ({
  DocumentKeyService: jest.fn(),
}));

import { DocumentContentVaultService } from "./documentContentVault.service";

describe("DocumentContentVaultService (encryption disabled)", () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of [
      "KODA_MASTER_KEY_BASE64",
      "SECURITY_REQUIRE_DOC_ENCRYPTION",
      "SECURITY_ALLOW_PLAINTEXT_READ",
      "NODE_ENV",
    ]) {
      savedEnv[key] = process.env[key];
    }
    delete process.env.KODA_MASTER_KEY_BASE64;
    delete process.env.SECURITY_REQUIRE_DOC_ENCRYPTION;
    process.env.SECURITY_ALLOW_PLAINTEXT_READ = "true";
    process.env.NODE_ENV = "test";
  });

  afterEach(() => {
    for (const [key, val] of Object.entries(savedEnv)) {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
  });

  test("isEnabled returns false when no master key is set", () => {
    const vault = new DocumentContentVaultService();
    expect(vault.isEnabled()).toBe(false);
  });

  test("resolvePreviewText returns plaintext via fallback chain (renderableContent > previewText > rawText)", async () => {
    const vault = new DocumentContentVaultService();

    // renderableContent wins when present
    const result1 = await vault.resolvePreviewText("u1", "d1", {
      rawText: "raw",
      previewText: "preview",
      renderableContent: "renderable",
    });
    expect(result1).toBe("renderable");

    // previewText wins when renderableContent is null
    const result2 = await vault.resolvePreviewText("u1", "d1", {
      rawText: "raw",
      previewText: "preview",
      renderableContent: null,
    });
    expect(result2).toBe("preview");

    // rawText as last resort
    const result3 = await vault.resolvePreviewText("u1", "d1", {
      rawText: "raw",
      previewText: null,
      renderableContent: null,
    });
    expect(result3).toBe("raw");
  });

  test("resolvePreviewText returns null for null doc", async () => {
    const vault = new DocumentContentVaultService();
    const result = await vault.resolvePreviewText("u1", "d1", null);
    expect(result).toBeNull();
  });

  test("encryptDocumentFields is a no-op when encryption is disabled", async () => {
    const vault = new DocumentContentVaultService();
    await vault.encryptDocumentFields("u1", "d1", {
      rawText: "hello",
      previewText: "world",
      renderableContent: "<p>hi</p>",
    });

    // Since encryption is disabled, prisma.document.updateMany should not be called
    const prisma = (await import("../../config/database")).default;
    expect(prisma.document.updateMany).not.toHaveBeenCalled();
  });
});
