import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

async function main() {
  // Get user
  const user = await p.user.findFirst({
    where: { email: "test@allybi.com" },
    select: { id: true },
  });
  if (!user) {
    console.log("User not found");
    return;
  }
  console.log("User:", user.id);

  // List all docs
  const docs = await p.document.findMany({
    where: { userId: user.id },
    select: { id: true, filename: true, status: true },
    orderBy: { filename: "asc" },
  });
  console.log("Total docs:", docs.length);
  for (const d of docs) {
    const fn = (d.filename || "?").toLowerCase();
    const flag =
      fn.includes("decreto") ||
      fn.includes("8772") ||
      fn.includes("genetic") ||
      fn.includes("heritage") ||
      fn.includes("biodiv") ||
      fn.includes("cgen") ||
      fn.includes("br3")
        ? " ***"
        : "";
    console.log(
      `  ${d.id.slice(0, 12)} | ${(d.status || "?").padEnd(10)} | ${d.filename}${flag}`
    );
  }

  // Check Cadastro Unico chunk content via decryption test
  const cadChunks = await p.documentChunk.count({
    where: { documentId: "1e4249a2-088c-4e70-99f5-94535455af84" },
  });
  console.log("\nCadastro Unico chunk count:", cadChunks);

  await p.$disconnect();
}

main().catch(console.error);
