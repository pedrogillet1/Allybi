/**
 * Create Localhost User Script
 * Creates a localhost@koda.com account for local development
 * Run: npx ts-node src/scripts/createLocalhostUser.ts
 */

import prisma from '../config/database';
import { hashPassword } from '../utils/password';

async function createLocalhostUser() {
  console.log('🔐 Creating localhost user for local development...\n');

  const email = 'localhost@koda.com';
  const password = 'localhost123';

  try {
    // Check if user already exists - if so, delete and recreate with correct hash
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      console.log('⚠️  Localhost user exists but may have incorrect password hash.');
      console.log('   Deleting and recreating with correct hash...\n');

      // Delete related data first (sessions, etc.)
      await prisma.session.deleteMany({ where: { userId: existingUser.id } });
      await prisma.user.delete({ where: { email } });
    }

    // Hash password using the correct method (same as auth.service)
    const { hash: passwordHash, salt } = await hashPassword(password);

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        salt,
        firstName: 'Localhost',
        lastName: 'Developer',
        isEmailVerified: true,
        isPhoneVerified: false,
        subscriptionTier: 'free',
        role: 'user'
      }
    });

    console.log('✅ Localhost user created successfully!');
    console.log('─'.repeat(40));
    console.log(`   Email:    ${user.email}`);
    console.log(`   Password: localhost123`);
    console.log(`   ID:       ${user.id}`);
    console.log('─'.repeat(40));
    console.log('\nUse these credentials to login on localhost:3000\n');

  } catch (error: any) {
    console.error('❌ Error creating localhost user:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

createLocalhostUser();
