import 'dotenv/config';
import axios from 'axios';

const API_BASE = 'http://localhost:5001';

async function testQ11() {
  const login = await axios.post(API_BASE + '/api/auth/login', { email: 'test@koda.com', password: 'test123' });
  const token = login.data.accessToken;
  const cid = 'q11-test-' + Date.now();

  const query = 'From all the folders, which file should I read to understand ranch operations?';

  console.log(`Testing Q11: "${query}"\n`);

  const res = await axios.post(API_BASE + '/api/rag/query',
    { query, conversationId: cid, language: 'en' },
    { headers: { Authorization: 'Bearer ' + token }, timeout: 30000 }
  );

  console.log('Intent:', res.data.intent);
  console.log('Answer:', res.data.answer);
  console.log('\nExpected: Should NOT return "coming soon" - should find ranch-related files');

  const isComingSoon = /coming soon/i.test(res.data.answer);
  const hasButton = /\{\{DOC::|📁/.test(res.data.answer);

  console.log(`\nResult: ${!isComingSoon && (hasButton || res.data.answer.length > 30) ? '✅ PASS' : '❌ FAIL'}`);
}

testQ11().catch(e => console.error('Error:', e.message));
