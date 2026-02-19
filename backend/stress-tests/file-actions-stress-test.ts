/* eslint-disable no-console */
import path from "path";
import {
  analyzeMessageToPlan,
  clearCaches,
} from "../src/services/editing/intentRuntime";

type Domain = "docx" | "excel";

type Scenario = {
  message: string;
  domain: Domain;
  language: "en" | "pt";
  viewerContext: Record<string, unknown>;
};

const SCENARIOS: Scenario[] = [
  {
    message: "Center the title",
    domain: "docx",
    language: "en",
    viewerContext: {
      selection: {
        ranges: [{ paragraphId: "docx:p:1", text: "My Title" }],
      },
    },
  },
  {
    message: "Transforme os bullets selecionados em um único parágrafo",
    domain: "docx",
    language: "pt",
    viewerContext: {
      selection: {
        ranges: [
          { paragraphId: "docx:p:10", text: "Item A" },
          { paragraphId: "docx:p:11", text: "Item B" },
        ],
      },
    },
  },
  {
    message: "Set formula =SUM(D5:D8) in D9",
    domain: "excel",
    language: "en",
    viewerContext: {
      sheetName: "SUMMARY 1",
    },
  },
  {
    message: "Add bullets to paragraphs 2-4",
    domain: "docx",
    language: "en",
    viewerContext: {
      selection: {
        ranges: [
          { paragraphId: "docx:p:2", text: "Para 2" },
          { paragraphId: "docx:p:3", text: "Para 3" },
          { paragraphId: "docx:p:4", text: "Para 4" },
        ],
      },
    },
  },
];

function runIterations(iterations: number): { ok: number; failed: number } {
  let ok = 0;
  let failed = 0;

  for (let i = 0; i < iterations; i += 1) {
    const scenario = SCENARIOS[i % SCENARIOS.length];
    const result = analyzeMessageToPlan({
      message: scenario.message,
      domain: scenario.domain,
      language: scenario.language,
      viewerContext: scenario.viewerContext,
    });

    if (
      result &&
      ((result.kind === "plan" &&
        Array.isArray(result.ops) &&
        result.ops.length > 0) ||
        result.kind === "clarification")
    ) {
      ok += 1;
    } else {
      failed += 1;
    }
  }

  return { ok, failed };
}

function main(): void {
  if (path.basename(process.cwd()) === "stress-tests") {
    process.chdir(path.resolve(process.cwd(), ".."));
  }
  process.env.KODA_EDITING_ALLOW_FILESYSTEM_FALLBACK = "true";
  clearCaches();

  const args = new Set(process.argv.slice(2));
  const quickMode = args.has("--quick");
  const loadOnlyMode = args.has("--load-only");

  const start = Date.now();
  if (quickMode) {
    const result = runIterations(400);
    const elapsedMs = Date.now() - start;
    console.log(
      `[stress-test:quick] ok=${result.ok} failed=${result.failed} elapsedMs=${elapsedMs}`,
    );
    process.exit(result.failed === 0 ? 0 : 1);
  }

  if (loadOnlyMode) {
    const result = runIterations(2500);
    const elapsedMs = Date.now() - start;
    console.log(
      `[stress-test:load] ok=${result.ok} failed=${result.failed} elapsedMs=${elapsedMs}`,
    );
    process.exit(result.failed === 0 ? 0 : 1);
  }

  const first = runIterations(800);
  const second = runIterations(3200);
  const elapsedMs = Date.now() - start;
  const totalFailed = first.failed + second.failed;
  const totalOk = first.ok + second.ok;
  console.log(
    `[stress-test] ok=${totalOk} failed=${totalFailed} elapsedMs=${elapsedMs}`,
  );
  process.exit(totalFailed === 0 ? 0 : 1);
}

main();
