import fs from "fs";
import path from "path";

type FileCap = {
  maxLines: number;
  kind: string;
};

function walk(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
      continue;
    }
    if (!entry.isFile()) continue;
    if (!fullPath.endsWith(".ts")) continue;
    if (fullPath.endsWith(".test.ts")) continue;
    files.push(fullPath);
  }
  return files;
}

function resolveCap(relativePath: string): FileCap {
  const normalized = relativePath.replace(/\\/g, "/");
  const base = path.basename(normalized);
  if (normalized.includes("/routes/")) {
    return { maxLines: 200, kind: "route" };
  }
  if (
    /(Orchestrator|Enforcer|Loader|Adapter|Bootstrap|Gateway|Generator)\.service\.ts$/.test(
      base,
    ) ||
    /(Orchestrator|Enforcer|Loader|Adapter|Bootstrap|Generator)\.ts$/.test(base)
  ) {
    return { maxLines: 450, kind: "orchestrator" };
  }
  if (/(Controller|Repository|Service|Store)\.ts$/.test(base)) {
    return { maxLines: 300, kind: "service" };
  }
  return { maxLines: 600, kind: "default" };
}

function main() {
  const root = path.resolve(process.cwd(), "src");
  const rows = walk(root)
    .map((filePath) => {
      const relativePath = path.relative(process.cwd(), filePath);
      const source = fs.readFileSync(filePath, "utf8");
      const lines = source.split("\n").length;
      const cap = resolveCap(relativePath);
      return {
        filePath: relativePath,
        lines,
        ...cap,
        overBy: Math.max(0, lines - cap.maxLines),
      };
    })
    .filter((row) => row.overBy > 0)
    .sort((a, b) => b.overBy - a.overBy || b.lines - a.lines);

  process.stdout.write(`file_cap_failures=${rows.length}\n`);
  for (const row of rows.slice(0, 200)) {
    process.stdout.write(
      `${row.lines}\t${row.maxLines}\t${row.kind}\t${row.filePath}\n`,
    );
  }
}

main();
