/**
 * Seed script for a deterministic E2E chat user.
 *
 * Usage:
 *   npx ts-node --transpile-only prisma/seedTestUser.ts [email] [password] [firstName] [lastName]
 *
 * Defaults:
 *   email=test@allybi.com
 *   password=test123
 *   firstName=Allybi
 *   lastName=Test
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const BCRYPT_ROUNDS = 12;

async function main() {
  const [, , emailArg, passwordArg, firstNameArg, lastNameArg] = process.argv;
  const email = String(emailArg || "test@allybi.com").trim().toLowerCase();
  const password = String(passwordArg || "test123").trim();
  const firstName = String(firstNameArg || "Allybi").trim() || null;
  const lastName = String(lastNameArg || "Test").trim() || null;

  if (!email.includes("@") || password.length < 6) {
    console.error(
      "Usage: npx ts-node --transpile-only prisma/seedTestUser.ts [email] [password] [firstName] [lastName]",
    );
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const salt = await bcrypt.genSalt(BCRYPT_ROUNDS);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await prisma.user.upsert({
      where: { email },
      update: {
        passwordHash,
        salt,
        firstName,
        lastName,
        isEmailVerified: true,
        isPhoneVerified: false,
        subscriptionTier: "free",
        role: "user",
      },
      create: {
        email,
        passwordHash,
        salt,
        firstName,
        lastName,
        isEmailVerified: true,
        isPhoneVerified: false,
        subscriptionTier: "free",
        role: "user",
      },
    });

    // Keep seed deterministic: clear stale pending/sessions.
    await prisma.pendingUser.deleteMany({ where: { email } });
    await prisma.session.deleteMany({ where: { userId: user.id } });

    console.log("Test user ready:");
    console.log(`  id: ${user.id}`);
    console.log(`  email: ${user.email}`);
    console.log(`  password: ${password}`);
    console.log("  emailVerified: true");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("seedTestUser failed:", error);
  process.exit(1);
});

