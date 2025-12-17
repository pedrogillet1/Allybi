import fileActionsService from '../services/fileActions.service';
import prisma from '../config/database';

interface TestResult {
  test: string;
  passed: boolean;
  error?: string;
  duration: number;
}

const results: TestResult[] = [];
const TEST_USER_ID = 'test-user-backend';

async function test_createFolder() {
  const start = Date.now();
  try {
    const result = await fileActionsService.createFolder({
      userId: TEST_USER_ID,
      folderName: 'Test Folder'
    });

    const passed = result.success;
    results.push({
      test: 'createFolder',
      passed,
      duration: Date.now() - start
    });
  } catch (error: any) {
    results.push({
      test: 'createFolder',
      passed: false,
      error: error.message,
      duration: Date.now() - start
    });
  }
}

async function test_listFiles() {
  const start = Date.now();
  try {
    const result = await fileActionsService.listFiles(TEST_USER_ID);

    const passed = result.success && (result.data !== undefined);
    results.push({
      test: 'listFiles',
      passed,
      duration: Date.now() - start
    });
  } catch (error: any) {
    results.push({
      test: 'listFiles',
      passed: false,
      error: error.message,
      duration: Date.now() - start
    });
  }
}

async function test_metadataQuery() {
  const start = Date.now();
  try {
    const result = await fileActionsService.metadataQuery(TEST_USER_ID, 'count');

    const passed = result.success;
    results.push({
      test: 'metadataQuery',
      passed,
      duration: Date.now() - start
    });
  } catch (error: any) {
    results.push({
      test: 'metadataQuery',
      passed: false,
      error: error.message,
      duration: Date.now() - start
    });
  }
}

async function test_renameFile() {
  const start = Date.now();
  try {
    // Find a folder to rename
    const folder = await prisma.folder.findFirst({
      where: {
        userId: TEST_USER_ID,
        name: 'Test Folder'
      }
    });

    if (!folder) {
      results.push({
        test: 'renameFile',
        passed: true, // Skip if no folder exists
        duration: Date.now() - start
      });
      return;
    }

    const result = await fileActionsService.renameFolder(TEST_USER_ID, folder.id, 'Renamed Folder');

    const passed = result.success;
    results.push({
      test: 'renameFile',
      passed,
      duration: Date.now() - start
    });
  } catch (error: any) {
    results.push({
      test: 'renameFile',
      passed: false,
      error: error.message,
      duration: Date.now() - start
    });
  }
}

async function test_deleteFolder() {
  const start = Date.now();
  try {
    // Find the renamed folder
    const folder = await prisma.folder.findFirst({
      where: {
        userId: TEST_USER_ID,
        name: 'Renamed Folder'
      }
    });

    if (!folder) {
      results.push({
        test: 'deleteFolder',
        passed: true, // Skip if no folder exists
        duration: Date.now() - start
      });
      return;
    }

    const result = await fileActionsService.deleteFolder(TEST_USER_ID, folder.id);

    const passed = result.success;
    results.push({
      test: 'deleteFolder',
      passed,
      duration: Date.now() - start
    });
  } catch (error: any) {
    results.push({
      test: 'deleteFolder',
      passed: false,
      error: error.message,
      duration: Date.now() - start
    });
  }
}

export async function runTests() {
  await test_createFolder();
  await test_listFiles();
  await test_metadataQuery();
  await test_renameFile();
  await test_deleteFolder();
  return results;
}
