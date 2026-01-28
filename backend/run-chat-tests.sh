#!/bin/bash

TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJmMzNjNGE3YS0wMDNkLTQxZTgtYjI1OS02OTE0YmFjMWNjYzUiLCJlbWFpbCI6InRlc3RAa29kYS5jb20iLCJpYXQiOjE3Njk2MTIxMDksImV4cCI6MTc2OTYxNTcwOX0.rLeoc4hukjOSu9kdvnHcDeaUBTJcB3nJfrflivOdSG0"
API="http://localhost:5000/api/chat/stream"

run_query() {
  local num=$1
  local query=$2
  echo "=============================================="
  echo "QUERY $num: $query"
  echo "=============================================="
  curl -s "$API" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"message\":\"$query\"}" \
    --max-time 120 2>&1
  echo -e "\n\n"
}

run_query 1 "Hey — can you open the document that analyzes mezzanine for me?"
run_query 2 "What's this document about?"
run_query 3 "What's the total investment in this mezzanine project?"
run_query 4 "How many m² is the mezzanine, and what R$/m² did they use?"
run_query 5 "Can you pull the main assumptions from the analysis?"
run_query 6 "What are the biggest risks or constraints mentioned?"
run_query 7 "Where does it talk about ROI / payback / retorno? Point me to the page/section."
run_query 8 "Is there any timeline or schedule in here? If yes, extract it."
run_query 9 "Explain the financial logic in one clear paragraph."
run_query 10 "Put the cost breakdown into a small table (item → value → note)."
run_query 11 "Can you quote the exact line where the total investment is stated?"
run_query 12 "What operational changes does this mezzanine create (capacity, access, safety, flow)?"
run_query 13 "What variables would change the outcome of the analysis the most?"
run_query 14 "If I'm presenting this to an investor, what are the top 3 points that matter?"
run_query 15 "Does it mention any recommendations or next steps? If yes, list them."
