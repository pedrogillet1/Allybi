import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const AdmZip = require('adm-zip');
const xml2js = require('xml2js');

const prisma = new PrismaClient();

async function debugPptxParsing() {
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

  console.log('='.repeat(70));
  console.log('  DEBUGGING PPTX XML PARSING');
  console.log('='.repeat(70));

  const zip = new AdmZip(fileBuffer);
  const entries = zip.getEntries();

  // Get first slide
  const slide1Entry = entries.find((e: any) => e.entryName === 'ppt/slides/slide1.xml');
  if (!slide1Entry) {
    console.log('No slide1.xml found');
    return;
  }

  const slideXml = slide1Entry.getData().toString('utf8');

  // Parse with xml2js
  const parser = new xml2js.Parser();
  const parsed = await parser.parseStringPromise(slideXml);

  console.log('\n=== TOP LEVEL KEYS ===');
  console.log('Keys:', Object.keys(parsed));

  console.log('\n=== p:sld KEYS ===');
  if (parsed['p:sld']) {
    console.log('p:sld keys:', Object.keys(parsed['p:sld']));

    // Check for $, p:cSld
    if (parsed['p:sld']['p:cSld']) {
      console.log('\n=== p:cSld KEYS ===');
      console.log('p:cSld is array:', Array.isArray(parsed['p:sld']['p:cSld']));
      const cSld = parsed['p:sld']['p:cSld'][0] || parsed['p:sld']['p:cSld'];
      console.log('p:cSld keys:', Object.keys(cSld));

      if (cSld['p:spTree']) {
        console.log('\n=== p:spTree KEYS ===');
        const spTree = cSld['p:spTree'][0] || cSld['p:spTree'];
        console.log('p:spTree keys:', Object.keys(spTree));

        if (spTree['p:sp']) {
          console.log('\n=== p:sp (shapes) ===');
          console.log('Number of shapes:', spTree['p:sp'].length);

          // Check first shape
          const sp = spTree['p:sp'][0];
          console.log('First shape keys:', Object.keys(sp));

          if (sp['p:txBody']) {
            console.log('\n=== p:txBody FOUND! ===');
            const txBody = sp['p:txBody'][0] || sp['p:txBody'];
            console.log('txBody keys:', Object.keys(txBody));

            if (txBody['a:p']) {
              console.log('\n=== a:p (paragraphs) ===');
              const paragraphs = txBody['a:p'];
              console.log('Number of paragraphs:', paragraphs.length);

              // Check first paragraph
              const p = paragraphs[0];
              console.log('First paragraph keys:', Object.keys(p));

              if (p['a:r']) {
                console.log('\n=== a:r (runs) ===');
                const runs = p['a:r'];
                console.log('Number of runs:', runs?.length || 0);

                if (runs && runs.length > 0) {
                  const run = runs[0];
                  console.log('First run keys:', Object.keys(run));

                  if (run['a:t']) {
                    console.log('\n=== a:t (TEXT) FOUND! ===');
                    console.log('a:t value:', JSON.stringify(run['a:t']));
                  }
                }
              }
            }
          }
        }
      }
    }
  } else {
    console.log('NO p:sld key found! Top-level keys:', Object.keys(parsed));
  }

  await prisma.$disconnect();
}

debugPptxParsing().catch(console.error);
