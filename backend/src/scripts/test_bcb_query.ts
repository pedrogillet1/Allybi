import http from 'http';

const SESSION = { at: '', csrf: '', rt: '' };

function captureCookies(res: http.IncomingMessage) {
  const raw = res.headers['set-cookie'];
  if (!raw) return;
  for (const line of Array.isArray(raw) ? raw : [raw]) {
    const m = line.match(/^(koda_at|koda_rt|koda_csrf)=([^;]+)/);
    if (m) (SESSION as any)[m[1].replace('koda_', '')] = m[2];
  }
}

function post(path: string, body: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request('http://localhost:5000' + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'Cookie': `koda_at=${SESSION.at}; koda_csrf=${SESSION.csrf}`,
        'x-csrf-token': SESSION.csrf,
      },
    }, (res) => {
      captureCookies(res);
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(d));
        } catch {
          resolve({ raw: d });
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function login(email: string, password: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ email, password });
    const req = http.request('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      captureCookies(res);
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        try {
          const p = JSON.parse(d);
          if (p.accessToken) SESSION.at = p.accessToken;
          resolve(p);
        } catch {
          resolve({ raw: d });
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function main() {
  await login('test@allybi.com', 'test123');
  console.log('Logged in. CSRF:', SESSION.csrf ? 'yes' : 'no');

  const bcbDocId = '27fa8bbd-dbe2-4ab0-8fa5-c445cb356c66';

  // Test 1: BCB-only (single doc)
  console.log('\n=== TEST 1: BCB doc only ===');
  const r1 = await post('/api/chat/chat', {
    message: 'What is the current reserve ratio that Brazilian commercial banks must maintain on demand deposits?',
    preferredLanguage: 'en',
    language: 'en',
    attachedDocuments: [{ id: bcbDocId, name: 'ReserveRequirements_PrimaryRules.pdf', type: 'pdf' }],
    documentIds: [bcbDocId],
  });
  const d1 = r1.data || r1;
  console.log('answerMode:', d1.answerMode);
  console.log('answer length:', (d1.assistantText || '').length);
  console.log('sources:', (d1.sources || []).length);
  if (d1.sources) {
    for (const s of d1.sources) {
      console.log('  src:', s.documentId || s.id, '-', s.title || s.filename);
    }
  }
  console.log('\nAnswer:');
  console.log(d1.assistantText || d1.error || 'NO_ANSWER');

  // Test 2: All 4 docs
  console.log('\n=== TEST 2: All 4 docs ===');
  const allDocs = [
    { id: bcbDocId, name: 'ReserveRequirements_PrimaryRules.pdf', type: 'pdf' },
    { id: '75edf961-122b-45ae-a646-7bebbbbf6655', name: 'Trade_Act_of_1974.pdf', type: 'pdf' },
    { id: '8d46ada3-e57e-4032-b3f4-d204860a0180', name: 'br373pt_1.pdf', type: 'pdf' },
    { id: '17079e4e-5c47-4b0a-912c-70816ba7028a', name: 'us423en.pdf', type: 'pdf' },
  ];
  const r2 = await post('/api/chat/chat', {
    message: 'What is the current reserve ratio that Brazilian commercial banks must maintain on demand deposits?',
    preferredLanguage: 'en',
    language: 'en',
    attachedDocuments: allDocs,
    documentIds: allDocs.map((d) => d.id),
  });
  const d2 = r2.data || r2;
  console.log('answerMode:', d2.answerMode);
  console.log('answer length:', (d2.assistantText || '').length);
  console.log('sources:', (d2.sources || []).length);
  if (d2.sources) {
    for (const s of d2.sources) {
      console.log('  src:', s.documentId || s.id, '-', s.title || s.filename);
    }
  }
  console.log('\nAnswer:');
  console.log(d2.assistantText || d2.error || 'NO_ANSWER');
}

main().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
