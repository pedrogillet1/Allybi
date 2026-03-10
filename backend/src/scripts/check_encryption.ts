import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

async function main() {
  const user = await p.user.findFirst({
    where: { email: "test@allybi.com" },
    select: { id: true },
  });
  if (!user) { console.log("No user"); return; }

  // Get all docs with chunk stats
  const docs = await p.document.findMany({
    where: { userId: user.id },
    select: { id: true, filename: true, encryptedFilename: true, status: true, indexingState: true },
    orderBy: { createdAt: "desc" },
  });

  console.log("Doc ID        | Status     | IndexState | Chunks | Plain | Enc  | Filename");
  console.log("-".repeat(100));

  for (const d of docs) {
    const chunks = await p.documentChunk.findMany({
      where: { documentId: d.id },
      select: { text: true, textEncrypted: true },
    });
    const total = chunks.length;
    const plain = chunks.filter(c => c.text && c.text.trim()).length;
    const enc = chunks.filter(c => c.textEncrypted && c.textEncrypted.trim()).length;
    const name = d.encryptedFilename || d.filename || "?";
    const fn = name.toLowerCase();

    // Flag target docs
    const flag = (fn.includes("reserve") || fn.includes("trade_act") || fn.includes("trade act") ||
                  fn.includes("cadastro") || fn.includes("2101")) ? " <--" : "";

    console.log(
      `${d.id.slice(0,13)} | ${(d.status||"?").padEnd(10)} | ${(d.indexingState||"?").padEnd(10)} | ${String(total).padStart(6)} | ${String(plain).padStart(5)} | ${String(enc).padStart(4)} | ${name}${flag}`
    );
  }

  await p.$disconnect();
}

main().catch(console.error);
