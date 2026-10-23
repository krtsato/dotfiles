import fs from 'node:fs';
import path from 'node:path';
import { deleteDriveFiles, operationAndCleanupError } from './resource-cleanup.mjs';

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

const MAX_API_ATTEMPTS = 4;
const INITIAL_RETRY_DELAY_MS = 5000;
// Bound each response while avoiding unnecessary pagination for normal document-sized batches.
const DRIVE_LIST_PAGE_SIZE = 100;

async function withRetry(label, callback) {
  for (let attempt = 0; attempt < MAX_API_ATTEMPTS; attempt += 1) {
    try {
      return await callback();
    } catch (error) {
      const retryable = error.code === 429 || (error.code >= 500 && error.code < 600);
      if (!retryable || attempt === MAX_API_ATTEMPTS - 1) throw error;
      // Exponential backoff gives transient quota and server errors time to recover.
      const retrySeconds = (INITIAL_RETRY_DELAY_MS * (2 ** attempt)) / 1000;
      console.warn(`${label} failed (${error.code}). Retrying in ${retrySeconds} seconds.`);
      await sleep(retrySeconds * 1000);
    }
  }
  throw new Error(`${label} failed.`);
}

export function assertPublicTemporaryImageAccess(allowed) {
  if (!allowed) {
    throw new Error(
      'Image insertion requires temporary public access. '
      + 'Set config.allowPublicTemporaryImages=true only after approving this behavior.',
    );
  }
}

export async function uploadTemporaryImage(
  drive,
  absolutePath,
  prefix = 'google-docs-sync-',
  allowPublicAccess = false,
) {
  assertPublicTemporaryImageAccess(allowPublicAccess);
  const response = await withRetry('Google Drive image upload', () => drive.files.create({
    requestBody: {
      name: `${prefix}${Date.now()}-${path.basename(absolutePath)}`,
    },
    media: {
      mimeType: absolutePath.endsWith('.png') ? 'image/png' : 'image/jpeg',
      body: fs.createReadStream(absolutePath),
    },
    fields: 'id',
  }));

  try {
    await withRetry('Google Drive image permission', () => drive.permissions.create({
      fileId: response.data.id,
      requestBody: { type: 'anyone', role: 'reader' },
    }));
  } catch (error) {
    try {
      await deleteDriveFiles(drive, [response.data.id], 'image whose permission update failed');
    } catch (cleanupError) {
      throw operationAndCleanupError(
        error,
        cleanupError,
        `Image permission and cleanup both failed: ${response.data.id}`,
      );
    }
    throw error;
  }

  return {
    fileId: response.data.id,
    uri: `https://drive.google.com/uc?export=download&id=${response.data.id}`,
  };
}

export async function listTemporaryImages(drive, prefix = 'google-docs-sync-') {
  const files = [];
  let pageToken;
  do {
    const response = await drive.files.list({
      q: `name contains '${prefix.replaceAll("'", "\\'")}' and trashed = false`,
      spaces: 'drive',
      pageSize: DRIVE_LIST_PAGE_SIZE,
      pageToken,
      fields: 'nextPageToken,files(id,name)',
    });
    files.push(...(response.data.files || []));
    pageToken = response.data.nextPageToken;
  } while (pageToken);
  return files;
}
