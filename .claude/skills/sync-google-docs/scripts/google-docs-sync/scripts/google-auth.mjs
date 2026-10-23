import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { google } from 'googleapis';

const OAUTH_TIMEOUT_MS = 5 * 60 * 1000;

function openBrowser(authUrl) {
  const [command, args] = process.platform === 'darwin'
    ? ['open', [authUrl]]
    : process.platform === 'win32'
      ? ['rundll32.exe', ['url.dll,FileProtocolHandler', authUrl]]
      : ['xdg-open', [authUrl]];
  try {
    const browser = spawn(command, args, { detached: true, stdio: 'ignore' });
    browser.on('error', () => {});
    browser.unref();
  } catch {
    // The printed URL remains available when automatic browser launch fails.
  }
}

export function oauthCallbackOptions(portValue = process.env.GOOGLE_OAUTH_CALLBACK_PORT) {
  if (portValue === undefined || portValue === '') return { host: '127.0.0.1', port: 0 };
  const port = Number.parseInt(portValue, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('GOOGLE_OAUTH_CALLBACK_PORT must be an integer between 1 and 65535.');
  }
  return { host: '0.0.0.0', port };
}

export async function loadGoogleAuth({ credentialsPath, tokenPath, scopes }) {
  try {
    const token = JSON.parse(await fsp.readFile(tokenPath, 'utf8'));
    return google.auth.fromJSON(token);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const keys = JSON.parse(await fsp.readFile(credentialsPath, 'utf8'));
  const key = keys.installed || keys.web;
  if (!key) throw new Error('credentials.json must contain an installed or web OAuth client.');

  let resolveCode;
  let rejectCode;
  const codePromise = new Promise((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });
  const state = randomUUID();
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (url.pathname !== '/oauth2callback') {
      response.writeHead(404).end();
      return;
    }
    if (url.searchParams.get('state') !== state) {
      response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('認証状態が一致しません。ターミナルから再実行してください。');
      rejectCode(new Error('OAuth state mismatch.'));
      return;
    }
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');
    if (error || !code) {
      response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Google Accountの認証が完了しませんでした。');
      rejectCode(new Error(`OAuth failed: ${error || 'authorization code is missing'}`));
      return;
    }
    response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('認証が完了しました。この画面を閉じてください。');
    resolveCode(code);
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    const callback = oauthCallbackOptions();
    server.listen(callback.port, callback.host, resolve);
  });
  const port = server.address().port;
  const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;
  const client = new google.auth.OAuth2(key.client_id, key.client_secret, redirectUri);
  const authUrl = client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: scopes,
    state,
  });
  console.log(`Open this URL if the browser does not open automatically:\n${authUrl}`);
  openBrowser(authUrl);

  const timeout = setTimeout(() => rejectCode(new Error('OAuth timed out after 5 minutes.')), OAUTH_TIMEOUT_MS);
  let code;
  try {
    code = await codePromise;
  } finally {
    clearTimeout(timeout);
    server.close();
  }
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  if (!client.credentials.refresh_token) {
    throw new Error('OAuth did not return a refresh token. Revoke the previous grant and authenticate again.');
  }
  await fsp.mkdir(path.dirname(tokenPath), { recursive: true });
  await fsp.writeFile(tokenPath, `${JSON.stringify({
    type: 'authorized_user',
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  }, null, 2)}\n`, { mode: 0o600 });
  await fsp.chmod(tokenPath, 0o600);
  return client;
}
