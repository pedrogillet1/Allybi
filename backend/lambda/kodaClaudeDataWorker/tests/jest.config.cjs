/**
 * KODA Test Suite - Jest Configuration
 */

module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/*.test.js'],
  verbose: true,
  testTimeout: 30000,
  collectCoverage: false,
  reporters: [
    'default',
    ['jest-junit', {
      outputDirectory: './tests/reports',
      outputName: 'junit.xml'
    }]
  ],
  setupFilesAfterEnv: ['./tests/setup.js'],
  globals: {
    KODA_DATA_DIR: '/Users/pg/Desktop/koda-webapp/backend/src/data',
    KODA_TEST_MODE: true
  }
};
