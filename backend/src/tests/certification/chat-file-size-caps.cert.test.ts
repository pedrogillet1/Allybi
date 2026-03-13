import fs from "fs";
import path from "path";

import { CHAT_FILE_CAPS } from "../../../scripts/chat-module/chatFileCaps.shared";

describe("Certification: chat file size caps", () => {
  test("chat owner files stay under their caps", () => {
    const failures = CHAT_FILE_CAPS.map(([relativePath, maxLines]) => {
      const source = fs.readFileSync(
        path.resolve(process.cwd(), relativePath),
        "utf8",
      );
      const lines = source.split("\n").length;
      return lines > maxLines ? `${relativePath}:${lines}>${maxLines}` : null;
    }).filter(Boolean);

    expect(failures).toEqual([]);
  });
});
