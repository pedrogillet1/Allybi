import prisma from '../config/database';

/**
 * Migrate pending users to actual users
 * This script moves all email-verified pending users to the users table
 */
async function migratePendingUsers() {
  try {
    console.log('🔄 Starting pending user migration...');

    // Get all pending users with verified emails
    const pendingUsers = await prisma.pendingUser.findMany({
      where: {
        emailVerified: true,
      },
    });

    console.log(`📊 Found ${pendingUsers.length} pending users with verified emails`);

    if (pendingUsers.length === 0) {
      console.log('✅ No pending users to migrate');
      return;
    }

    let migratedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const pendingUser of pendingUsers) {
      try {
        // Check if user already exists in users table
        const existingUser = await prisma.user.findUnique({
          where: { email: pendingUser.email },
        });

        if (existingUser) {
          console.log(`⚠️  Skipping ${pendingUser.email} - already exists in users table`);
          skippedCount++;

          // Delete the pending user since actual user exists
          await prisma.pendingUser.delete({
            where: { id: pendingUser.id },
          });
          continue;
        }

        // Create actual user
        const user = await prisma.user.create({
          data: {
            email: pendingUser.email,
            passwordHash: pendingUser.passwordHash,
            salt: pendingUser.salt,
            phoneNumber: pendingUser.phoneNumber || null,
            isEmailVerified: pendingUser.emailVerified,
            isPhoneVerified: pendingUser.phoneVerified || false,
          },
        });

        // Delete the pending user
        await prisma.pendingUser.delete({
          where: { id: pendingUser.id },
        });

        console.log(`✅ Migrated ${pendingUser.email} → User ID: ${user.id}`);
        migratedCount++;
      } catch (error) {
        console.error(`❌ Error migrating ${pendingUser.email}:`, error);
        errorCount++;
      }
    }

    console.log('\n📈 Migration Summary:');
    console.log(`   ✅ Migrated: ${migratedCount}`);
    console.log(`   ⚠️  Skipped: ${skippedCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    console.log('\n🎉 Migration complete!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run migration
migratePendingUsers()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
