/**
 * Generate Test Token - For Upload Truth Audit
 */

const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const path = require('path');

// Suppress dotenv logging
const originalLog = console.log;
console.log = () => {};
require('dotenv').config({ path: path.join(__dirname, '../.env') });
console.log = originalLog;

const prisma = new PrismaClient();

async function generateToken(email) {
  let user;
  
  if (email) {
    user = await prisma.user.findUnique({
      where: { email: email },
      select: { id: true, email: true }
    });
    if (!user) {
      process.stderr.write('User not found: ' + email + '\n');
      process.exit(1);
    }
  } else {
    user = await prisma.user.findFirst({
      select: { id: true, email: true }
    });
    if (!user) {
      process.stderr.write('No users found in database\n');
      process.exit(1);
    }
  }

  process.stderr.write('User: ' + user.email + '\n');

  const token = jwt.sign(
    { userId: user.id, email: user.email },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: '1h' }
  );

  // Output ONLY the token to stdout
  process.stdout.write(token);
  
  await prisma.$disconnect();
}

const email = process.argv[2];
generateToken(email).catch(function(err) {
  process.stderr.write('Error: ' + err.message + '\n');
  process.exit(1);
});
