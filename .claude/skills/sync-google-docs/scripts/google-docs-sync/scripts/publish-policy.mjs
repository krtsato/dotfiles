export function assertPublishTarget({ newDocument, documentId }) {
  if (!newDocument && !documentId) {
    throw new Error('Specify --new-document to create a document, or provide an existing document ID.');
  }
}

export function planExistingDocumentPublish({ manifestTabs, selectedFiles, existingTitles }) {
  if (selectedFiles.length === 0) {
    throw new Error(
      'Existing Google Docs documents cannot be fully regenerated. '
      + 'Use apply-patches for existing tabs, or use --new-document to create a new document.',
    );
  }

  const selectedSet = new Set(selectedFiles);
  const selectedTabs = manifestTabs.filter((tab) => selectedSet.has(tab.sourceFile));
  const existingTabs = selectedTabs.filter((tab) => existingTitles.has(tab.tabTitle));
  const missingTabs = selectedTabs.filter((tab) => !existingTitles.has(tab.tabTitle));
  const unrelatedMissingTabs = manifestTabs.filter((tab) => (
    !selectedSet.has(tab.sourceFile) && !existingTitles.has(tab.tabTitle)
  ));

  return {
    selectedTabs,
    existingTabs,
    missingTabs,
    unrelatedMissingTabs,
  };
}

export function assertNewTabsOnly({
  existingTabs,
  missingTabs,
  unrelatedMissingTabs,
  createMissingTabs,
}) {
  if (existingTabs.length > 0) {
    throw new Error(
      `Refusing to replace existing Google Docs tabs: ${existingTabs.map((tab) => tab.tabTitle).join(', ')}. `
      + 'Use apply-patches with an explicit before/after manifest.',
    );
  }
  if (missingTabs.length > 0 && !createMissingTabs) {
    throw new Error(
      `Google Docs tabs are missing: ${missingTabs.map((tab) => tab.tabTitle).join(', ')}. `
      + 'Run again with --create-missing-tabs to add only these new tabs.',
    );
  }
  if (unrelatedMissingTabs.length > 0) {
    throw new Error(
      `Other Google Docs tabs are missing: ${unrelatedMissingTabs.map((tab) => tab.tabTitle).join(', ')}. `
      + 'Include every missing tab explicitly before adding any of them.',
    );
  }
}
