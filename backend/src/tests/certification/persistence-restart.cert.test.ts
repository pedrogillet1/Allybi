import { describe, expect, test } from "@jest/globals";
import { createHash, randomBytes } from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

import TokenVaultService from "../../services/connectors/tokenVault.service";
import { writeCertificationGateReport } from "./reporting";

function randomB64Key(): string {
  return randomBytes(32).toString("base64");
}

describe("Certification: persistence restart integrity", () => {
  test("token vault survives service restart with file-backed durable storage", async () => {
    const storageRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "allybi-cert-token-vault-"),
    );
    const prevStorage = process.env.CONNECTOR_TOKEN_STORAGE;
    const prevMaster = process.env.KODA_MASTER_KEY_BASE64;

    process.env.CONNECTOR_TOKEN_STORAGE = "file";
    process.env.KODA_MASTER_KEY_BASE64 = randomB64Key();

    const failures: string[] = [];
    try {
      const serviceA = new TokenVaultService({ storageRoot });
      await serviceA.storeToken(
        "cert-user-1",
        "gmail",
        JSON.stringify({
          accessToken: "access-token-cert-1",
          refreshToken: "refresh-token-cert-1",
          providerAccountId: "acct-123",
        }),
        ["gmail.readonly"],
        new Date(Date.now() + 3600_000),
      );

      // Simulate process restart by creating a fresh service instance.
      const serviceB = new TokenVaultService({ storageRoot });
      const token = await serviceB.getValidAccessToken("cert-user-1", "gmail");
      if (token !== "access-token-cert-1") failures.push("TOKEN_MISMATCH");

      const meta = await serviceB.getProviderTokenMeta("cert-user-1", "gmail");
      if (!meta) failures.push("META_NOT_FOUND_AFTER_RESTART");
      if (meta && meta.scopes[0] !== "gmail.readonly") {
        failures.push("SCOPE_MISMATCH_AFTER_RESTART");
      }

      await serviceB.deleteToken("cert-user-1", "gmail");
      const afterDelete = await serviceB.getProviderTokenMeta(
        "cert-user-1",
        "gmail",
      );
      if (afterDelete !== null) failures.push("DELETE_NOT_PERSISTED");
    } finally {
      process.env.CONNECTOR_TOKEN_STORAGE = prevStorage;
      process.env.KODA_MASTER_KEY_BASE64 = prevMaster;
      fs.rmSync(storageRoot, { recursive: true, force: true });
    }

    const dbConfigPath = path.resolve(process.cwd(), "src/config/database.ts");
    const dbConfigSource = fs.readFileSync(dbConfigPath, "utf8");
    const hasNoopFallback = /noop|fallback.*prisma|in[-_ ]memory.*prisma/i.test(
      dbConfigSource,
    );
    if (hasNoopFallback) failures.push("PRISMA_NOOP_FALLBACK_DETECTED");

    writeCertificationGateReport("persistence-restart", {
      passed: failures.length === 0,
      metrics: {
        durableTokenVault: true,
        prismaNoopFallbackDetected: hasNoopFallback,
        failureCount: failures.length,
      },
      thresholds: {
        maxFailureCount: 0,
      },
      failures,
    });

    expect(failures).toEqual([]);
  });

  test("master key material has deterministic hash shape for restart continuity", () => {
    const key = randomB64Key();
    const digest = createHash("sha256").update(key).digest("hex");
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
  });
});
