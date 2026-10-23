import assert from 'node:assert/strict';
import { access, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  completedPublishError,
  deleteDriveFiles,
  deleteDocumentTabs,
  discardIncompleteDocument,
  operationAndCleanupError,
  trashDriveFile,
} from '../scripts/resource-cleanup.mjs';

test('deleteDriveFiles attempts all files and reports failed IDs', async () => {
  const deleted = [];
  const drive = {
    files: {
      delete: async ({ fileId }) => {
        deleted.push(fileId);
        if (fileId === 'file-2') throw new Error('network');
      },
    },
  };

  await assert.rejects(
    deleteDriveFiles(drive, ['file-1', 'file-2', 'file-3']),
    /file-2/,
  );
  assert.deepEqual(deleted, ['file-1', 'file-2', 'file-3']);
});

test('trashDriveFile reports the recoverable file ID', async () => {
  const drive = { files: { update: async () => { throw new Error('network'); } } };
  await assert.rejects(trashDriveFile(drive, 'document-1'), /document-1/);
});

test('discardIncompleteDocument trashes the document and removes local state', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'google-docs-sync-cleanup-'));
  const statePath = path.join(directory, '.document-id');
  await writeFile(statePath, 'document-1\n');
  const trashed = [];
  const drive = { files: { update: async ({ fileId }) => trashed.push(fileId) } };

  await discardIncompleteDocument(drive, 'document-1', statePath);

  assert.deepEqual(trashed, ['document-1']);
  await assert.rejects(access(statePath));
});

test('deleteDocumentTabs removes only tabs added by the failed publish', async () => {
  const updates = [];
  const docs = { documents: { batchUpdate: async (request) => updates.push(request) } };
  await deleteDocumentTabs(docs, 'document-1', [
    { tabId: 'tab-1', title: 'One' },
    { tabId: 'tab-2', title: 'Two' },
  ]);
  assert.deepEqual(updates[0].requestBody.requests, [
    { deleteTab: { tabId: 'tab-1' } },
    { deleteTab: { tabId: 'tab-2' } },
  ]);
});

test('operationAndCleanupError preserves both failures', () => {
  const operation = new Error('operation');
  const cleanup = new Error('cleanup');
  const combined = operationAndCleanupError(operation, cleanup, 'both failed');
  assert.deepEqual(combined.errors, [operation, cleanup]);
});

test('completedPublishError preserves a completed document after local output failure', () => {
  const original = new Error('read-only build directory');
  const error = completedPublishError(original, 'document-1');
  assert.match(error.message, /Document document-1 was published/);
  assert.equal(error.cause, original);
});
