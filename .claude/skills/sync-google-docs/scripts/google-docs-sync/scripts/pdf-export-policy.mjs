import { sourceNumber } from './document-naming.mjs';

export function submissionTabs(manifestTabs, includeNumberedFiles) {
  if (!includeNumberedFiles) throw new Error('PDF export requires pdf.includeNumberedFiles in config.');
  const selected = manifestTabs.filter((tab) => {
    const number = sourceNumber(tab.sourceFile);
    return number !== null && number >= includeNumberedFiles.min && number <= includeNumberedFiles.max;
  });

  if (selected.length === 0) throw new Error('No source tabs matched the configured PDF number range.');
  return selected;
}

export function planPdfExport(manifestTabs, documentTabs, includeNumberedFiles) {
  const selected = submissionTabs(manifestTabs, includeNumberedFiles);
  const liveByTitle = new Map();
  for (const tab of documentTabs) {
    const title = tab.tabProperties?.title;
    if (!title) continue;
    if (liveByTitle.has(title)) throw new Error(`Duplicate Google Docs tab title: ${title}`);
    liveByTitle.set(title, tab);
  }

  const missing = selected.filter((tab) => !liveByTitle.has(tab.tabTitle));
  if (missing.length > 0) {
    throw new Error(`Google Docs tabs are missing: ${missing.map((tab) => tab.tabTitle).join(', ')}`);
  }

  const selectedTitles = new Set(selected.map((tab) => tab.tabTitle));
  return {
    selected,
    retained: documentTabs.filter((tab) => selectedTitles.has(tab.tabProperties?.title)),
    removed: documentTabs.filter((tab) => !selectedTitles.has(tab.tabProperties?.title)),
  };
}
