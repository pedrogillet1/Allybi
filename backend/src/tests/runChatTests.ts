/**
 * Comprehensive Chat & RAG Test Suite
 * Tests all AI capabilities with your uploaded documents
 */

import axios from 'axios';
import prisma from '../config/database';

const API_BASE_URL = 'http://localhost:5000/api';

interface TestResult {
  documentName: string;
  questionNumber: number;
  question: string;
  answerLength?: string;
  passed: boolean;
  answer?: string;
  error?: string;
  duration: number;
  confidence?: number;
  intent?: string;
}

class ChatTestRunner {
  private authToken: string = '';
  private userId: string = '';
  private conversationId: string = '';
  private results: TestResult[] = [];
  private documents: any[] = [];

  async run() {
    console.log('🚀 Starting Comprehensive Chat & RAG Test Suite...\n');

    try {
      // Step 1: Authenticate
      await this.authenticate();

      // Step 2: Get uploaded documents
      await this.getDocuments();

      // Step 3: Create test conversation
      await this.createConversation();

      // Step 4: Run document-specific tests
      await this.runDocumentTests();

      // Step 5: Run Phase 3 feature tests
      await this.runPhase3Tests();

      // Step 6: Print comprehensive results
      this.printResults();

    } catch (error: any) {
      console.error('❌ Test suite failed:', error.message);
      if (error.response?.data) {
        console.error('Response data:', JSON.stringify(error.response.data, null, 2));
      }
    }
  }

  private async authenticate() {
    console.log('🔐 Authenticating...');

    // Get the user with uploaded documents
    const user = await prisma.user.findFirst({
      where: { email: '123hackerabc@gmail.com' },
    });

    if (!user) {
      throw new Error('User 123hackerabc@gmail.com not found in database');
    }

    this.userId = user.id;
    console.log(`✅ Using user: ${user.email} (${user.id})`);

    // Generate a token manually for testing
    // In production, this would come from the login endpoint
    const jwt = require('jsonwebtoken');
    const { config } = require('../config/env');

    this.authToken = jwt.sign(
      { userId: user.id, email: user.email },
      config.JWT_ACCESS_SECRET,
      { expiresIn: '1h' }
    );

    console.log('✅ Token generated successfully\n');
  }

  private async getDocuments() {
    console.log('📄 Fetching uploaded documents...');

    this.documents = await prisma.document.findMany({
      where: {
        userId: this.userId,
        status: 'completed',
      },
      include: {
        metadata: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    console.log(`✅ Found ${this.documents.length} documents:\n`);
    this.documents.forEach((doc, idx) => {
      console.log(`   ${idx + 1}. ${doc.filename} (${doc.mimeType})`);
    });
    console.log('');
  }

  private async createConversation() {
    console.log('💬 Creating test conversation...');

    const response = await axios.post(
      `${API_BASE_URL}/chat/conversations`,
      { title: 'AI Capabilities Test Suite' },
      { headers: { Authorization: `Bearer ${this.authToken}` } }
    );

    this.conversationId = response.data.id;
    console.log(`✅ Conversation created: ${this.conversationId}\n`);
  }

  private async runDocumentTests() {
    console.log('=' .repeat(70));
    console.log('📊 RUNNING DOCUMENT-SPECIFIC TESTS');
    console.log('=' .repeat(70) + '\n');

    // Test Dataset: 3 questions per document
    const testQuestions: { [key: string]: Array<{ question: string; answerLength: string }> } = {
      'pasted_content_3.txt': [
        { question: 'What AI capabilities are currently functional?', answerLength: 'summary' },
        { question: 'Explain the Phase 3 enhancements in detail', answerLength: 'long' },
        { question: 'What is confidence gating?', answerLength: 'short' },
      ],
      'ICP_Koda_Formatado': [
        { question: 'What is the Ideal Customer Profile for KODA?', answerLength: 'medium' },
        { question: 'Summarize the target market segments', answerLength: 'summary' },
        { question: 'What are the key pain points KODA addresses?', answerLength: 'long' },
      ],
      'Kodablueprint': [
        { question: 'What is the overall KODA strategy?', answerLength: 'summary' },
        { question: 'Describe the technical architecture briefly', answerLength: 'medium' },
        { question: 'What are the main features?', answerLength: 'short' },
      ],
      'LoneMountainRanchP&L2025': [
        { question: 'What are the major expense categories?', answerLength: 'summary' },
        { question: 'Summarize the revenue projections', answerLength: 'medium' },
        { question: 'What is the total budget?', answerLength: 'short' },
      ],
    };

    for (const doc of this.documents) {
      // Find matching test questions
      const docKey = Object.keys(testQuestions).find(key =>
        doc.filename.toLowerCase().includes(key.toLowerCase().replace(/\s+/g, ''))
      );

      if (!docKey) {
        console.log(`⏭️  Skipping ${doc.filename} (no test questions defined)\n`);
        continue;
      }

      console.log(`\n📄 Testing: ${doc.filename}`);
      console.log('-'.repeat(70));

      const questions = testQuestions[docKey];
      for (let i = 0; i < questions.length; i++) {
        const { question, answerLength } = questions[i];
        await this.runTest(doc.filename, i + 1, question, answerLength, doc.id);
      }
    }
  }

  private async runPhase3Tests() {
    console.log('\n' + '=' .repeat(70));
    console.log('✨ RUNNING PHASE 3 FEATURE TESTS');
    console.log('=' .repeat(70) + '\n');

    // Test 1: Answer Length Variations
    console.log('📏 Testing Answer Length Control:');
    console.log('-'.repeat(70));

    const lengthTests = [
      { length: 'short', question: 'What is KODA?' },
      { length: 'medium', question: 'What is KODA?' },
      { length: 'summary', question: 'What is KODA?' },
      { length: 'long', question: 'What is KODA?' },
    ];

    for (const test of lengthTests) {
      await this.runTest('Length Test', 0, test.question, test.length);
    }

    // Test 2: Mentions Search
    console.log('\n\n🔍 Testing Mentions Search:');
    console.log('-'.repeat(70));

    const mentionsTests = [
      'Where is "revenue" mentioned?',
      'Find all mentions of "budget"',
      'Where is "customer" mentioned?',
    ];

    for (let i = 0; i < mentionsTests.length; i++) {
      await this.runTest('Mentions Search', i + 1, mentionsTests[i], 'medium');
    }

    // Test 3: Intent Detection
    console.log('\n\n🎯 Testing Intent Detection:');
    console.log('-'.repeat(70));

    const intentTests = [
      'Summarize the main points of my documents',
      'What is the total budget amount?',
      'Compare the KODA ICP and blueprint documents',
    ];

    for (let i = 0; i < intentTests.length; i++) {
      await this.runTest('Intent Test', i + 1, intentTests[i], 'medium');
    }

    // Test 4: Confidence Gating
    console.log('\n\n🚫 Testing Confidence Gating:');
    console.log('-'.repeat(70));

    const confidenceTests = [
      'What is the weather on Mars?', // Should fail
      'Tell me about quantum physics', // Should fail
      'What is the capital of France?', // Should fail
    ];

    for (let i = 0; i < confidenceTests.length; i++) {
      await this.runTest('Confidence Test', i + 1, confidenceTests[i], 'medium');
    }
  }

  private async runTest(
    documentName: string,
    questionNumber: number,
    question: string,
    answerLength: string,
    documentId?: string
  ) {
    const startTime = Date.now();

    try {
      console.log(`\n  🧪 Q${questionNumber}: ${question}`);
      console.log(`     📏 Length: ${answerLength}${documentId ? ` | 📄 Doc: ${documentId.substring(0, 8)}...` : ''}`);

      const response = await axios.post(
        `${API_BASE_URL}/rag/query`,
        {
          query: question,
          conversationId: this.conversationId,
          answerLength,
          documentId,
        },
        {
          headers: { Authorization: `Bearer ${this.authToken}` },
        }
      );

      const duration = Date.now() - startTime;
      const answer = response.data.answer || response.data.assistantMessage?.content || 'No answer';
      const confidence = response.data.confidence;
      const intent = response.data.intent;

      // Count words
      const wordCount = answer.split(/\s+/).length;

      this.results.push({
        documentName,
        questionNumber,
        question,
        answerLength,
        passed: true,
        answer: answer.substring(0, 200) + (answer.length > 200 ? '...' : ''),
        duration,
        confidence,
        intent,
      });

      console.log(`  ✅ PASSED (${duration}ms)`);
      console.log(`     📊 Words: ${wordCount} | Confidence: ${confidence?.toFixed(2) || 'N/A'} | Intent: ${intent || 'N/A'}`);
      console.log(`     💬 Answer: ${answer.substring(0, 150)}${answer.length > 150 ? '...' : ''}`);

    } catch (error: any) {
      const duration = Date.now() - startTime;

      this.results.push({
        documentName,
        questionNumber,
        question,
        answerLength,
        passed: false,
        error: error.message,
        duration,
      });

      console.log(`  ❌ FAILED (${duration}ms)`);
      console.log(`     Error: ${error.message}`);
      if (error.response?.data?.error) {
        console.log(`     Server: ${error.response.data.error}`);
      }
    }
  }

  private printResults() {
    console.log('\n\n' + '='.repeat(70));
    console.log('📊 COMPREHENSIVE TEST RESULTS');
    console.log('='.repeat(70) + '\n');

    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.filter(r => !r.passed).length;
    const total = this.results.length;
    const passRate = ((passed / total) * 100).toFixed(1);

    console.log(`✅ Passed: ${passed}/${total} (${passRate}%)`);
    console.log(`❌ Failed: ${failed}/${total}`);

    const avgDuration = (
      this.results.reduce((sum, r) => sum + r.duration, 0) / total
    ).toFixed(0);

    console.log(`⏱️  Average response time: ${avgDuration}ms`);

    // Group results by document
    const byDocument = this.results.reduce((acc, result) => {
      if (!acc[result.documentName]) {
        acc[result.documentName] = [];
      }
      acc[result.documentName].push(result);
      return acc;
    }, {} as { [key: string]: TestResult[] });

    console.log('\n📋 Results by Category:\n');

    for (const [docName, results] of Object.entries(byDocument)) {
      const docPassed = results.filter(r => r.passed).length;
      const docTotal = results.length;
      const status = docPassed === docTotal ? '✅' : '⚠️';

      console.log(`${status} ${docName}: ${docPassed}/${docTotal} passed`);
    }

    if (failed > 0) {
      console.log('\n❌ Failed Tests:');
      this.results
        .filter(r => !r.passed)
        .forEach(r => {
          console.log(`   - [${r.documentName}] Q${r.questionNumber}: ${r.question}`);
          console.log(`     Error: ${r.error}`);
        });
    }

    // Print some successful answers for verification
    console.log('\n✨ Sample Successful Responses:\n');
    this.results
      .filter(r => r.passed)
      .slice(0, 3)
      .forEach((r, idx) => {
        console.log(`${idx + 1}. [${r.documentName}] ${r.question}`);
        console.log(`   Answer: ${r.answer}`);
        console.log(`   Stats: ${r.duration}ms | Intent: ${r.intent || 'N/A'} | Confidence: ${r.confidence?.toFixed(2) || 'N/A'}\n`);
      });

    console.log('='.repeat(70) + '\n');
  }
}

// Run the test suite
const tester = new ChatTestRunner();
tester.run().catch(console.error);
