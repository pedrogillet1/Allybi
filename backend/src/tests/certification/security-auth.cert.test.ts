import fs from "fs";
import path from "path";
import { describe, expect, test } from "@jest/globals";

import { authenticateToken } from "../../middleware/auth.middleware";
import { writeCertificationGateReport } from "./reporting";

describe("Certification: security auth hardening", () => {
  test("auth middleware rejects missing tokens and avoids x-user-id trust", async () => {
    const req: any = {
      headers: {},
      cookies: {},
    };
    const resState: { status?: number; body?: unknown } = {};
    const res: any = {
      status(code: number) {
        resState.status = code;
        return this;
      },
      json(payload: unknown) {
        resState.body = payload;
        return this;
      },
    };
    let nextCalled = false;

    await authenticateToken(
      req as any,
      res as any,
      (() => {
        nextCalled = true;
      }) as any,
    );

    const middlewarePath = path.resolve(
      process.cwd(),
      "src/middleware/auth.middleware.ts",
    );
    const middlewareSource = fs.readFileSync(middlewarePath, "utf8");
    const failures: string[] = [];

    if (nextCalled) failures.push("MISSING_TOKEN_DID_NOT_REJECT");
    if (resState.status !== 401) failures.push("MISSING_TOKEN_STATUS_NOT_401");
    if (/x-user-id/i.test(middlewareSource))
      failures.push("HEADER_TRUST_PATH_PRESENT");
    if (!/verifyAccessToken\(/.test(middlewareSource)) {
      failures.push("JWT_VERIFICATION_NOT_USED");
    }

    writeCertificationGateReport("security-auth", {
      passed: failures.length === 0,
      metrics: {
        missingTokenRejected: !nextCalled && resState.status === 401,
        headerTrustPathPresent: /x-user-id/i.test(middlewareSource),
        jwtVerificationUsed: /verifyAccessToken\(/.test(middlewareSource),
      },
      thresholds: {
        missingTokenRejected: true,
        headerTrustPathPresent: false,
        jwtVerificationUsed: true,
      },
      failures,
    });

    expect(failures).toEqual([]);
  });
});
