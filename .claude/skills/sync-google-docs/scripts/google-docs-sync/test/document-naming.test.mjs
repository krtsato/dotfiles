import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertUniqueTabTitles,
  headingTitle,
  sourceNumber,
  tabTitle,
} from '../scripts/document-naming.mjs';

const numberedHeadings = { prefix: 'タブ', min: 0, max: 50 };

test('keeps Google Docs tab names stable when headings include the PDF prefix', () => {
  assert.equal(tabTitle('00-index.md', 'タブ 00: 要件定義書', numberedHeadings), '00 要件定義書');
  assert.equal(tabTitle('50-operation-log-design.md', 'タブ 50: 操作ログ設計書', numberedHeadings), '50 操作ログ設計書');
});

test('requires matching heading prefixes for files numbered 00 through 50', () => {
  assert.throws(() => headingTitle('49-delivery.md', '開発・納品条件', numberedHeadings), /must start/);
  assert.throws(() => headingTitle('49-delivery.md', 'タブ 48: 開発・納品条件', numberedHeadings), /does not match/);
});

test('treats a configured heading prefix as literal text', () => {
  const headings = { prefix: 'Tab.', min: 0, max: 50 };
  assert.equal(tabTitle('01-overview.md', 'Tab. 01: Overview', headings), '01 Overview');
  assert.throws(
    () => tabTitle('01-overview.md', 'TabX 01: Overview', headings),
    /must start/,
  );
});

test('does not require a tab prefix for internal files above 50', () => {
  assert.equal(tabTitle('99-retrospective.md', '要件定義の振り返り', numberedHeadings), '99 要件定義の振り返り');
  assert.equal(sourceNumber('notes.md'), null);
});

test('uses the heading as the tab title when numbering is not configured', () => {
  assert.equal(tabTitle('00-index.md', 'Overview'), 'Overview');
});

test('rejects generated tab title collisions with their source files', () => {
  assert.throws(
    () => assertUniqueTabTitles([
      { sourceFile: '01-first.md', tabTitle: 'Duplicate' },
      { sourceFile: '02-second.md', tabTitle: 'Duplicate' },
    ]),
    /Duplicate.*01-first\.md, 02-second\.md/,
  );
});
