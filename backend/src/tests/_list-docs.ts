import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({
    where: { email: 'test@koda.com' },
    select: { id: true, email: true },
  });
  if (!user) {
    console.log('User not found');
    return;
  }
  console.log('User:', user.id);

  const docs = await prisma.document.findMany({
    where: { userId: user.id },
    select: { id: true, filename: true, mimeType: true, status: true, createdAt: true, fileSize: true },
    orderBy: { createdAt: 'desc' },
  });

  console.log(`\nDocuments (${docs.length}):`);
  for (const d of docs) {
    const sizeKb = d.fileSize ? Math.round(d.fileSize / 1024) : 0;
    console.log(`  ${d.id.slice(0, 12)}  ${String(d.filename || '(encrypted)').padEnd(45)}  [${d.mimeType.padEnd(50)}]  ${d.status.padEnd(8)}  ${sizeKb}KB`);
  }

  // Highlight DOCX and XLSX
  const docx = docs.filter(d => d.mimeType.includes('wordprocessing') || (d.filename || '').endsWith('.docx'));
  const xlsx = docs.filter(d => d.mimeType.includes('spreadsheet') || d.mimeType.includes('excel') || (d.filename || '').endsWith('.xlsx') || (d.filename || '').endsWith('.xls'));

  console.log(`\n--- DOCX files (${docx.length}) ---`);
  for (const d of docx) console.log(`  ${d.id}  ${d.filename}`);

  console.log(`\n--- XLSX/XLS files (${xlsx.length}) ---`);
  for (const d of xlsx) console.log(`  ${d.id}  ${d.filename}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => { console.error(e); prisma.$disconnect(); });
