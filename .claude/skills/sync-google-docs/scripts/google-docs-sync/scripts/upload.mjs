import fsp from 'node:fs/promises';
import path from 'node:path';
import { google } from 'googleapis';
import { marked } from 'marked';
import {
  assertPublicTemporaryImageAccess,
  listTemporaryImages,
  uploadTemporaryImage,
} from './google-drive-image.mjs';
import { loadGoogleAuth } from './google-auth.mjs';
import { assertNewTabsOnly, assertPublishTarget, planExistingDocumentPublish } from './publish-policy.mjs';
import { loadConfig } from './config.mjs';
import {
  deleteDriveFiles,
  deleteDocumentTabs,
  discardIncompleteDocument,
  completedPublishError,
  operationAndCleanupError,
  ResourceCleanupError,
} from './resource-cleanup.mjs';

const { sourceDir, buildDir, stateDir, screenDirectory, config } = await loadConfig();
const credentialsPath = path.resolve(process.env.GOOGLE_OAUTH_CREDENTIALS || path.join(stateDir, 'credentials.json'));
const tokenPath = path.resolve(process.env.GOOGLE_OAUTH_TOKEN || path.join(stateDir, 'token.json'));
const documentIdPath = path.join(stateDir, '.document-id');
const scopes = [
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/drive.file',
];

function argument(name) {
  const prefix = `--${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix));
  return value?.slice(prefix.length);
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function flattenTabs(tabs) {
  const result = [];
  for (const tab of tabs || []) {
    result.push(tab);
    result.push(...flattenTabs(tab.childTabs));
  }
  return result;
}

function utf16Length(value) {
  return value.length;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

// Space writes slightly beyond one second to avoid short bursts against per-minute quotas.
const WRITE_INTERVAL_MS = 1100;
const MAX_WRITE_ATTEMPTS = 3;
// Quota windows are minute-based; wait one minute plus a scheduling margin after HTTP 429.
const QUOTA_RETRY_BASE_MS = 65000;

class DocsWriter {
  constructor(docs) {
    this.docs = docs;
    this.lastWriteAt = 0;
  }

  async batchUpdate(parameters) {
    const wait = Math.max(0, WRITE_INTERVAL_MS - (Date.now() - this.lastWriteAt));
    if (wait > 0) await sleep(wait);

    for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
      try {
        const response = await this.docs.documents.batchUpdate(parameters);
        this.lastWriteAt = Date.now();
        return response;
      } catch (error) {
        if (error.code !== 429 || attempt === MAX_WRITE_ATTEMPTS - 1) throw error;
        const retrySeconds = (QUOTA_RETRY_BASE_MS * (attempt + 1)) / 1000;
        console.warn(`Google Docs write quota reached. Retrying in ${retrySeconds} seconds.`);
        await sleep(retrySeconds * 1000);
      }
    }
    throw new Error('Google Docs batch update failed.');
  }
}

function localFileReference(value) {
  const clean = value.split('#')[0];
  return /^[0-9A-Za-z._-]+\.md$/.test(clean) ? path.basename(clean) : null;
}

function screenReference(value) {
  const escapedScreenDirectory = screenDirectory.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return value.match(new RegExp(`${escapedScreenDirectory}/([0-9A-Za-z._-]+\\.(?:png|jpe?g|gif))`))?.[1] || null;
}

function tabLink(context, target) {
  if (!context.tabLinkDocumentId) return { tabId: target.tabId };
  return {
    url: `https://docs.google.com/document/d/${context.tabLinkDocumentId}/edit?tab=${target.tabId}`,
  };
}

function renderInline(tokens, context, inherited = {}) {
  let text = '';
  const spans = [];

  function append(value, style = {}) {
    if (!value) return;
    const start = utf16Length(text);
    text += value;
    const end = utf16Length(text);
    if (Object.keys(style).length > 0) spans.push({ start, end, ...style });
  }

  function appendText(value, style) {
    const escapedScreenDirectory = screenDirectory.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(${escapedScreenDirectory}/[0-9A-Za-z._-]+\\.(?:png|jpe?g|gif)|[0-9A-Za-z._-]+\\.md)`, 'g');
    let offset = 0;
    for (const match of value.matchAll(pattern)) {
      append(value.slice(offset, match.index), style);
      const reference = match[0];
      const screen = screenReference(reference);
      const file = localFileReference(reference);
      if (screen) {
        const example = context.screenExamplesByImage.get(`${screenDirectory}/${screen}`);
        append(example ? `${context.labels.screenExample}${example.number}` : reference, style);
      } else if (file && context.tabByFile.has(file)) {
        const target = context.tabByFile.get(file);
        append(`${context.labels.tabReference}「${target.title}」`, { ...style, ...tabLink(context, target) });
      } else if (file && context.unresolvedReferences.has(file)) {
        append(context.labels.unresolvedReference, style);
      } else {
        append(reference, style);
      }
      offset = match.index + reference.length;
    }
    append(value.slice(offset), style);
  }

  function visit(tokenList, style = {}) {
    for (const token of tokenList || []) {
      if (token.type === 'text') {
        if (token.tokens) visit(token.tokens, style);
        else appendText(token.text, style);
      } else if (token.type === 'strong') {
        visit(token.tokens, { ...style, bold: true });
      } else if (token.type === 'em') {
        visit(token.tokens, { ...style, italic: true });
      } else if (token.type === 'del') {
        visit(token.tokens, { ...style, strikethrough: true });
      } else if (token.type === 'codespan') {
        const file = localFileReference(token.text);
        const screen = screenReference(token.text);
        if (file && context.tabByFile.has(file)) {
          const target = context.tabByFile.get(file);
          append(`${context.labels.tabReference}「${target.title}」`, { ...style, code: true, ...tabLink(context, target) });
        } else if (file && context.unresolvedReferences.has(file)) {
          append(context.labels.unresolvedReference, style);
        } else if (screen) {
          const example = context.screenExamplesByImage.get(`${screenDirectory}/${screen}`);
          append(example ? `${context.labels.screenExample}${example.number}` : token.text, { ...style, code: true });
        } else {
          append(token.text, { ...style, code: true });
        }
      } else if (token.type === 'link') {
        const file = localFileReference(token.href);
        if (file && context.tabByFile.has(file)) {
          const target = context.tabByFile.get(file);
          append(`${context.labels.tabReference}「${target.title}」`, { ...style, ...tabLink(context, target) });
        } else if (file && context.unresolvedReferences.has(file)) {
          append(context.labels.unresolvedReference, style);
        } else {
          const linked = renderInline(token.tokens, context, style);
          const start = utf16Length(text);
          text += linked.text;
          spans.push(...linked.spans.map((span) => ({ ...span, start: span.start + start, end: span.end + start })));
          spans.push({ start, end: utf16Length(text), url: token.href });
        }
      } else if (token.type === 'br') {
        append('\n', style);
      } else if (typeof token.text === 'string') {
        appendText(token.text, style);
      }
    }
  }

  visit(tokens, inherited);
  return { text, spans };
}

function textStyle(span) {
  const style = {};
  const fields = [];
  for (const key of ['bold', 'italic', 'strikethrough']) {
    if (span[key] !== undefined) {
      style[key] = span[key];
      fields.push(key);
    }
  }
  if (span.code) {
    style.weightedFontFamily = { fontFamily: 'Roboto Mono' };
    style.backgroundColor = { color: { rgbColor: { red: 0.94, green: 0.94, blue: 0.94 } } };
    fields.push('weightedFontFamily', 'backgroundColor');
  }
  if (span.tabId) {
    style.link = { tabId: span.tabId };
    fields.push('link');
  } else if (span.url) {
    style.link = { url: span.url };
    fields.push('link');
  }
  return { style, fields: [...new Set(fields)].join(',') };
}

function paragraphRequests(tabId, cursor, rendered, options = {}) {
  const content = `${rendered.text}\n`;
  const requests = [{
    insertText: {
      endOfSegmentLocation: { tabId },
      text: content,
    },
  }];

  if (options.namedStyleType) {
    requests.push({
      updateParagraphStyle: {
        range: { tabId, startIndex: cursor, endIndex: cursor + utf16Length(content) },
        paragraphStyle: { namedStyleType: options.namedStyleType },
        fields: 'namedStyleType',
      },
    });
  }

  if (options.bulletPreset) {
    requests.push({
      createParagraphBullets: {
        range: { tabId, startIndex: cursor, endIndex: cursor + utf16Length(content) },
        bulletPreset: options.bulletPreset,
      },
    });
  }

  for (const span of rendered.spans) {
    const { style, fields } = textStyle(span);
    if (!fields || span.start === span.end) continue;
    requests.push({
      updateTextStyle: {
        range: {
          tabId,
          startIndex: cursor + span.start,
          endIndex: cursor + span.end,
        },
        textStyle: style,
        fields,
      },
    });
  }

  return { requests, cursor: cursor + utf16Length(content) };
}

async function appendParagraph(writer, documentId, tabId, cursor, rendered, options = {}) {
  const built = paragraphRequests(tabId, cursor, rendered, options);
  await writer.batchUpdate({ documentId, requestBody: { requests: built.requests } });
  return built.cursor;
}

function listItemInlineTokens(item) {
  const textToken = item.tokens?.find((token) => token.type === 'text');
  return textToken?.tokens || [{ type: 'text', text: item.text || '' }];
}

async function documentTab(docs, documentId, tabId) {
  const response = await docs.documents.get({ documentId, includeTabsContent: true });
  return flattenTabs(response.data.tabs).find((tab) => tab.tabProperties.tabId === tabId);
}

async function bodyEndIndex(docs, documentId, tabId) {
  const tab = await documentTab(docs, documentId, tabId);
  const content = tab.documentTab.body.content || [];
  return Math.max(1, (content.at(-1)?.endIndex || 2) - 1);
}

async function appendTable(docs, writer, documentId, tabId, cursor, token, context) {
  const rows = [token.header, ...token.rows];
  const columns = token.header.length;
  await writer.batchUpdate({
    documentId,
    requestBody: {
      requests: [{ insertTable: { rows: rows.length, columns, endOfSegmentLocation: { tabId } } }],
    },
  });

  const tab = await documentTab(docs, documentId, tabId);
  const tableElement = [...tab.documentTab.body.content].reverse().find((element) => element.table);
  const cells = [];
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    for (let columnIndex = 0; columnIndex < columns; columnIndex += 1) {
      const cell = tableElement.table.tableRows[rowIndex].tableCells[columnIndex];
      const location = cell.content[0].startIndex;
      const rendered = renderInline(rows[rowIndex][columnIndex].tokens, context);
      cells.push({ rowIndex, location, rendered });
    }
  }

  cells.sort((a, b) => b.location - a.location);
  const requests = [];
  for (const cell of cells) {
    if (!cell.rendered.text) continue;
    requests.push({
      insertText: {
        location: { tabId, index: cell.location },
        text: cell.rendered.text,
      },
    });
    if (cell.rowIndex === 0) {
      requests.push({
        updateTextStyle: {
          range: {
            tabId,
            startIndex: cell.location,
            endIndex: cell.location + utf16Length(cell.rendered.text),
          },
          textStyle: { bold: true },
          fields: 'bold',
        },
      });
    }
    for (const span of cell.rendered.spans) {
      const { style, fields } = textStyle(span);
      if (!fields || span.start === span.end) continue;
      requests.push({
        updateTextStyle: {
          range: {
            tabId,
            startIndex: cell.location + span.start,
            endIndex: cell.location + span.end,
          },
          textStyle: style,
          fields,
        },
      });
    }
  }
  if (requests.length > 0) await writer.batchUpdate({ documentId, requestBody: { requests } });

  return bodyEndIndex(docs, documentId, tabId);
}

async function renderBlocks(docs, writer, documentId, tabId, markdown, context) {
  let cursor = 1;
  let pendingRequests = [];

  function queueParagraph(rendered, options = {}) {
    const built = paragraphRequests(tabId, cursor, rendered, options);
    pendingRequests.push(...built.requests);
    cursor = built.cursor;
  }

  async function flush() {
    if (pendingRequests.length === 0) return;
    await writer.batchUpdate({ documentId, requestBody: { requests: pendingRequests } });
    pendingRequests = [];
  }

  for (const token of marked.lexer(markdown)) {
    if (token.type === 'space') continue;
    if (token.type === 'heading') {
      const rendered = renderInline(token.tokens, context);
      const namedStyleType = token.depth === 1 ? 'HEADING_1' : token.depth === 2 ? 'HEADING_2' : 'HEADING_3';
      queueParagraph(rendered, { namedStyleType });
    } else if (token.type === 'paragraph' || token.type === 'text') {
      queueParagraph(renderInline(token.tokens || [{ type: 'text', text: token.text || '' }], context));
    } else if (token.type === 'list') {
      for (const item of token.items) {
        queueParagraph(
          renderInline(listItemInlineTokens(item), context),
          { bulletPreset: token.ordered ? 'NUMBERED_DECIMAL_NESTED' : 'BULLET_DISC_CIRCLE_SQUARE' },
        );
      }
    } else if (token.type === 'table') {
      await flush();
      cursor = await appendTable(docs, writer, documentId, tabId, cursor, token, context);
    } else if (token.type === 'code') {
      queueParagraph({
        text: token.text,
        spans: [{ start: 0, end: utf16Length(token.text), code: true }],
      });
    } else if (token.type === 'blockquote') {
      for (const child of token.tokens || []) {
        const rendered = renderInline(child.tokens || [{ type: 'text', text: child.text || '' }], context);
        rendered.text = `> ${rendered.text}`;
        rendered.spans = rendered.spans.map((span) => ({ ...span, start: span.start + 2, end: span.end + 2 }));
        queueParagraph(rendered);
      }
    } else if (token.type === 'hr') {
      queueParagraph({ text: '────────────────', spans: [] });
    }
  }
  await flush();
  return cursor;
}

async function resetTabs(docs, writer, documentId, manifest) {
  const response = await docs.documents.get({ documentId, includeTabsContent: true });
  const tabs = flattenTabs(response.data.tabs);
  const firstTab = tabs[0];
  const requests = [];

  for (const tab of [...tabs].reverse()) {
    if (tab.tabProperties.tabId !== firstTab.tabProperties.tabId) {
      requests.push({ deleteTab: { tabId: tab.tabProperties.tabId } });
    }
  }

  const body = firstTab.documentTab.body.content || [];
  const endIndex = (body.at(-1)?.endIndex || 2) - 1;
  if (endIndex > 1) {
    requests.push({
      deleteContentRange: {
        range: { tabId: firstTab.tabProperties.tabId, startIndex: 1, endIndex },
      },
    });
  }

  requests.push({
    updateDocumentTabProperties: {
      tabProperties: {
        tabId: firstTab.tabProperties.tabId,
        title: manifest.tabs[0].tabTitle,
      },
      fields: 'title',
    },
  });

  await writer.batchUpdate({ documentId, requestBody: { requests } });

  const tabByFile = new Map([[manifest.tabs[0].sourceFile, {
    tabId: firstTab.tabProperties.tabId,
    title: manifest.tabs[0].tabTitle,
  }]]);

  const addRequests = [];
  for (let index = 1; index < manifest.tabs.length; index += 1) {
    const tab = manifest.tabs[index];
    addRequests.push({ addDocumentTab: { tabProperties: { title: tab.tabTitle, index } } });
  }
  const add = addRequests.length > 0
    ? await writer.batchUpdate({ documentId, requestBody: { requests: addRequests } })
    : { data: { replies: [] } };
  for (let index = 1; index < manifest.tabs.length; index += 1) {
    const tab = manifest.tabs[index];
    const properties = add.data.replies[index - 1].addDocumentTab.tabProperties;
    tabByFile.set(tab.sourceFile, { tabId: properties.tabId, title: tab.tabTitle });
  }
  return tabByFile;
}

async function existingTabs(docs, documentId, manifest) {
  const response = await docs.documents.get({ documentId, includeTabsContent: true });
  const tabsByTitle = new Map(flattenTabs(response.data.tabs).map((tab) => [
    tab.tabProperties.title,
    tab.tabProperties.tabId,
  ]));
  const tabByFile = new Map();
  for (const tab of manifest.tabs) {
    const tabId = tabsByTitle.get(tab.tabTitle);
    if (!tabId) throw new Error(`Google Docs tab is missing: ${tab.tabTitle}`);
    tabByFile.set(tab.sourceFile, { tabId, title: tab.tabTitle });
  }
  return tabByFile;
}

async function addMissingSelectedTabs(docs, writer, documentId, manifest, selectedFiles) {
  const response = await docs.documents.get({ documentId, includeTabsContent: true });
  const existingTitles = new Set(flattenTabs(response.data.tabs).map((tab) => tab.tabProperties.title));
  const selectedSet = new Set(selectedFiles);
  const missing = manifest.tabs.filter((tab) => (
    selectedSet.has(tab.sourceFile) && !existingTitles.has(tab.tabTitle)
  ));
  if (missing.length === 0) return [];

  const requests = missing.map((tab) => ({
    addDocumentTab: {
      tabProperties: {
        title: tab.tabTitle,
        index: manifest.tabs.indexOf(tab),
      },
    },
  }));
  const added = await writer.batchUpdate({ documentId, requestBody: { requests } });
  return missing.map((tab, index) => ({
    tabId: added.data.replies[index].addDocumentTab.tabProperties.tabId,
    title: tab.tabTitle,
  }));
}

async function appendImages(
  docs,
  writer,
  drive,
  documentId,
  tabId,
  screenExamples,
  imageWidthPt,
  temporaryImages,
) {
  if (screenExamples.length === 0) return;
  let cursor = await bodyEndIndex(docs, documentId, tabId);
  const tabImages = [];
  for (const { image } of screenExamples) {
    const item = {
      image,
      temporary: await uploadTemporaryImage(
        drive,
        path.join(sourceDir, image),
        config.temporaryImagePrefix,
        config.allowPublicTemporaryImages,
      ),
    };
    tabImages.push(item);
    temporaryImages.push(item);
  }

  const heading = paragraphRequests(tabId, cursor, { text: manifest.labels.screenExamplesHeading, spans: [] }, { namedStyleType: 'HEADING_2' });
  const requests = [...heading.requests];
  cursor = heading.cursor;
  for (const [{ temporary }, example] of tabImages.map((item, index) => [item, screenExamples[index]])) {
    const captionText = `▼ ${manifest.labels.screenExample}${example.number}：${example.label}`;
    const caption = paragraphRequests(tabId, cursor, {
      text: captionText,
      spans: [{ start: 0, end: captionText.length, bold: true }],
    });
    requests.push(...caption.requests);
    cursor = caption.cursor;
    requests.push({
      insertInlineImage: {
        endOfSegmentLocation: { tabId },
        uri: temporary.uri,
        objectSize: {
          width: { magnitude: imageWidthPt, unit: 'PT' },
        },
      },
    });
    requests.push({ insertText: { endOfSegmentLocation: { tabId }, text: '\n' } });
    cursor += 2;
  }
  await writer.batchUpdate({ documentId, requestBody: { requests } });
}

const manifest = JSON.parse(await fsp.readFile(path.join(buildDir, 'requirements.json'), 'utf8'));
const selectedFiles = argument('files')?.split(',').map((value) => value.trim()).filter(Boolean) || [];
const tabsForImageUpload = selectedFiles.length === 0
  ? manifest.tabs
  : manifest.tabs.filter((tab) => selectedFiles.includes(tab.sourceFile));
const writesImages = !hasFlag('dry-run') && tabsForImageUpload.some((tab) => tab.screenExamples.length > 0);
if (writesImages) assertPublicTemporaryImageAccess(config.allowPublicTemporaryImages);
if (manifest.unresolvedReferences.length > 0 && !hasFlag('allow-unresolved')) {
  throw new Error(
    `Unresolved Markdown references remain: ${manifest.unresolvedReferences.join(', ')}. `
    + 'Create the source files or run with --allow-unresolved for a provisional document.',
  );
}

const auth = await loadGoogleAuth({ credentialsPath, tokenPath, scopes });
const docs = google.docs({ version: 'v1', auth });
const drive = google.drive({ version: 'v3', auth });
const writer = new DocsWriter(docs);
if (writesImages) {
  const leakedTemporaryImages = await listTemporaryImages(drive, config.temporaryImagePrefix);
  if (leakedTemporaryImages.length > 0) {
    throw new Error(
      `Temporary Google Drive images remain from an earlier run: ${leakedTemporaryImages.map((file) => file.name).join(', ')}`,
    );
  }
}
const newDocument = hasFlag('new-document');
if (newDocument && (argument('document-id') || process.env.GOOGLE_DOCS_DOCUMENT_ID)) {
  throw new Error('--new-document cannot be combined with an existing document ID.');
}
let documentId = newDocument ? undefined : argument('document-id') || process.env.GOOGLE_DOCS_DOCUMENT_ID;
if (!documentId && !newDocument) {
  try {
    documentId = (await fsp.readFile(documentIdPath, 'utf8')).trim();
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

assertPublishTarget({ newDocument, documentId });

const documentExists = Boolean(documentId);
let createdDocument = false;
let addedTabs = [];
const temporaryImages = [];
let contentWritten = false;
try {
if (!documentExists) {
  if (selectedFiles.length > 0) {
    throw new Error('--files requires an existing Google Docs document. Run a full publish first.');
  }
  const created = await docs.documents.create({ requestBody: { title: manifest.documentTitle } });
  documentId = created.data.documentId;
  createdDocument = true;
  await fsp.writeFile(documentIdPath, `${documentId}\n`, { mode: 0o600 });
  await fsp.chmod(documentIdPath, 0o600);
}

const unknownFiles = selectedFiles.filter((file) => !manifest.tabs.some((tab) => tab.sourceFile === file));
if (unknownFiles.length > 0) throw new Error(`Unknown source files: ${unknownFiles.join(', ')}`);

let existingDocumentPlan;
if (documentExists) {
  const response = await docs.documents.get({ documentId, includeTabsContent: true });
  const existingTitles = new Set(flattenTabs(response.data.tabs).map((tab) => tab.tabProperties.title));
  existingDocumentPlan = planExistingDocumentPublish({
    manifestTabs: manifest.tabs,
    selectedFiles,
    existingTitles,
  });
}
if (documentExists && hasFlag('dry-run')) {
  console.log(JSON.stringify({
    mode: 'dry-run',
    documentId,
    selectedTabs: existingDocumentPlan.selectedTabs.map((tab) => tab.tabTitle),
    existingTabs: existingDocumentPlan.existingTabs.map((tab) => tab.tabTitle),
    missingTabs: existingDocumentPlan.missingTabs.map((tab) => tab.tabTitle),
    unrelatedMissingTabs: existingDocumentPlan.unrelatedMissingTabs.map((tab) => tab.tabTitle),
    createMissingTabs: hasFlag('create-missing-tabs'),
    existingTabsWritable: false,
  }, null, 2));
  process.exit(0);
}
if (documentExists) {
  assertNewTabsOnly({
    ...existingDocumentPlan,
    createMissingTabs: hasFlag('create-missing-tabs'),
  });
}
if (documentExists && hasFlag('create-missing-tabs')) {
  addedTabs = await addMissingSelectedTabs(docs, writer, documentId, manifest, selectedFiles);
  if (addedTabs.length > 0) console.log(`Added tabs: ${addedTabs.map((tab) => tab.title).join(', ')}`);
}
const writeTabByFile = documentExists
  ? await existingTabs(docs, documentId, manifest)
  : await resetTabs(docs, writer, documentId, manifest);
const context = {
  tabByFile: writeTabByFile,
  tabLinkDocumentId: manifest.tabLinkDocumentId && manifest.tabLinkDocumentId !== documentId
    ? manifest.tabLinkDocumentId
    : null,
  unresolvedReferences: new Set(manifest.unresolvedReferences),
  labels: manifest.labels,
};
const tabsToWrite = documentExists
  ? existingDocumentPlan.missingTabs
  : manifest.tabs;
for (const tab of tabsToWrite) {
  const target = writeTabByFile.get(tab.sourceFile);
  console.log(`Writing tab: ${target.title}`);
  const tabContext = {
    ...context,
    screenExamplesByImage: new Map(tab.screenExamples.map((example) => [example.image, example])),
  };
  await renderBlocks(docs, writer, documentId, target.tabId, tab.markdown, tabContext);
  await appendImages(
    docs,
    writer,
    drive,
    documentId,
    target.tabId,
    tab.screenExamples,
    manifest.imageWidthPt,
    temporaryImages,
  );
}
contentWritten = true;
await deleteDriveFiles(
  drive,
  temporaryImages.map(({ temporary }) => temporary.fileId),
  'temporary images',
);
temporaryImages.length = 0;

const url = `https://docs.google.com/document/d/${documentId}/edit`;
await fsp.writeFile(path.join(buildDir, 'document-url.txt'), `${url}\n`);
console.log(`Published: ${url}`);
} catch (error) {
  if (contentWritten) throw completedPublishError(error, documentId);
  let operationError = error;
  if (temporaryImages.length > 0) {
    try {
      await deleteDriveFiles(
        drive,
        temporaryImages.map(({ temporary }) => temporary.fileId),
        'temporary images',
      );
    } catch (cleanupError) {
      operationError = operationAndCleanupError(
        operationError,
        cleanupError,
        'Publish and temporary image cleanup both failed.',
      );
    }
  }
  if (!createdDocument && addedTabs.length === 0) throw operationError;
  try {
    if (createdDocument) {
      await discardIncompleteDocument(drive, documentId, documentIdPath);
    } else {
      await deleteDocumentTabs(docs, documentId, addedTabs);
    }
  } catch (cleanupError) {
    throw operationAndCleanupError(
      operationError,
      cleanupError,
      `Publish failed and incomplete resources could not be cleaned up: ${documentId}; `
        + `tabs: ${addedTabs.map((tab) => tab.tabId).join(', ') || 'none'}`,
    );
  }
  throw operationError;
}
