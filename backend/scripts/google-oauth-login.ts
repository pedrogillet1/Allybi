/**
 * Quick OAuth2 login to get ADC credentials for Google Slides API.
 * Opens browser, handles callback, saves credentials.
 */
import { google } from 'googleapis';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

const clientJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'oauth-client.json'), 'utf-8')
);
const { client_id, client_secret } = clientJson.installed || clientJson.web;

const SCOPES = [
  'https://www.googleapis.com/auth/presentations',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/cloud-platform',
];

const PORT = 8085;
const REDIRECT_URI = `http://localhost:${PORT}`;

const oauth2Client = new google.auth.OAuth2(client_id, client_secret, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
  prompt: 'consent',
});

console.log('\nOpening browser for Google OAuth...\n');

// Start local server to receive callback
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url!, `http://localhost:${PORT}`);
  const code = url.searchParams.get('code');

  if (!code) {
    res.writeHead(400);
    res.end('No authorization code received');
    return;
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);

    // Save as ADC format
    const adcCredentials = {
      type: 'authorized_user',
      client_id,
      client_secret,
      refresh_token: tokens.refresh_token,
    };

    const adcPath = path.join(
      process.env.HOME || '~',
      '.config', 'gcloud', 'application_default_credentials.json'
    );

    fs.mkdirSync(path.dirname(adcPath), { recursive: true });
    fs.writeFileSync(adcPath, JSON.stringify(adcCredentials, null, 2));

    console.log('Credentials saved to:', adcPath);
    console.log('Scopes:', SCOPES.join(', '));

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<h1>Success!</h1><p>You can close this tab. Credentials saved.</p>');
  } catch (err: any) {
    console.error('Token exchange failed:', err.message);
    res.writeHead(500);
    res.end('Token exchange failed: ' + err.message);
  }

  setTimeout(() => { server.close(); process.exit(0); }, 500);
});

server.listen(PORT, () => {
  console.log(`Listening on ${REDIRECT_URI}`);
  // Open browser
  const cmd = process.platform === 'darwin' ? 'open' : 'xdg-open';
  require('child_process').exec(`${cmd} "${authUrl}"`);
});
