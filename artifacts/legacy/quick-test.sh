#!/bin/bash
cd /home/ubuntu/koda-webapp/backend
export $(cat .env | grep -v '^#' | xargs)
USER_ID=$(npx ts-node -e "import { PrismaClient } from '@prisma/client'; const p = new PrismaClient(); p.user.findUnique({ where: { email: 'test@koda.com' } }).then(u => { console.log(u?.id || ''); p.\$disconnect(); });" 2>/dev/null)
echo "User ID: $USER_ID"
echo ""
echo "Quick commands:"
echo "  ./quick-test.sh list"
echo "  ./quick-test.sh query \"your question\""
echo "  ./quick-test.sh demo"
echo ""
if [ "$1" == "list" ]; then
  npx ts-node /home/ubuntu/test-rag-backend.ts list $USER_ID
elif [ "$1" == "demo" ]; then
  npx ts-node /home/ubuntu/test-rag-backend.ts demo $USER_ID
elif [ "$1" == "query" ]; then
  npx ts-node /home/ubuntu/test-rag-backend.ts query $USER_ID "$2"
else
  echo "Usage: ./quick-test.sh [list|demo|query \"question\"]"
fi
