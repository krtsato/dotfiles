import fsp from 'node:fs/promises';
import path from 'node:path';
import { google } from 'googleapis';
import { flattenTabs, structuralElementsText } from './document-patch.mjs';
import { loadGoogleAuth } from './google-auth.mjs';
import { cleanGoogleDocsPdf } from './pdf-cleanup.mjs';
import { planPdfExport } from './pdf-export-policy.mjs';
import { loadConfig } from './config.mjs';
import { operationAndCleanupError, trashDriveFile } from './resource-cleanup.mjs';

const { config, buildDir, stateDir } = await loadConfig();
if (!config.pdf) throw new Error('PDF export requires config.pdf.');

function argument(name) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function firstHeading(tab) {
  for (const element of tab.documentTab?.body?.content || []) {
    if (element.paragraph?.paragraphStyle?.namedStyleType !== 'HEADING_1') continue;
    return structuralElementsText([element]).trim();
  }
  return null;
}

function assertSubmissionHeadings(plan) {
  const liveByTitle = new Map(plan.retained.map((tab) => [tab.tabProperties.title, tab]));
  const mismatches = plan.selected.flatMap((source) => {
    const actual = firstHeading(liveByTitle.get(source.tabTitle));
    return actual === source.title ? [] : [`${source.tabTitle}: expected "${source.title}", got "${actual || ''}"`];
  });
  if (mismatches.length > 0) {
    throw new Error(`Google Docs headings are not ready for PDF export:\n${mismatches.join('\n')}`);
  }
}

function deletionRoots(plan) {
  const removedIds = new Set(plan.removed.map((tab) => tab.tabProperties.tabId));
  const retainedIds = new Set(plan.retained.map((tab) => tab.tabProperties.tabId));
  for (const tab of plan.retained) {
    if (removedIds.has(tab.tabProperties.parentTabId)) {
      throw new Error(`Cannot retain a tab whose parent would be removed: ${tab.tabProperties.title}`);
    }
  }
  return plan.removed.filter((tab) => !removedIds.has(tab.tabProperties.parentTabId)
    && !retainedIds.has(tab.tabProperties.tabId));
}

const manifest = JSON.parse(await fsp.readFile(path.join(buildDir, 'requirements.json'), 'utf8'));
const documentId = argument('document-id') || process.env.GOOGLE_PDF_DOCUMENT_ID || config.tabLinkDocumentId;
if (!documentId) throw new Error('Set config.tabLinkDocumentId, --document-id, or GOOGLE_PDF_DOCUMENT_ID.');

const outputPath = path.resolve(argument('output') || path.join(buildDir, config.pdf.outputFile));
const credentialsPath = path.resolve(
  process.env.GOOGLE_PDF_CREDENTIALS || path.join(stateDir, 'credentials.json'),
);
const tokenPath = path.resolve(
  process.env.GOOGLE_PDF_TOKEN || path.join(stateDir, 'pdf-token.json'),
);
const scopes = [
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.readonly',
];
const auth = await loadGoogleAuth({ credentialsPath, tokenPath, scopes });
const docs = google.docs({ version: 'v1', auth });
const drive = google.drive({ version: 'v3', auth });

const sourceResponse = await docs.documents.get({ documentId, includeTabsContent: true });
const sourcePlan = planPdfExport(manifest.tabs, flattenTabs(sourceResponse.data.tabs), config.pdf.includeNumberedFiles);
assertSubmissionHeadings(sourcePlan);

let temporaryDocumentId;
let operationError;
try {
  const copy = await drive.files.copy({
    fileId: documentId,
    supportsAllDrives: true,
    requestBody: { name: manifest.documentTitle },
    fields: 'id',
  });
  temporaryDocumentId = copy.data.id;
  if (!temporaryDocumentId) throw new Error('Google Drive did not return the temporary document ID.');

  const copiedResponse = await docs.documents.get({
    documentId: temporaryDocumentId,
    includeTabsContent: true,
  });
  const copiedPlan = planPdfExport(manifest.tabs, flattenTabs(copiedResponse.data.tabs), config.pdf.includeNumberedFiles);
  const roots = deletionRoots(copiedPlan);
  if (roots.length > 0) {
    await docs.documents.batchUpdate({
      documentId: temporaryDocumentId,
      requestBody: {
        requests: roots.map((tab) => ({ deleteTab: { tabId: tab.tabProperties.tabId } })),
        writeControl: { requiredRevisionId: copiedResponse.data.revisionId },
      },
    });
  }

  const finalCopy = await docs.documents.get({
    documentId: temporaryDocumentId,
    includeTabsContent: true,
  });
  const finalTabs = flattenTabs(finalCopy.data.tabs);
  const finalPlan = planPdfExport(manifest.tabs, finalTabs, config.pdf.includeNumberedFiles);
  if (finalPlan.removed.length > 0 || finalPlan.retained.length !== finalPlan.selected.length) {
    throw new Error('The temporary PDF copy still contains non-submission tabs.');
  }

  const exported = await drive.files.export(
    { fileId: temporaryDocumentId, mimeType: 'application/pdf' },
    { responseType: 'arraybuffer' },
  );
  const rawPdf = Buffer.from(exported.data);
  if (!rawPdf.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    throw new Error('Google Drive did not return a PDF file.');
  }
  const cleaned = await cleanGoogleDocsPdf(
    rawPdf,
    finalPlan.selected.map((tab) => tab.tabTitle),
    manifest.documentTitle,
    config.pdf.creator,
  );
  await fsp.mkdir(path.dirname(outputPath), { recursive: true });
  await fsp.writeFile(outputPath, cleaned.pdf);
  console.log(JSON.stringify({
    status: 'exported',
    documentId,
    outputPath,
    retainedTabs: finalPlan.retained.map((tab) => tab.tabProperties.title),
    excludedSourceFiles: manifest.tabs
      .filter((tab) => !finalPlan.selected.some((selected) => selected.sourceFile === tab.sourceFile))
      .map((tab) => tab.sourceFile),
    originalPageCount: cleaned.originalPageCount,
    removedDividerPages: cleaned.removedPageNumbers,
    finalPageCount: cleaned.finalPageCount,
    bytes: cleaned.pdf.length,
  }, null, 2));
} catch (error) {
  operationError = error;
  throw error;
} finally {
  if (temporaryDocumentId) {
    try {
      await trashDriveFile(drive, temporaryDocumentId, 'temporary PDF document');
    } catch (cleanupError) {
      if (operationError) {
        throw operationAndCleanupError(
          operationError,
          cleanupError,
          `PDF export and temporary document cleanup both failed: ${temporaryDocumentId}`,
        );
      }
      throw cleanupError;
    }
  }
}
