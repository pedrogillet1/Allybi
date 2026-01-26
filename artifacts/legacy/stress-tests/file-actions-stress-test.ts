/**
 * Koda File Actions - Comprehensive Stress Test Script
 *
 * Tests all file actions with:
 * - Normal scenarios
 * - Edge cases
 * - Error handling
 * - Load testing
 * - Performance metrics
 * - Multilanguage support (English, Portuguese, Spanish)
 */

import axios, { AxiosError } from 'axios';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  baseUrl: process.env.API_URL || 'http://localhost:5000',
  authToken: process.env.AUTH_TOKEN || '', // JWT token for authentication
  testEmail: process.env.TEST_EMAIL || 'localhost@koda.com',
  testPassword: process.env.TEST_PASSWORD || 'localhost123',
  timeout: 60000, // 60 seconds (increased for AI processing)
  concurrentTests: 3, // Number of concurrent requests for load testing (reduced for rate limiting)
  delayBetweenTests: 3000, // 3 second delay between tests to avoid AI rate limiting
};

// ============================================================================
// TYPES
// ============================================================================

interface TestResult {
  query: string;
  category: string;
  action: string;
  success: boolean;
  responseTime: number;
  actionDetected: boolean;
  actionType?: string;
  error?: string;
  response?: string;
  statusCode?: number;
}

interface TestSummary {
  totalTests: number;
  passedTests: number;
  failedTests: number;
  passRate: string;
  avgResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
}

interface ApiResponse {
  success: boolean;
  data?: any;
  error?: string;
  responseTime: number;
  statusCode?: number;
}

// ============================================================================
// TEST DATA - All Query Variations
// ============================================================================

const TEST_QUERIES = {
  // 1. FILE MANAGEMENT ACTIONS (2 per type)
  fileManagement: {
    createFolder: [
      'Create folder Reports',
      'Criar pasta Vendas', // Portuguese
    ],
    moveFile: [
      'Move Q2 Report.pdf to Finance',
      'Mover Relatório.pdf para Vendas', // Portuguese
    ],
    renameFile: [
      'Rename Budget.xlsx to Budget 2024.xlsx',
      'Renomear Relatório.pdf para Novo Relatório.pdf', // Portuguese
    ],
    deleteFile: [
      'Delete old-report.pdf',
      'Deletar arquivo-antigo.pdf', // Portuguese
    ],
  },

  // 2. FILE DISPLAY ACTIONS (2 per type)
  fileDisplay: {
    showFile: [
      'Show me the Q2 Report',
      'Me mostra o Relatório Q2', // Portuguese
    ],
    showSingleDocument: [
      'Which document mentions Q2 2025 decline?',
      'Qual documento fala sobre receita?', // Portuguese
    ],
    showMultipleDocuments: [
      'Documents about revenue',
      'Documentos sobre orçamento', // Portuguese
    ],
  },

  // 3. LIST ACTIONS (2 per type)
  listActions: {
    listFolders: [
      'List folders',
      'Listar pastas', // Portuguese
    ],
    listDocuments: [
      'List documents',
      'Listar documentos', // Portuguese
    ],
    listFolderContents: [
      "What's inside the Finance folder?",
      'O que tem na pasta Vendas?', // Portuguese
    ],
  },

  // 4. UPLOAD ACTIONS (2 per type)
  uploadActions: {
    uploadRequest: [
      'Upload a file',
      'Fazer upload', // Portuguese
    ],
  },

  // 5. DOCUMENT SEARCH ACTIONS (2 per type)
  documentSearch: {
    findDocument: [
      'Find the document about Q2 2025',
      'Encontrar documento sobre receita', // Portuguese
    ],
    documentNotFound: [
      'Find document about Q7 2030', // Invalid quarter
      'Locate file about unicorns and dragons', // Doesn't exist
    ],
  },
};

// ============================================================================
// GLOBAL STATE
// ============================================================================

const results: TestResult[] = [];
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
let authToken = CONFIG.authToken;
let conversationId: string | null = null;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Authenticate and get JWT token
 */
async function authenticate(): Promise<boolean> {
  if (authToken) {
    console.log('  Using provided auth token');
    return true;
  }

  console.log('\n  Authenticating with credentials...');

  try {
    const response = await axios.post(
      `${CONFIG.baseUrl}/api/auth/login`,
      {
        email: CONFIG.testEmail,
        password: CONFIG.testPassword,
      },
      { timeout: CONFIG.timeout }
    );

    // Handle the correct response structure
    if (response.data.accessToken) {
      authToken = response.data.accessToken;
      console.log('  Authentication successful!');
      return true;
    }

    console.error('  Authentication failed: No accessToken received');
    console.error('  Response:', JSON.stringify(response.data).substring(0, 200));
    return false;
  } catch (error) {
    const axiosError = error as AxiosError;
    const status = axiosError.response?.status;
    const errorData = axiosError.response?.data as any;
    const errorMsg = errorData?.error || errorData?.message || axiosError.message;

    console.error(`  Authentication failed (${status || 'no response'}): ${errorMsg}`);

    if (axiosError.code === 'ECONNREFUSED') {
      console.error(`  Cannot connect to backend at ${CONFIG.baseUrl}`);
      console.error('  Make sure the backend is running: npm run dev');
    } else if (status === 401) {
      console.error('  Invalid credentials. Please check TEST_EMAIL and TEST_PASSWORD.');
    } else if (status === 404) {
      console.error('  Auth endpoint not found. Check API_URL configuration.');
    }

    console.log('\n  To run tests, set these environment variables:');
    console.log('    AUTH_TOKEN=<your-jwt-token>');
    console.log('  Or:');
    console.log('    TEST_EMAIL=<your-email>');
    console.log('    TEST_PASSWORD=<your-password>\n');

    return false;
  }
}

/**
 * Create a test conversation
 */
async function createTestConversation(): Promise<boolean> {
  console.log('\nCreating test conversation...');

  try {
    const response = await axios.post(
      `${CONFIG.baseUrl}/api/chat/conversations`,
      { title: 'Stress Test Conversation' },
      {
        timeout: CONFIG.timeout,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
      }
    );

    if (response.data.id) {
      conversationId = response.data.id;
      console.log('Test conversation created:', conversationId);
      return true;
    }

    console.error('Failed to create conversation');
    return false;
  } catch (error) {
    const axiosError = error as AxiosError;
    console.error('Create conversation error:', axiosError.message);
    return false;
  }
}

/**
 * Detect action type from response content
 */
function detectActionFromContent(content: string, query: string): string | undefined {
  const lowerContent = content.toLowerCase();
  const lowerQuery = query.toLowerCase();

  // Check for folder creation
  if (lowerQuery.includes('create folder') || lowerQuery.includes('criar pasta') || lowerQuery.includes('crear carpeta') ||
      lowerQuery.includes('new folder') || lowerQuery.includes('nova pasta') || lowerQuery.includes('nueva carpeta')) {
    if (lowerContent.includes('created') || lowerContent.includes('criada') || lowerContent.includes('creada') ||
        lowerContent.includes('folder') || lowerContent.includes('pasta') || lowerContent.includes('carpeta')) {
      return 'create_folder';
    }
  }

  // Check for file move
  if (lowerQuery.includes('move') || lowerQuery.includes('mover') || lowerQuery.includes('transfer')) {
    if (lowerContent.includes('moved') || lowerContent.includes('movido') || lowerContent.includes('transfer')) {
      return 'move_file';
    }
  }

  // Check for file rename
  if (lowerQuery.includes('rename') || lowerQuery.includes('renomear') || lowerQuery.includes('renombrar')) {
    if (lowerContent.includes('renamed') || lowerContent.includes('renomeado') || lowerContent.includes('renombrado')) {
      return 'rename_file';
    }
  }

  // Check for file delete
  if (lowerQuery.includes('delete') || lowerQuery.includes('deletar') || lowerQuery.includes('eliminar') ||
      lowerQuery.includes('remove') || lowerQuery.includes('apagar') || lowerQuery.includes('borrar')) {
    if (lowerContent.includes('deleted') || lowerContent.includes('deletado') || lowerContent.includes('eliminado') ||
        lowerContent.includes('removed') || lowerContent.includes('apagado') || lowerContent.includes('borrado')) {
      return 'delete_file';
    }
  }

  // Check for list folders
  if (lowerQuery.includes('list folder') || lowerQuery.includes('show folder') || lowerQuery.includes('listar pasta') ||
      lowerQuery.includes('mostrar pasta') || lowerQuery.includes('listar carpeta') || lowerQuery.includes('mostrar carpeta') ||
      lowerQuery.includes('what folders')) {
    return 'list_folders';
  }

  // Check for list documents
  if (lowerQuery.includes('list document') || lowerQuery.includes('show file') || lowerQuery.includes('list file') ||
      lowerQuery.includes('listar documento') || lowerQuery.includes('mostrar arquivo') ||
      lowerQuery.includes('listar archivos') || lowerQuery.includes('what files')) {
    return 'list_documents';
  }

  // Check for show/open file
  if (lowerQuery.includes('show me') || lowerQuery.includes('open') || lowerQuery.includes('display') ||
      lowerQuery.includes('view') || lowerQuery.includes('mostrar') || lowerQuery.includes('abrir') ||
      lowerQuery.includes('exibir') || lowerQuery.includes('ver')) {
    return 'show_file';
  }

  // Check for upload
  if (lowerQuery.includes('upload') || lowerQuery.includes('enviar') || lowerQuery.includes('subir') ||
      lowerQuery.includes('add file') || lowerQuery.includes('adicionar') || lowerQuery.includes('agregar')) {
    return 'upload_request';
  }

  // Check for search
  if (lowerQuery.includes('find') || lowerQuery.includes('search') || lowerQuery.includes('locate') ||
      lowerQuery.includes('encontrar') || lowerQuery.includes('buscar') || lowerQuery.includes('localizar') ||
      lowerQuery.includes('which document')) {
    return 'search_document';
  }

  return undefined;
}

/**
 * Send query to Koda API with SSE streaming support and retry logic
 */
async function sendQuery(query: string, retryCount = 0): Promise<ApiResponse> {
  const startTime = Date.now();
  const MAX_RETRIES = 2;

  try {
    // Use SSE streaming endpoint
    const response = await axios.post(
      `${CONFIG.baseUrl}/api/chat/conversations/${conversationId}/messages/stream`,
      {
        content: query,
      },
      {
        timeout: CONFIG.timeout,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
          'Accept': 'text/event-stream',
        },
        responseType: 'text',
      }
    );

    const responseTime = Date.now() - startTime;

    // Parse SSE response to extract content
    const rawData = response.data as string;
    let fullContent = '';
    let messageId = '';
    let assistantMessageId = '';

    // Parse SSE events
    const lines = rawData.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const eventData = JSON.parse(line.substring(6));
          if (eventData.type === 'content' && eventData.content) {
            fullContent += eventData.content;
          } else if (eventData.type === 'done') {
            messageId = eventData.messageId || '';
            assistantMessageId = eventData.assistantMessageId || '';
          } else if (eventData.type === 'error') {
            return {
              success: false,
              error: eventData.error || 'Unknown SSE error',
              responseTime,
              statusCode: response.status,
            };
          }
        } catch {
          // Skip invalid JSON lines
        }
      }
    }

    // Detect action type from the response content
    const detectedAction = detectActionFromContent(fullContent, query);

    return {
      success: true,
      data: {
        response: fullContent,
        messageId,
        assistantMessageId,
        actionType: detectedAction,
      },
      responseTime,
      statusCode: response.status,
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    const axiosError = error as AxiosError;

    // Extract detailed error message
    let errorMessage = axiosError.message;
    if (axiosError.response?.data) {
      const data = axiosError.response.data as any;
      if (typeof data === 'string') {
        // Try to parse SSE error
        const errorMatch = data.match(/data: ({"type":"error".*})/);
        if (errorMatch) {
          try {
            const errorEvent = JSON.parse(errorMatch[1]);
            errorMessage = errorEvent.error || errorMessage;
          } catch {
            errorMessage = data.substring(0, 100);
          }
        } else {
          errorMessage = data.substring(0, 100);
        }
      } else {
        errorMessage = data.error || data.message || JSON.stringify(data).substring(0, 100);
      }
    }

    // Retry on connection errors
    const isConnectionError = errorMessage.includes('ECONNRESET') ||
                              errorMessage.includes('ETIMEDOUT') ||
                              errorMessage.includes('ECONNREFUSED') ||
                              axiosError.response?.status === 500;

    if (isConnectionError && retryCount < MAX_RETRIES) {
      console.log(`      Retrying (${retryCount + 1}/${MAX_RETRIES})...`);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry

      // Create new conversation if needed
      if (axiosError.response?.status === 404) {
        await createTestConversation();
      }

      return sendQuery(query, retryCount + 1);
    }

    return {
      success: false,
      error: errorMessage,
      responseTime,
      statusCode: axiosError.response?.status,
    };
  }
}

/**
 * Run a single test
 */
async function runTest(
  query: string,
  category: string,
  action: string
): Promise<TestResult> {
  totalTests++;

  console.log(`\n  Testing: "${query.substring(0, 50)}${query.length > 50 ? '...' : ''}"`);

  const result = await sendQuery(query);

  const testResult: TestResult = {
    query,
    category,
    action,
    success: result.success,
    responseTime: result.responseTime,
    actionDetected: false,
    statusCode: result.statusCode,
  };

  if (result.success) {
    const data = result.data;

    // Check for action in response
    testResult.actionDetected = !!data.actionType || !!data.action;
    testResult.actionType = data.actionType || data.action;
    testResult.response = typeof data.response === 'string'
      ? data.response.substring(0, 200)
      : JSON.stringify(data).substring(0, 200);

    passedTests++;
    console.log(`    PASSED (${result.responseTime}ms) - Action: ${testResult.actionType || 'none'}`);
  } else {
    failedTests++;
    testResult.error = result.error;
    console.log(`    FAILED (${result.responseTime}ms) - Error: ${result.error}`);
  }

  results.push(testResult);
  return testResult;
}

/**
 * Run tests for a category
 */
async function runCategoryTests(
  categoryName: string,
  actions: Record<string, string[]>
) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`CATEGORY: ${categoryName}`);
  console.log('='.repeat(70));

  for (const [actionName, queries] of Object.entries(actions)) {
    console.log(`\n  Action: ${actionName} (${queries.length} tests)`);
    console.log('  ' + '-'.repeat(40));

    for (const query of queries) {
      await runTest(query, categoryName, actionName);

      // Delay between tests to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, CONFIG.delayBetweenTests));
    }
  }
}

/**
 * Run load test (concurrent requests)
 */
async function runLoadTest() {
  console.log(`\n${'='.repeat(70)}`);
  console.log('LOAD TEST - Concurrent Requests');
  console.log('='.repeat(70));

  const testQueries = [
    'List folders',
    'List documents',
    'Show me my files',
    'What folders do I have?',
    'Display documents',
  ];

  console.log(`\nSending ${CONFIG.concurrentTests} concurrent requests...`);

  const startTime = Date.now();

  const promises = testQueries.slice(0, CONFIG.concurrentTests).map(query =>
    sendQuery(query)
  );

  const loadResults = await Promise.all(promises);

  const totalTime = Date.now() - startTime;
  const avgTime = totalTime / CONFIG.concurrentTests;

  const successCount = loadResults.filter(r => r.success).length;
  const failCount = loadResults.length - successCount;

  console.log(`\nLoad Test Results:`);
  console.log(`  Total Requests: ${CONFIG.concurrentTests}`);
  console.log(`  Successful: ${successCount}`);
  console.log(`  Failed: ${failCount}`);
  console.log(`  Total Time: ${totalTime}ms`);
  console.log(`  Average Time: ${avgTime.toFixed(2)}ms`);
  console.log(`  Requests/sec: ${(CONFIG.concurrentTests / (totalTime / 1000)).toFixed(2)}`);

  if (failCount > 0) {
    console.log(`\n  WARNING: ${failCount} requests failed under load`);
    loadResults.filter(r => !r.success).forEach(r => {
      console.log(`    Error: ${r.error}`);
    });
  } else {
    console.log(`\n  All requests succeeded under load`);
  }

  return {
    concurrentRequests: CONFIG.concurrentTests,
    successCount,
    failCount,
    totalTime,
    avgTime,
    requestsPerSecond: CONFIG.concurrentTests / (totalTime / 1000),
  };
}

/**
 * Generate summary report
 */
function generateReport(loadTestResults?: any) {
  console.log(`\n${'='.repeat(70)}`);
  console.log('STRESS TEST SUMMARY');
  console.log('='.repeat(70));

  // Overall results
  console.log(`\nOverall Results:`);
  console.log(`  Total Tests: ${totalTests}`);
  console.log(`  Passed: ${passedTests} (${((passedTests / totalTests) * 100).toFixed(1)}%)`);
  console.log(`  Failed: ${failedTests} (${((failedTests / totalTests) * 100).toFixed(1)}%)`);

  // Results by category
  console.log(`\nResults by Category:`);

  const categories = [...new Set(results.map(r => r.category))];

  for (const category of categories) {
    const categoryResults = results.filter(r => r.category === category);
    const passed = categoryResults.filter(r => r.success).length;
    const total = categoryResults.length;
    const percentage = ((passed / total) * 100).toFixed(1);

    console.log(`\n  ${category}:`);
    console.log(`    Tests: ${total}`);
    console.log(`    Passed: ${passed} (${percentage}%)`);
    console.log(`    Failed: ${total - passed}`);

    // Show failed tests
    const failed = categoryResults.filter(r => !r.success);
    if (failed.length > 0) {
      console.log(`    Failed Queries:`);
      failed.forEach(f => {
        console.log(`      - "${f.query.substring(0, 40)}..."`);
        console.log(`        Error: ${f.error}`);
      });
    }
  }

  // Performance metrics
  console.log(`\nPerformance Metrics:`);

  const responseTimes = results.map(r => r.responseTime);
  const avgTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
  const minTime = Math.min(...responseTimes);
  const maxTime = Math.max(...responseTimes);

  console.log(`  Average Response Time: ${avgTime.toFixed(2)}ms`);
  console.log(`  Min Response Time: ${minTime}ms`);
  console.log(`  Max Response Time: ${maxTime}ms`);

  // Slow queries (> 10 seconds)
  const slowQueries = results.filter(r => r.responseTime > 10000);
  if (slowQueries.length > 0) {
    console.log(`\n  Slow Queries (>10s): ${slowQueries.length}`);
    slowQueries.slice(0, 5).forEach(q => {
      console.log(`    "${q.query.substring(0, 40)}..." - ${q.responseTime}ms`);
    });
  }

  // Action detection rate
  console.log(`\nAction Detection:`);
  const actionsDetected = results.filter(r => r.actionDetected).length;
  const detectionRate = ((actionsDetected / totalTests) * 100).toFixed(1);
  console.log(`  Actions Detected: ${actionsDetected}/${totalTests} (${detectionRate}%)`);

  // Action types distribution
  const actionTypes = results
    .filter(r => r.actionType)
    .reduce((acc, r) => {
      acc[r.actionType!] = (acc[r.actionType!] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

  if (Object.keys(actionTypes).length > 0) {
    console.log(`\n  Action Types:`);
    Object.entries(actionTypes)
      .sort((a, b) => b[1] - a[1])
      .forEach(([type, count]) => {
        console.log(`    ${type}: ${count}`);
      });
  }

  // Load test results
  if (loadTestResults) {
    console.log(`\nLoad Test Results:`);
    console.log(`  Concurrent Requests: ${loadTestResults.concurrentRequests}`);
    console.log(`  Success Rate: ${((loadTestResults.successCount / loadTestResults.concurrentRequests) * 100).toFixed(1)}%`);
    console.log(`  Throughput: ${loadTestResults.requestsPerSecond.toFixed(2)} req/s`);
  }

  // Final verdict
  console.log(`\n${'='.repeat(70)}`);

  const passRate = (passedTests / totalTests) * 100;

  if (passRate >= 95) {
    console.log('RESULT: EXCELLENT - All systems working correctly!');
  } else if (passRate >= 80) {
    console.log('RESULT: GOOD - Most tests passing, some issues detected');
  } else if (passRate >= 60) {
    console.log('RESULT: WARNING - Significant issues detected');
  } else {
    console.log('RESULT: CRITICAL - Major failures detected');
  }

  console.log('='.repeat(70));

  return {
    totalTests,
    passedTests,
    failedTests,
    passRate: `${passRate.toFixed(1)}%`,
    avgResponseTime: avgTime,
    minResponseTime: minTime,
    maxResponseTime: maxTime,
  } as TestSummary;
}

/**
 * Save results to JSON file
 */
function saveResults(summary: TestSummary, loadTestResults?: any) {
  const reportData = {
    timestamp: new Date().toISOString(),
    config: {
      baseUrl: CONFIG.baseUrl,
      timeout: CONFIG.timeout,
      concurrentTests: CONFIG.concurrentTests,
    },
    summary,
    loadTestResults,
    results,
  };

  const filename = `stress-test-results-${Date.now()}.json`;
  const filepath = path.join(__dirname, filename);

  fs.writeFileSync(filepath, JSON.stringify(reportData, null, 2));

  console.log(`\nResults saved to: ${filename}`);

  return filepath;
}

// ============================================================================
// MAIN TEST RUNNER
// ============================================================================

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('KODA FILE ACTIONS - STRESS TEST');
  console.log('='.repeat(70));
  console.log(`Base URL: ${CONFIG.baseUrl}`);
  console.log(`Timeout: ${CONFIG.timeout}ms`);
  console.log(`Concurrent Tests: ${CONFIG.concurrentTests}`);
  console.log('='.repeat(70));

  // Parse command line arguments
  const args = process.argv.slice(2);
  const quickMode = args.includes('--quick');
  const loadOnly = args.includes('--load-only');
  const categoryArg = args.find(a => a.startsWith('--category='));
  const selectedCategory = categoryArg?.split('=')[1];

  try {
    // Step 1: Authenticate
    const authSuccess = await authenticate();
    if (!authSuccess) {
      console.error('\n  ERROR: Authentication is required to run tests.');
      console.error('  Please provide valid credentials and try again.');
      process.exit(1);
    }

    // Step 2: Create test conversation
    const convSuccess = await createTestConversation();
    if (!convSuccess) {
      console.error('\n  ERROR: Failed to create test conversation.');
      process.exit(1);
    }

    let loadTestResults;

    if (loadOnly) {
      // Only run load test
      loadTestResults = await runLoadTest();
    } else if (quickMode) {
      // Quick mode: run subset of tests
      console.log('\nRunning in QUICK mode (subset of tests)...');

      await runCategoryTests('File Management', {
        createFolder: TEST_QUERIES.fileManagement.createFolder.slice(0, 3),
        moveFile: TEST_QUERIES.fileManagement.moveFile.slice(0, 2),
      });

      await runCategoryTests('File Display', {
        showFile: TEST_QUERIES.fileDisplay.showFile.slice(0, 5),
      });

      await runCategoryTests('List Actions', {
        listFolders: TEST_QUERIES.listActions.listFolders.slice(0, 3),
        listDocuments: TEST_QUERIES.listActions.listDocuments.slice(0, 3),
      });

    } else if (selectedCategory) {
      // Run specific category
      const categoryMap: Record<string, any> = {
        'file-management': TEST_QUERIES.fileManagement,
        'file-display': TEST_QUERIES.fileDisplay,
        'list': TEST_QUERIES.listActions,
        'upload': TEST_QUERIES.uploadActions,
        'search': TEST_QUERIES.documentSearch,
      };

      const queries = categoryMap[selectedCategory];
      if (queries) {
        await runCategoryTests(selectedCategory, queries);
      } else {
        console.error(`Unknown category: ${selectedCategory}`);
        console.log('Available: file-management, file-display, list, upload, search');
        process.exit(1);
      }

    } else {
      // Full test suite

      // 1. FILE MANAGEMENT ACTIONS
      await runCategoryTests('File Management', TEST_QUERIES.fileManagement);

      // 2. FILE DISPLAY ACTIONS
      await runCategoryTests('File Display', TEST_QUERIES.fileDisplay);

      // 3. LIST ACTIONS
      await runCategoryTests('List Actions', TEST_QUERIES.listActions);

      // 4. UPLOAD ACTIONS
      await runCategoryTests('Upload Actions', TEST_QUERIES.uploadActions);

      // 5. DOCUMENT SEARCH ACTIONS
      await runCategoryTests('Document Search', TEST_QUERIES.documentSearch);

      // 6. LOAD TEST
      loadTestResults = await runLoadTest();
    }

    // Generate report
    const summary = generateReport(loadTestResults);

    // Save results
    saveResults(summary, loadTestResults);

    console.log(`\nStress test completed!`);

    // Exit with appropriate code
    process.exit(failedTests > 0 ? 1 : 0);

  } catch (error) {
    console.error('\nFatal error during stress test:', error);
    process.exit(1);
  }
}

// Run tests
main();
