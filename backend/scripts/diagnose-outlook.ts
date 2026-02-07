/**
 * diagnose-outlook.ts
 *
 * End-to-end diagnostic for the Outlook connector:
 * 1. Check env vars
 * 2. Load encrypted token for test-user-001
 * 3. Decrypt and validate access token (auto-refresh if expired)
 * 4. Call Microsoft Graph /me to verify token
 * 5. Fetch latest 5 emails from Inbox
 * 6. Check Prisma for synced outlook documents
 * 7. Test search for outlook emails
 *
 * Usage: npx tsx scripts/diagnose-outlook.ts
 */

import 'dotenv/config';
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { TokenVaultService } from '../src/services/connectors/tokenVault.service';
import { EncryptionService } from '../src/services/security/encryption.service';
import { EnvelopeService } from '../src/services/security/envelope.service';
import { GraphClientService } from '../src/services/connectors/outlook/graphClient.service';
import prisma from '../src/config/database';

const USER_ID = 'test-user-001';
const PROVIDER = 'outlook';
const TOKEN_FILE = path.resolve(process.cwd(), 'storage', 'connectors', 'tokens', `${USER_ID}.json`);

// ─── Step helpers ───────────────────────────────────────────────────────

let stepNum = 0;
function step(label: string) {
  stepNum++;
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Step ${stepNum}: ${label}`);
  console.log('─'.repeat(60));
}

function ok(msg: string) { console.log(`  [OK] ${msg}`); }
function warn(msg: string) { console.log(`  [WARN] ${msg}`); }
function fail(msg: string) { console.log(`  [FAIL] ${msg}`); }

function getMasterKey(): Buffer {
  const base64 = process.env.KODA_MASTER_KEY_BASE64;
  if (base64) {
    const decoded = Buffer.from(base64, 'base64');
    if (decoded.length === 32) return decoded;
  }
  const fallback = process.env.ENCRYPTION_KEY;
  if (!fallback) throw new Error('Missing encryption key');
  return createHash('sha256').update(fallback).digest();
}

async function main() {
  // ─── 1. Env vars ─────────────────────────────────────────────────────

  step('Check environment variables');

  const requiredEnv = [
    'MICROSOFT_CLIENT_ID',
    'MICROSOFT_CLIENT_SECRET',
    'MICROSOFT_CALLBACK_URL',
    'MICROSOFT_TENANT_ID',
  ];
  const encryptionEnv = ['KODA_MASTER_KEY_BASE64', 'ENCRYPTION_KEY'];

  let envOk = true;
  for (const key of requiredEnv) {
    if (process.env[key]?.trim()) {
      ok(`${key} = ${process.env[key]!.slice(0, 8)}...`);
    } else {
      fail(`${key} is missing`);
      envOk = false;
    }
  }

  const hasEncKey = encryptionEnv.some(k => process.env[k]?.trim());
  if (hasEncKey) ok('Encryption key present');
  else { fail('No encryption key'); envOk = false; }

  if (!envOk) { console.log('\nAborting: fix env vars first.'); process.exit(1); }

  // ─── 2. Token vault — load + check expiry ─────────────────────────────

  step('Load token from vault');

  const vault = new TokenVaultService();
  const enc = new EncryptionService();
  const envelope = new EnvelopeService(enc);

  let tokenMeta: Awaited<ReturnType<typeof vault.getProviderTokenMeta>>;
  try {
    tokenMeta = await vault.getProviderTokenMeta(USER_ID, PROVIDER as any);
    if (!tokenMeta) {
      fail(`No token stored for ${USER_ID} / ${PROVIDER}`);
      process.exit(1);
    }
    ok(`Token found — scopes: ${tokenMeta.scopes.join(', ')}`);
    ok(`Expires at: ${tokenMeta.expiresAt.toISOString()}`);
    ok(`Updated at: ${tokenMeta.updatedAt.toISOString()}`);
  } catch (err) {
    fail(`Token meta load error: ${(err as Error).message}`);
    process.exit(1);
  }

  // ─── 3. Get access token (refresh if expired) ─────────────────────────

  step('Get valid access token');

  const expiresIn = tokenMeta!.expiresAt.getTime() - Date.now();
  let accessToken: string;

  if (expiresIn > 60_000) {
    ok(`Token still valid for ${Math.round(expiresIn / 60_000)} minutes`);
    accessToken = await vault.getValidAccessToken(USER_ID, PROVIDER as any);
    ok(`Decrypted access token (${accessToken.length} chars)`);
  } else {
    warn(`Token expired ${Math.round(-expiresIn / 1000)}s ago — refreshing...`);

    // Decrypt the full token payload to get the refresh_token
    const raw = await fs.readFile(TOKEN_FILE, 'utf8');
    const file = JSON.parse(raw);
    const entry = file.providers?.[PROVIDER];

    if (!entry) {
      fail('No Outlook entry in token file');
      process.exit(1);
    }

    const masterKey = getMasterKey();
    const aad = `connector-token:${USER_ID}:${PROVIDER}`;
    const recordKey = envelope.unwrapRecordKey(entry.wrappedRecordKey, masterKey, aad);
    const payload = enc.decryptJsonFromJson<{
      accessToken: string;
      refreshToken?: string;
      tokenType?: string;
      providerAccountId?: string;
    }>(entry.encryptedPayloadJson, recordKey, aad);

    if (!payload.refreshToken) {
      fail('No refresh_token stored — user needs to re-connect Outlook');
      process.exit(1);
    }
    ok(`Found refresh_token (${payload.refreshToken.length} chars)`);

    // Exchange refresh token for new access token
    const tenantId = process.env.MICROSOFT_TENANT_ID || 'common';
    const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

    // Note: redirect_uri is optional for refresh_token grant type.
    // We omit it here because the registered URI in Azure may differ from MICROSOFT_CALLBACK_URL.
    const body = new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
      grant_type: 'refresh_token',
      refresh_token: payload.refreshToken,
      scope: 'offline_access openid profile email User.Read Mail.Read',
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => 'unknown error');
      fail(`Token refresh failed (${response.status}): ${errText.slice(0, 300)}`);
      console.log('\nUser may need to re-connect Outlook.');
      process.exit(1);
    }

    const tokenResp = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope?: string;
    };

    accessToken = tokenResp.access_token;
    ok(`Refreshed access token (${accessToken.length} chars, expires in ${tokenResp.expires_in}s)`);

    // Store the new tokens back in the vault
    const newScopes = (tokenResp.scope || 'offline_access openid profile email User.Read Mail.Read')
      .split(/\s+/).filter(Boolean);
    const newExpiresAt = new Date(Date.now() + Math.max(60, tokenResp.expires_in) * 1000);

    await vault.storeToken(
      USER_ID,
      PROVIDER as any,
      JSON.stringify({
        accessToken: tokenResp.access_token,
        refreshToken: tokenResp.refresh_token || payload.refreshToken,
        tokenType: 'Bearer',
        providerAccountId: payload.providerAccountId,
      }),
      newScopes,
      newExpiresAt,
    );

    ok(`Updated vault — new token expires at ${newExpiresAt.toISOString()}`);
  }

  // ─── 4. Verify with /me ──────────────────────────────────────────────

  step('Call Microsoft Graph /me');

  const graph = new GraphClientService();

  try {
    const me = await graph.getMe(accessToken);
    ok(`Authenticated as: ${me.displayName || '(no name)'}`);
    ok(`Email: ${me.mail || me.userPrincipalName || '(unknown)'}`);
    ok(`Graph user ID: ${me.id}`);
  } catch (err) {
    fail(`Graph /me failed: ${(err as Error).message}`);
    process.exit(1);
  }

  // ─── 5. Fetch latest emails ──────────────────────────────────────────

  step('Fetch latest 5 emails from Inbox');

  try {
    const result = await graph.listMessages({
      accessToken,
      top: 5,
      folder: 'Inbox',
    });

    if (!result.value || result.value.length === 0) {
      warn('Inbox is empty (0 messages returned)');
    } else {
      ok(`Fetched ${result.value.length} message(s):\n`);
      for (const msg of result.value) {
        const from = msg.from?.emailAddress?.address || '(unknown)';
        const subject = msg.subject || '(no subject)';
        const date = msg.receivedDateTime || '';
        const preview = (msg.bodyPreview || '').slice(0, 80);
        console.log(`    [${date}] From: ${from}`);
        console.log(`      Subject: ${subject}`);
        console.log(`      Preview: ${preview}...`);
        console.log();
      }
    }
  } catch (err) {
    fail(`Email fetch failed: ${(err as Error).message}`);
  }

  // ─── 6. Check Prisma for synced documents ────────────────────────────

  step('Check Prisma for synced Outlook documents');

  try {
    const count = await prisma.document.count({
      where: {
        userId: USER_ID,
        filename: { startsWith: 'outlook_' },
      },
    });

    if (count > 0) {
      ok(`Found ${count} synced Outlook document(s) in database`);

      const samples = await prisma.document.findMany({
        where: {
          userId: USER_ID,
          filename: { startsWith: 'outlook_' },
        },
        orderBy: { updatedAt: 'desc' },
        take: 3,
        select: {
          id: true,
          filename: true,
          displayTitle: true,
          updatedAt: true,
          rawText: true,
        },
      });

      ok('Latest synced emails:');
      for (const doc of samples) {
        const snippet = (doc.rawText || '').slice(0, 100);
        console.log(`    ID: ${doc.id}`);
        console.log(`    Title: ${doc.displayTitle || doc.filename}`);
        console.log(`    Updated: ${doc.updatedAt}`);
        console.log(`    Text preview: ${snippet}...`);
        console.log();
      }
    } else {
      warn('No synced Outlook documents found. Sync has not run yet.');
    }
  } catch (err) {
    fail(`Prisma query failed: ${(err as Error).message}`);
  }

  // ─── 7. Test connector search ─────────────────────────────────────────

  step('Test connector email search');

  try {
    const searchQuery = 'test';
    const docs = await prisma.document.findMany({
      where: {
        userId: USER_ID,
        filename: { startsWith: 'outlook_' },
        OR: [
          { filename: { contains: searchQuery, mode: 'insensitive' } },
          { rawText: { contains: searchQuery, mode: 'insensitive' } },
          { displayTitle: { contains: searchQuery, mode: 'insensitive' } },
        ],
      },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      select: {
        id: true,
        filename: true,
        displayTitle: true,
      },
    });

    if (docs.length > 0) {
      ok(`Search for "${searchQuery}" returned ${docs.length} result(s):`);
      for (const doc of docs) {
        console.log(`    ${doc.displayTitle || doc.filename} (${doc.id})`);
      }
    } else {
      warn(`No results for "${searchQuery}" — expected if sync hasn't run.`);
    }
  } catch (err) {
    fail(`Search query failed: ${(err as Error).message}`);
  }

  // ─── Summary ──────────────────────────────────────────────────────────

  console.log(`\n${'═'.repeat(60)}`);
  console.log('DIAGNOSIS COMPLETE');
  console.log('═'.repeat(60));

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
