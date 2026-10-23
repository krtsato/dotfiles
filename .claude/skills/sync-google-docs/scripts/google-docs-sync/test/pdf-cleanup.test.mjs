import assert from 'node:assert/strict';
import test from 'node:test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { cleanGoogleDocsPdf, dividerPageIndexes } from '../scripts/pdf-cleanup.mjs';

test('finds one exact divider page for each tab title', () => {
  const indexes = dividerPageIndexes([
    '00 Overview',
    'タブ 00: Overview\n本文',
    '01 Requirements',
    'タブ 01: Requirements\n本文',
  ], ['00 Overview', '01 Requirements']);

  assert.deepEqual(indexes, [0, 2]);
});

test('normalizes PDF-inserted whitespace but does not match a content page', () => {
  assert.deepEqual(
    dividerPageIndexes(['24 AI 出力結果', '24 AI出力結果 本文'], ['24 AI出力結果']),
    [0],
  );
});

test('fails when a divider page is missing', () => {
  assert.throws(
    () => dividerPageIndexes(['タブ 00: Overview'], ['00 Overview']),
    /found 0/,
  );
});

test('fails when a divider page is duplicated', () => {
  assert.throws(
    () => dividerPageIndexes(['00 Overview', '00 Overview'], ['00 Overview']),
    /found 2/,
  );
});

test('extracts divider text and produces a valid cleaned PDF', async () => {
  const source = await PDFDocument.create();
  const font = await source.embedFont(StandardFonts.Helvetica);
  for (const text of [
    '00 Overview',
    'Tab 00 Overview content',
    '01 Requirements',
    'Tab 01 Requirements content',
  ]) {
    const page = source.addPage([596, 842]);
    page.drawText(text, { x: 40, y: 780, font, size: 12 });
  }

  const cleaned = await cleanGoogleDocsPdf(
    await source.save(),
    ['00 Overview', '01 Requirements'],
    'Requirements Definition',
    'Google Docs Sync',
  );

  assert.equal(cleaned.originalPageCount, 4);
  assert.equal(cleaned.finalPageCount, 2);
  assert.deepEqual(cleaned.removedPageNumbers, [1, 3]);
  assert.equal(cleaned.pdf.subarray(0, 5).toString(), '%PDF-');

  const output = await PDFDocument.load(cleaned.pdf);
  assert.equal(output.getPageCount(), 2);
  assert.equal(output.getTitle(), 'Requirements Definition');
  assert.equal(output.getCreator(), 'Google Docs Sync');
});
