# 🚀 KODA Speedrun Test - Quick Start Guide

## What This Does
- Runs all 20 test questions automatically via WebSocket (like real chat!)
- Shows results in real-time as each question is answered
- Scores accuracy, completeness, sources, and response time
- Generates a final report with grades and category breakdowns

## How to Run

### Quick Start (WebSocket Version - Recommended)

1. **Make sure your backend server is running** on `localhost:3001`

2. Open a **NEW** terminal window and run:

```bash
cd C:\Users\Pedro\Desktop\webapp\backend
npx ts-node koda-speedrun-websocket.ts
```

3. **Watch the Magic! ✨**

The script will:
- Run all 20 questions automatically
- Show each answer as it comes in
- Display scores for each question
- Show a final summary with grade

## Example Output

```
╔═══════════════════════════════════════════════════════════════╗
║        🚀 KODA AI SPEEDRUN TEST - 20 QUESTIONS 🚀            ║
╚═══════════════════════════════════════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Question 1/20 🟢 [BASIC]
❓ Hello! How are you?
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ Answer (1245ms):
  Hello! I'm doing well, thank you for asking! I'm here to help you...

📊 Scores:
  Accuracy:        ██████████ 5/5
  Completeness:    ████████░░ 4/5
  Source Citation: ██████░░░░ 3/5
  Response Time:   ██████████ 5/5
  Total:           █████████████████░░░ 17/20
```

## What Gets Tested

### 🟢 Basic (Questions 1-5)
- Greetings
- Document counting
- File listing
- Finding specific documents

### 🟡 Intermediate (Questions 6-10)
- Folder locations
- Content summaries
- Information extraction
- Document comparisons

### 🟠 Advanced (Questions 11-15)
- Multi-document analysis
- Timeline queries
- Technical explanations
- Financial metrics

### 🔴 Complex (Questions 16-20)
- Multi-step reasoning
- Strategic questions
- Cross-document synthesis
- Risk analysis

## Grading Scale

- **360-400 (A+)**: Production Ready 🎉
- **320-359 (A)**: Excellent ⭐
- **280-319 (B)**: Good, needs minor fixes
- **240-279 (C)**: Acceptable, needs work
- **200-239 (D)**: Major issues
- **< 200 (F)**: Critical failures

## Troubleshooting

### "Error: Access token is required"
→ Make sure you copied the token correctly from localStorage

### "ERROR: connect ECONNREFUSED"
→ Make sure your backend server is running on localhost:3001

### "ERROR: 401 Unauthorized"
→ Your token may have expired, get a new one from the browser

### SSL Certificate Error
→ The script uses https://localhost:3001, make sure SSL is configured

## What to Look For

### Good Signs ✅
- Response times under 3 seconds
- Multiple sources cited
- Comprehensive answers (50+ words)
- Accurate keyword matches

### Red Flags ❌
- "No information found" for documents that exist
- Missing source citations
- Very short answers (< 10 words)
- Response times over 10 seconds

## After the Test

The script will show you:
1. **Total Score** - Your overall performance
2. **Grade** - A+ to F rating
3. **Category Breakdown** - How each difficulty level performed
4. **Top 3 Questions** - Your best answers
5. **Bottom 3 Questions** - Areas that need improvement

Use this information to identify which parts of KODA need optimization!

---

**Need help?** Check the terminal output for specific error messages.
