/**
 * Setup Test User for Stress Tests
 *
 * This script creates a test user account for running stress tests.
 * Run this once before running the stress tests.
 */

import axios from 'axios';

const CONFIG = {
  baseUrl: process.env.API_URL || 'http://localhost:5000',
  testEmail: process.env.TEST_EMAIL || 'stress-test@koda.local',
  testPassword: process.env.TEST_PASSWORD || 'StressTest123!',
  testName: 'Stress Test User',
};

async function setupTestUser() {
  console.log('\n======================================================================');
  console.log('KODA STRESS TEST - USER SETUP');
  console.log('======================================================================');
  console.log(`Base URL: ${CONFIG.baseUrl}`);
  console.log(`Test Email: ${CONFIG.testEmail}`);
  console.log('======================================================================\n');

  // Step 1: Try to login first (maybe user already exists)
  console.log('Step 1: Checking if test user exists...');

  try {
    const loginResponse = await axios.post(
      `${CONFIG.baseUrl}/api/auth/login`,
      {
        email: CONFIG.testEmail,
        password: CONFIG.testPassword,
      },
      { timeout: 30000 }
    );

    if (loginResponse.data.accessToken) {
      console.log('  Test user already exists and credentials are valid!');
      console.log('\n  You can run stress tests with:');
      console.log(`    TEST_EMAIL="${CONFIG.testEmail}" TEST_PASSWORD="${CONFIG.testPassword}" npm run stress-test`);
      console.log('\n  Or set AUTH_TOKEN directly:');
      console.log(`    AUTH_TOKEN="${loginResponse.data.accessToken}" npm run stress-test\n`);
      return true;
    }
  } catch (error: any) {
    if (error.response?.status === 401) {
      console.log('  User may exist but password is incorrect, or user does not exist.');
    } else if (error.response?.status === 404) {
      console.log('  Auth endpoint not found. Is the backend running?');
      return false;
    } else {
      console.log('  Login failed, will try to register...');
    }
  }

  // Step 2: Try to register the user
  console.log('\nStep 2: Registering test user...');

  try {
    const registerResponse = await axios.post(
      `${CONFIG.baseUrl}/api/auth/register`,
      {
        email: CONFIG.testEmail,
        password: CONFIG.testPassword,
        name: CONFIG.testName,
        firstName: 'Stress',
        lastName: 'Test',
      },
      { timeout: 30000 }
    );

    console.log('  Registration successful!');

    // Step 3: Try to login with new user
    console.log('\nStep 3: Logging in with new user...');

    const loginResponse = await axios.post(
      `${CONFIG.baseUrl}/api/auth/login`,
      {
        email: CONFIG.testEmail,
        password: CONFIG.testPassword,
      },
      { timeout: 30000 }
    );

    if (loginResponse.data.accessToken) {
      console.log('  Login successful!');
      console.log('\n  You can run stress tests with:');
      console.log(`    TEST_EMAIL="${CONFIG.testEmail}" TEST_PASSWORD="${CONFIG.testPassword}" npm run stress-test`);
      console.log('\n  Or set AUTH_TOKEN directly:');
      console.log(`    AUTH_TOKEN="${loginResponse.data.accessToken}" npm run stress-test\n`);
      return true;
    }

  } catch (error: any) {
    const status = error.response?.status;
    const message = error.response?.data?.error || error.message;

    if (status === 409 || message.includes('already exists')) {
      console.log('  User already exists. Try logging in with different credentials.');
    } else if (status === 400) {
      console.log(`  Registration failed: ${message}`);
    } else {
      console.log(`  Registration error (${status}): ${message}`);
    }

    return false;
  }

  return false;
}

// Run setup
setupTestUser()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
