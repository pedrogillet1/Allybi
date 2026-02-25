#!/usr/bin/env npx ts-node
import fs from "fs";
import path from "path";

type RouteRule = {
  file: string;
  requiredPattern: RegExp;
  description: string;
};

const RULES: RouteRule[] = [
  {
    file: "src/entrypoints/http/routes/chat.routes.ts",
    requiredPattern: /authorizeByMethod\("chat"\)|authorizeChat/,
    description: "chat routes must enforce RBAC",
  },
  {
    file: "src/entrypoints/http/routes/documents.routes.ts",
    requiredPattern: /authorizeByMethod\("documents"\)/,
    description: "documents routes must enforce RBAC",
  },
  {
    file: "src/entrypoints/http/routes/editing.routes.ts",
    requiredPattern: /authorizeByMethod\("editing"\)|authorizeEditing/,
    description: "editing routes must enforce RBAC",
  },
  {
    file: "src/entrypoints/http/routes/integrations.routes.ts",
    requiredPattern: /authorizeByMethod\("integrations"\)|authorizeIntegrations/,
    description: "integrations routes must enforce RBAC",
  },
  {
    file: "src/entrypoints/http/routes/telemetry.routes.ts",
    requiredPattern: /authorizeByMethod\("telemetry"\)|authorizeTelemetry/,
    description: "telemetry usage endpoint must enforce RBAC",
  },
];

function run(): number {
  const root = process.cwd();
  const failures: Array<{ file: string; issue: string }> = [];

  for (const rule of RULES) {
    const full = path.resolve(root, rule.file);
    if (!fs.existsSync(full)) {
      failures.push({
        file: rule.file,
        issue: "route file missing",
      });
      continue;
    }

    const source = fs.readFileSync(full, "utf8");
    if (!rule.requiredPattern.test(source)) {
      failures.push({
        file: rule.file,
        issue: rule.description,
      });
    }
  }

  if (!failures.length) {
    console.log("PASS: RBAC route protection checks passed.");
    return 0;
  }

  console.error(`FAIL: ${failures.length} RBAC protection issue(s) found.`);
  for (const failure of failures) {
    console.error(`- ${failure.file}: ${failure.issue}`);
  }
  return 1;
}

process.exit(run());
