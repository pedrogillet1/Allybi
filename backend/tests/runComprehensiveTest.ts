/* eslint-disable no-console */
import { spawnSync } from "child_process";

type Suite = {
  name: string;
  script: string;
};

function runNpmScript(script: string): number {
  const result = spawnSync("npm", ["run", "-s", script], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) {
    console.error(
      `[test:comprehensive] failed to run ${script}: ${result.error.message}`,
    );
    return 1;
  }
  return result.status ?? 1;
}

function suites(quick: boolean): Suite[] {
  const quickSuites: Suite[] = [
    { name: "Integration", script: "test:integration" },
    { name: "Routing", script: "test:routing" },
    { name: "Behavior", script: "test:behavior" },
    { name: "Generation", script: "test:generation" },
    { name: "Validation", script: "test:validation" },
    { name: "Conversation Quick", script: "test:conversation:quick" },
  ];

  if (quick) return quickSuites;

  return [
    ...quickSuites,
    { name: "Functionality", script: "test:functionality" },
    { name: "Chat Complete", script: "test:chat" },
    { name: "Stress Quick", script: "stress-test:quick" },
    { name: "Stress Load", script: "stress-test:load" },
    { name: "Conversation Full", script: "test:conversation" },
  ];
}

function main(): void {
  const quick =
    process.env.QUICK_MODE === "true" || process.argv.includes("--quick");
  const selected = suites(quick);
  let failures = 0;

  console.log(
    `[test:comprehensive] mode=${quick ? "quick" : "full"} suites=${selected.length}`,
  );

  for (const suite of selected) {
    console.log(`\n=== ${suite.name} (${suite.script}) ===`);
    const status = runNpmScript(suite.script);
    if (status !== 0) {
      failures += 1;
      console.log(`FAIL (${status}) ${suite.script}`);
    } else {
      console.log(`PASS ${suite.script}`);
    }
  }

  console.log(
    `\n[test:comprehensive] failures=${failures} total=${selected.length}`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main();
