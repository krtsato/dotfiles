import assert from 'node:assert/strict';
import test from 'node:test';
import { assertSourceRef, gitObjectPath } from '../scripts/git-source-ref.mjs';

test('does not require source options when sourceRef is omitted', () => {
  assert.doesNotThrow(() => assertSourceRef([], undefined));
});

test('requires source options when sourceRef is set', () => {
  assert.throws(
    () => assertSourceRef([], 'main'),
    /sourceDir and repoRoot are required when sourceRef is set/,
  );
});

test('normalizes a Windows relative path for git ref:path syntax', () => {
  const relativePath = () => 'docs\\requirements\\screens\\03-capture.png';
  assert.equal(
    gitObjectPath('C:\\repo', 'C:\\repo\\docs\\requirements\\screens\\03-capture.png', relativePath),
    'docs/requirements/screens/03-capture.png',
  );
});
