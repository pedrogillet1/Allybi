/* eslint-disable no-console */
import fs from "fs";
import path from "path";

type StressUser = {
  id: string;
  email: string;
  createdAt: string;
};

function parseUserId(argv: string[]): string | null {
  const idx = argv.findIndex((arg) => arg === "--user-id");
  if (idx >= 0 && argv[idx + 1]) return argv[idx + 1];
  return null;
}

function main(): void {
  const explicitUserId = parseUserId(process.argv.slice(2));
  const userId = explicitUserId || process.env.STRESS_TEST_USER_ID || "stress-user-local";

  const profile: StressUser = {
    id: userId,
    email: `${userId}@allybi.local`,
    createdAt: new Date().toISOString(),
  };

  const outPath = path.join("/tmp", "allybi-stress-user.json");
  fs.writeFileSync(outPath, JSON.stringify(profile, null, 2), "utf8");

  console.log(`[stress-test:setup] user ready: ${profile.id}`);
  console.log(`[stress-test:setup] profile: ${outPath}`);
}

main();
