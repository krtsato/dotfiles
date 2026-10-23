import fsp from 'node:fs/promises';
import path from 'node:path';
import { google } from 'googleapis';
import { flattenTabs } from './document-patch.mjs';
import { assertSourceRef } from './git-source-ref.mjs';
import {
  assertPublicTemporaryImageAccess,
  listTemporaryImages,
  uploadTemporaryImage,
} from './google-drive-image.mjs';
import { loadGoogleAuth } from './google-auth.mjs';
import {
  imageReplacementRequests,
  planImageSync,
  verifyImageSync,
} from './image-sync.mjs';
import { loadConfig } from './config.mjs';
import {
  deleteDriveFiles,
  operationAndCleanupError,
  ResourceCleanupError,
} from './resource-cleanup.mjs';

const { config, sourceDir, buildDir, repoRoot, stateDir } = await loadConfig();

function argument(name) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

const apply = process.argv.includes('--apply');
const manifest = JSON.parse(await fsp.readFile(path.join(buildDir, 'requirements.json'), 'utf8'));
const documentId = argument('document-id') || process.env.GOOGLE_IMAGE_DOCUMENT_ID || config.tabLinkDocumentId;
if (!documentId) throw new Error('Set config.tabLinkDocumentId, --document-id, or GOOGLE_IMAGE_DOCUMENT_ID.');

const credentialsPath = path.resolve(
  process.env.GOOGLE_IMAGE_CREDENTIALS || path.join(stateDir, 'credentials.json'),
);
const tokenPath = path.resolve(
  process.env.GOOGLE_IMAGE_TOKEN || path.join(stateDir, 'pdf-token.json'),
);
const auth = await loadGoogleAuth({
  credentialsPath,
  tokenPath,
  scopes: [
    'https://www.googleapis.com/auth/documents',
    'https://www.googleapis.com/auth/drive.file',
  ],
});
const docs = google.docs({ version: 'v1', auth });
const drive = google.drive({ version: 'v3', auth });
const before = (await docs.documents.get({ documentId, includeTabsContent: true })).data;
const replacements = planImageSync(manifest.tabs, flattenTabs(before.tabs));
const images = [...new Set(replacements.map((replacement) => replacement.image))];
if (apply && images.length > 0) assertPublicTemporaryImageAccess(config.allowPublicTemporaryImages);
const sourceRef = argument('source-ref');
assertSourceRef(images, sourceRef, { sourceDir, repoRoot });
const leakedTemporaryImages = await listTemporaryImages(drive, config.temporaryImagePrefix);
if (leakedTemporaryImages.length > 0) {
  throw new Error(
    `Temporary Google Drive images remain from an earlier run: ${leakedTemporaryImages.map((file) => file.name).join(', ')}`,
  );
}

console.log(JSON.stringify({
  mode: apply ? 'apply' : 'dry-run',
  documentId,
  revisionId: before.revisionId,
  sourceRef: sourceRef || null,
  tabs: new Set(replacements.map((replacement) => replacement.tabTitle)).size,
  imageFiles: images.length,
  replacements: replacements.length,
}, null, 2));
if (!apply || replacements.length === 0) process.exit(0);

const temporaryImages = new Map();
let result;
let operationError;
try {
  for (const image of images) {
    temporaryImages.set(image, await uploadTemporaryImage(
      drive,
      path.join(sourceDir, image),
      config.temporaryImagePrefix,
      config.allowPublicTemporaryImages,
    ));
  }
  const uriByImage = new Map(
    [...temporaryImages].map(([image, temporary]) => [image, temporary.uri]),
  );
  await docs.documents.batchUpdate({
    documentId,
    requestBody: {
      requests: imageReplacementRequests(replacements, uriByImage),
      writeControl: { requiredRevisionId: before.revisionId },
    },
  });

  const after = (await docs.documents.get({ documentId, includeTabsContent: true })).data;
  const currentReplacements = planImageSync(manifest.tabs, flattenTabs(after.tabs));
  const failures = verifyImageSync(flattenTabs(after.tabs), currentReplacements, uriByImage);
  if (failures.length > 0) {
    throw new Error(`Image replacement verification failed:\n${failures.join('\n')}`);
  }
  result = {
    status: 'applied',
    documentId,
    revisionId: after.revisionId,
    replacedImages: replacements.length,
  };
} catch (error) {
  operationError = error;
}

let cleanupError;
try {
  await deleteDriveFiles(
    drive,
    [...temporaryImages.values()].map((temporary) => temporary.fileId),
    'temporary images',
  );
} catch (error) {
  cleanupError = error;
}

if (operationError && cleanupError) {
  throw operationAndCleanupError(
    operationError,
    cleanupError,
    'Image synchronization and temporary image cleanup both failed.',
  );
}
if (operationError) throw operationError;
if (cleanupError) {
  const resourceIds = cleanupError instanceof ResourceCleanupError
    ? cleanupError.resourceIds.join(', ')
    : 'unknown';
  throw new Error(
    `Images were synchronized to document ${documentId}, but temporary image cleanup failed: ${resourceIds}`,
    { cause: cleanupError },
  );
}
console.log(JSON.stringify(result, null, 2));
