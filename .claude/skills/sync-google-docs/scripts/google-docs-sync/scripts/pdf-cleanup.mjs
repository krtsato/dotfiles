import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const standardFontDataUrl = `${fileURLToPath(
  new URL('../node_modules/pdfjs-dist/standard_fonts/', import.meta.url),
)}${path.sep}`;

function normalizedText(value) {
  return value.replace(/\s+/g, '');
}

export function dividerPageIndexes(pageTexts, expectedTitles) {
  const normalizedPages = pageTexts.map(normalizedText);
  const indexes = expectedTitles.map((title) => {
    const expected = normalizedText(title);
    const matches = normalizedPages.flatMap((text, index) => (text === expected ? [index] : []));
    if (matches.length !== 1) {
      throw new Error(`Expected one PDF divider page for "${title}", found ${matches.length}.`);
    }
    return matches[0];
  });

  if (new Set(indexes).size !== indexes.length) {
    throw new Error('Multiple Google Docs tabs matched the same PDF divider page.');
  }
  return indexes.sort((left, right) => left - right);
}

async function pageTexts(pdfBytes) {
  const loadingTask = getDocument({
    data: new Uint8Array(pdfBytes),
    disableWorker: true,
    standardFontDataUrl,
  });
  const document = await loadingTask.promise;
  const texts = [];
  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      texts.push(content.items.map((item) => item.str).join(' '));
      page.cleanup();
    }
  } finally {
    await document.destroy();
  }
  return texts;
}

export async function cleanGoogleDocsPdf(pdfBytes, expectedTitles, documentTitle, creator) {
  const texts = await pageTexts(pdfBytes);
  const removedPageIndexes = dividerPageIndexes(texts, expectedTitles);
  const removed = new Set(removedPageIndexes);
  const source = await PDFDocument.load(pdfBytes);
  const output = await PDFDocument.create();
  const retainedPageIndexes = source.getPageIndices().filter((index) => !removed.has(index));
  const pages = await output.copyPages(source, retainedPageIndexes);
  pages.forEach((page) => output.addPage(page));
  output.setTitle(documentTitle);
  output.setCreator(creator);
  output.setProducer('Google Docs and pdf-lib');

  return {
    pdf: Buffer.from(await output.save()),
    originalPageCount: texts.length,
    finalPageCount: retainedPageIndexes.length,
    removedPageNumbers: removedPageIndexes.map((index) => index + 1),
  };
}
