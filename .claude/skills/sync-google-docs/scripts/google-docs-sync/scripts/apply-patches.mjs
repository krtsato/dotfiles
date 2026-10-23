import fsp from 'node:fs/promises';
import path from 'node:path';
import { google } from 'googleapis';
import { loadGoogleAuth } from './google-auth.mjs';
import { createPatchPlan, verifyManifest, verifyPatch } from './document-patch.mjs';
import { loadConfig } from './config.mjs';

const { config, stateDir } = await loadConfig();

function argument(name) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

const apply = process.argv.includes('--apply');
const verifyOnly = process.argv.includes('--verify');
const manifestArgument = argument('manifest');
if (!manifestArgument) throw new Error('--manifest is required.');

const manifestPath = path.resolve(process.cwd(), manifestArgument);
const manifest = JSON.parse(await fsp.readFile(manifestPath, 'utf8'));
const documentId = argument('document-id') || manifest.documentId || config.tabLinkDocumentId;
if (!documentId) throw new Error('Document ID is required.');

const credentialsPath = path.resolve(
  process.env.GOOGLE_EDIT_CREDENTIALS || path.join(stateDir, 'comments-credentials.json'),
);
const tokenPath = path.resolve(
  process.env.GOOGLE_EDIT_TOKEN || path.join(stateDir, apply ? 'edit-token.json' : 'comments-token.json'),
);
const scopes = [
  apply
    ? 'https://www.googleapis.com/auth/documents'
    : 'https://www.googleapis.com/auth/documents.readonly',
];
const auth = await loadGoogleAuth({ credentialsPath, tokenPath, scopes });
const docs = google.docs({ version: 'v1', auth });

const before = await docs.documents.get({ documentId, includeTabsContent: true });
if (!before.data.revisionId) throw new Error('The document revision ID is unavailable.');
if (verifyOnly) {
  const failures = verifyManifest(before.data, manifest);
  if (failures.length > 0) throw new Error(`Verification failed:\n${failures.join('\n')}`);
  console.log(JSON.stringify({
    status: 'verified',
    documentId,
    revisionId: before.data.revisionId,
    verifiedOperations: manifest.operations?.length || 0,
  }, null, 2));
  process.exit(0);
}
const plan = createPatchPlan(before.data, manifest);

console.log(JSON.stringify({
  mode: apply ? 'apply' : 'dry-run',
  documentId,
  title: before.data.title,
  revisionId: before.data.revisionId,
  operations: plan.summary,
}, null, 2));

if (!apply) {
  console.log('Dry run completed. No document changes were made.');
  process.exit(0);
}

await docs.documents.batchUpdate({
  documentId,
  requestBody: {
    requests: plan.requests,
    writeControl: { requiredRevisionId: before.data.revisionId },
  },
});

const after = await docs.documents.get({ documentId, includeTabsContent: true });
const failures = verifyPatch(after.data, plan.checks);
if (failures.length > 0) throw new Error(`Post-write verification failed:\n${failures.join('\n')}`);

console.log(JSON.stringify({
  status: 'applied',
  documentId,
  revisionId: after.data.revisionId,
  verifiedOperations: plan.checks.length,
}, null, 2));
