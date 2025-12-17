import prisma from '../src/config/database';

async function check() {
  try {
    const users = await prisma.user.findMany({ select: { id: true, email: true } });
    console.log('Users found:', users.length);
    for (const u of users) {
      console.log('  User:', u.email, u.id);
    }

    const docs = await prisma.document.findMany({
      select: { id: true, filename: true, status: true, userId: true },
      take: 10
    });
    console.log('Documents found:', docs.length);
    for (const d of docs) {
      console.log('  Doc:', d.filename, '(' + d.status + ') userId:', d.userId);
    }
  } catch (e) {
    console.error('Error:', e);
  } finally {
    await prisma.$disconnect();
  }
}
check();
