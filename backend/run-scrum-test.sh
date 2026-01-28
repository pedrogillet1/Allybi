#!/bin/bash

TOKEN=$(node -e "const jwt=require('jsonwebtoken');console.log(jwt.sign({userId:'f33c4a7a-003d-41e8-b259-6914bac1ccc5',email:'test@koda.com'},'k8mP2vXqL9nR4wYj6tF1hB3cZ5sA7uD0eG8iK2oM4qW6yT1xV3nJ5bH7fL9pU2rE',{expiresIn:'24h'}))")
API="http://localhost:5000/api/chat"

# Create conversation
echo "Creating conversation 'test 1'..."
CONV_RESPONSE=$(curl -s -X POST "$API/conversations/new" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"test 1"}')

CONV_ID=$(echo "$CONV_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "Conversation ID: $CONV_ID"
echo ""

run_query() {
  local num=$1
  local query=$2
  echo "=============================================="
  echo "QUERY $num: $query"
  echo "=============================================="

  RESPONSE=$(curl -s "$API/stream" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"conversationId\":\"$CONV_ID\",\"message\":\"$query\",\"attachedDocuments\":[],\"client\":{\"wantsStreaming\":true}}" \
    --max-time 120 2>&1)

  # Extract final content
  FINAL=$(echo "$RESPONSE" | grep '"type":"final"' | sed 's/data: //' | head -1)
  if [ -n "$FINAL" ]; then
    echo "$FINAL" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('content',''))" 2>/dev/null || echo "$RESPONSE" | tail -5
  else
    echo "$RESPONSE" | tail -10
  fi
  echo ""
  echo ""
  sleep 1
}

run_query 1 "Can you open the Framework Scrum document?"
run_query 2 "Give me a quick 2–3 sentence overview of what this chapter covers."
run_query 3 "What's the simplest definition of Scrum according to this chapter?"
run_query 4 "What are the 3 pillars and what do they mean (short)?"
run_query 5 "What are the Scrum values listed here?"
run_query 6 "Who are the roles in Scrum and what does each one do?"
run_query 7 "What are the events/ceremonies and their purpose?"
run_query 8 "What are the main artifacts and what problem does each solve?"
run_query 9 "Where does it explain Sprint Goal and Definition of Done?"
run_query 10 "Summarize the chapter in 5 bullets, full sentences."
run_query 11 "What does it say about Scrum being a framework vs methodology?"
run_query 12 "What are the common misunderstandings about Scrum mentioned here?"
run_query 13 "If you had to teach this in 60 seconds, what are the key takeaways?"
run_query 14 "Quote one short sentence that best captures the chapter's core message."
run_query 15 "What practical advice does it give for implementing Scrum in real teams?"

echo "=============================================="
echo "TEST COMPLETE"
echo "=============================================="
