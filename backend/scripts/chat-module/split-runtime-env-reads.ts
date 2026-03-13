import fs from "fs";
import path from "path";

type Replacement = {
  file: string;
  find: RegExp;
  replace: string;
  importLine: string;
};

const REPLACEMENTS: Replacement[] = [
  {
    file: "src/modules/chat/application/handlers/connectorTurn.handler.ts",
    find: /function resolveConnectorChatTimeoutMs\(\): number \{[\s\S]*?\n\}/,
    replace:
      'function resolveConnectorChatTimeoutMs(): number {\n  return resolveConnectorTurnConfig().timeoutMs;\n}',
    importLine:
      'import { resolveConnectorTurnConfig } from "../../config/chatRuntimeConfig";',
  },
  {
    file: "src/modules/chat/runtime/truncationClassifier.ts",
    find:
      /export function isSemanticTruncationV2Enabled\([\s\S]*?\n\}/,
    replace:
      "export function isSemanticTruncationV2Enabled(\n  env?: NodeJS.ProcessEnv,\n): boolean {\n  return resolveTruncationRuntimeConfig(env).semanticTruncationV2;\n}",
    importLine:
      'import { resolveTruncationRuntimeConfig } from "../config/chatRuntimeConfig";',
  },
];

function ensureImport(source: string, importLine: string): string {
  if (source.includes(importLine)) return source;
  const firstImport = source.indexOf("import ");
  if (firstImport < 0) return `${importLine}\n${source}`;
  return `${source.slice(0, firstImport)}${importLine}\n${source.slice(firstImport)}`;
}

function main() {
  let changed = 0;
  for (const entry of REPLACEMENTS) {
    const filePath = path.resolve(process.cwd(), entry.file);
    if (!fs.existsSync(filePath)) continue;
    const current = fs.readFileSync(filePath, "utf8");
    if (!entry.find.test(current)) continue;
    const replaced = ensureImport(
      current.replace(entry.find, entry.replace),
      entry.importLine,
    );
    if (replaced === current) continue;
    fs.writeFileSync(filePath, replaced);
    changed += 1;
  }
  process.stdout.write(`chat env codemod updated ${changed} file(s)\n`);
}

main();
