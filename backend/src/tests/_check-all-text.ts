import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({
    where: { email: "test@koda.com" },
    select: { id: true },
  });
  if (!user) {
    console.log("No user");
    return;
  }

  const docs = await prisma.document.findMany({
    where: { userId: user.id },
    select: {
      id: true,
      filename: true,
      rawText: true,
      previewText: true,
      status: true,
    },
  });

  let withText = 0;
  let withoutText = 0;

  for (const d of docs) {
    const hasRaw = d.rawText && d.rawText.length > 0;
    const hasPreview = d.previewText && d.previewText.length > 0;
    if (hasRaw || hasPreview) {
      withText++;
      console.log(
        "HAS TEXT:",
        d.filename,
        "| raw:",
        d.rawText?.length || 0,
        "| preview:",
        d.previewText?.length || 0,
      );
    } else {
      withoutText++;
    }
  }

  console.log(
    "\nTotal:",
    docs.length,
    "| With text:",
    withText,
    "| Without text:",
    withoutText,
  );

  // Also check metadata extractedText
  const metas = await prisma.documentMetadata.findMany({
    where: { documentId: { in: docs.map((d) => d.id) } },
    select: {
      documentId: true,
      extractedText: true,
      extractedTextEncrypted: true,
    },
  });

  let metaWithText = 0;
  for (const m of metas) {
    const hasExtracted =
      (m.extractedText && m.extractedText.length > 0) ||
      (m.extractedTextEncrypted && m.extractedTextEncrypted.length > 0);
    if (hasExtracted) {
      metaWithText++;
      const doc = docs.find((d) => d.id === m.documentId);
      console.log(
        "META HAS TEXT:",
        doc?.filename,
        "| extracted:",
        m.extractedText?.length || 0,
        "| encrypted:",
        m.extractedTextEncrypted?.length || 0,
      );
    }
  }
  console.log("Metadata with text:", metaWithText, "/", metas.length);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
  });
