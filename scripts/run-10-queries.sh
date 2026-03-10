#!/bin/bash
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxZTAxNzRhMi1hN2UyLTQ1NmQtOWY5MC1lODM1NDI1YWNkNjciLCJlbWFpbCI6InRlc3RAYWxseWJpLmNvbSIsInNpZCI6IjgwMjJkOTdkLTZlZWMtNDQwNS04OTg0LTc4OGNjMzY3NTY2YyIsInN2IjoxLCJpYXQiOjE3NzMxNjEzNTMsImV4cCI6MTc3MzI0Nzc1M30.rJjaE0DfOVctMpvhUpLctwq81wJIK-uM9x64gW54Sag"
CONV="0a51aa28-ac1e-451c-b400-423326ce1c1d"
OUTFILE="/c/Users/Pedro/Desktop/webapp/reports/query-results.txt"
mkdir -p /c/Users/Pedro/Desktop/webapp/reports

send_query() {
  local num="$1"
  local query="$2"
  echo ">>> QUERY $num: $query" >> "$OUTFILE"
  echo "" >> "$OUTFILE"

  RESPONSE=$(curl -s -N -X POST "http://localhost:5000/api/chat/conversations/$CONV/messages/adaptive/stream" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"content\":\"$query\"}" 2>&1)

  # Extract the final JSON which has the full content
  FINAL=$(echo "$RESPONSE" | grep '"type":"final"' | sed 's/^data: //')
  CONTENT=$(echo "$FINAL" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('content','NO CONTENT'))" 2>/dev/null)

  if [ -z "$CONTENT" ]; then
    # Fallback: concatenate deltas
    CONTENT=$(echo "$RESPONSE" | grep '"type":"delta"' | sed 's/^data: //' | python3 -c "
import sys,json
text=''
for line in sys.stdin:
  line=line.strip()
  if line:
    try:
      d=json.loads(line)
      text+=d.get('text','')
    except: pass
print(text)
" 2>/dev/null)
  fi

  # Extract sources
  SOURCES=$(echo "$FINAL" | python3 -c "
import sys,json
try:
  d=json.load(sys.stdin)
  for s in d.get('sources',[]):
    print(f\"  - {s.get('filename','?')} (page {s.get('page','?')})\")
  mode = d.get('answerMode','?')
  print(f'  Answer mode: {mode}')
except: print('  (no source data)')
" 2>/dev/null)

  echo "ANSWER:" >> "$OUTFILE"
  echo "$CONTENT" >> "$OUTFILE"
  echo "" >> "$OUTFILE"
  echo "SOURCES:" >> "$OUTFILE"
  echo "$SOURCES" >> "$OUTFILE"
  echo "" >> "$OUTFILE"
  echo "---" >> "$OUTFILE"
  echo "" >> "$OUTFILE"
  echo "Done query $num"
}

# Clear output file
> "$OUTFILE"

# Query 1 already done, but re-run for consistency in the same file
send_query 1 "What is the estimated market potential for BESS (Battery Energy Storage Systems) in Brazil, and what are the main drivers identified in the preliminary assessment?"
send_query 2 "What is Mayfair Group's investment strategy and what are their key portfolio holdings or target sectors for 2025?"
send_query 3 "What is the total amount due on the AT&T bill from December 2023, and what services are included in the charges?"
send_query 4 "What is the history of Breguet as a watchmaker, and what are the most notable timepieces or innovations mentioned in the document?"
send_query 5 "What are the main provisions of the Trade Act of 1974 regarding unfair trade practices and import relief?"
send_query 6 "Quais sao os principais objetivos e metas do Plano de Dados Abertos do IBGE para 2024-2025?"
send_query 7 "What are the key property details and financial terms in the ARM Montana and Arizona summary?"
send_query 8 "Qual e o modelo de negocio apresentado para o servico de guarda de bens e self storage?"
send_query 9 "What are the reserve requirements specified in the Primary Rules document, including any percentages or thresholds?"
send_query 10 "Quais sao os dados apresentados na Tabela 1.1 sobre nascidos vivos, e quais estados ou regioes aparecem com os maiores numeros?"

echo "ALL DONE"
