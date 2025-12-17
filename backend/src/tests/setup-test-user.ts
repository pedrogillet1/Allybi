import prisma from '../config/database';

export const TEST_USER_ID = 'test-user-backend';
export const TEST_USER_EMAIL = 'test@koda-backend.local';

export async function setupTestUser() {
  try {
    // Check if test user exists
    let user = await prisma.user.findUnique({
      where: { id: TEST_USER_ID },
    });

    if (!user) {
      // Create test user
      user = await prisma.user.create({
        data: {
          id: TEST_USER_ID,
          email: TEST_USER_EMAIL,
          firstName: 'Test',
          lastName: 'User (Backend)',
          passwordHash: 'test-password-hash', // Not used in tests
        },
      });
      console.log('✅ Created test user:', TEST_USER_ID);
    } else {
      console.log('✅ Test user already exists:', TEST_USER_ID);
    }

    return user;
  } catch (error) {
    console.error('❌ Failed to setup test user:', error);
    throw error;
  }
}

export async function cleanupTestUser() {
  try {
    // Delete all test data in correct order (respecting foreign keys)
    await prisma.message.deleteMany({
      where: { conversation: { userId: TEST_USER_ID } },
    });
    await prisma.conversation.deleteMany({
      where: { userId: TEST_USER_ID },
    });
    await prisma.document.deleteMany({
      where: { userId: TEST_USER_ID },
    });
    await prisma.folder.deleteMany({
      where: { userId: TEST_USER_ID },
    });
    await prisma.generated_documents.deleteMany({
      where: { userId: TEST_USER_ID },
    });
    await prisma.user_profiles.deleteMany({
      where: { userId: TEST_USER_ID },
    });
    await prisma.user_preferences_memory.deleteMany({
      where: { userId: TEST_USER_ID },
    });
    await prisma.conversation_topics.deleteMany({
      where: { userId: TEST_USER_ID },
    });

    // Delete test user
    await prisma.user.delete({
      where: { id: TEST_USER_ID },
    });

    console.log('✅ Cleaned up test user and data');
  } catch (error) {
    console.error('❌ Failed to cleanup test user:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run setup if called directly
if (require.main === module) {
  setupTestUser()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
