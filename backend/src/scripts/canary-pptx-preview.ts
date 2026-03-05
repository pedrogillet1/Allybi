/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";

const backendSrcRoot = path.resolve(__dirname, "..");
const requiredFiles = [
  "services/preview/previewProviderRouter.ts",
  "services/preview/previewPdfGenerator.service.ts",
  "services/preview/pptxSlideImageGenerator.service.ts",
  "controllers/document.controller.ts",
];

const missing = requiredFiles.filter(
  (relativePath) =>
    !fs.existsSync(path.join(backendSrcRoot, relativePath)),
);

if (missing.length > 0) {
  console.error("[canary:pptx] missing required preview files:");
  for (const relativePath of missing) {
    console.error(`- ${relativePath}`);
  }
  process.exit(1);
}

console.log(
  `[canary:pptx] PASS checked ${requiredFiles.length} required preview files.`,
);
