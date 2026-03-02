const http = require('http');

function post(path, body, token) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const opts = {
      hostname: 'localhost', port: 5000, path, method: 'POST',
      timeout: 120000,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    };
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    const req = http.request(opts, res => {
      let chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
        catch(e) { resolve({ error: 'parse_error', raw: Buffer.concat(chunks).toString().slice(0, 300) }); }
      });
    });
    req.setTimeout(120000, () => { req.destroy(new Error('timeout')); });
    req.on('error', e => resolve({ error: e.message }));
    req.write(data);
    req.end();
  });
}

// 5 conversations × 20 queries each = 100 total
// Each conversation targets different document clusters
const CONVERSATIONS = [
  {
    title: 'Conv1 — AT&T Bill, Move-Out Statement, Certidao Quitacao',
    queries: [
      'What is the total amount due on the AT&T bill?',
      'What is the account number on the AT&T wireless bill?',
      'What phone numbers are listed on the AT&T bill?',
      'What are the monthly service charges on the wireless account?',
      'What is the move-out statement about? Summarize the charges.',
      'What is the address mentioned in the move-out statement?',
      'What deductions or credits appear on the move-out statement?',
      'What is the total balance on the move-out statement?',
      'What does the certidão de quitação say? What entity issued it?',
      'What property or obligation does the certidão de quitação cover?',
      'Compare the amounts on the AT&T bill vs the move-out statement.',
      'What dates are mentioned across these financial documents?',
      'Are there any late fees or penalties in any of the bills?',
      'What is the billing period for the AT&T charges?',
      'Who is the account holder on the AT&T bill?',
      'What taxes and surcharges appear on the phone bill?',
      'What is the payment due date on the AT&T bill?',
      'Is there a security deposit mentioned in the move-out statement?',
      'What utility charges appear in the move-out documents?',
      'Summarize all financial obligations across the billing documents.',
    ],
  },
  {
    title: 'Conv2 — BESS Brazil Market, Mayfair Investor Deck, ARM Summary',
    queries: [
      'What is the BESS preliminary assessment about?',
      'What is the estimated market potential for BESS in Brazil?',
      'What regions or states in Brazil are highlighted for BESS?',
      'What key metrics or projections are in the BESS report?',
      'What does the Mayfair Group investor deck cover?',
      'What is Mayfair Group\'s investment strategy or focus?',
      'What financial figures or returns are mentioned in the Mayfair deck?',
      'What team members or leadership are listed in the Mayfair presentation?',
      'What does the ARM Montana and Arizona summary contain?',
      'What property or real estate details are in the ARM summary?',
      'What are the key financial terms in the ARM document?',
      'Compare the investment opportunities in BESS vs Mayfair documents.',
      'What risk factors are mentioned in any of the investment documents?',
      'What timelines or milestones appear in the BESS assessment?',
      'What is the total investment amount discussed in the Mayfair deck?',
      'What geographic markets are covered across all investment documents?',
      'What energy or infrastructure themes appear in the BESS report?',
      'What regulatory considerations are mentioned for Brazil?',
      'What returns or IRR projections appear in any document?',
      'Give me a comprehensive summary of all the investment documents.',
    ],
  },
  {
    title: 'Conv3 — Medical Exams, Birth Certificate, SEVIS, Pedro Gillet ID',
    queries: [
      'What medical exams are documented? List all test results.',
      'What are the key values or measurements in the medical exams?',
      'Are there any abnormal results in the medical examination?',
      'What is the date of the medical exams?',
      'What does the certidão de nascimento (birth certificate) say?',
      'What is the full name on the birth certificate?',
      'What are the parents\' names on the birth certificate?',
      'Where and when was the person born according to the certificate?',
      'What is the SEVIS RTI document about?',
      'What institution or school is mentioned in the SEVIS document?',
      'What student information appears in the SEVIS record?',
      'What immigration or visa details are in the SEVIS document?',
      'What does the Pedro Gillet document contain?',
      'What personal identification details are in the Pedro Gillet document?',
      'What dates are associated with the identification documents?',
      'Compare the personal information across the birth certificate and ID.',
      'What nationality or citizenship information appears in the documents?',
      'What is the registration number on the birth certificate?',
      'What educational institution details appear across all documents?',
      'Summarize all personal identification information from the documents.',
    ],
  },
  {
    title: 'Conv4 — Flight Tickets, OBA Marketing, Trabalho Projeto, Trabalho Final',
    queries: [
      'What flight information is in the LATAM airline document?',
      'What is the departure and arrival for the LATAM flight?',
      'What passengers are listed on the LATAM flight booking?',
      'What is the booking reference or confirmation number for LATAM?',
      'What does the aereo Alvaro flight document contain?',
      'What is the flight route in the Alvaro document?',
      'What dates are the flights scheduled for?',
      'What is OBA marketing services document about?',
      'What services does OBA offer according to the document?',
      'What pricing or packages are mentioned in the OBA marketing doc?',
      'What is the trabalho projeto (project work) document about?',
      'What are the main topics or sections in the trabalho projeto?',
      'What academic subject does the trabalho projeto cover?',
      'What conclusions or results are in the trabalho projeto?',
      'What does the trabalho final (final work/image) contain?',
      'Compare the two trabalho documents — are they related?',
      'What airline class or fare type is on the flight bookings?',
      'What total prices appear on the flight documents?',
      'What contact information appears in the OBA marketing document?',
      'Summarize all travel-related documents.',
    ],
  },
  {
    title: 'Conv5 — Breguet, Anotações Aula, RF2 Gillet Neto, Self Storage PPTX',
    queries: [
      'What is the Breguet document about?',
      'What historical or technical details are in the Breguet document?',
      'What key facts or figures appear in the Breguet document?',
      'What does the class notes (anotações aula) document cover?',
      'What subject or course are the class notes from?',
      'What are the main topics discussed in the class notes?',
      'What formulas or key concepts appear in the anotações?',
      'What is the RF2 Gillet Neto Paulo document about?',
      'What tax or financial information is in the RF2 document?',
      'What income or asset figures appear in the RF2?',
      'What is the filing year or period for the RF2 document?',
      'What does the self storage presentation contain?',
      'What services are offered in the self storage presentation?',
      'What pricing or unit sizes are in the self storage deck?',
      'What location or address is mentioned in the self storage document?',
      'What is the company name in the self storage presentation?',
      'Compare the financial information in RF2 vs other documents.',
      'What educational content appears across all documents?',
      'What professional or business services are documented?',
      'Give me a comprehensive summary across all the documents in this conversation.',
    ],
  },
];

(async () => {
  const login = await post('/api/auth/login', { email: 'test@koda.com', password: 'test1234' });
  const token = login.accessToken || login.token;
  if (!token) { console.log('LOGIN FAILED:', JSON.stringify(login).slice(0, 300)); return; }
  console.log('Logged in\n');

  let totalPassed = 0;
  let totalFailed = 0;
  let totalError = 0;
  const allResults = [];

  for (let c = 0; c < CONVERSATIONS.length; c++) {
    const convDef = CONVERSATIONS[c];
    console.log('================================================================');
    console.log('CONVERSATION ' + (c + 1) + ': ' + convDef.title);
    console.log('================================================================\n');

    const conv = await post('/api/chat/conversations', { title: convDef.title }, token);
    const convId = conv.data?.id || conv.id;
    if (!convId) {
      console.log('  CONV CREATE FAILED: ' + JSON.stringify(conv).slice(0, 200));
      totalError += convDef.queries.length;
      continue;
    }
    console.log('  ConvID: ' + convId + '\n');

    let convPassed = 0;
    let convFailed = 0;

    for (let q = 0; q < convDef.queries.length; q++) {
      const query = convDef.queries[q];
      const label = 'C' + (c+1) + 'Q' + String(q+1).padStart(2,'0');
      process.stdout.write('  ' + label + ': ');

      // Small delay between queries to avoid overwhelming the server
      if (q > 0) await new Promise(r => setTimeout(r, 1500));

      const start = Date.now();
      const chat = await post('/api/chat/chat', {
        conversationId: convId,
        message: query,
        language: 'en'
      }, token);
      const ms = Date.now() - start;

      if (chat.error) {
        // Server may have crashed — wait and retry once
        console.log('[RETRY] ' + ms + 'ms | ' + chat.error + ' — waiting 5s...');
        await new Promise(r => setTimeout(r, 5000));
        const retry = await post('/api/chat/chat', {
          conversationId: convId,
          message: query,
          language: 'en'
        }, token);
        if (retry.error || !(retry.data?.assistantText || '').trim()) {
          console.log('  ' + label + ': [ERROR] retry failed: ' + (retry.error || 'empty'));
          totalError++;
          allResults.push({ label, query, status: 'ERROR', ms, text: chat.error });
          continue;
        }
        // Use retry result
        Object.assign(chat, retry);
      }

      const d = chat.data || {};
      const text = (d.assistantText || '').trim();
      const isFallback = text.includes('Let me try a different approach') ||
                         text.includes('could not safely finalize') ||
                         text.includes('Reenvie') ||
                         text.includes('Nao consegui finalizar') ||
                         text.includes('No pude finalizar') ||
                         text.length < 15;
      const status = isFallback ? 'FAIL' : 'PASS';
      if (isFallback) { convFailed++; totalFailed++; } else { convPassed++; totalPassed++; }

      const shortText = text.replace(/\n/g, ' ').slice(0, 150);
      console.log('[' + status + '] ' + ms + 'ms | ' + (d.answerMode || '?') + ' | ' + (d.failureCode || 'ok') + ' | tokens=' + (d.assistantTelemetry?.usage?.completionTokens || '?'));
      console.log('         "' + shortText + '"');

      allResults.push({
        label, query, status, ms,
        text: text.slice(0, 300),
        mode: d.answerMode,
        failureCode: d.failureCode,
        sources: (d.sources || []).length,
        tokens: d.assistantTelemetry?.usage?.completionTokens,
      });
    }

    console.log('\n  Conv ' + (c+1) + ' results: ' + convPassed + '/' + convDef.queries.length + ' passed, ' + convFailed + ' failed\n');
  }

  console.log('\n================================================================');
  console.log('FINAL RESULTS: ' + totalPassed + '/100 passed | ' + totalFailed + ' failed | ' + totalError + ' errors');
  console.log('================================================================\n');

  // Summary of failures
  const failures = allResults.filter(r => r.status !== 'PASS');
  if (failures.length > 0) {
    console.log('FAILED/ERROR QUERIES:');
    for (const f of failures) {
      console.log('  ' + f.label + ' [' + f.status + '] "' + f.query.slice(0,60) + '"');
      console.log('    -> ' + (f.text || '').slice(0, 120));
    }
  }

  // Mode distribution
  const modes = {};
  for (const r of allResults) {
    const m = r.mode || 'error';
    modes[m] = (modes[m] || 0) + 1;
  }
  console.log('\nAnswer mode distribution:', JSON.stringify(modes));

  // Average response time
  const times = allResults.filter(r => r.ms).map(r => r.ms);
  if (times.length > 0) {
    const avg = Math.round(times.reduce((a,b) => a+b, 0) / times.length);
    const max = Math.max(...times);
    const min = Math.min(...times);
    console.log('Response times: avg=' + avg + 'ms min=' + min + 'ms max=' + max + 'ms');
  }
})();
