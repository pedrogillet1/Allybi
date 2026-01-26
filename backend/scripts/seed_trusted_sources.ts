import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const sources = [
    { domain: 'wikipedia.org', name: 'Wikipedia', category: 'encyclopedia', priority: 8 },
    { domain: 'britannica.com', name: 'Britannica', category: 'encyclopedia', priority: 9 },
    { domain: 'scholar.google.com', name: 'Google Scholar', category: 'academic', priority: 10 },
    { domain: 'nature.com', name: 'Nature', category: 'academic', priority: 9 },
    { domain: 'sciencedirect.com', name: 'ScienceDirect', category: 'academic', priority: 8 },
    { domain: 'pubmed.ncbi.nlm.nih.gov', name: 'PubMed', category: 'academic', priority: 9 },
    { domain: 'reuters.com', name: 'Reuters', category: 'news', priority: 8 },
    { domain: 'apnews.com', name: 'AP News', category: 'news', priority: 8 },
  ];

  console.log('Seeding trusted sources...');

  for (const source of sources) {
    await prisma.trustedSource.upsert({
      where: { domain: source.domain },
      update: source,
      create: source,
    });
    console.log(`  ✓ ${source.name} (${source.domain})`);
  }

  const count = await prisma.trustedSource.count();
  console.log(`\nTotal trusted sources: ${count}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
