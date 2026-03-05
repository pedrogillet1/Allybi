#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { join } from "node:path";

function extractSemver(raw) {
  const text = String(raw || "").trim();
  const match = text.match(/(\d+\.\d+\.\d+)/);
  return match ? match[1] : null;
}

function main() {
  const packageJsonPath = join(process.cwd(), "package.json");
  const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  const clientRaw = pkg?.dependencies?.["@prisma/client"];
  const prismaRaw = pkg?.devDependencies?.prisma;

  const client = extractSemver(clientRaw);
  const prisma = extractSemver(prismaRaw);

  if (!clientRaw || !prismaRaw || !client || !prisma) {
    throw new Error(
      "[prisma:deps:check] Missing or invalid prisma/@prisma/client declarations.",
    );
  }

  if (client !== prisma) {
    throw new Error(
      `[prisma:deps:check] version mismatch: @prisma/client=${clientRaw} vs prisma=${prismaRaw}.`,
    );
  }

  console.log(`[prisma:deps:check] OK (${client})`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
