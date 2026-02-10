const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const ids = ["b22b3447-42be-4cae-89f2-7e4aab5bd54a","a62c29ca-3091-4bed-afe9-6e5f87947e48"];
  for (const id of ids) {
    const doc = await p.document.findUnique({ where: { id } });
    if (!doc) { console.log(id, "NOT FOUND"); continue; }
    const fn = doc.filename || doc.encryptedFilename?.split("/").pop();
    console.log("---", fn, "---");
    console.log("  status:", doc.status);
    console.log("  hash:", doc.contentHash || "null");
    console.log("  created:", doc.createdAt);
    console.log("  updated:", doc.updatedAt);

    const meta = await p.documentMetadata.findUnique({ where: { documentId: id } });
    if (meta) {
      const keys = Object.keys(meta).filter(k => meta[k] != null && k !== "documentId");
      for (const k of keys) {
        const v = String(meta[k]);
        if (v.length > 200) console.log("  meta." + k + ":", v.slice(0, 200) + "...");
        else console.log("  meta." + k + ":", v);
      }
    } else {
      console.log("  NO METADATA RECORD");
    }

    const chunks = await p.documentChunk.count({ where: { documentId: id } });
    console.log("  chunks:", chunks);
    console.log();
  }
  await p.$disconnect();
})();
