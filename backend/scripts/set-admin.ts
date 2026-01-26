import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function setAdmin() {
  try {
    const user = await prisma.user.update({
      where: { email: 'test@koda.com' },
      data: { role: 'admin' }
    });
    console.log('✅ User updated to admin:');
    console.log('  Email:', user.email);
    console.log('  Role:', user.role);
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

setAdmin();
