#!/usr/bin/env node
/* eslint-disable no-console */

const requiredVars = [
  "PINECONE_API_KEY",
  "PINECONE_INDEX_NAME",
];

const missing = requiredVars.filter((key) => {
  const value = String(process.env[key] || "").trim();
  return value.length === 0;
});

if (missing.length > 0) {
  console.error(
    `[cert:integration] missing required env vars: ${missing.join(", ")}`,
  );
  process.exit(1);
}

console.log(
  `[cert:integration] env ok (${requiredVars.length} required variables present)`,
);
