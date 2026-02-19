import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const docId = "4f7b3fa7-85f4-4a38-85b7-f9128c849c48"; // DOCX
  const xlsxId = "0c01684e-e858-4218-8f01-9f50fae1ae38"; // XLSX

  for (const id of [docId, xlsxId]) {
    const doc = await prisma.document.findUnique({ where: { id } });
    if (!doc) {
      console.log(id + ": NOT FOUND");
      continue;
    }
    console.log("\n=== " + doc.filename + " ===");
    console.log("status:", doc.status);
    console.log(
      "rawText:",
      doc.rawText ? "[" + doc.rawText.length + " chars]" : "null",
    );
    console.log(
      "previewText:",
      doc.previewText ? "[" + doc.previewText.length + " chars]" : "null",
    );

    const meta = await prisma.documentMetadata.findUnique({
      where: { documentId: id },
    });
    if (meta) {
      console.log(
        "extractedText:",
        meta.extractedText
          ? "[" + meta.extractedText.length + " chars]"
          : "null",
      );
      console.log(
        "extractedTextEncrypted:",
        meta.extractedTextEncrypted
          ? "[" + meta.extractedTextEncrypted.length + " chars]"
          : "null",
      );
      console.log("language:", meta.language);

      // Check all non-null string fields
      for (const [k, v] of Object.entries(meta)) {
        if (
          v !== null &&
          typeof v === "string" &&
          v.length > 0 &&
          !["id", "documentId", "createdAt", "updatedAt"].includes(k)
        ) {
          if (v.length > 200) {
            console.log(
              "  " +
                k +
                ": [" +
                v.length +
                " chars] " +
                v.slice(0, 100) +
                "...",
            );
          } else {
            console.log("  " + k + ": " + v);
          }
        }
      }
    } else {
      console.log("NO METADATA");
    }
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
  });
