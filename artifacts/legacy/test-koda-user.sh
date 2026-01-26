#!/bin/bash
# Quick test script for test@koda.com user

cd /home/ubuntu/koda-webapp/backend

# Load environment variables
export $(cat .env | grep -v '^#' | xargs)

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Koda Backend Tester for test@koda.com${NC}"
echo -e "${BLUE}========================================${NC}\n"

# Get user ID
echo -e "${YELLOW}[1/2] Getting user info...${NC}"
USER_DATA=$(npx ts-node -e "
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
prisma.user.findUnique({ where: { email: 'test@koda.com' } })
  .then(user => {
    if (user) {
      console.log(JSON.stringify({ id: user.id, email: user.email }));
    } else {
      console.log(JSON.stringify({ error: 'User not found' }));
    }
    prisma.\$disconnect();
  });
")

USER_ID=$(echo $USER_DATA | jq -r '.id')

if [ "$USER_ID" == "null" ] || [ -z "$USER_ID" ]; then
  echo -e "${RED}❌ User test@koda.com not found${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Found user: $USER_ID${NC}\n"

# Get document count
echo -e "${YELLOW}[2/2] Getting documents...${NC}"
DOC_COUNT=$(npx ts-node -e "
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
prisma.document.count({ where: { userId: '$USER_ID' } })
  .then(count => {
    console.log(count);
    prisma.\$disconnect();
  });
")

echo -e "${GREEN}✓ Found $DOC_COUNT documents${NC}\n"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Ready to test!${NC}"
echo -e "${BLUE}========================================${NC}\n"

# Show available commands
echo -e "${YELLOW}Available commands:${NC}\n"

echo -e "${GREEN}1. List documents:${NC}"
echo -e "   npx ts-node /home/ubuntu/test-rag-backend.ts list $USER_ID\n"

echo -e "${GREEN}2. Test simple query:${NC}"
echo -e "   npx ts-node /home/ubuntu/test-rag-backend.ts query $USER_ID \"What documents do I have?\"\n"

echo -e "${GREEN}3. Test calculation:${NC}"
echo -e "   npx ts-node /home/ubuntu/test-rag-backend.ts query $USER_ID \"What is 2 + 2?\"\n"

echo -e "${GREEN}4. Test with documents:${NC}"
echo -e "   npx ts-node /home/ubuntu/test-rag-backend.ts query $USER_ID \"Summarize my documents\"\n"

echo -e "${GREEN}5. Run demo queries:${NC}"
echo -e "   npx ts-node /home/ubuntu/test-rag-backend.ts demo $USER_ID\n"

# Ask what to do
echo -e "${YELLOW}What would you like to test?${NC}"
echo "1) List documents"
echo "2) Test simple query"
echo "3) Test calculation"
echo "4) Test with documents"
echo "5) Run demo"
echo "6) Custom query"
echo "7) Exit"
echo ""
read -p "Enter choice [1-7]: " choice

case $choice in
  1)
    npx ts-node /home/ubuntu/test-rag-backend.ts list $USER_ID
    ;;
  2)
    npx ts-node /home/ubuntu/test-rag-backend.ts query $USER_ID "What documents do I have?"
    ;;
  3)
    npx ts-node /home/ubuntu/test-rag-backend.ts query $USER_ID "What is 2 + 2?"
    ;;
  4)
    npx ts-node /home/ubuntu/test-rag-backend.ts query $USER_ID "Summarize my documents"
    ;;
  5)
    npx ts-node /home/ubuntu/test-rag-backend.ts demo $USER_ID
    ;;
  6)
    read -p "Enter your query: " query
    npx ts-node /home/ubuntu/test-rag-backend.ts query $USER_ID "$query"
    ;;
  7)
    echo "Goodbye!"
    exit 0
    ;;
  *)
    echo "Invalid choice"
    exit 1
    ;;
esac
