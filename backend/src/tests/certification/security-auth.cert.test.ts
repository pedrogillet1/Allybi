import fs from "fs";
import path from "path";
import { describe, expect, test } from "@jest/globals";

import { authenticateToken } from "../../middleware/auth.middleware";
import { writeCertificationGateReport } from "./reporting";

describe("Certification: security auth hardening", () => {
  test("auth middleware rejects missing tokens and avoids x-user-id trust", async () => {
    const missingTokenReq: any = {
      headers: {},
      cookies: {},
    };
    const missingTokenResState: { status?: number; body?: unknown } = {};
    const missingTokenRes: any = {
      status(code: number) {
        missingTokenResState.status = code;
        return this;
      },
      json(payload: unknown) {
        missingTokenResState.body = payload;
        return this;
      },
    };
    let missingTokenNextCalled = false;

    await authenticateToken(
      missingTokenReq as any,
      missingTokenRes as any,
      (() => {
        missingTokenNextCalled = true;
      }) as any,
    );

    const forgedHeaderReq: any = {
      headers: {
        authorization: "Bearer forged.invalid.token",
        "x-user-id": "attacker-user-id",
      },
      cookies: {},
    };
    const forgedHeaderResState: { status?: number; body?: unknown } = {};
    const forgedHeaderRes: any = {
      status(code: number) {
        forgedHeaderResState.status = code;
        return this;
      },
      json(payload: unknown) {
        forgedHeaderResState.body = payload;
        return this;
      },
    };
    let forgedHeaderNextCalled = false;

    await authenticateToken(
      forgedHeaderReq as any,
      forgedHeaderRes as any,
      (() => {
        forgedHeaderNextCalled = true;
      }) as any,
    );

    const middlewarePath = path.resolve(
      process.cwd(),
      "src/middleware/auth.middleware.ts",
    );
    const middlewareSource = fs.readFileSync(middlewarePath, "utf8");
    const failures: string[] = [];

    if (missingTokenNextCalled) failures.push("MISSING_TOKEN_DID_NOT_REJECT");
    if (missingTokenResState.status !== 401)
      failures.push("MISSING_TOKEN_STATUS_NOT_401");
    if (forgedHeaderNextCalled) failures.push("FORGED_TOKEN_DID_NOT_REJECT");
    if (forgedHeaderResState.status !== 401)
      failures.push("FORGED_TOKEN_STATUS_NOT_401");
    if (forgedHeaderReq.user != null)
      failures.push("FORGED_TOKEN_SET_AUTH_CONTEXT");
    if (/x-user-id/i.test(middlewareSource))
      failures.push("HEADER_TRUST_PATH_PRESENT");
    if (!/verifyAccessToken\(/.test(middlewareSource)) {
      failures.push("JWT_VERIFICATION_NOT_USED");
    }

    writeCertificationGateReport("security-auth", {
      passed: failures.length === 0,
      metrics: {
        missingTokenRejected:
          !missingTokenNextCalled && missingTokenResState.status === 401,
        forgedHeaderRejected:
          !forgedHeaderNextCalled && forgedHeaderResState.status === 401,
        forgedHeaderDidNotSetUser: forgedHeaderReq.user == null,
        headerTrustPathPresent: /x-user-id/i.test(middlewareSource),
        jwtVerificationUsed: /verifyAccessToken\(/.test(middlewareSource),
      },
      thresholds: {
        missingTokenRejected: true,
        forgedHeaderRejected: true,
        forgedHeaderDidNotSetUser: true,
        headerTrustPathPresent: false,
        jwtVerificationUsed: true,
      },
      failures,
    });

    expect(failures).toEqual([]);
  });
});
