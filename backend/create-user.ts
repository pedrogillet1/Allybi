import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function createUser() {
  // Generate salt like the app does
  const salt = crypto.randomBytes(16).toString('hex');
  // Hash password with salt appended (same as app)
  const passwordHash = await bcrypt.hash('Localhost123!' + salt, 12);

  console.log('Salt:', salt);
  console.log('PasswordHash:', passwordHash);

  const user = await prisma.user.upsert({
    where: { email: 'localhost@koda.com' },
    update: {
      passwordHash: passwordHash,
      salt: salt
    },
    create: {
      email: 'localhost@koda.com',
      passwordHash: passwordHash,
      salt: salt,
      firstName: 'Localhost',
      lastName: 'Test',
      isEmailVerified: true
    }
  });
  console.log('User created/updated:', user.id, user.email);
  await prisma.$disconnect();
}

createUser().catch(console.error);
