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

function getEnv(name) {
  return String(process.env[name] || "").trim();
}

function parsePath(rawUrl) {
  if (!rawUrl) return "";
  try {
    return new URL(rawUrl).pathname;
  } catch {
    return "";
  }
}

const warnings = [];
const errors = [];

const googleAuthCallback = getEnv("GOOGLE_CALLBACK_URL");
const gmailConnectorCallback = getEnv("GOOGLE_GMAIL_CALLBACK_URL");
const strictGmailOauth = getEnv("CONNECTOR_GMAIL_STRICT_OAUTH_CONFIG").toLowerCase();
const strictMode =
  strictGmailOauth === "true" ||
  strictGmailOauth === "1" ||
  process.env.NODE_ENV === "production" ||
  process.env.NODE_ENV === "staging";

if (googleAuthCallback) {
  const callbackPath = parsePath(googleAuthCallback);
  if (callbackPath !== "/api/auth/google/callback") {
    errors.push(
      `GOOGLE_CALLBACK_URL must use /api/auth/google/callback (received: ${callbackPath || "invalid_url"})`,
    );
  }
}

if (gmailConnectorCallback) {
  const callbackPath = parsePath(gmailConnectorCallback);
  if (callbackPath !== "/api/integrations/gmail/callback") {
    errors.push(
      `GOOGLE_GMAIL_CALLBACK_URL must use /api/integrations/gmail/callback (received: ${callbackPath || "invalid_url"})`,
    );
  }
}

if (strictMode) {
  const missingStrictGmailVars = [
    "GOOGLE_GMAIL_CLIENT_ID",
    "GOOGLE_GMAIL_CLIENT_SECRET",
    "GOOGLE_GMAIL_CALLBACK_URL",
  ].filter((key) => !getEnv(key));
  if (missingStrictGmailVars.length > 0) {
    warnings.push(
      `strict Gmail OAuth mode detected; missing dedicated vars: ${missingStrictGmailVars.join(", ")}`,
    );
  }
}

if (errors.length > 0) {
  console.error(`[cert:integration] integration env validation failed:`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

if (warnings.length > 0) {
  console.warn(`[cert:integration] warnings:`);
  for (const warning of warnings) console.warn(`- ${warning}`);
}

console.log(
  `[cert:integration] env ok (${requiredVars.length} required variables present)`,
);
