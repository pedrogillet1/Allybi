/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/*.test.ts", "**/*.spec.ts"],
  // Some folders contain vitest-based or local/dev harness tests that should not run in Jest.
  testPathIgnorePatterns: [
    "/node_modules/",
    "<rootDir>/src/services/llm/tests/",
    "<rootDir>/src/tests/editing-verify.test.ts",
    "<rootDir>/src/tests/editing-suggestions.test.ts",
  ],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: "tsconfig.json",
        diagnostics: false,
      },
    ],
  },
};
