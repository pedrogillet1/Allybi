const { PrismaClient } = require("@prisma/client");
const jwt = require("jsonwebtoken");
require('dotenv').config();
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findUnique({ where: { email: "test@koda.com" } });
  if (!user) { console.log("User not found"); return; }
  
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) { console.log("JWT_ACCESS_SECRET not found"); return; }
  
  const token = jwt.sign(
    { userId: user.id, email: user.email },
    secret,
    { expiresIn: "1h" }
  );
  console.log(token);
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
