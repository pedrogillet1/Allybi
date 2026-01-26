import axios from 'axios';

const API_BASE_URL = 'http://localhost:5000/api';

async function run() {
  // Login
  console.log('Logging in...');
  const loginRes = await axios.post(`${API_BASE_URL}/auth/login`, {
    email: 'localhost@koda.com',
    password: 'localhost123'
  });
  const token = loginRes.data.accessToken;
  const headers = { Authorization: `Bearer ${token}` };
  console.log('Logged in successfully!\n');

  // Create conversation
  const convRes = await axios.post(
    `${API_BASE_URL}/chat/conversations`,
    { title: 'Full Response Test' },
    { headers }
  );
  const conversationId = convRes.data.id;
  console.log(`Created conversation: ${conversationId}\n`);

  const queries = [
    'Hello',
    'What can you do?',
    'Do you understand Portuguese?',
    'Show me all documents and their contents',
    'Analyze the key themes across all my documents and provide insights',
    'List all the main topics from my documents'
  ];

  for (const query of queries) {
    console.log('='.repeat(70));
    console.log(`QUERY: ${query}`);
    console.log('='.repeat(70));

    const res = await axios.post(
      `${API_BASE_URL}/rag/query`,
      { query, conversationId },
      { headers }
    );

    console.log('\nFULL ANSWER:\n');
    console.log(res.data.answer);
    console.log(`\n[Length: ${res.data.answer.length} chars]`);
    console.log('\n');
  }
}

run().catch(e => console.error('Error:', e.message));
