// Inspect only nearby text so unrelated identifiers elsewhere in a long tab are not suggested.
const REFERENCE_CONTEXT_RADIUS = 300;

function structuralContentText(content) {
  return (content || []).map((element) => {
    if (element.paragraph) {
      return (element.paragraph.elements || [])
        .map((item) => item.textRun?.content || item.autoText?.content || '')
        .join('');
    }
    if (element.table) {
      return (element.table.tableRows || [])
        .flatMap((row) => row.tableCells || [])
        .map((cell) => structuralContentText(cell.content))
        .join('\n');
    }
    if (element.tableOfContents) {
      return structuralContentText(element.tableOfContents.content);
    }
    return '';
  }).join('');
}

export function flattenDocumentTabs(tabs) {
  return (tabs || []).flatMap((tab) => [tab, ...flattenDocumentTabs(tab.childTabs)]);
}

export function normalizeText(value) {
  return String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
}

export function documentTabRecords(document, manifest) {
  const sourceByTitle = new Map(
    (manifest.tabs || []).map((tab) => [normalizeText(tab.tabTitle), tab.sourceFile]),
  );

  return flattenDocumentTabs(document.tabs).map((tab, index) => ({
    index,
    tabId: tab.tabProperties?.tabId || null,
    tabTitle: tab.tabProperties?.title || `Tab ${index + 1}`,
    sourceFile: sourceByTitle.get(normalizeText(tab.tabProperties?.title)) || null,
    text: structuralContentText(tab.documentTab?.body?.content),
  }));
}

function referenceCandidates(comment, matchedTabs, reference) {
  if (!reference) return [];
  const directText = [
    comment.quotedFileContent?.value,
    comment.content,
    ...(comment.replies || []).map((reply) => reply.content),
  ].join('\n');
  const direct = [...normalizeText(directText).matchAll(new RegExp(reference.directPattern, 'gi'))]
    .map((match) => match[1]);
  if (direct.length > 0) return [...new Set(direct)];

  const quote = normalizeText(comment.quotedFileContent?.value);
  if (!quote || matchedTabs.length !== 1) return [];
  const tabText = normalizeText(matchedTabs[0].text);
  const quoteIndex = tabText.indexOf(quote);
  if (quoteIndex < 0) return [];
  const nearby = tabText.slice(
    Math.max(0, quoteIndex - REFERENCE_CONTEXT_RADIUS),
    quoteIndex + quote.length + REFERENCE_CONTEXT_RADIUS,
  );
  return [...new Set([...nearby.matchAll(new RegExp(reference.nearbyPattern, 'gi'))].map((match) => match[1]))];
}

function normalizeReply(reply) {
  return {
    id: reply.id,
    createdAt: reply.createdTime || null,
    modifiedAt: reply.modifiedTime || null,
    author: reply.author?.displayName || null,
    content: reply.content || '',
    action: reply.action || null,
  };
}

export function mapCommentToTabs(comment, tabs, reference) {
  const quotedText = comment.quotedFileContent?.value || '';
  const normalizedQuote = normalizeText(quotedText);
  const matchedTabs = normalizedQuote
    ? tabs.filter((tab) => normalizeText(tab.text).includes(normalizedQuote))
    : [];

  let status = 'unmatched';
  if (!normalizedQuote) status = 'unanchored';
  else if (matchedTabs.length === 1) status = matchedTabs[0].sourceFile ? 'matched' : 'unmapped';
  else if (matchedTabs.length > 1) status = 'ambiguous';

  const matchedTab = ['matched', 'unmapped'].includes(status) ? matchedTabs[0] : null;
  const occurrenceCount = matchedTab
    ? normalizeText(matchedTab.text).split(normalizedQuote).length - 1
    : 0;

  return {
    id: comment.id,
    createdAt: comment.createdTime || null,
    modifiedAt: comment.modifiedTime || null,
    resolved: Boolean(comment.resolved),
    author: comment.author?.displayName || null,
    content: comment.content || '',
    quotedText,
    anchor: comment.anchor || null,
    replies: (comment.replies || []).map(normalizeReply),
    referenceCandidates: referenceCandidates(comment, matchedTabs, reference),
    tabMatch: {
      status,
      tabId: matchedTab?.tabId || null,
      tabTitle: matchedTab?.tabTitle || null,
      sourceFile: matchedTab?.sourceFile || null,
      occurrenceCount,
      candidates: matchedTabs.map((tab) => ({
        tabId: tab.tabId,
        tabTitle: tab.tabTitle,
        sourceFile: tab.sourceFile,
      })),
    },
  };
}

export function createCommentReport({ document, manifest, comments, documentId, includeResolved, reference }) {
  const tabs = documentTabRecords(document, manifest);
  const includedComments = comments
    .filter((comment) => includeResolved || !comment.resolved)
    .map((comment) => mapCommentToTabs(comment, tabs, reference))
    .sort((left, right) => {
      const leftTab = tabs.findIndex((tab) => tab.tabId === left.tabMatch.tabId);
      const rightTab = tabs.findIndex((tab) => tab.tabId === right.tabMatch.tabId);
      const tabOrder = (leftTab < 0 ? Number.MAX_SAFE_INTEGER : leftTab)
        - (rightTab < 0 ? Number.MAX_SAFE_INTEGER : rightTab);
      return tabOrder || String(left.createdAt).localeCompare(String(right.createdAt));
    });

  const statuses = ['matched', 'unmapped', 'ambiguous', 'unmatched', 'unanchored'];
  return {
    schemaVersion: 'v1.0.0',
    generatedAt: new Date().toISOString(),
    documentId,
    documentUrl: `https://docs.google.com/document/d/${documentId}/edit`,
    includeResolved,
    referenceLabel: reference?.label || null,
    summary: {
      fetched: comments.length,
      included: includedComments.length,
      resolved: includedComments.filter((comment) => comment.resolved).length,
      ...Object.fromEntries(statuses.map((status) => [
        status,
        includedComments.filter((comment) => comment.tabMatch.status === status).length,
      ])),
    },
    tabs: tabs.map(({ text: _text, ...tab }) => tab),
    comments: includedComments,
  };
}

function textBlock(value, fallback = 'なし') {
  const text = String(value || '').trim();
  const content = text || fallback;
  const longestBacktickRun = Math.max(
    0,
    ...(content.match(/`+/g) || []).map((run) => run.length),
  );
  const fence = '`'.repeat(Math.max(3, longestBacktickRun + 1));
  return `${fence}text\n${content}\n${fence}`;
}

function statusLabel(status) {
  return {
    matched: '原本を特定',
    unmapped: 'タブは特定・原本は未対応',
    ambiguous: '候補が複数',
    unmatched: '引用箇所が見つからない',
    unanchored: '文書全体へのコメント',
  }[status] || status;
}

function renderComment(comment, referenceLabel) {
  const match = comment.tabMatch;
  const lines = [
    `### コメント ${comment.id}`,
    '',
    `- 照合結果: ${statusLabel(match.status)}`,
    `- 投稿者: ${comment.author || '不明'}`,
    `- 投稿日時: ${comment.createdAt || '不明'}`,
    `- 解決済み: ${comment.resolved ? 'はい' : 'いいえ'}`,
  ];
  if (match.sourceFile) lines.push(`- 原本: \`${match.sourceFile}\``);
  if (comment.referenceCandidates.length > 0) {
    lines.push(`- ${referenceLabel}: ${comment.referenceCandidates.join(', ')}`);
  }
  if (match.occurrenceCount > 1) {
    lines.push(`- 同一タブ内の引用一致数: ${match.occurrenceCount}`);
  }
  if (match.candidates.length > 1) {
    lines.push(`- タブ候補: ${match.candidates.map((candidate) => candidate.tabTitle).join(', ')}`);
  }
  lines.push('', '選択箇所:', '', textBlock(comment.quotedText), '', 'コメント:', '', textBlock(comment.content));

  if (comment.replies.length > 0) {
    lines.push('', '返信:');
    for (const [index, reply] of comment.replies.entries()) {
      lines.push('', `返信${index + 1}: ${reply.author || '不明'} / ${reply.createdAt || '日時不明'}`, '', textBlock(reply.content, reply.action || '本文なし'));
    }
  }
  return lines.join('\n');
}

export function renderCommentReportMarkdown(report) {
  const lines = [
    '# Google Docsレビューコメント',
    '',
    `- 生成日時: ${report.generatedAt}`,
    `- 対象文書: [Google Docs](${report.documentUrl})`,
    `- 対象: ${report.includeResolved ? '全コメント' : '未解決コメント'}`,
    '',
    '## 概要',
    '',
    '| 項目 | 件数 |',
    '| --- | ---: |',
    `| 取得 | ${report.summary.fetched} |`,
    `| 出力 | ${report.summary.included} |`,
    `| 原本を特定 | ${report.summary.matched} |`,
    `| タブは特定・原本は未対応 | ${report.summary.unmapped} |`,
    `| 候補が複数 | ${report.summary.ambiguous} |`,
    `| 引用箇所が見つからない | ${report.summary.unmatched} |`,
    `| 文書全体へのコメント | ${report.summary.unanchored} |`,
  ];

  const grouped = new Map();
  for (const comment of report.comments) {
    const key = comment.tabMatch.status === 'matched'
      ? comment.tabMatch.tabTitle
      : `要手動確認: ${statusLabel(comment.tabMatch.status)}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(comment);
  }

  if (report.comments.length === 0) {
    lines.push('', '未解決コメントはありません。');
  } else {
    for (const [title, comments] of grouped) {
      lines.push('', `## ${title}`, '');
      lines.push(comments.map((comment) => renderComment(comment, report.referenceLabel)).join('\n\n'));
    }
  }

  return `${lines.join('\n')}\n`;
}
