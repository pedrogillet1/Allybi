import fs from "fs";
import path from "path";

import { CHAT_FILE_CAPS } from "./chatFileCaps.shared";

function main() {
  const failures = CHAT_FILE_CAPS.map(([relativePath, maxLines]) => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), relativePath),
      "utf8",
    );
    const lines = source.split("\n").length;
    return lines > maxLines ? `${relativePath}:${lines}>${maxLines}` : null;
  }).filter(Boolean);

  if (failures.length > 0) {
    process.stderr.write(`chat file caps exceeded:\n${failures.join("\n")}\n`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write("chat file caps ok\n");
}

main();
