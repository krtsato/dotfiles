import assert from 'node:assert/strict';
import test from 'node:test';
import { validateConfig } from '../scripts/config.mjs';

const valid = { version: 1, documentTitle: 'Requirements', sourceDir: '../source', buildDir: 'build', indexFile: '00-index.md', imageWidthPt: 386 };

test('validateConfig accepts the minimal reusable configuration', () => {
  assert.deepEqual(validateConfig(valid), valid);
});

test('validateConfig rejects unsupported versions and invalid PDF ranges', () => {
  assert.throws(() => validateConfig({ ...valid, version: 2 }), /Unsupported config version/);
  assert.throws(() => validateConfig({ ...valid, pdf: { includeNumberedFiles: { min: 50, max: 49 }, outputFile: 'out.pdf', creator: 'test' } }), /must not exceed/);
});

test('validateConfig accepts configurable output labels', () => {
  const labels = {
    tabReference: 'Tab',
    unresolvedReference: 'To be added',
    screenExamplesHeading: 'Screen examples',
    screenExample: 'Screen example',
  };
  assert.equal(validateConfig({ ...valid, labels }).labels, labels);
  assert.throws(
    () => validateConfig({ ...valid, labels: { ...labels, screenExample: '' } }),
    /config.screenExample must be a non-empty string/,
  );
});

test('validateConfig accepts configurable comment references', () => {
  const commentReference = {
    label: 'Requirement candidate',
    directPattern: 'Requirement\\s+(\\d+)',
    nearbyPattern: '(?:^|\\D)(\\d+)(?=\\D|$)',
  };
  assert.equal(validateConfig({ ...valid, commentReference }).commentReference, commentReference);
  assert.throws(
    () => validateConfig({ ...valid, commentReference: { ...commentReference, directPattern: '[' } }),
    /must be a valid regular expression/,
  );
});

test('validateConfig accepts only a boolean public image acknowledgement', () => {
  assert.equal(validateConfig({ ...valid, allowPublicTemporaryImages: true }).allowPublicTemporaryImages, true);
  assert.throws(
    () => validateConfig({ ...valid, allowPublicTemporaryImages: 'yes' }),
    /must be a boolean/,
  );
});
