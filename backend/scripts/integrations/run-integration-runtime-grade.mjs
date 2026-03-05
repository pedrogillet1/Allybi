#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, "..", "..");

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    strict: args.includes("--strict"),
  };
}

function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function gradeFromScore(score) {
  if (score >= 97) return "A+";
  if (score >= 93) return "A";
  if (score >= 90) return "A-";
  if (score >= 87) return "B+";
  if (score >= 83) return "B";
  if (score >= 80) return "B-";
  if (score >= 77) return "C+";
  if (score >= 73) return "C";
  if (score >= 70) return "C-";
  if (score >= 67) return "D+";
  if (score >= 63) return "D";
  return "F";
}

function renderMarkdown(report) {
  let out = "";
  out += "# Integration Runtime Grade\n\n";
  out += `- Generated: ${report.generatedAt}\n`;
  out += `- Final score: **${report.finalScore}**\n`;
  out += `- Final grade: **${report.finalGrade}**\n`;
  out += `- Verdict: **${report.verdict}**\n\n`;
  out += "## Checks\n\n";
  out += "| Check | Severity | Weight | Pass | Detail |\n";
  out += "|---|---|---:|:---:|---|\n";
  for (const check of report.checks) {
    out += `| ${check.id} | ${check.severity} | ${check.weight} | ${check.pass ? "yes" : "no"} | ${check.detail} |\n`;
  }
  out += "\n";
  return out;
}

function runCommand(cmd, args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk || "");
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk || "");
    });
    child.on("close", (code) => {
      resolve({
        ok: code === 0,
        code,
        stdout,
        stderr,
      });
    });
    child.on("error", (error) => {
      resolve({
        ok: false,
        code: -1,
        stdout,
        stderr: `${stderr}\n${String(error?.message || error)}`,
      });
    });
  });
}

async function main() {
  const args = parseArgs();
  const startedAt = Date.now();
  const checks = [];

  const controllerPath = path.join(
    backendRoot,
    "src",
    "controllers",
    "integrations.controller.ts",
  );
  const routesPath = path.join(
    backendRoot,
    "src",
    "entrypoints",
    "http",
    "routes",
    "integrations.routes.ts",
  );
  const queuePath = path.join(backendRoot, "src", "queues", "connector.queue.ts");
  const workerPath = path.join(backendRoot, "src", "workers", "connector-worker.ts");
  const handlerPath = path.join(
    backendRoot,
    "src",
    "services",
    "core",
    "handlers",
    "connectorHandler.service.ts",
  );
  const turnRouterPath = path.join(
    backendRoot,
    "src",
    "services",
    "chat",
    "turnRouter.service.ts",
  );
  const mimeRegistryPath = path.join(
    backendRoot,
    "src",
    "services",
    "ingestion",
    "extraction",
    "ingestionMimeRegistry.service.ts",
  );
  const extractionDispatchPath = path.join(
    backendRoot,
    "src",
    "services",
    "ingestion",
    "extraction",
    "extractionDispatch.service.ts",
  );
  const frontendOAuthCallbackPath = path.join(
    backendRoot,
    "..",
    "frontend",
    "src",
    "components",
    "auth",
    "OAuthCallback.jsx",
  );
  const frontendIntegrationsHookPath = path.join(
    backendRoot,
    "..",
    "frontend",
    "src",
    "hooks",
    "useIntegrationStatus.js",
  );
  const frontendChatPath = path.join(
    backendRoot,
    "..",
    "frontend",
    "src",
    "components",
    "chat",
    "v2",
    "ChatInterfaceV2.impl.js",
  );

  const controllerText = readFileSafe(controllerPath);
  const routesText = readFileSafe(routesPath);
  const queueText = readFileSafe(queuePath);
  const workerText = readFileSafe(workerPath);
  const handlerText = readFileSafe(handlerPath);
  const turnRouterText = readFileSafe(turnRouterPath);
  const mimeRegistryText = readFileSafe(mimeRegistryPath);
  const extractionDispatchText = readFileSafe(extractionDispatchPath);
  const frontendOAuthCallbackText = readFileSafe(frontendOAuthCallbackPath);
  const frontendIntegrationsHookText = readFileSafe(frontendIntegrationsHookPath);
  const frontendChatText = readFileSafe(frontendChatPath);

  checks.push({
    id: "no_wildcard_postmessage",
    severity: "high",
    weight: 20,
    pass: !/postMessage\([^,]+,\s*['"]\*['"]\)/.test(controllerText),
    detail: "OAuth callback must not use postMessage targetOrigin='*'.",
  });

  checks.push({
    id: "no_raw_error_leakage",
    severity: "high",
    weight: 20,
    pass:
      !/\be\?\.message\b/.test(routesText) &&
      !/\berr\?\.message\b/.test(routesText) &&
      !/\be\?\.message\b/.test(controllerText),
    detail: "Integrations routes/controller must not return raw exception messages.",
  });

  checks.push({
    id: "oauth_callback_no_localstorage_fallback",
    severity: "high",
    weight: 20,
    pass: !/koda_oauth_complete/.test(controllerText),
    detail:
      "OAuth callback page must not use localStorage fallback for completion signaling.",
  });

  checks.push({
    id: "frontend_oauth_callback_no_url_token_ingest",
    severity: "high",
    weight: 20,
    pass:
      !/searchParams\.get\(['"]accessToken['"]\)/.test(frontendOAuthCallbackText) &&
      !/searchParams\.get\(['"]refreshToken['"]\)/.test(frontendOAuthCallbackText) &&
      !/localStorage\.setItem\(['"]accessToken['"]/.test(frontendOAuthCallbackText) &&
      !/localStorage\.setItem\(['"]refreshToken['"]/.test(frontendOAuthCallbackText),
    detail:
      "Frontend OAuth callback must not read tokens from URL query or write auth tokens to localStorage.",
  });

  checks.push({
    id: "frontend_oauth_completion_no_localstorage_signal",
    severity: "medium",
    weight: 10,
    pass: !/koda_oauth_complete/.test(frontendIntegrationsHookText),
    detail:
      "Frontend integrations OAuth completion flow must not rely on localStorage cross-window signaling.",
  });

  checks.push({
    id: "frontend_oauth_message_origin_validation",
    severity: "high",
    weight: 15,
    pass:
      /trustedOrigins\.has\(/.test(frontendIntegrationsHookText) &&
      /connectorMessageOrigins\.has\(/.test(frontendChatText),
    detail:
      "OAuth completion messages must enforce trusted origin checks in integrations and chat surfaces.",
  });

  checks.push({
    id: "editor_mode_blocks_connector_routing",
    severity: "high",
    weight: 20,
    pass:
      /viewerMode\s*===\s*["']editor["']/.test(turnRouterText) &&
      /if\s*\(\s*viewerMode\s*===\s*["']editor["']\s*\)\s*\{\s*return\s*\{\s*route:\s*["']KNOWLEDGE["']/s.test(
        turnRouterText,
      ),
    detail:
      "Editor mode must not execute connector actions; routing must stay in KNOWLEDGE/editor lane.",
  });

  checks.push({
    id: "connector_mime_extractability_contract",
    severity: "high",
    weight: 20,
    pass:
      /CONNECTOR_MIMES/.test(mimeRegistryText) &&
      /message\/rfc822/.test(mimeRegistryText) &&
      /application\/x-slack-message/.test(mimeRegistryText) &&
      /CONNECTOR_MIMES\.includes\(normalizedMime\)/.test(extractionDispatchText),
    detail:
      "Connector-ingested MIME types must be extraction-supported to avoid ingestion pipeline failures.",
  });

  checks.push({
    id: "no_console_runtime_paths",
    severity: "medium",
    weight: 15,
    pass:
      !/console\.(log|warn|error)\(/.test(queueText) &&
      !/console\.(log|warn|error)\(/.test(workerText) &&
      !/console\.(log|warn|error)\(/.test(handlerText) &&
      !/console\.(log|warn|error)\(/.test(controllerText),
    detail: "Runtime integrations paths should use structured logger.",
  });

  const requiredTests = [
    path.join(backendRoot, "src", "controllers", "integrations.controller.test.ts"),
    path.join(
      backendRoot,
      "src",
      "services",
      "connectors",
      "integrationRuntimePolicy.service.test.ts",
    ),
    path.join(backendRoot, "src", "services", "chat", "turnRouter.service.test.ts"),
    path.join(
      backendRoot,
      "src",
      "services",
      "ingestion",
      "extraction",
      "__tests__",
      "ingestionMimeRegistry.service.test.ts",
    ),
    path.join(
      backendRoot,
      "src",
      "services",
      "ingestion",
      "extraction",
      "__tests__",
      "extractionDispatch.fallback.test.ts",
    ),
  ];
  checks.push({
    id: "critical_tests_present",
    severity: "medium",
    weight: 10,
    pass: requiredTests.every((testPath) => fs.existsSync(testPath)),
    detail: "Required integrations runtime tests must exist.",
  });

  const jestCli = path.join(backendRoot, "node_modules", "jest", "bin", "jest.js");
  const testCmd = await runCommand(
    process.execPath,
    [
      jestCli,
      "--config",
      "jest.config.cjs",
      "--runInBand",
      "--runTestsByPath",
      "src/controllers/integrations.controller.test.ts",
      "src/services/connectors/integrationRuntimePolicy.service.test.ts",
      "src/services/chat/handlers/connectorTurn.handler.test.ts",
      "src/services/core/handlers/connectorHandler.service.test.ts",
      "src/services/connectors/slack/slackEvents.controller.test.ts",
      "src/services/chat/turnRouter.service.test.ts",
      "src/services/ingestion/extraction/__tests__/ingestionMimeRegistry.service.test.ts",
      "src/services/ingestion/extraction/__tests__/extractionDispatch.fallback.test.ts",
    ],
    backendRoot,
  );

  checks.push({
    id: "runtime_test_pack_passes",
    severity: "high",
    weight: 35,
    pass: testCmd.ok,
    detail: testCmd.ok
      ? "Target runtime integrations test pack passed."
      : `Test pack failed (exit=${testCmd.code}).`,
    stderrTail: testCmd.stderr.split("\n").slice(-12).join("\n"),
  });

  const failedWeight = checks
    .filter((check) => !check.pass)
    .reduce((sum, check) => sum + check.weight, 0);
  const finalScore = Math.max(0, 100 - failedWeight);
  const finalGrade = gradeFromScore(finalScore);
  const hardFail = checks.some(
    (check) => !check.pass && check.severity === "high",
  );

  const report = {
    generatedAt: new Date().toISOString(),
    runtimeMs: Date.now() - startedAt,
    finalScore,
    finalGrade,
    verdict: finalScore >= 90 && !hardFail ? "ready" : "needs_work",
    checks,
  };

  const outDir = path.join(backendRoot, "reports", "integrations");
  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, "integration-runtime-grade.json");
  const mdPath = path.join(outDir, "integration-runtime-grade.md");
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(mdPath, renderMarkdown(report));

  console.log(
    `[integration-runtime] finalScore=${report.finalScore} grade=${report.finalGrade} verdict=${report.verdict}`,
  );
  console.log(
    `[integration-runtime] json=${path.relative(backendRoot, jsonPath)}`,
  );
  console.log(`[integration-runtime] md=${path.relative(backendRoot, mdPath)}`);

  if (args.strict && (report.finalScore < 90 || hardFail)) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(
    `[integration-runtime] failed: ${String(error?.message || error)}`,
  );
  process.exit(1);
});
