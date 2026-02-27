import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

const docs = await db.$queryRawUnsafe(`
  SELECT d.id, d."displayTitle", d.filename, d.status, d."fileSize", d."mimeType",
         d."chunksCount",
         COUNT(dc.id)::int as actual_chunks
  FROM documents d
  LEFT JOIN document_chunks dc ON dc."documentId" = d.id
  WHERE d."userId" = $1
  GROUP BY d.id
  ORDER BY d.filename
`, "cf3e82c3-48fb-4bd5-a43c-6107b8942b59");

console.log("Status       Stored  Actual  Size(KB)   Filename");
console.log("-".repeat(110));

let totalStored = 0, totalActual = 0, readyCount = 0, failedCount = 0;
const zeroChunkDocs = [];
const mismatchDocs = [];

for (const d of docs) {
  const sizeKB = ((Number(d.fileSize) || 0) / 1024).toFixed(1);
  const name = d.displayTitle || d.filename;
  const stored = d.chunksCount ?? 0;
  const actual = d.actual_chunks;
  const flag = stored !== actual ? " *** MISMATCH" : "";

  console.log(
    `${(d.status || "?").padEnd(12)} ${String(stored).padStart(6)}  ${String(actual).padStart(6)}  ${sizeKB.padStart(8)}  ${name}${flag}`
  );

  totalStored += stored;
  totalActual += actual;
  if (d.status === "ready") readyCount++;
  if (d.status === "failed") failedCount++;
  if (actual === 0 && d.status === "ready") zeroChunkDocs.push(name);
  if (stored !== actual) mismatchDocs.push({ name, stored, actual });
}

console.log("-".repeat(110));
console.log(`Total: ${docs.length} docs | Ready: ${readyCount} | Failed: ${failedCount}`);
console.log(`Chunks — stored total: ${totalStored} | actual total: ${totalActual}`);

if (zeroChunkDocs.length > 0) {
  console.log(`\nZERO-CHUNK "ready" docs (${zeroChunkDocs.length}):`);
  zeroChunkDocs.forEach(n => console.log(`   - ${n}`));
}

if (mismatchDocs.length > 0) {
  console.log(`\nMISMATCH docs (${mismatchDocs.length}):`);
  mismatchDocs.forEach(m => console.log(`   - ${m.name}: stored=${m.stored} actual=${m.actual}`));
}

// Now match against test1 files
const test1Files = [
  "20260121 BESS - Preliminary Assessment of the Brazilian Market Potential 2.pdf",
  "214 Move Out Statement (2).pdf",
  "AÉREO ALVARO + 2.pdf",
  "ARM Montana & Arizona Summary_3.12.25.pdf",
  "ATTBill_4977_Dec2023.pdf",
  "Anotações Aula 2 (1).pdf",
  "Breguet.pdf",
  "Certidao de nascimento Pedro.pdf",
  "Comprovante-LATAM-LA9578465UHXQ.pdf",
  "FaturaVivo_899968637569_022026.pdf",
  "Mayfair Group_Investor Deck 2025.pdf",
  "OBA_marketing_servicos (1).pdf",
  "Pedro-Gillet.pdf",
  "RF2_Gillet_Neto_Paulo.pdf",
  "SEVIS_RTI.pdf",
  "TRABALHO FINAL (1).PNG",
  "Trabalho projeto .pdf",
  "certidao_quitacao_458712200159.pdf",
  "exames-5.pdf",
  "guarda bens self storage.pptx"
];

console.log("\n\n=== TEST1 FILES MATCHING ===");
console.log(`Looking for ${test1Files.length} files from ~/Desktop/test1/\n`);

for (const f of test1Files) {
  // Normalize: replace spaces/special chars with underscores for matching
  const sanitized = f.replace(/[^a-zA-Z0-9._-]/g, "_");
  const match = docs.find(d => {
    const docName = (d.displayTitle || d.filename || "").toLowerCase();
    const fLower = f.toLowerCase();
    const sLower = sanitized.toLowerCase();
    return docName === fLower || docName === sLower ||
           docName.includes(fLower.replace(/\.[^.]+$/, "")) ||
           docName.includes(sLower.replace(/\.[^.]+$/, ""));
  });

  if (match) {
    const chunks = match.actual_chunks;
    const status = match.status;
    const icon = status === "ready" && chunks > 0 ? "OK" : status === "failed" ? "FAIL" : chunks === 0 ? "NO CHUNKS" : "?";
    console.log(`[${icon.padEnd(9)}] ${f}`);
    console.log(`           -> ${match.displayTitle || match.filename} | status=${status} | chunks=${chunks}`);
  } else {
    console.log(`[NOT FOUND] ${f}`);
  }
}

await db.$disconnect();
