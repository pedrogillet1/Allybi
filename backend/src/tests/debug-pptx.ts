import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const AdmZip = require('adm-zip');

const prisma = new PrismaClient();

async function debugPptx() {
  const doc = await prisma.document.findFirst({
    where: { filename: 'Real-Estate-Empreendimento-Parque-Global.pptx' }
  });

  if (!doc) {
    console.log('Document not found');
    return;
  }

  const { downloadFile } = await import('../services/s3Storage.service');
  const result = await downloadFile(doc.encryptedFilename);
  const fileBuffer = Array.isArray(result) ? result[0] : result;

  console.log('Analyzing PPTX structure...\n');

  const zip = new AdmZip(fileBuffer);
  const entries = zip.getEntries();

  // List all slide files
  const slides = entries.filter((e: any) => e.entryName.match(/ppt\/slides\/slide\d+\.xml$/));
  console.log('Found', slides.length, 'slides\n');

  // Check first slide content
  const slide1 = slides[0];
  if (slide1) {
    const content = slide1.getData().toString('utf8');
    console.log('=== Slide 1 XML (first 2000 chars) ===');
    console.log(content.substring(0, 2000));
    console.log('\n...\n');

    // Check for text elements
    const hasText = content.includes('<a:t>');
    const hasImage = content.includes('<a:blip');
    console.log('Has text (<a:t>):', hasText);
    console.log('Has images (<a:blip):', hasImage);
  }

  // Check for slide images in media folder
  const media = entries.filter((e: any) => e.entryName.startsWith('ppt/media/'));
  console.log('\nMedia files:', media.length);
  media.slice(0, 5).forEach((m: any) => console.log('  -', m.entryName));

  await prisma.$disconnect();
}

debugPptx().catch(console.error);
