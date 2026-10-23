import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertNewTabsOnly,
  assertPublishTarget,
  planExistingDocumentPublish,
} from '../scripts/publish-policy.mjs';

const manifestTabs = [
  { sourceFile: '00-index.md', tabTitle: '00 Index' },
  { sourceFile: '49-operation-log-design.md', tabTitle: '49 Operation log design' },
];

test('requires an explicit target before publish', () => {
  assert.throws(
    () => assertPublishTarget({ newDocument: false, documentId: undefined }),
    /Specify --new-document/,
  );
  assert.doesNotThrow(() => assertPublishTarget({ newDocument: true, documentId: undefined }));
  assert.doesNotThrow(() => assertPublishTarget({ newDocument: false, documentId: 'document-1' }));
});

test('rejects full regeneration of an existing document', () => {
  assert.throws(
    () => planExistingDocumentPublish({
      manifestTabs,
      selectedFiles: [],
      existingTitles: new Set(['00 Index']),
    }),
    /cannot be fully regenerated/,
  );
});

test('rejects replacement of an existing tab', () => {
  const plan = planExistingDocumentPublish({
    manifestTabs,
    selectedFiles: ['00-index.md'],
    existingTitles: new Set(['00 Index']),
  });

  assert.deepEqual(plan.existingTabs, [manifestTabs[0]]);
  assert.throws(
    () => assertNewTabsOnly({ ...plan, createMissingTabs: true }),
    /Refusing to replace existing Google Docs tabs/,
  );
});

test('allows adding a missing tab only with the explicit flag', () => {
  const plan = planExistingDocumentPublish({
    manifestTabs,
    selectedFiles: ['49-operation-log-design.md'],
    existingTitles: new Set(['00 Index']),
  });

  assert.deepEqual(plan.missingTabs, [manifestTabs[1]]);
  assert.throws(
    () => assertNewTabsOnly({ ...plan, createMissingTabs: false }),
    /--create-missing-tabs/,
  );
  assert.doesNotThrow(() => assertNewTabsOnly({ ...plan, createMissingTabs: true }));
});

test('rejects adding a tab when another manifest tab is also missing', () => {
  const extendedManifest = [
    ...manifestTabs,
    { sourceFile: '50-future.md', tabTitle: '50 Future' },
  ];
  const plan = planExistingDocumentPublish({
    manifestTabs: extendedManifest,
    selectedFiles: ['49-operation-log-design.md'],
    existingTitles: new Set(['00 Index']),
  });

  assert.throws(
    () => assertNewTabsOnly({ ...plan, createMissingTabs: true }),
    /Other Google Docs tabs are missing: 50 Future/,
  );
});

test('rejects a mixed selection before writing any tab', () => {
  const plan = planExistingDocumentPublish({
    manifestTabs,
    selectedFiles: ['00-index.md', '49-operation-log-design.md'],
    existingTitles: new Set(['00 Index']),
  });

  assert.throws(
    () => assertNewTabsOnly({ ...plan, createMissingTabs: true }),
    /00 Index/,
  );
});
