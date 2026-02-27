import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const db = new PrismaClient();
const userId = "17a07d7e-1db5-4a0b-b0e7-5f8672a05890"; // test@allybi.com

const docs = await db.$queryRawUnsafe(`
  SELECT d.id, d."displayTitle", d.filename, d.status, d."fileSize", d."mimeType",
         d."chunksCount", d."createdAt",
         COUNT(dc.id)::int as actual_chunks,
         (SELECT substring(dc2.text, 1, 150)
          FROM document_chunks dc2
          WHERE dc2."documentId" = d.id
          ORDER BY dc2."chunkIndex" ASC LIMIT 1) as first_chunk_preview
  FROM documents d
  LEFT JOIN document_chunks dc ON dc."documentId" = d.id
  WHERE d."userId" = $1
  GROUP BY d.id
  ORDER BY d."fileSize" DESC
`, userId);

console.log("=== test@allybi.com DOCUMENT AUDIT ===");
console.log(`Total documents: ${docs.length}\n`);

console.log("# Status  Chunks  Size(bytes)  MIME                          First chunk preview");
console.log("-".repeat(150));
let idx = 0;
for (const d of docs) {
  idx++;
  const mime = (d.mimeType || "?").substring(0, 28).padEnd(28);
  const preview = (d.first_chunk_preview || "(no chunks)").replace(/\n/g, " ").substring(0, 70);
  console.log(
    `${String(idx).padStart(2)} ${(d.status||"?").padEnd(7)} ${String(d.actual_chunks).padStart(5)}  ${String(Number(d.fileSize)).padStart(11)}  ${mime}  ${preview}`
  );
}

// test1 file sizes from local disk
const test1Dir = "/Users/pg/Desktop/test1";
const test1Files = fs.readdirSync(test1Dir)
  .filter(f => f !== ".DS_Store")
  .map(f => ({
    name: f,
    size: fs.statSync(path.join(test1Dir, f)).size
  }))
  .sort((a, b) => b.size - a.size);

console.log(`\n\n=== SIZE-BASED MATCHING (${test1Files.length} local files -> ${docs.length} DB docs) ===\n`);

const matched = new Set();
let okCount = 0, failCount = 0, noMatchCount = 0, zeroChunkCount = 0;
const results = [];

for (const f of test1Files) {
  const candidates = docs.filter(d => Number(d.fileSize) === f.size && !matched.has(d.id));
  if (candidates.length >= 1) {
    const d = candidates[0];
    matched.add(d.id);
    let icon;
    if (d.status === "failed") { icon = "FAIL"; failCount++; }
    else if (d.status === "ready" && d.actual_chunks > 0) { icon = `OK ${d.actual_chunks}ch`; okCount++; }
    else if (d.status === "ready" && d.actual_chunks === 0) { icon = "0 CHUNKS"; zeroChunkCount++; }
    else { icon = d.status; }
    const preview = (d.first_chunk_preview || "").replace(/\n/g, " ").substring(0, 50);
    results.push({ icon, name: f.name, size: f.size, chunks: d.actual_chunks, status: d.status, preview });
  } else {
    noMatchCount++;
    results.push({ icon: "NO MATCH", name: f.name, size: f.size, chunks: 0, status: "-", preview: "" });
  }
}

for (const r of results) {
  console.log(`  [${r.icon.padEnd(10)}] ${r.name}`);
  console.log(`              size=${r.size} bytes | chunks=${r.chunks} | status=${r.status}`);
  if (r.preview) console.log(`              preview: ${r.preview}`);
}

console.log(`\n--- SUMMARY ---`);
console.log(`OK (ready + chunks): ${okCount}`);
console.log(`FAILED:              ${failCount}`);
console.log(`Zero chunks:         ${zeroChunkCount}`);
console.log(`Not found in DB:     ${noMatchCount}`);
console.log(`Total test1 files:   ${test1Files.length}`);

// Unmatched DB docs
const unmatched = docs.filter(d => !matched.has(d.id));
if (unmatched.length > 0) {
  console.log(`\nDB docs NOT matching any test1 file (${unmatched.length}):`);
  for (const d of unmatched) {
    const preview = (d.first_chunk_preview || "").replace(/\n/g, " ").substring(0, 60);
    console.log(`  id=${d.id} size=${Number(d.fileSize)} chunks=${d.actual_chunks} status=${d.status}`);
    console.log(`    preview: ${preview}`);
  }
}

await db.$disconnect();
