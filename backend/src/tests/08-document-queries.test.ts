import prisma from '../config/database';

interface TestResult {
  test: string;
  passed: boolean;
  error?: string;
  duration: number;
  data?: any;
}

const results: TestResult[] = [];
const TEST_USER_ID = 'test-user-backend';

async function test_queryAllDocuments() {
  const start = Date.now();
  try {
    const documents = await prisma.document.findMany({
      where: {
        userId: TEST_USER_ID,
        status: { not: 'deleted' }
      },
      orderBy: { createdAt: 'desc' }
    });

    const passed = Array.isArray(documents) && documents.length > 0;
    results.push({
      test: 'queryAllDocuments',
      passed,
      duration: Date.now() - start,
      data: {
        count: documents.length,
        documents: documents.map(d => ({
          id: d.id,
          filename: d.filename,
          size: d.fileSize,
          type: d.mimeType,
          created: d.createdAt
        }))
      }
    });
  } catch (error: any) {
    results.push({
      test: 'queryAllDocuments',
      passed: false,
      error: error.message,
      duration: Date.now() - start
    });
  }
}

async function test_queryDocumentContent() {
  const start = Date.now();
  try {
    const documents = await prisma.document.findMany({
      where: {
        userId: TEST_USER_ID,
        mimeType: 'text/markdown'
      },
      select: {
        id: true,
        filename: true,
        renderableContent: true
      }
    });

    const markdownDoc = documents[0];
    const passed = Boolean(markdownDoc &&
                   markdownDoc.renderableContent &&
                   markdownDoc.renderableContent.includes('# Test Markdown Document'));

    results.push({
      test: 'queryDocumentContent',
      passed,
      duration: Date.now() - start,
      data: {
        filename: markdownDoc?.filename,
        contentLength: markdownDoc?.renderableContent?.length,
        contentPreview: markdownDoc?.renderableContent?.substring(0, 200)
      }
    });
  } catch (error: any) {
    results.push({
      test: 'queryDocumentContent',
      passed: false,
      error: error.message,
      duration: Date.now() - start
    });
  }
}

async function test_queryDocumentsByType() {
  const start = Date.now();
  try {
    const mdFiles = await prisma.document.count({
      where: {
        userId: TEST_USER_ID,
        mimeType: 'text/markdown'
      }
    });

    const pdfFiles = await prisma.document.count({
      where: {
        userId: TEST_USER_ID,
        mimeType: 'application/pdf'
      }
    });

    const docxFiles = await prisma.document.count({
      where: {
        userId: TEST_USER_ID,
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      }
    });

    const passed = mdFiles >= 1 && pdfFiles >= 1 && docxFiles >= 1;

    results.push({
      test: 'queryDocumentsByType',
      passed,
      duration: Date.now() - start,
      data: {
        markdown: mdFiles,
        pdf: pdfFiles,
        docx: docxFiles,
        total: mdFiles + pdfFiles + docxFiles
      }
    });
  } catch (error: any) {
    results.push({
      test: 'queryDocumentsByType',
      passed: false,
      error: error.message,
      duration: Date.now() - start
    });
  }
}

async function test_queryDocumentMetadata() {
  const start = Date.now();
  try {
    const totalSize = await prisma.document.aggregate({
      where: { userId: TEST_USER_ID },
      _sum: { fileSize: true },
      _count: true,
      _avg: { fileSize: true },
      _max: { fileSize: true },
      _min: { fileSize: true }
    });

    const passed = totalSize._count > 0 && totalSize._sum.fileSize !== null;

    results.push({
      test: 'queryDocumentMetadata',
      passed,
      duration: Date.now() - start,
      data: {
        totalDocuments: totalSize._count,
        totalSize: totalSize._sum.fileSize,
        averageSize: Math.round(totalSize._avg.fileSize || 0),
        largestFile: totalSize._max.fileSize,
        smallestFile: totalSize._min.fileSize
      }
    });
  } catch (error: any) {
    results.push({
      test: 'queryDocumentMetadata',
      passed: false,
      error: error.message,
      duration: Date.now() - start
    });
  }
}

async function test_searchDocumentsByName() {
  const start = Date.now();
  try {
    const searchTerm = 'test';
    const documents = await prisma.document.findMany({
      where: {
        userId: TEST_USER_ID,
        filename: {
          contains: searchTerm,
          mode: 'insensitive'
        }
      }
    });

    const passed = documents.length >= 3; // Should find all test documents

    results.push({
      test: 'searchDocumentsByName',
      passed,
      duration: Date.now() - start,
      data: {
        searchTerm,
        foundDocuments: documents.length,
        filenames: documents.map(d => d.filename)
      }
    });
  } catch (error: any) {
    results.push({
      test: 'searchDocumentsByName',
      passed: false,
      error: error.message,
      duration: Date.now() - start
    });
  }
}

async function test_queryRecentDocuments() {
  const start = Date.now();
  try {
    const recentDocuments = await prisma.document.findMany({
      where: {
        userId: TEST_USER_ID,
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    const passed = recentDocuments.length >= 3;

    results.push({
      test: 'queryRecentDocuments',
      passed,
      duration: Date.now() - start,
      data: {
        recentCount: recentDocuments.length,
        documents: recentDocuments.map(d => ({
          filename: d.filename,
          created: d.createdAt,
          age: Math.round((Date.now() - d.createdAt.getTime()) / 1000) + 's ago'
        }))
      }
    });
  } catch (error: any) {
    results.push({
      test: 'queryRecentDocuments',
      passed: false,
      error: error.message,
      duration: Date.now() - start
    });
  }
}

async function test_queryUserMemory() {
  const start = Date.now();
  try {
    const [profile, preferences, topics] = await Promise.all([
      prisma.user_profiles.findUnique({
        where: { userId: TEST_USER_ID }
      }),
      prisma.user_preferences_memory.findMany({
        where: { userId: TEST_USER_ID }
      }),
      prisma.conversation_topics.findMany({
        where: { userId: TEST_USER_ID }
      })
    ]);

    const passed = !!profile && preferences.length > 0 && topics.length > 0;

    results.push({
      test: 'queryUserMemory',
      passed,
      duration: Date.now() - start,
      data: {
        hasProfile: !!profile,
        profileData: profile ? {
          name: profile.name,
          role: profile.role,
          expertise: profile.expertiseLevel
        } : null,
        preferencesCount: preferences.length,
        preferences: preferences.map(p => ({
          type: p.preferenceType,
          value: p.preferenceValue,
          confidence: p.confidence
        })),
        topicsCount: topics.length,
        topics: topics.map(t => ({
          summary: t.topicSummary,
          frequency: t.frequency,
          confidence: t.confidence
        }))
      }
    });
  } catch (error: any) {
    results.push({
      test: 'queryUserMemory',
      passed: false,
      error: error.message,
      duration: Date.now() - start
    });
  }
}

async function test_queryDocumentWithFullText() {
  const start = Date.now();
  try {
    const markdownDoc = await prisma.document.findFirst({
      where: {
        userId: TEST_USER_ID,
        mimeType: 'text/markdown'
      },
      select: {
        id: true,
        filename: true,
        fileSize: true,
        mimeType: true,
        renderableContent: true,
        createdAt: true,
        updatedAt: true
      }
    });

    const passed = Boolean(markdownDoc &&
                   markdownDoc.renderableContent &&
                   markdownDoc.renderableContent.length > 5000);

    results.push({
      test: 'queryDocumentWithFullText',
      passed,
      duration: Date.now() - start,
      data: {
        filename: markdownDoc?.filename,
        size: markdownDoc?.fileSize,
        contentLength: markdownDoc?.renderableContent?.length,
        fullContent: markdownDoc?.renderableContent
      }
    });
  } catch (error: any) {
    results.push({
      test: 'queryDocumentWithFullText',
      passed: false,
      error: error.message,
      duration: Date.now() - start
    });
  }
}

export async function runTests() {
  await test_queryAllDocuments();
  await test_queryDocumentContent();
  await test_queryDocumentsByType();
  await test_queryDocumentMetadata();
  await test_searchDocumentsByName();
  await test_queryRecentDocuments();
  await test_queryUserMemory();
  await test_queryDocumentWithFullText();
  return results;
}
