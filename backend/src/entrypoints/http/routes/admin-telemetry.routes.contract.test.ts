import { describe, expect, test } from "@jest/globals";
import router from "./admin-telemetry.routes";

function routePaths(value: unknown): string[] {
  const stack = Array.isArray((value as any)?.stack) ? (value as any).stack : [];
  return stack
    .filter((layer: any) => layer?.route?.path)
    .map((layer: any) => String(layer.route.path));
}

describe("admin telemetry routes contract", () => {
  test("quality endpoints include truncation and regeneration rates", () => {
    const paths = routePaths(router);
    expect(paths).toContain("/quality/reask-rate");
    expect(paths).toContain("/quality/truncation-rate");
    expect(paths).toContain("/quality/regeneration-rate");
  });
});
