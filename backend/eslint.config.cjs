const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');

module.exports = [
  {
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
    ignores: [
      'dist/**',
      '**/dist/**',
      'node_modules/**',
      'coverage/**',
      'storage/**',
      'temp/**',
      'workers_gcp/**',
      'src/data_banks/**/*.json',
      'src/generated/**',
      '**/*.d.ts',
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.cjs', '**/*.mjs'],
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {},
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    rules: {},
  },
  {
    files: ['**/*.js', '**/*.cjs', '**/*.mjs'],
    rules: {},
  },
];
