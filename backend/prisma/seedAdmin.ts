/**
 * Seed script for creating an admin account.
 *
 * Usage:
 *   npx ts-node --transpile-only prisma/seedAdmin.ts <username> <password> [name]
 *
 * Example:
 *   npx ts-node --transpile-only prisma/seedAdmin.ts pedro Palmeiras1 Pedro
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 12;

async function main() {
  const [, , username, password, name] = process.argv;

  if (!username || !password) {
    console.error('Usage: npx ts-node prisma/seedAdmin.ts <username> <password> [name]');
    process.exit(1);
  }

  const prisma = new PrismaClient();

  try {
    const existing = await prisma.admin.findUnique({ where: { username: username.toLowerCase() } });
    if (existing) {
      console.log(`Admin "${username}" already exists (id: ${existing.id}). Skipping.`);
      return;
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const admin = await prisma.admin.create({
      data: {
        username: username.toLowerCase(),
        passwordHash,
        name: name || null,
        role: 'super_admin',
        isActive: true,
      },
    });

    console.log(`Admin created successfully:`);
    console.log(`  id:       ${admin.id}`);
    console.log(`  username: ${admin.username}`);
    console.log(`  role:     ${admin.role}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
