import assert from 'node:assert/strict';
import test from 'node:test';
import {
  imageReplacementRequests,
  planImageSync,
  verifyImageSync,
} from '../scripts/image-sync.mjs';

function liveTab({ caption = '▼ 画面例1：撮影', objectIds = ['img-1'] } = {}) {
  return {
    tabProperties: { tabId: 'tab-21', title: '21 撮影' },
    documentTab: {
      body: {
        content: [
          {
            paragraph: {
              elements: [{ textRun: { content: `${caption}\n` } }],
            },
          },
          ...objectIds.map((inlineObjectId, index) => ({
            paragraph: { elements: [{
              startIndex: 10 + index,
              endIndex: 11 + index,
              inlineObjectElement: { inlineObjectId },
            }] },
          })),
        ],
      },
      inlineObjects: Object.fromEntries(objectIds.map((id) => [id, {
        inlineObjectProperties: {
          embeddedObject: {
            size: {
              width: { magnitude: 100, unit: 'PT' },
              height: { magnitude: 75, unit: 'PT' },
            },
            imageProperties: { sourceUri: 'https://example.com/new.png' },
          },
        },
      }])),
    },
  };
}

const manifest = [{
  tabTitle: '21 撮影',
  screenExamples: [{ image: 'screens/03-capture.png', number: 1, label: '撮影' }],
}];

test('pairs each screen example with one existing inline image', () => {
  assert.deepEqual(planImageSync(manifest, [liveTab()]), [{
    tabTitle: '21 撮影',
    tabId: 'tab-21',
    imageObjectId: 'img-1',
    startIndex: 10,
    endIndex: 11,
    objectSize: {
      width: { magnitude: 100, unit: 'PT' },
      height: { magnitude: 75, unit: 'PT' },
    },
    image: 'screens/03-capture.png',
    caption: '▼ 画面例1：撮影',
  }]);
});

test('stops before writing when image counts differ', () => {
  assert.throws(() => planImageSync(manifest, [liveTab({ objectIds: [] })]), /Image count mismatch/);
});

test('stops before writing when the expected caption is missing', () => {
  assert.throws(() => planImageSync(manifest, [liveTab({ caption: '別の画面' })]), /Expected one image caption/);
});

test('rejects duplicate Google Docs tab titles before planning or verification', () => {
  const duplicateTabs = [liveTab(), liveTab()];
  assert.throws(
    () => planImageSync(manifest, duplicateTabs),
    /Duplicate Google Docs tab title: 21 撮影/,
  );
  assert.throws(
    () => verifyImageSync(duplicateTabs, [], new Map()),
    /Duplicate Google Docs tab title: 21 撮影/,
  );
});

test('verifies the source URI of every replaced image', () => {
  const replacements = planImageSync(manifest, [liveTab()]);
  assert.deepEqual(
    verifyImageSync(
      [liveTab()],
      replacements,
      new Map([['screens/03-capture.png', 'https://example.com/new.png']]),
    ),
    [],
  );
});

test('replaces tab images in descending range order while preserving size', () => {
  const replacements = planImageSync(manifest, [liveTab()]);
  assert.deepEqual(
    imageReplacementRequests(
      replacements,
      new Map([['screens/03-capture.png', 'https://example.com/new.png']]),
    ),
    [
      {
        deleteContentRange: {
          range: { tabId: 'tab-21', startIndex: 10, endIndex: 11 },
        },
      },
      {
        insertInlineImage: {
          uri: 'https://example.com/new.png',
          location: { tabId: 'tab-21', index: 10 },
          objectSize: {
            width: { magnitude: 100, unit: 'PT' },
            height: { magnitude: 75, unit: 'PT' },
          },
        },
      },
    ],
  );
});
