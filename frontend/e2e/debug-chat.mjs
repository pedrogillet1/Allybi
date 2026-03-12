import http from 'http';

function post(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), ...headers },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data, setCookies: res.headers['set-cookie'] || [] }));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('timeout')));
    req.write(payload);
    req.end();
  });
}

function get(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: 'GET', headers }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data, setCookies: res.headers['set-cookie'] || [] }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  // 1. Login
  const loginRes = await post('http://localhost:5000/api/auth/login', { email: 'test@koda.com', password: 'test1234' });
  const login = JSON.parse(loginRes.body);
  if (!login.accessToken) { console.error('Login failed:', loginRes.body.substring(0, 300)); return; }
  console.log('Login OK');

  let at = '', rt = '', csrf = '';
  for (const c of loginRes.setCookies) {
    if (c.startsWith('koda_at=')) at = c.split('=')[1].split(';')[0];
    if (c.startsWith('koda_rt=')) rt = c.split('=')[1].split(';')[0];
    if (c.startsWith('koda_csrf=')) csrf = c.split('=')[1].split(';')[0];
  }
  console.log('Cookies:', { at: at.length > 0, rt: rt.length > 0, csrf: csrf.length > 0 });

  const cookieStr = [at && 'koda_at=' + at, rt && 'koda_rt=' + rt, csrf && 'koda_csrf=' + csrf].filter(Boolean).join('; ');
  const authHeaders = { Cookie: cookieStr, 'x-csrf-token': csrf, Authorization: 'Bearer ' + login.accessToken };

  // 2. Get docs
  const docsRes = await get('http://localhost:5000/api/documents', authHeaders);
  const docsData = JSON.parse(docsRes.body);
  const docs = docsData.data?.items || docsData.data || [];
  console.log('Docs found:', docs.length);

  const bess = docs.find(d => d.id.startsWith('3fd09f55'));
  if (!bess) {
    console.log('BESS not found. Docs:');
    docs.forEach(d => console.log(' ', d.id.substring(0, 8), d.status, d.filename));
    return;
  }
  console.log('BESS full ID:', bess.id);

  // 3. Try chat
  const chatBody = {
    message: 'What is the main topic of this document?',
    preferredLanguage: 'en',
    language: 'en',
    attachedDocuments: [{ id: bess.id, name: bess.filename, type: 'pdf' }],
    documentIds: [bess.id],
  };
  console.log('Sending chat request...');
  const chatRes = await post('http://localhost:5000/api/chat/stream', chatBody, {
    ...authHeaders,
    Accept: 'text/event-stream',
  });
  console.log('Chat status:', chatRes.status);
  console.log('Chat response (first 1000):', chatRes.body.substring(0, 1000));
}

main().catch(e => console.error('Fatal:', e));
