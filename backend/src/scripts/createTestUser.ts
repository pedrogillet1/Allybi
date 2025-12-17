/**
 * Create Test User Script
 * Run: npx ts-node src/scripts/createTestUser.ts
 */

import prisma from '../config/database';
import bcrypt from 'bcrypt';

async function createTestUser() {
  console.log('🔐 Creating test user...\n');

  const email = 'test@koda.com';
  const password = 'test123';

  try {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      console.log('⚠️  Test user already exists:');
      console.log(`   ID: ${existingUser.id}`);
      console.log(`   Email: ${existingUser.email}`);
      console.log(`   Password: test123`);
      console.log('\nYou can use this user ID for testing.\n');
      return;
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        salt,
        firstName: 'Test',
        lastName: 'User',
        isEmailVerified: true,
        isPhoneVerified: false,
        subscriptionTier: 'free',
        role: 'user'
      }
    });

    console.log('✅ Test user created successfully!');
    console.log(`   ID: ${user.id}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Password: test123`);
    console.log('\nCopy the User ID above to use in test scripts.\n');

  } catch (error: any) {
    console.error('❌ Error creating test user:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

createTestUser();
