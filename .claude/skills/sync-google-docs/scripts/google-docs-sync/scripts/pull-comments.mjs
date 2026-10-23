import fsp from 'node:fs/promises';
import path from 'node:path';
import { google } from 'googleapis';
import { createCommentReport, renderCommentReportMarkdown } from './comment-report.mjs';
import { loadGoogleAuth } from './google-auth.mjs';
import { loadConfig } from './config.mjs';

// Bound each response while avoiding unnecessary pagination for normal review batches.
const COMMENT_PAGE_SIZE = 100;

const { config, buildDir, stateDir } = await loadConfig();
const credentialsPath = path.resolve(
  process.env.GOOGLE_COMMENTS_CREDENTIALS || path.join(stateDir, 'comments-credentials.json'),
);
const tokenPath = path.resolve(
  process.env.GOOGLE_COMMENTS_TOKEN || path.join(stateDir, 'comments-token.json'),
);
const scopes = [
  'https://www.googleapis.com/auth/documents.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
];

function argument(name) {
  const prefix = `--${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix));
  return value?.slice(prefix.length);
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

async function listComments(drive, documentId) {
  const comments = [];
  let pageToken;
  do {
    const response = await drive.comments.list({
      fileId: documentId,
      pageSize: COMMENT_PAGE_SIZE,
      pageToken,
      includeDeleted: false,
      fields: [
        'nextPageToken,',
        'comments(id,createdTime,modifiedTime,resolved,content,anchor,',
        'quotedFileContent(mimeType,value),author(displayName),',
        'replies(id,createdTime,modifiedTime,content,action,deleted,author(displayName)))',
      ].join(''),
    });
    comments.push(...(response.data.comments || []));
    pageToken = response.data.nextPageToken;
  } while (pageToken);
  return comments;
}

async function assertDriveAccess(drive, documentId) {
  try {
    await drive.files.get({ fileId: documentId, fields: 'id', supportsAllDrives: true });
  } catch (error) {
    if (error.code === 404) {
      throw new Error(
        'The OAuth account cannot access this file through the Drive API. '
        + 'Verify the document ID and share the document directly with that account; '
        + 'link-only access is insufficient for comment retrieval.',
        { cause: error },
      );
    }
    throw error;
  }
}

const manifest = JSON.parse(await fsp.readFile(path.join(buildDir, 'requirements.json'), 'utf8'));
const documentId = argument('document-id')
  || process.env.GOOGLE_REVIEW_DOCUMENT_ID
  || config.tabLinkDocumentId;
if (!documentId) {
  throw new Error('Set config.tabLinkDocumentId, --document-id, or GOOGLE_REVIEW_DOCUMENT_ID.');
}

const includeResolved = hasFlag('include-resolved');
const auth = await loadGoogleAuth({ credentialsPath, tokenPath, scopes });
const docs = google.docs({ version: 'v1', auth });
const drive = google.drive({ version: 'v3', auth });
await assertDriveAccess(drive, documentId);
const [documentResponse, comments] = await Promise.all([
  docs.documents.get({ documentId, includeTabsContent: true }),
  listComments(drive, documentId),
]);
const report = createCommentReport({
  document: documentResponse.data,
  manifest,
  comments,
  documentId,
  includeResolved,
  reference: config.commentReference,
});

await fsp.mkdir(buildDir, { recursive: true });
await Promise.all([
  fsp.writeFile(
    path.join(buildDir, 'review-comments.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  ),
  fsp.writeFile(
    path.join(buildDir, 'review-comments.md'),
    renderCommentReportMarkdown(report),
  ),
]);

console.log(`Fetched ${report.summary.fetched} comments; wrote ${report.summary.included}.`);
console.log(`Matched ${report.summary.matched}; manual review ${report.summary.unmapped + report.summary.ambiguous + report.summary.unmatched + report.summary.unanchored}.`);
