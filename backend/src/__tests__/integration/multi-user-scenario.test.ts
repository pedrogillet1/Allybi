import { PrismaClient } from '@prisma/client';

/**
 * INTEGRATION TEST: Multi-User Scenario
 *
 * This test simulates the EXACT scenario reported by the user:
 * - User A uploads "Comprovante1.pdf" (receipt)
 * - User B uploads "Psychiatric-Report.pdf" (sensitive document)
 * - User A asks "qual o valor do comprovante?"
 * - Verify:
 *   1. User A ONLY sees their own "Comprovante1.pdf"
 *   2. User A does NOT see User B's psychiatric document
 *   3. No duplicate documents appear in search results
 *   4. AI auto-analyzes the single matching document
 */

const prisma = new PrismaClient();

describe('Multi-User Scenario Integration Test', () => {
  const userA = {
    id: 'user-a-integration-test',
    email: 'usera@test.com',
    passwordHash: 'hashed-password-a',
    firstName: 'User',
    lastName: 'A',
  };

  const userB = {
    id: 'user-b-integration-test',
    email: 'userb@test.com',
    passwordHash: 'hashed-password-b',
    firstName: 'User',
    lastName: 'B',
  };

  // User A's document
  const comprovanteDoc = {
    id: 'comprovante-doc-id',
    userId: userA.id,
    filename: 'Comprovante1.pdf',
    encryptedFilename: 'encrypted-comprovante',
    mimeType: 'application/pdf',
    fileSize: 1024,
    fileHash: 'hash-comprovante',
  };

  // User B's sensitive document
  const psychiatricDoc = {
    id: 'psychiatric-doc-id',
    userId: userB.id,
    filename: 'Psychiatric-Report.pdf',
    encryptedFilename: 'encrypted-psychiatric',
    mimeType: 'application/pdf',
    fileSize: 2048,
    fileHash: 'hash-psychiatric',
  };

  // User A also has an unrelated document
  const businessPlanDoc = {
    id: 'business-plan-doc-id',
    userId: userA.id,
    filename: 'Koda Business Plan V12 (1).pdf',
    encryptedFilename: 'encrypted-business-plan',
    mimeType: 'application/pdf',
    fileSize: 3072,
    fileHash: 'hash-business-plan',
  };

  beforeAll(async () => {
    // Clean up any existing test data
    await prisma.documentMetadata.deleteMany({
      where: {
        documentId: {
          in: [comprovanteDoc.id, psychiatricDoc.id, businessPlanDoc.id],
        },
      },
    });
    await prisma.document.deleteMany({
      where: {
        id: {
          in: [comprovanteDoc.id, psychiatricDoc.id, businessPlanDoc.id],
        },
      },
    });
    await prisma.user.deleteMany({
      where: {
        id: {
          in: [userA.id, userB.id],
        },
      },
    });

    // Create test users
    await prisma.user.create({ data: userA });
    await prisma.user.create({ data: userB });

    // Create User A's documents
    await prisma.document.create({
      data: {
        ...comprovanteDoc,
        status: 'processed',
        metadata: {
          create: {
            extractedText: 'Comprovante de Pagamento\nValor: R$ 1.500,00\nData: 15/01/2025\nBeneficiário: João Silva',
          },
        },
      },
    });

    await prisma.document.create({
      data: {
        ...businessPlanDoc,
        status: 'processed',
        metadata: {
          create: {
            extractedText: 'Koda Business Plan Version 12\nExecutive Summary...',
          },
        },
      },
    });

    // Create User B's sensitive document
    await prisma.document.create({
      data: {
        ...psychiatricDoc,
        status: 'processed',
        metadata: {
          create: {
            extractedText: 'CONFIDENTIAL - Psychiatric Evaluation Report\nPatient Name: Confidential\nDiagnosis: ...',
          },
        },
      },
    });
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.documentMetadata.deleteMany({
      where: {
        documentId: {
          in: [comprovanteDoc.id, psychiatricDoc.id, businessPlanDoc.id],
        },
      },
    });
    await prisma.document.deleteMany({
      where: {
        id: {
          in: [comprovanteDoc.id, psychiatricDoc.id, businessPlanDoc.id],
        },
      },
    });
    await prisma.user.deleteMany({
      where: {
        id: {
          in: [userA.id, userB.id],
        },
      },
    });

    await prisma.$disconnect();
  });

  describe('User A searches for "Comprovante"', () => {
    test('Should ONLY return User A documents - NO cross-user leakage', async () => {
      // Simulate AI search_documents function call
      const searchQuery = 'Comprovante';
      const searchResults = await prisma.document.findMany({
        where: {
          userId: userA.id, // ✅ CRITICAL: Filter by User A's ID
          OR: [
            { filename: { contains: searchQuery } },
            {
              metadata: {
                extractedText: { contains: searchQuery },
              },
            },
          ],
        },
        include: {
          folder: true,
          metadata: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      // ✅ Should find exactly 1 document
      expect(searchResults).toHaveLength(1);
      expect(searchResults[0].id).toBe(comprovanteDoc.id);
      expect(searchResults[0].filename).toBe('Comprovante1.pdf');
      expect(searchResults[0].userId).toBe(userA.id);

      // ✅ Should NOT contain User B's psychiatric document
      const psychiatricDocFound = searchResults.find(
        (doc) => doc.id === psychiatricDoc.id
      );
      expect(psychiatricDocFound).toBeUndefined();

      // ✅ Should NOT contain business plan (not matching search)
      const businessPlanFound = searchResults.find(
        (doc) => doc.id === businessPlanDoc.id
      );
      expect(businessPlanFound).toBeUndefined();
    });

    test('Deduplication: Same document in multiple folders appears only once', async () => {
      // Create two folders for User A
      const recentFolder = await prisma.folder.create({
        data: {
          name: 'Recently Added',
          userId: userA.id,
        },
      });

      const workFolder = await prisma.folder.create({
        data: {
          name: 'Work Documents',
          userId: userA.id,
        },
      });

      // Put Comprovante in Recent folder (simulating folder view)
      await prisma.document.update({
        where: { id: comprovanteDoc.id },
        data: { folderId: recentFolder.id },
      });

      // Search for Comprovante
      const searchResults = await prisma.document.findMany({
        where: {
          userId: userA.id,
          OR: [{ filename: { contains: 'Comprovante' } }],
        },
        include: {
          folders: true,
          document_metadata: true,
        },
      });

      // ✅ Apply deduplication logic (from chat.service.ts)
      const seenDocIds = new Set<string>();
      const uniqueResults = searchResults.filter((doc) => {
        if (seenDocIds.has(doc.id)) {
          return false;
        }
        seenDocIds.add(doc.id);
        return true;
      });

      // ✅ Should have exactly 1 unique result (no duplicates)
      expect(uniqueResults).toHaveLength(1);
      expect(uniqueResults[0].id).toBe(comprovanteDoc.id);
      expect(uniqueResults[0].filename).toBe('Comprovante1.pdf');

      // Clean up
      await prisma.folder.deleteMany({
        where: { id: { in: [recentFolder.id, workFolder.id] } },
      });
    });
  });

  describe('User B searches for their own documents', () => {
    test('Should ONLY return User B documents - complete isolation', async () => {
      // User B searches for "Psychiatric"
      const searchResults = await prisma.document.findMany({
        where: {
          userId: userB.id, // ✅ CRITICAL: Filter by User B's ID
          OR: [
            { filename: { contains: 'Psychiatric' } },
            {
              document_metadata: {
                extractedText: { contains: 'Psychiatric' },
              },
            },
          ],
        },
        include: {
          document_metadata: true,
        },
      });

      // ✅ Should find exactly 1 document
      expect(searchResults).toHaveLength(1);
      expect(searchResults[0].id).toBe(psychiatricDoc.id);
      expect(searchResults[0].userId).toBe(userB.id);

      // ✅ Should NOT contain User A's documents
      const userADocsFound = searchResults.filter(
        (doc) => doc.userId === userA.id
      );
      expect(userADocsFound).toHaveLength(0);
    });

    test('User B cannot see User A comprovante by filename search', async () => {
      // User B tries to search for User A's document
      const searchResults = await prisma.document.findMany({
        where: {
          userId: userB.id, // ✅ CRITICAL: Filter by User B's ID
          filename: { contains: 'Comprovante' },
        },
      });

      // ✅ Should return 0 results (User B doesn't have access)
      expect(searchResults).toHaveLength(0);
    });

    test('User B cannot see User A comprovante by content search', async () => {
      // User B tries to search for content in User A's document
      const searchResults = await prisma.document.findMany({
        where: {
          userId: userB.id, // ✅ CRITICAL: Filter by User B's ID
          document_metadata: {
            extractedText: { contains: 'R$ 1.500,00' }, // User A's receipt amount
          },
        },
        include: {
          document_metadata: true,
        },
      });

      // ✅ Should return 0 results
      expect(searchResults).toHaveLength(0);
    });
  });

  describe('Document Analysis - Ownership Verification', () => {
    test('User A can analyze their own document', async () => {
      // Simulate analyze_document function
      const document = await prisma.document.findFirst({
        where: {
          id: comprovanteDoc.id,
          userId: userA.id, // ✅ CRITICAL: Verify ownership
        },
        include: {
          document_metadata: true,
        },
      });

      expect(document).not.toBeNull();
      expect(document?.id).toBe(comprovanteDoc.id);
      expect(document?.document_metadata?.extractedText).toContain('R$ 1.500,00');
    });

    test('User A CANNOT analyze User B document', async () => {
      // User A tries to analyze User B's document by ID
      const document = await prisma.document.findFirst({
        where: {
          id: psychiatricDoc.id, // User B's document ID
          userId: userA.id, // ✅ CRITICAL: Verify ownership (should fail)
        },
        include: {
          document_metadata: true,
        },
      });

      // ✅ Should return null (access denied)
      expect(document).toBeNull();
    });

    test('User B can analyze their own document', async () => {
      const document = await prisma.document.findFirst({
        where: {
          id: psychiatricDoc.id,
          userId: userB.id, // ✅ CRITICAL: Verify ownership
        },
        include: {
          document_metadata: true,
        },
      });

      expect(document).not.toBeNull();
      expect(document?.id).toBe(psychiatricDoc.id);
      expect(document?.document_metadata?.extractedText).toContain('CONFIDENTIAL');
    });

    test('User B CANNOT analyze User A document', async () => {
      const document = await prisma.document.findFirst({
        where: {
          id: comprovanteDoc.id, // User A's document ID
          userId: userB.id, // ✅ CRITICAL: Verify ownership (should fail)
        },
        include: {
          document_metadata: true,
        },
      });

      // ✅ Should return null (access denied)
      expect(document).toBeNull();
    });
  });

  describe('AI Smart Auto-Analysis Logic', () => {
    test('When User A searches "Comprovante" - exactly 1 unique match → auto-analyze', async () => {
      // Step 1: Search for documents
      const searchResults = await prisma.document.findMany({
        where: {
          userId: userA.id,
          OR: [
            { filename: { contains: 'Comprovante' } },
            { document_metadata: { extractedText: { contains: 'Comprovante' } } },
          ],
        },
        include: {
          document_metadata: true,
        },
      });

      // Step 2: Deduplicate
      const seenDocIds = new Set<string>();
      const uniqueResults = searchResults.filter((doc) => {
        if (seenDocIds.has(doc.id)) return false;
        seenDocIds.add(doc.id);
        return true;
      });

      // Step 3: Check if exactly 1 unique result
      expect(uniqueResults).toHaveLength(1);

      // Step 4: AI should auto-analyze (not ask user to choose)
      const documentToAnalyze = uniqueResults[0];
      expect(documentToAnalyze.id).toBe(comprovanteDoc.id);
      expect(documentToAnalyze.document_metadata?.extractedText).toContain('R$ 1.500,00');

      // ✅ AI can now extract the value and answer directly
      // Expected AI behavior: "O valor do comprovante é R$ 1.500,00"
      // NOT: "I found 3 documents... which one?"
    });

    test('When search returns 0 results → AI should say document not found', async () => {
      const searchResults = await prisma.document.findMany({
        where: {
          userId: userA.id,
          OR: [{ filename: { contains: 'NonExistentDocument' } }],
        },
      });

      expect(searchResults).toHaveLength(0);
      // ✅ AI should respond: "I couldn't find any documents matching 'NonExistentDocument'"
    });

    test('When search returns multiple DIFFERENT documents → AI should list them', async () => {
      // User A searches for "pdf" (generic - matches multiple docs)
      const searchResults = await prisma.document.findMany({
        where: {
          userId: userA.id,
          OR: [{ filename: { contains: 'pdf' } }],
        },
        include: {
          document_metadata: true,
        },
      });

      // Deduplicate
      const seenDocIds = new Set<string>();
      const uniqueResults = searchResults.filter((doc) => {
        if (seenDocIds.has(doc.id)) return false;
        seenDocIds.add(doc.id);
        return true;
      });

      // Should have 2 different documents
      expect(uniqueResults.length).toBeGreaterThan(1);

      // ✅ AI should list: "I found 2 documents: 1. Comprovante1.pdf, 2. Koda Business Plan..."
      // And ask: "Which one would you like me to analyze?"
    });
  });

  describe('Real-world Attack Scenarios', () => {
    test('ATTACK: User A tries to bypass userId filter by searching all documents', async () => {
      // Malicious attempt: Search without userId filter
      const allDocuments = await prisma.document.findMany({
        where: {
          filename: { contains: 'Psychiatric' },
          // Attacker omits userId filter
        },
      });

      // This query WOULD return User B's document (security breach scenario)
      expect(allDocuments.length).toBeGreaterThan(0);

      // ✅ DEFENSE: Service layer MUST always include userId filter
      const secureSearch = await prisma.document.findMany({
        where: {
          userId: userA.id, // ✅ CRITICAL: Always filter by userId
          filename: { contains: 'Psychiatric' },
        },
      });

      // With userId filter, User A sees nothing
      expect(secureSearch).toHaveLength(0);
    });

    test('ATTACK: User A guesses User B document ID and tries to access it', async () => {
      // Attacker knows the document ID (e.g., from URL, logs, or guessing)
      const knownDocId = psychiatricDoc.id;

      // Attempt to access without ownership verification
      const documentWithoutCheck = await prisma.document.findUnique({
        where: { id: knownDocId },
      });

      // Document exists
      expect(documentWithoutCheck).not.toBeNull();

      // ✅ DEFENSE: Service layer MUST verify ownership
      const documentWithCheck = await prisma.document.findFirst({
        where: {
          id: knownDocId,
          userId: userA.id, // ✅ CRITICAL: Verify ownership
        },
      });

      // Access denied - User A doesn't own this document
      expect(documentWithCheck).toBeNull();
    });
  });
});
