import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCommentReport,
  documentTabRecords,
  mapCommentToTabs,
  renderCommentReportMarkdown,
} from '../scripts/comment-report.mjs';

function tab(tabId, title, text, childTabs = []) {
  return {
    tabProperties: { tabId, title },
    documentTab: {
      body: {
        content: [{
          paragraph: {
            elements: [{ textRun: { content: text } }],
          },
        }],
      },
    },
    childTabs,
  };
}

const manifest = {
  tabs: [
    { tabTitle: '13 キャビネット一覧', sourceFile: '13-cabinet-list.md' },
    { tabTitle: '14 キャビネット複製', sourceFile: '14-cabinet-duplicate.md' },
  ],
};
const reference = {
  label: '要件 No. 候補',
  directPattern: '要件\\s*No\\.?\\s*[:：]?\\s*(\\d{3})',
  nearbyPattern: '(?:^|\\D)(\\d{3})(?=\\D|$)',
};

test('documentTabRecords flattens child tabs and maps source files', () => {
  const document = {
    tabs: [tab('tab-13', '13 キャビネット一覧', '要件 No. 040 一覧を表示する。', [
      tab('tab-14', '14 キャビネット複製', '要件 No. 050 情報を複製する。'),
    ])],
  };

  assert.deepEqual(
    documentTabRecords(document, manifest).map(({ tabId, sourceFile }) => ({ tabId, sourceFile })),
    [
      { tabId: 'tab-13', sourceFile: '13-cabinet-list.md' },
      { tabId: 'tab-14', sourceFile: '14-cabinet-duplicate.md' },
    ],
  );
});

test('documentTabRecords extracts text from tables', () => {
  const document = {
    tabs: [{
      tabProperties: { tabId: 'tab-13', title: '13 キャビネット一覧' },
      documentTab: {
        body: {
          content: [{
            table: {
              tableRows: [{
                tableCells: [{
                  content: [{
                    paragraph: {
                      elements: [{ textRun: { content: '表内の要件' } }],
                    },
                  }],
                }],
              }],
            },
          }],
        },
      },
    }],
  };

  assert.equal(documentTabRecords(document, manifest)[0].text, '表内の要件');
});

test('mapCommentToTabs identifies one tab and keeps replies', () => {
  const tabs = documentTabRecords({
    tabs: [tab('tab-13', '13 キャビネット一覧', '要件 No. 040 一覧を表示する。')],
  }, manifest);
  const mapped = mapCommentToTabs({
    id: 'comment-1',
    content: '文言を確認してください。',
    quotedFileContent: { value: '一覧を表示する。' },
    replies: [{ id: 'reply-1', content: '確認します。', author: { displayName: 'Reviewer' } }],
  }, tabs, reference);

  assert.equal(mapped.tabMatch.status, 'matched');
  assert.equal(mapped.tabMatch.sourceFile, '13-cabinet-list.md');
  assert.deepEqual(mapped.referenceCandidates, ['040']);
  assert.equal(mapped.replies[0].content, '確認します。');
});

test('mapCommentToTabs does not guess when a quote exists in multiple tabs', () => {
  const tabs = documentTabRecords({
    tabs: [
      tab('tab-13', '13 キャビネット一覧', '保存する。'),
      tab('tab-14', '14 キャビネット複製', '保存する。'),
    ],
  }, manifest);
  const mapped = mapCommentToTabs({
    id: 'comment-2',
    content: '保存条件を確認してください。',
    quotedFileContent: { value: '保存する。' },
  }, tabs);

  assert.equal(mapped.tabMatch.status, 'ambiguous');
  assert.equal(mapped.tabMatch.sourceFile, null);
  assert.equal(mapped.tabMatch.candidates.length, 2);
});

test('mapCommentToTabs requires a manifest entry before identifying a source file', () => {
  const tabs = documentTabRecords({
    tabs: [tab('tab-99', '99 未登録タブ', '固有の引用箇所')],
  }, manifest);
  const mapped = mapCommentToTabs({
    id: 'comment-3',
    content: '確認してください。',
    quotedFileContent: { value: '固有の引用箇所' },
  }, tabs);

  assert.equal(mapped.tabMatch.status, 'unmapped');
  assert.equal(mapped.tabMatch.sourceFile, null);
});

test('createCommentReport excludes resolved comments by default and renders Markdown', () => {
  const report = createCommentReport({
    document: { tabs: [tab('tab-13', '13 キャビネット一覧', '一覧を表示する。')] },
    manifest,
    documentId: 'document-1',
    includeResolved: false,
    comments: [
      {
        id: 'comment-open',
        content: '確認してください。',
        quotedFileContent: { value: '一覧を表示する。' },
        author: { displayName: 'Reviewer' },
      },
      {
        id: 'comment-resolved',
        content: '対応済みです。',
        resolved: true,
        quotedFileContent: { value: '一覧を表示する。' },
      },
    ],
  });

  assert.equal(report.summary.fetched, 2);
  assert.equal(report.summary.included, 1);
  assert.match(renderCommentReportMarkdown(report), /`13-cabinet-list\.md`/);
  assert.doesNotMatch(renderCommentReportMarkdown(report), /comment-resolved/);
});

test('renderCommentReportMarkdown preserves Markdown-like comment text as plain text', () => {
  const report = createCommentReport({
    document: { tabs: [tab('tab-13', '13 キャビネット一覧', '一覧を表示する。')] },
    manifest,
    documentId: 'document-1',
    includeResolved: false,
    comments: [{
      id: 'comment-markdown',
      content: '- 箇条書き\n```\nreviewer@example.com',
      quotedFileContent: { value: '一覧を表示する。' },
    }],
  });
  const markdown = renderCommentReportMarkdown(report);

  assert.match(markdown, /````text\n- 箇条書き\n```\nreviewer@example\.com\n````/);
});
