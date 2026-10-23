import assert from 'node:assert/strict';
import test from 'node:test';
import { planPdfExport, submissionTabs } from '../scripts/pdf-export-policy.mjs';

const includeNumberedFiles = { min: 0, max: 49 };

const manifestTabs = [
  { sourceFile: '00-index.md', tabTitle: '00 Index' },
  { sourceFile: '49-delivery.md', tabTitle: '49 Delivery' },
  { sourceFile: '50-operation-log-design.md', tabTitle: '50 Operation log design' },
  { sourceFile: '99-retrospective.md', tabTitle: '99 Retrospective' },
];

const documentTabs = manifestTabs.map((tab, index) => ({
  tabProperties: { tabId: `tab-${index}`, title: tab.tabTitle },
}));

test('selects only requirement tabs numbered 00 through 49', () => {
  assert.deepEqual(
    submissionTabs(manifestTabs, includeNumberedFiles).map((tab) => tab.sourceFile),
    ['00-index.md', '49-delivery.md'],
  );
});

test('removes the operation log design and internal tabs from the temporary PDF copy', () => {
  const plan = planPdfExport(manifestTabs, documentTabs, includeNumberedFiles);
  assert.deepEqual(
    plan.retained.map((tab) => tab.tabProperties.title),
    ['00 Index', '49 Delivery'],
  );
  assert.deepEqual(
    plan.removed.map((tab) => tab.tabProperties.title),
    ['50 Operation log design', '99 Retrospective'],
  );
});

test('stops when a submission tab is missing from Google Docs', () => {
  assert.throws(
    () => planPdfExport(manifestTabs, documentTabs.slice(1), includeNumberedFiles),
    /Google Docs tabs are missing: 00 Index/,
  );
});

test('requires an explicit PDF source range', () => {
  assert.throws(() => submissionTabs(manifestTabs), /requires pdf.includeNumberedFiles/);
});
