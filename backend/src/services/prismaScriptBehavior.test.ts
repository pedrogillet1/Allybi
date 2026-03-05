import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const policyCore = require("../../scripts/prisma/policy-core.cjs");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const replayCore = require("../../scripts/prisma/replay-core.cjs");

function withTempDir(testBody: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), "prisma-policy-"));
  try {
    testBody(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("Prisma CI policy/replay script behavior", () => {
  test("policy check fails when workflow directly uses prisma db push", () => {
    withTempDir((root) => {
      const workflowsDir = join(root, ".github", "workflows");
      mkdirSync(workflowsDir, { recursive: true });
      writeFileSync(
        join(workflowsDir, "ci.yml"),
        `name: CI
jobs:
  test:
    steps:
      - run: npx prisma db push --accept-data-loss
`,
      );
      writeFileSync(join(root, "package.json"), '{"scripts":{}}');

      expect(() =>
        policyCore.assertNoCiDbPush(workflowsDir, join(root, "package.json")),
      ).toThrow("Forbidden Prisma CI patterns");
    });
  });

  test("policy check fails when workflow invokes forbidden package script", () => {
    withTempDir((root) => {
      const workflowsDir = join(root, ".github", "workflows");
      mkdirSync(workflowsDir, { recursive: true });
      writeFileSync(
        join(workflowsDir, "ci.yml"),
        `name: CI
jobs:
  replay:
    steps:
      - run: npm run danger:push
`,
      );
      writeFileSync(
        join(root, "package.json"),
        JSON.stringify(
          {
            scripts: {
              "danger:push": "npx prisma db push --accept-data-loss",
            },
          },
          null,
          2,
        ),
      );

      expect(() =>
        policyCore.assertNoCiDbPush(workflowsDir, join(root, "package.json")),
      ).toThrow("package.json#scripts.danger:push");
    });
  });

  test("policy check fails for yarn-run indirection", () => {
    withTempDir((root) => {
      const workflowsDir = join(root, ".github", "workflows");
      mkdirSync(workflowsDir, { recursive: true });
      writeFileSync(
        join(workflowsDir, "ci.yml"),
        `name: CI
jobs:
  replay:
    steps:
      - run: yarn run danger:push
`,
      );
      writeFileSync(
        join(root, "package.json"),
        JSON.stringify(
          {
            scripts: {
              "danger:push": "npx prisma db push --accept-data-loss",
            },
          },
          null,
          2,
        ),
      );

      expect(() =>
        policyCore.assertNoCiDbPush(workflowsDir, join(root, "package.json")),
      ).toThrow("package.json#scripts.danger:push");
    });
  });

  test("policy check fails for npm --prefix run indirection", () => {
    withTempDir((root) => {
      const workflowsDir = join(root, ".github", "workflows");
      mkdirSync(workflowsDir, { recursive: true });
      writeFileSync(
        join(workflowsDir, "ci.yml"),
        `name: CI
jobs:
  replay:
    steps:
      - run: npm --prefix backend run danger:push
`,
      );
      writeFileSync(
        join(root, "package.json"),
        JSON.stringify(
          {
            scripts: {
              "danger:push": "npx prisma db push --accept-data-loss",
            },
          },
          null,
          2,
        ),
      );

      expect(() =>
        policyCore.assertNoCiDbPush(workflowsDir, join(root, "package.json")),
      ).toThrow("package.json#scripts.danger:push");
    });
  });

  test("policy check allows forbidden command in non-referenced script", () => {
    withTempDir((root) => {
      const workflowsDir = join(root, ".github", "workflows");
      mkdirSync(workflowsDir, { recursive: true });
      writeFileSync(
        join(workflowsDir, "ci.yml"),
        `name: CI
jobs:
  replay:
    steps:
      - run: npm run safe:check
`,
      );
      writeFileSync(
        join(root, "package.json"),
        JSON.stringify(
          {
            scripts: {
              "safe:check": "echo ok",
              "danger:push": "npx prisma db push --accept-data-loss",
            },
          },
          null,
          2,
        ),
      );

      expect(() =>
        policyCore.assertNoCiDbPush(workflowsDir, join(root, "package.json")),
      ).not.toThrow();
    });
  });

  test("replay preflight rejects placeholder DATABASE_URL", () => {
    expect(() =>
      replayCore.assertReplayEnv({
        DATABASE_URL:
          "postgresql://USER:PASSWORD@HOST:5432/DB_NAME?schema=public",
      }),
    ).toThrow("invalid DATABASE_URL");
  });

  test("replay preflight rejects placeholder DIRECT_DATABASE_URL", () => {
    expect(() =>
      replayCore.assertReplayEnv({
        DATABASE_URL:
          "postgresql://prisma:prisma@localhost:5432/prisma_ci?schema=public",
        DIRECT_DATABASE_URL:
          "postgresql://USER:PASSWORD@HOST:5432/DB_NAME?schema=public",
      }),
    ).toThrow("invalid DIRECT_DATABASE_URL");
  });

  test("replay preflight accepts valid URLs", () => {
    expect(() =>
      replayCore.assertReplayEnv({
        DATABASE_URL:
          "postgresql://prisma:prisma@localhost:5432/prisma_ci?schema=public",
        DIRECT_DATABASE_URL:
          "postgresql://prisma:prisma@localhost:5432/prisma_ci?schema=public",
      }),
    ).not.toThrow();
  });
});
