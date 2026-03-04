import { describe, it, expect } from "@jest/globals";
import fs from "fs";
import path from "path";

describe("AUTH_URL_TOKEN_COMPAT security", () => {
  it("must not put tokens in redirect URL query params", () => {
    const authRoutes = fs.readFileSync(
      path.resolve(__dirname, "../../entrypoints/http/routes/auth.routes.ts"),
      "utf8",
    );
    expect(authRoutes).not.toContain("AUTH_URL_TOKEN_COMPAT");
    expect(authRoutes).not.toMatch(/URLSearchParams\s*\(\s*\{[^}]*accessToken/);
    expect(authRoutes).not.toMatch(/URLSearchParams\s*\(\s*\{[^}]*refreshToken/);
  });
});
