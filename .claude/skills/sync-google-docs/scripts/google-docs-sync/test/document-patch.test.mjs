import test from 'node:test';
import assert from 'node:assert/strict';
import { createPatchPlan, verifyManifest, verifyPatch } from '../scripts/document-patch.mjs';

function paragraph(value, startIndex) {
  const text = typeof value === 'string' ? value : value.text;
  const textStyle = typeof value === 'string' ? undefined : value.textStyle;
  return { startIndex, paragraph: { elements: [{ startIndex, textRun: { content: text, textStyle } }] } };
}

function indexedTable(startIndex, rows) {
  let nextIndex = startIndex + 1;
  return {
    startIndex,
    table: {
      tableRows: rows.map((row) => ({
        tableCells: row.map((value) => {
          const text = typeof value === 'string' ? value : value.text;
          const textStyle = typeof value === 'string' ? undefined : value.textStyle;
          const run = {
            startIndex: nextIndex,
            endIndex: nextIndex + text.length,
            textRun: { content: text, textStyle },
          };
          nextIndex += text.length + 1;
          return { content: [{ paragraph: { elements: [run] } }] };
        }),
      })),
    },
  };
}

function table(startIndex, rows) {
  return {
    startIndex,
    table: {
      tableRows: rows.map((row) => ({
        tableCells: row.map((text) => ({ content: [paragraph(text)] })),
      })),
    },
  };
}

function tab(tabId, title, content) {
  return {
    tabProperties: { tabId, title },
    documentTab: { body: { content } },
  };
}

const manifest = {
  version: 1,
  expectedDocumentTitle: 'Requirements',
  operations: [
    { type: 'replaceText', tabTitle: '47 Export', oldText: 'ZIP structure', newText: 'ZIP structure example' },
    {
      type: 'deleteTableRow',
      tabTitle: '00 Index',
      tableContainsText: 'Description',
      containsText: 'Review plan',
    },
    { type: 'deleteTab', tabTitle: '05 Review plan' },
  ],
};

const indexedManifest = {
  version: 1,
  expectedDocumentTitle: 'Requirements',
  operations: [
    {
      type: 'replaceTableCellText',
      tabTitle: '03 Additional',
      tableContainsText: 'Authentication',
      rowContainsText: 'Authentication',
      oldText: 'Tab 11',
      newText: 'Tab 01',
      links: [{ text: 'Tab 01', tabTitle: '01 Overview' }],
    },
    {
      type: 'deleteSection',
      tabTitle: '11 Offline',
      startHeading: 'Processing',
      endHeading: 'Acceptance',
    },
  ],
};

const linkRepairManifest = {
  version: 1,
  expectedDocumentTitle: 'Requirements',
  operations: [{
    type: 'applyTableCellLinks',
    tabTitle: '03 Additional',
    tableContainsText: 'Authentication',
    rowContainsText: 'Authentication',
    cellContainsText: 'Tab 01',
    links: [{ text: 'Tab 01', tabTitle: '01 Overview' }],
  }],
};

test('rejects empty and unsupported patch operations', () => {
  const document = {
    title: 'Requirements',
    tabs: [tab('tab-1', '00 Index', [paragraph('Index', 1)])],
  };
  assert.throws(
    () => createPatchPlan(document, { version: 1, operations: [] }),
    /at least one operation/,
  );
  assert.throws(
    () => createPatchPlan(document, {
      version: 1,
      operations: [{ type: 'unknownOperation', tabTitle: '00 Index' }],
    }),
    /Unsupported patch operation/,
  );
});

test('createPatchPlan builds scoped and structural requests', () => {
  const document = {
    title: 'Requirements',
    tabs: [
      tab('tab-00', '00 Index', [table(10, [['Tab', 'Description'], ['Review plan', 'Schedule']])]),
      tab('tab-05', '05 Review plan', [paragraph('Schedule')]),
      tab('tab-47', '47 Export', [paragraph('Export requirements\nZIP structure\nAcceptance')]),
    ],
  };
  const plan = createPatchPlan(document, manifest);

  assert.deepEqual(plan.summary, {
    deleteParagraph: 0,
    replaceParagraphText: 0,
    replaceText: 1,
    replaceTableCellText: 0,
    applyTableCellLinks: 0,
    deleteTableRow: 1,
    deleteTableColumn: 0,
    deleteSection: 0,
    insertSectionBeforeHeading: 0,
    renameTab: 0,
    deleteTab: 1,
  });
  assert.deepEqual(plan.requests[0].replaceAllText.tabsCriteria.tabIds, ['tab-47']);
  assert.equal(plan.requests[1].deleteTableRow.tableCellLocation.rowIndex, 1);
  assert.equal(plan.requests[2].deleteTab.tabId, 'tab-05');
});

test('createPatchPlan builds targeted cell and section requests', () => {
  const document = {
    title: 'Requirements',
    tabs: [
      tab('tab-01', '01 Overview', [paragraph('Overview')]),
      tab('tab-03', '03 Additional', [
        indexedTable(10, [
          ['Feature', 'Requirement', 'Target'],
          ['Offline', 'Works offline', 'Tab 11'],
          ['Authentication', 'No authentication', {
            text: 'Tab 11',
            textStyle: { bold: true, link: { tabId: 'tab-11' } },
          }],
        ]),
      ]),
      tab('tab-11', '11 Offline', [
        paragraph('Processing\n', 10),
        paragraph('Repeated details\n', 20),
        paragraph('Acceptance\n', 40),
      ]),
    ],
  };

  const plan = createPatchPlan(document, indexedManifest);

  assert.deepEqual(plan.summary, {
    deleteParagraph: 0,
    replaceParagraphText: 0,
    replaceText: 0,
    replaceTableCellText: 1,
    applyTableCellLinks: 0,
    deleteTableRow: 0,
    deleteTableColumn: 0,
    deleteSection: 1,
    insertSectionBeforeHeading: 0,
    renameTab: 0,
    deleteTab: 0,
  });
  assert.equal(plan.requests[0].deleteContentRange.range.tabId, 'tab-03');
  assert.equal(plan.requests[1].insertText.text, 'Tab 01');
  assert.equal(plan.requests[2].updateTextStyle.textStyle.bold, true);
  assert.equal(plan.requests[3].updateTextStyle.textStyle.link.tabId, 'tab-01');
  assert.deepEqual(plan.requests[4].deleteContentRange.range, {
    tabId: 'tab-11',
    startIndex: 10,
    endIndex: 40,
  });
});

test('createPatchPlan can require an exact whole-cell match', () => {
  const document = {
    title: 'Requirements',
    tabs: [tab('tab-00', '00 Index', [indexedTable(10, [
      ['Order', 'Tab', 'Requirements'],
      ['3', '43 Results', '200 to 209'],
    ])])],
  };
  const exactCellManifest = {
    version: 1,
    expectedDocumentTitle: 'Requirements',
    operations: [{
      type: 'replaceTableCellText',
      tabTitle: '00 Index',
      tableContainsText: '43 Results',
      rowContainsText: '43 Results',
      oldText: '3',
      newText: '2',
      matchWholeCell: true,
    }],
  };

  const plan = createPatchPlan(document, exactCellManifest);

  assert.equal(plan.summary.replaceTableCellText, 1);
  assert.equal(plan.requests[1].insertText.text, '2');
});

test('createPatchPlan deletes one verified table column', () => {
  const document = {
    title: 'Requirements',
    tabs: [tab('tab-47', '47 Export', [
      table(10, [
        ['Output', 'Format', 'File name example', 'Contents'],
        ['Measurements', 'CSV', 'measurements.csv', 'One row per measurement'],
      ]),
    ])],
  };
  const columnManifest = {
    version: 1,
    expectedDocumentTitle: 'Requirements',
    operations: [{
      type: 'deleteTableColumn',
      tabTitle: '47 Export',
      tableContainsText: 'One row per measurement',
      columnIndex: 2,
      expectedHeader: 'File name example',
    }],
  };

  const plan = createPatchPlan(document, columnManifest);

  assert.equal(plan.summary.deleteTableColumn, 1);
  assert.deepEqual(plan.requests[0].deleteTableColumn.tableCellLocation, {
    tableStartLocation: { tabId: 'tab-47', index: 10 },
    rowIndex: 0,
    columnIndex: 2,
  });
});

test('createPatchPlan renames one tab without replacing its content', () => {
  const document = {
    title: 'Requirements',
    tabs: [tab('tab-44', '44 Action log', [paragraph('Existing content')])],
  };
  const renameManifest = {
    version: 1,
    expectedDocumentTitle: 'Requirements',
    operations: [{ type: 'renameTab', tabTitle: '44 Action log', newTitle: '44 Operation log' }],
  };

  const plan = createPatchPlan(document, renameManifest);

  assert.equal(plan.summary.renameTab, 1);
  assert.deepEqual(plan.requests, [{
    updateDocumentTabProperties: {
      tabProperties: { tabId: 'tab-44', title: '44 Operation log' },
      fields: 'title',
    },
  }]);
  assert.deepEqual(verifyPatch({
    title: 'Requirements',
    tabs: [tab('tab-44', '44 Operation log', [paragraph('Existing content')])],
  }, plan.checks), []);
  assert.deepEqual(verifyManifest({
    title: 'Requirements',
    tabs: [tab('tab-44', '44 Operation log', [paragraph('Existing content')])],
  }, renameManifest), []);
});

test('createPatchPlan replaces one exact paragraph and preserves its text style', () => {
  const document = {
    title: 'Requirements',
    tabs: [tab('tab-44', '44 Operation log', [paragraph({
      text: 'Action log\n',
      textStyle: { bold: true },
    }, 10)])],
  };
  const paragraphManifest = {
    version: 1,
    expectedDocumentTitle: 'Requirements',
    operations: [{
      type: 'replaceParagraphText',
      tabTitle: '44 Operation log',
      oldText: 'Action log',
      newText: 'Operation log',
    }],
  };

  const plan = createPatchPlan(document, paragraphManifest);

  assert.equal(plan.summary.replaceParagraphText, 1);
  assert.equal(plan.requests[0].deleteContentRange.range.startIndex, 10);
  assert.equal(plan.requests[1].insertText.text, 'Operation log');
  assert.equal(plan.requests[2].updateTextStyle.textStyle.bold, true);
});

test('createPatchPlan replaces one exact paragraph and applies an internal tab link', () => {
  const document = {
    title: 'Requirements',
    tabs: [
      tab('tab-11', '11 Offline', [paragraph('Offline')]),
      tab('tab-43', '43 Results', [paragraph({
        text: 'Tab 42 Storage\n',
        textStyle: { link: { tabId: 'tab-42' } },
      }, 10)]),
    ],
  };
  const linkManifest = {
    version: 1,
    expectedDocumentTitle: 'Requirements',
    operations: [{
      type: 'replaceParagraphText',
      tabTitle: '43 Results',
      oldText: 'Tab 42 Storage',
      newText: 'Tab 11 Offline',
      links: [{ text: 'Tab 11 Offline', tabTitle: '11 Offline' }],
    }],
  };

  const plan = createPatchPlan(document, linkManifest);

  assert.equal(plan.requests[2].updateTextStyle.textStyle.link.tabId, 'tab-11');
  assert.deepEqual(verifyPatch({
    title: 'Requirements',
    tabs: [
      tab('tab-11', '11 Offline', [paragraph('Offline')]),
      tab('tab-43', '43 Results', [paragraph({
        text: 'Tab 11 Offline\n',
        textStyle: { link: { tabId: 'tab-11' } },
      }, 10)]),
    ],
  }, plan.checks), []);
  assert.deepEqual(verifyManifest({
    title: 'Requirements',
    tabs: [
      tab('tab-11', '11 Offline', [paragraph('Offline')]),
      tab('tab-43', '43 Results', [paragraph({
        text: 'Tab 11 Offline\n',
        textStyle: { link: { tabId: 'tab-11' } },
      }, 10)]),
    ],
  }, linkManifest), []);
});

test('createPatchPlan deletes one exact paragraph including its list item', () => {
  const document = {
    title: 'Requirements',
    tabs: [tab('tab-48', '48 Test', [
      { startIndex: 10, endIndex: 30, paragraph: { elements: [{
        startIndex: 10,
        textRun: { content: 'Tab 42 Storage\n' },
      }] } },
      paragraph('Tab 43 Results\n', 30),
    ])],
  };
  const deletionManifest = {
    version: 1,
    expectedDocumentTitle: 'Requirements',
    operations: [{ type: 'deleteParagraph', tabTitle: '48 Test', text: 'Tab 42 Storage' }],
  };

  const plan = createPatchPlan(document, deletionManifest);

  assert.equal(plan.summary.deleteParagraph, 1);
  assert.deepEqual(plan.requests[0].deleteContentRange.range, {
    tabId: 'tab-48',
    startIndex: 10,
    endIndex: 30,
  });
  assert.deepEqual(verifyPatch({
    title: 'Requirements',
    tabs: [tab('tab-48', '48 Test', [paragraph('Tab 43 Results\n', 10)])],
  }, plan.checks), []);
  assert.deepEqual(verifyManifest({
    title: 'Requirements',
    tabs: [tab('tab-48', '48 Test', [paragraph('Tab 43 Results\n', 10)])],
  }, deletionManifest), []);
});

test('createPatchPlan rejects ambiguous replacement text', () => {
  const document = {
    title: 'Requirements',
    tabs: [
      tab('tab-00', '00 Index', [table(10, [['Review plan']])]),
      tab('tab-05', '05 Review plan', [paragraph('Schedule')]),
      tab('tab-47', '47 Export', [paragraph('ZIP structure ZIP structure')]),
    ],
  };

  assert.throws(() => createPatchPlan(document, manifest), /found 2/);
});

test('createPatchPlan allows an explicit number of scoped replacements', () => {
  const document = {
    title: 'Requirements',
    tabs: [tab('tab-03', '03 Additional', [paragraph('Action log and Action log')])],
  };
  const repeatedManifest = {
    version: 1,
    expectedDocumentTitle: 'Requirements',
    operations: [{
      type: 'replaceText',
      tabTitle: '03 Additional',
      oldText: 'Action log',
      newText: 'Operation log',
      expectedOccurrences: 2,
    }],
  };

  const plan = createPatchPlan(document, repeatedManifest);

  assert.equal(plan.summary.replaceText, 1);
  assert.equal(plan.checks[0].newTextMinimumCount, 2);
});

test('createPatchPlan rejects replacement of a complete tab', () => {
  const document = {
    title: 'Requirements',
    tabs: [tab('tab-47', '47 Export', [paragraph('Complete tab contents\n')])],
  };
  const completeTabManifest = {
    version: 1,
    expectedDocumentTitle: 'Requirements',
    operations: [{
      type: 'replaceText',
      tabTitle: '47 Export',
      oldText: 'Complete tab contents',
      newText: 'Rebuilt tab contents',
    }],
  };

  assert.throws(
    () => createPatchPlan(document, completeTabManifest),
    /Refusing to replace the complete contents/,
  );
});

test('verifyPatch accepts a scoped text deletion', () => {
  const updated = {
    title: 'Requirements',
    tabs: [tab('tab-47', '47 Export', [paragraph('Remaining contents')])],
  };
  const checks = [{
    type: 'replaceText',
    tabTitle: '47 Export',
    oldText: 'Obsolete path',
    newText: '',
    oldTextContainedInNewText: false,
    newTextMinimumCount: null,
  }];

  assert.deepEqual(verifyPatch(updated, checks), []);
});

test('createPatchPlan builds a targeted table cell link repair', () => {
  const document = {
    title: 'Requirements',
    tabs: [
      tab('tab-01', '01 Overview', [paragraph('Overview')]),
      tab('tab-03', '03 Additional', [
        indexedTable(10, [
          ['Feature', 'Requirement', 'Target'],
          ['Authentication', 'No authentication', 'Tab 01'],
        ]),
      ]),
    ],
  };

  const plan = createPatchPlan(document, linkRepairManifest);

  assert.equal(plan.summary.applyTableCellLinks, 1);
  assert.equal(plan.requests.length, 1);
  assert.equal(plan.requests[0].updateTextStyle.textStyle.link.tabId, 'tab-01');
});

test('createPatchPlan inserts a linked section before one heading', () => {
  const document = {
    title: 'Requirements',
    tabs: [
      tab('tab-00', '00 Index', [paragraph('Rules\n', 100)]),
      tab('tab-49', '49 Log design', [paragraph('Log design')]),
    ],
  };
  const insertionManifest = {
    version: 1,
    expectedDocumentTitle: 'Requirements',
    operations: [{
      type: 'insertSectionBeforeHeading',
      tabTitle: '00 Index',
      beforeHeading: 'Rules',
      heading: 'Design materials',
      body: 'Tab 49: Log field design',
      links: [{ text: 'Tab 49', tabTitle: '49 Log design' }],
    }],
  };

  const plan = createPatchPlan(document, insertionManifest);

  assert.equal(plan.summary.insertSectionBeforeHeading, 1);
  assert.equal(plan.requests[0].insertText.text, 'Design materials\nTab 49: Log field design\n\n');
  assert.equal(plan.requests[3].updateTextStyle.textStyle.link.tabId, 'tab-49');
});

test('verifyPatch can target the updated row text', () => {
  const updated = {
    title: 'Requirements',
    tabs: [tab('tab-42', '42 Storage', [
      table(10, [
        ['Source', 'Unit'],
        ['Annotations', 'One image, one state'],
      ]),
    ])],
  };
  const checks = [{
    type: 'replaceTableCellText',
    tabTitle: '42 Storage',
    tableContainsText: 'Annotations',
    rowContainsText: 'Annotations',
    newText: 'One image, one state',
    links: [],
  }];

  assert.deepEqual(verifyPatch(updated, checks), []);
});

test('verifyPatch confirms replacements and deletions', () => {
  const updated = {
    title: 'Requirements',
    tabs: [
      tab('tab-00', '00 Index', [table(10, [['Tab', 'Description']])]),
      tab('tab-47', '47 Export', [paragraph('ZIP structure example')]),
    ],
  };
  const checks = [
    {
      type: 'replaceText',
      tabTitle: '47 Export',
      oldText: 'ZIP structure',
      newText: 'ZIP structure example',
      oldTextContainedInNewText: true,
      newTextMinimumCount: 1,
    },
    { type: 'deleteTableRow', tabTitle: '00 Index', containsText: 'Review plan' },
    { type: 'deleteTab', tabTitle: '05 Review plan' },
  ];

  assert.deepEqual(verifyPatch(updated, checks), []);
});

test('verifyManifest scopes deleted row checks to the target table', () => {
  const updated = {
    title: 'Requirements',
    tabs: [
      tab('tab-00', '00 Index', [
        table(10, [['Tab', 'Description']]),
        table(20, [['Other table'], ['Review plan']]),
      ]),
      tab('tab-47', '47 Export', [paragraph('ZIP structure example')]),
    ],
  };

  assert.deepEqual(verifyManifest(updated, manifest), []);
});

test('verifyManifest allows replacement text that already exists in the tab', () => {
  const duplicateManifest = {
    version: 1,
    operations: [
      { type: 'replaceText', tabTitle: '11 Offline', oldText: 'Stored data', newText: 'None' },
    ],
  };
  const updated = {
    tabs: [tab('tab-11', '11 Offline', [paragraph('None\nNone\n')])],
  };

  assert.deepEqual(verifyManifest(updated, duplicateManifest), []);
});

test('verifyManifest confirms targeted cell and section changes', () => {
  const updated = {
    title: 'Requirements',
    tabs: [
      tab('tab-01', '01 Overview', [paragraph('Overview')]),
      tab('tab-03', '03 Additional', [
        table(10, [
          ['Feature', 'Requirement', 'Target'],
          ['Offline', 'Works offline', 'Tab 11'],
          ['Authentication', 'No authentication', {
            text: 'Tab 01',
            textStyle: { link: { tabId: 'tab-01' } },
          }],
        ]),
      ]),
      tab('tab-11', '11 Offline', [paragraph('Acceptance\n', 10)]),
    ],
  };

  assert.deepEqual(verifyManifest(updated, indexedManifest), []);
});

test('verifyManifest ignores deleted section words in body text', () => {
  const updated = {
    title: 'Requirements',
    tabs: [
      tab('tab-01', '01 Overview', [paragraph('Overview')]),
      tab('tab-03', '03 Additional', [
        table(10, [
          ['Feature', 'Requirement', 'Target'],
          ['Authentication', 'No authentication', {
            text: 'Tab 01',
            textStyle: { link: { tabId: 'tab-01' } },
          }],
        ]),
      ]),
      tab('tab-11', '11 Offline', [
        paragraph('Processing is completed offline.\n', 10),
        paragraph('Acceptance\n', 50),
      ]),
    ],
  };

  assert.deepEqual(verifyManifest(updated, indexedManifest), []);
});
