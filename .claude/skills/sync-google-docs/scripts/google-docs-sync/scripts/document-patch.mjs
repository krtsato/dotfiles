function elementText(element) {
  if (element.textRun?.content) return element.textRun.content;
  if (element.autoText?.content) return element.autoText.content;
  if (element.person?.personProperties?.name) return element.person.personProperties.name;
  if (element.richLink?.richLinkProperties?.title) return element.richLink.richLinkProperties.title;
  return '';
}

function structuralElementsText(elements = []) {
  let text = '';
  for (const element of elements) {
    if (element.paragraph) {
      text += (element.paragraph.elements || []).map(elementText).join('');
    } else if (element.table) {
      for (const row of element.table.tableRows || []) {
        for (const cell of row.tableCells || []) {
          text += structuralElementsText(cell.content);
        }
      }
    } else if (element.tableOfContents) {
      text += structuralElementsText(element.tableOfContents.content);
    }
  }
  return text;
}

function flattenTabs(tabs = []) {
  const result = [];
  for (const tab of tabs) {
    result.push(tab);
    result.push(...flattenTabs(tab.childTabs));
  }
  return result;
}

function countOccurrences(text, search) {
  if (!search) return 0;
  let count = 0;
  let offset = 0;
  while ((offset = text.indexOf(search, offset)) !== -1) {
    count += 1;
    offset += search.length;
  }
  return count;
}

function resolveTab(tabs, title) {
  const matches = tabs.filter((tab) => tab.tabProperties?.title === title);
  if (matches.length !== 1) {
    throw new Error(`Expected one tab titled "${title}", found ${matches.length}.`);
  }
  return matches[0];
}

function tables(tab) {
  const result = [];
  for (const element of tab.documentTab?.body?.content || []) {
    if (!element.table) continue;
    const rows = [];
    for (const [rowIndex, row] of (element.table.tableRows || []).entries()) {
      const cells = (row.tableCells || []).map((cell) => ({
        text: structuralElementsText(cell.content),
        textRuns: (cell.content || []).flatMap((content) => (
          content.paragraph?.elements || []
        )).filter((item) => item.textRun?.content),
      }));
      rows.push({
        tableStartIndex: element.startIndex,
        rowIndex,
        text: cells.map((cell) => cell.text).join(''),
        cells,
      });
    }
    result.push({ text: rows.map((row) => row.text).join(''), rows });
  }
  return result;
}

function sections(tab) {
  return (tab.documentTab?.body?.content || [])
    .filter((element) => element.paragraph)
    .map((element) => ({
      startIndex: element.startIndex,
      text: structuralElementsText([element]).trim(),
    }));
}

function inheritedTextStyle(textStyle = {}) {
  const fields = [
    'backgroundColor',
    'baselineOffset',
    'bold',
    'fontSize',
    'foregroundColor',
    'italic',
    'smallCaps',
    'strikethrough',
    'underline',
    'weightedFontFamily',
  ].filter((field) => textStyle[field] !== undefined);
  if (textStyle.link) {
    for (const field of ['foregroundColor', 'underline']) {
      const index = fields.indexOf(field);
      if (index !== -1) fields.splice(index, 1);
    }
  }
  return {
    fields: fields.join(','),
    textStyle: Object.fromEntries(fields.map((field) => [field, structuredClone(textStyle[field])])),
  };
}

function resolvedLinks(links = [], text, tabs) {
  return links.map((link) => {
    if (countOccurrences(text, link.text) !== 1) {
      throw new Error(`Expected one occurrence of link text "${link.text}", found ${countOccurrences(text, link.text)}.`);
    }
    const target = resolveTab(tabs, link.tabTitle);
    return {
      text: link.text,
      offset: text.indexOf(link.text),
      targetTabId: target.tabProperties.tabId,
      targetTabTitle: link.tabTitle,
    };
  });
}

function linkedRunRange(cell, linkText) {
  const runs = cell.textRuns.filter((run) => run.textRun.content.includes(linkText));
  if (runs.length !== 1 || countOccurrences(runs[0].textRun.content, linkText) !== 1) {
    throw new Error(`Expected one text run containing link text "${linkText}", found ${runs.length}.`);
  }
  const offset = runs[0].textRun.content.indexOf(linkText);
  return {
    startIndex: runs[0].startIndex + offset,
    endIndex: runs[0].startIndex + offset + linkText.length,
  };
}

function cellLinksMatch(cell, links, tabs) {
  return links.every((link) => {
    const targetTabId = resolveTab(tabs, link.tabTitle).tabProperties.tabId;
    const runs = cell.textRuns.filter((run) => run.textRun.content.includes(link.text));
    if (runs.length !== 1) return false;
    const target = runs[0].textRun.textStyle?.link;
    return target?.tabId === targetTabId || target?.url?.includes(`tab=${targetTabId}`);
  });
}

export function createPatchPlan(document, manifest) {
  if (manifest.version !== 1) throw new Error(`Unsupported patch manifest version: ${manifest.version}`);
  if (!Array.isArray(manifest.operations) || manifest.operations.length === 0) {
    throw new Error('Patch manifest must contain at least one operation.');
  }
  if (manifest.expectedDocumentTitle && document.title !== manifest.expectedDocumentTitle) {
    throw new Error(`Document title mismatch: expected "${manifest.expectedDocumentTitle}", got "${document.title}".`);
  }

  const tabs = flattenTabs(document.tabs);
  const replacements = [];
  const paragraphDeletions = [];
  const paragraphReplacements = [];
  const cellReplacements = [];
  const cellLinkUpdates = [];
  const rowDeletions = [];
  const columnDeletions = [];
  const sectionDeletions = [];
  const sectionInsertions = [];
  const tabDeletions = [];
  const tabRenames = [];
  const checks = [];

  for (const operation of manifest.operations || []) {
    const tab = resolveTab(tabs, operation.tabTitle);
    const tabId = tab.tabProperties.tabId;
    if (operation.type === 'deleteParagraph') {
      if (!operation.text) {
        throw new Error(`Invalid deleteParagraph operation in tab "${operation.tabTitle}".`);
      }
      const paragraphs = (tab.documentTab?.body?.content || [])
        .filter((element) => element.paragraph)
        .filter((element) => structuralElementsText([element]).trim() === operation.text);
      if (paragraphs.length !== 1) {
        throw new Error(
          `Expected one paragraph "${operation.text}" in tab "${operation.tabTitle}", found ${paragraphs.length}.`,
        );
      }
      paragraphDeletions.push({
        tabId,
        startIndex: paragraphs[0].startIndex,
        endIndex: paragraphs[0].endIndex,
      });
      checks.push({
        type: operation.type,
        tabTitle: operation.tabTitle,
        text: operation.text,
      });
    } else if (operation.type === 'replaceParagraphText') {
      if (!operation.oldText || operation.oldText === operation.newText) {
        throw new Error(`Invalid replaceParagraphText operation in tab "${operation.tabTitle}".`);
      }
      const paragraphs = (tab.documentTab?.body?.content || [])
        .filter((element) => element.paragraph)
        .filter((element) => structuralElementsText([element]).trim() === operation.oldText);
      if (paragraphs.length !== 1) {
        throw new Error(
          `Expected one paragraph "${operation.oldText}" in tab "${operation.tabTitle}", found ${paragraphs.length}.`,
        );
      }
      const runs = (paragraphs[0].paragraph.elements || []).filter((element) => element.textRun?.content);
      const rawText = runs.map((run) => run.textRun.content).join('').replace(/\n$/, '');
      if (rawText !== operation.oldText || runs.length < 1) {
        throw new Error(`Paragraph contains unsupported elements: ${operation.oldText}`);
      }
      paragraphReplacements.push({
        tabId,
        startIndex: runs[0].startIndex,
        endIndex: runs[0].startIndex + operation.oldText.length,
        newText: operation.newText,
        inheritedStyle: inheritedTextStyle(runs[0].textRun.textStyle),
        links: resolvedLinks(operation.links || [], operation.newText, tabs),
      });
      checks.push({
        type: operation.type,
        tabTitle: operation.tabTitle,
        oldText: operation.oldText,
        newText: operation.newText,
        links: operation.links || [],
      });
    } else if (operation.type === 'replaceText') {
      if (!operation.oldText || operation.oldText === operation.newText) {
        throw new Error(`Invalid replaceText operation in tab "${operation.tabTitle}".`);
      }
      const text = structuralElementsText(tab.documentTab?.body?.content);
      const oldCount = countOccurrences(text, operation.oldText);
      const expectedOccurrences = operation.expectedOccurrences || 1;
      if (oldCount !== expectedOccurrences) {
        throw new Error(
          `Expected ${expectedOccurrences} occurrence(s) of "${operation.oldText}" in tab "${operation.tabTitle}", found ${oldCount}.`,
        );
      }
      if (text.trim() === operation.oldText.trim()) {
        throw new Error(
          `Refusing to replace the complete contents of tab "${operation.tabTitle}". `
          + 'Split the change into scoped operations.',
        );
      }
      replacements.push({
        replaceAllText: {
          containsText: { text: operation.oldText, matchCase: true },
          replaceText: operation.newText,
          tabsCriteria: { tabIds: [tabId] },
        },
      });
      checks.push({
        type: operation.type,
        tabTitle: operation.tabTitle,
        oldText: operation.oldText,
        newText: operation.newText,
        oldTextContainedInNewText: operation.newText.includes(operation.oldText),
        newTextMinimumCount: operation.newText
          ? countOccurrences(text, operation.newText) + oldCount
          : null,
      });
    } else if (operation.type === 'replaceTableCellText') {
      const targetTables = tables(tab).filter((table) => (
        !operation.tableContainsText || table.text.includes(operation.tableContainsText)
      ));
      const rows = targetTables
        .flatMap((table) => table.rows)
        .filter((row) => row.text.includes(operation.rowContainsText));
      if (rows.length !== 1) {
        throw new Error(`Expected one table row containing "${operation.rowContainsText}" in tab "${operation.tabTitle}", found ${rows.length}.`);
      }
      const cells = rows[0].cells.filter((cell) => (
        operation.matchWholeCell
          ? cell.text.trim() === operation.oldText
          : countOccurrences(cell.text, operation.oldText) === 1
      ));
      if (cells.length !== 1) {
        const rowCells = rows[0].cells.map((cell) => cell.text.trim()).join(' | ');
        throw new Error(
          `Expected one cell containing "${operation.oldText}" in the target row, found ${cells.length}. `
          + `Cells: ${rowCells}`,
        );
      }
      const runs = cells[0].textRuns.filter((run) => run.textRun.content.includes(operation.oldText));
      const replacesWholeCell = cells[0].text.trim() === operation.oldText;
      if (runs.length !== 1 && !replacesWholeCell) {
        throw new Error(
          `Expected one text run or the complete cell to match "${operation.oldText}", found ${runs.length} runs.`,
        );
      }
      const sourceRun = replacesWholeCell ? cells[0].textRuns[0] : runs[0];
      const offset = replacesWholeCell ? 0 : sourceRun.textRun.content.indexOf(operation.oldText);
      const startIndex = sourceRun.startIndex + offset;
      cellReplacements.push({
        tabId,
        startIndex,
        endIndex: startIndex + operation.oldText.length,
        newText: operation.newText,
        inheritedStyle: inheritedTextStyle(sourceRun.textRun.textStyle),
        links: resolvedLinks(operation.links, operation.newText, tabs),
      });
      checks.push({
        type: operation.type,
        tabTitle: operation.tabTitle,
        tableContainsText: operation.verifyTableContainsText || operation.tableContainsText,
        rowContainsText: operation.verifyRowContainsText || operation.rowContainsText,
        newText: operation.newText,
        verifyCellText: operation.verifyCellText,
        links: operation.links || [],
      });
    } else if (operation.type === 'applyTableCellLinks') {
      const targetTables = tables(tab).filter((table) => (
        !operation.tableContainsText || table.text.includes(operation.tableContainsText)
      ));
      const rows = targetTables
        .flatMap((table) => table.rows)
        .filter((row) => row.text.includes(operation.rowContainsText));
      if (rows.length !== 1) {
        throw new Error(`Expected one table row containing "${operation.rowContainsText}" in tab "${operation.tabTitle}", found ${rows.length}.`);
      }
      const cells = rows[0].cells.filter((cell) => countOccurrences(cell.text, operation.cellContainsText) === 1);
      if (cells.length !== 1) {
        throw new Error(`Expected one cell containing "${operation.cellContainsText}" in the target row, found ${cells.length}.`);
      }
      const links = resolvedLinks(operation.links, operation.cellContainsText, tabs).map((link) => ({
        ...link,
        ...linkedRunRange(cells[0], link.text),
      }));
      cellLinkUpdates.push({ tabId, links });
      checks.push({
        type: operation.type,
        tabTitle: operation.tabTitle,
        tableContainsText: operation.tableContainsText,
        rowContainsText: operation.rowContainsText,
        cellContainsText: operation.cellContainsText,
        links: operation.links,
      });
    } else if (operation.type === 'deleteTableRow') {
      const targetTables = tables(tab).filter((table) => (
        !operation.tableContainsText || table.text.includes(operation.tableContainsText)
      ));
      if (operation.tableContainsText && targetTables.length !== 1) {
        throw new Error(`Expected one table containing "${operation.tableContainsText}" in tab "${operation.tabTitle}", found ${targetTables.length}.`);
      }
      const matches = targetTables
        .flatMap((table) => table.rows)
        .filter((row) => row.text.includes(operation.containsText));
      if (matches.length !== 1) {
        throw new Error(`Expected one table row containing "${operation.containsText}" in tab "${operation.tabTitle}", found ${matches.length}.`);
      }
      rowDeletions.push({ tabId, tabTitle: operation.tabTitle, ...matches[0] });
      checks.push({
        type: operation.type,
        tabTitle: operation.tabTitle,
        tableContainsText: operation.tableContainsText,
        containsText: operation.containsText,
      });
    } else if (operation.type === 'deleteTableColumn') {
      const targetTables = tables(tab).filter((table) => (
        table.text.includes(operation.tableContainsText)
      ));
      if (targetTables.length !== 1) {
        throw new Error(
          `Expected one table containing "${operation.tableContainsText}" in tab "${operation.tabTitle}", found ${targetTables.length}.`,
        );
      }
      const header = targetTables[0].rows[0]?.cells[operation.columnIndex]?.text?.trim();
      if (header !== operation.expectedHeader) {
        throw new Error(
          `Expected column ${operation.columnIndex} header "${operation.expectedHeader}" in tab "${operation.tabTitle}", got "${header || ''}".`,
        );
      }
      columnDeletions.push({
        tabId,
        tabTitle: operation.tabTitle,
        tableStartIndex: targetTables[0].rows[0].tableStartIndex,
        columnIndex: operation.columnIndex,
      });
      checks.push({
        type: operation.type,
        tabTitle: operation.tabTitle,
        tableContainsText: operation.tableContainsText,
        expectedHeader: operation.expectedHeader,
      });
    } else if (operation.type === 'deleteSection') {
      const headings = sections(tab);
      const starts = headings.filter((heading) => heading.text === operation.startHeading);
      const ends = headings.filter((heading) => heading.text === operation.endHeading);
      if (starts.length !== 1 || ends.length !== 1 || starts[0].startIndex >= ends[0].startIndex) {
        throw new Error(
          `Expected ordered unique section headings "${operation.startHeading}" and "${operation.endHeading}" in tab "${operation.tabTitle}".`,
        );
      }
      sectionDeletions.push({
        tabId,
        startIndex: starts[0].startIndex,
        endIndex: ends[0].startIndex,
      });
      checks.push({
        type: operation.type,
        tabTitle: operation.tabTitle,
        startHeading: operation.startHeading,
        endHeading: operation.endHeading,
      });
    } else if (operation.type === 'insertSectionBeforeHeading') {
      const headings = sections(tab);
      const targets = headings.filter((heading) => heading.text === operation.beforeHeading);
      if (targets.length !== 1) {
        throw new Error(
          `Expected one heading "${operation.beforeHeading}" in tab "${operation.tabTitle}", found ${targets.length}.`,
        );
      }
      const text = structuralElementsText(tab.documentTab?.body?.content);
      if (countOccurrences(text, operation.heading) > 0 || countOccurrences(text, operation.body) > 0) {
        throw new Error(`Section already exists in tab "${operation.tabTitle}": ${operation.heading}`);
      }
      const insertedText = `${operation.heading}\n${operation.body}\n\n`;
      const links = resolvedLinks(operation.links || [], insertedText, tabs);
      sectionInsertions.push({
        tabId,
        tabTitle: operation.tabTitle,
        index: targets[0].startIndex,
        heading: operation.heading,
        body: operation.body,
        insertedText,
        links,
      });
      checks.push({
        type: operation.type,
        tabTitle: operation.tabTitle,
        heading: operation.heading,
        body: operation.body,
      });
    } else if (operation.type === 'deleteTab') {
      tabDeletions.push({ deleteTab: { tabId } });
      checks.push({ type: operation.type, tabTitle: operation.tabTitle });
    } else if (operation.type === 'renameTab') {
      if (!operation.newTitle || operation.newTitle === operation.tabTitle) {
        throw new Error(`Invalid renameTab operation for tab "${operation.tabTitle}".`);
      }
      if (tabs.some((candidate) => candidate.tabProperties?.title === operation.newTitle)) {
        throw new Error(`Tab title already exists: ${operation.newTitle}`);
      }
      tabRenames.push({
        updateDocumentTabProperties: {
          tabProperties: { tabId, title: operation.newTitle },
          fields: 'title',
        },
      });
      checks.push({
        type: operation.type,
        tabTitle: operation.tabTitle,
        newTitle: operation.newTitle,
      });
    } else {
      throw new Error(`Unsupported patch operation: ${operation.type}`);
    }
  }

  rowDeletions.sort((left, right) => {
    if (left.tabId !== right.tabId) return left.tabId.localeCompare(right.tabId);
    if (left.tableStartIndex !== right.tableStartIndex) return right.tableStartIndex - left.tableStartIndex;
    return right.rowIndex - left.rowIndex;
  });
  const rowRequests = rowDeletions.map((row) => ({
    deleteTableRow: {
      tableCellLocation: {
        tableStartLocation: { tabId: row.tabId, index: row.tableStartIndex },
        rowIndex: row.rowIndex,
        columnIndex: 0,
      },
    },
  }));
  const columnRequests = columnDeletions.map((column) => ({
    deleteTableColumn: {
      tableCellLocation: {
        tableStartLocation: { tabId: column.tabId, index: column.tableStartIndex },
        rowIndex: 0,
        columnIndex: column.columnIndex,
      },
    },
  }));
  paragraphDeletions.sort((left, right) => right.startIndex - left.startIndex);
  const paragraphDeletionRequests = paragraphDeletions.map((paragraph) => ({
    deleteContentRange: {
      range: {
        tabId: paragraph.tabId,
        startIndex: paragraph.startIndex,
        endIndex: paragraph.endIndex,
      },
    },
  }));
  cellReplacements.sort((left, right) => right.startIndex - left.startIndex);
  const cellRequests = cellReplacements.flatMap((replacement) => {
    const requests = [{
      deleteContentRange: {
        range: {
          tabId: replacement.tabId,
          startIndex: replacement.startIndex,
          endIndex: replacement.endIndex,
        },
      },
    }, {
      insertText: {
        location: { tabId: replacement.tabId, index: replacement.startIndex },
        text: replacement.newText,
      },
    }];
    if (replacement.inheritedStyle.fields) {
      requests.push({
        updateTextStyle: {
          range: {
            tabId: replacement.tabId,
            startIndex: replacement.startIndex,
            endIndex: replacement.startIndex + replacement.newText.length,
          },
          textStyle: replacement.inheritedStyle.textStyle,
          fields: replacement.inheritedStyle.fields,
        },
      });
    }
    for (const link of replacement.links) {
      requests.push({
        updateTextStyle: {
          range: {
            tabId: replacement.tabId,
            startIndex: replacement.startIndex + link.offset,
            endIndex: replacement.startIndex + link.offset + link.text.length,
          },
          textStyle: { link: { tabId: link.targetTabId } },
          fields: 'link',
        },
      });
    }
    return requests;
  });
  paragraphReplacements.sort((left, right) => right.startIndex - left.startIndex);
  const paragraphRequests = paragraphReplacements.flatMap((replacement) => {
    const requests = [{
      deleteContentRange: {
        range: {
          tabId: replacement.tabId,
          startIndex: replacement.startIndex,
          endIndex: replacement.endIndex,
        },
      },
    }, {
      insertText: {
        location: { tabId: replacement.tabId, index: replacement.startIndex },
        text: replacement.newText,
      },
    }];
    if (replacement.inheritedStyle.fields) {
      requests.push({
        updateTextStyle: {
          range: {
            tabId: replacement.tabId,
            startIndex: replacement.startIndex,
            endIndex: replacement.startIndex + replacement.newText.length,
          },
          textStyle: replacement.inheritedStyle.textStyle,
          fields: replacement.inheritedStyle.fields,
        },
      });
    }
    for (const link of replacement.links) {
      requests.push({
        updateTextStyle: {
          range: {
            tabId: replacement.tabId,
            startIndex: replacement.startIndex + link.offset,
            endIndex: replacement.startIndex + link.offset + link.text.length,
          },
          textStyle: { link: { tabId: link.targetTabId } },
          fields: 'link',
        },
      });
    }
    return requests;
  });
  const cellLinkRequests = cellLinkUpdates.flatMap((update) => update.links.map((link) => ({
    updateTextStyle: {
      range: {
        tabId: update.tabId,
        startIndex: link.startIndex,
        endIndex: link.endIndex,
      },
      textStyle: { link: { tabId: link.targetTabId } },
      fields: 'link',
    },
  })));
  sectionDeletions.sort((left, right) => right.startIndex - left.startIndex);
  const sectionRequests = sectionDeletions.map((section) => ({
    deleteContentRange: {
      range: {
        tabId: section.tabId,
        startIndex: section.startIndex,
        endIndex: section.endIndex,
      },
    },
  }));
  const sectionInsertionRequests = sectionInsertions.flatMap((section) => {
    const headingEnd = section.index + section.heading.length + 1;
    const bodyStart = headingEnd;
    const bodyEnd = section.index + section.insertedText.length;
    return [
      {
        insertText: {
          location: { tabId: section.tabId, index: section.index },
          text: section.insertedText,
        },
      },
      {
        updateParagraphStyle: {
          range: { tabId: section.tabId, startIndex: section.index, endIndex: headingEnd },
          paragraphStyle: { namedStyleType: 'HEADING_2' },
          fields: 'namedStyleType',
        },
      },
      {
        updateParagraphStyle: {
          range: { tabId: section.tabId, startIndex: bodyStart, endIndex: bodyEnd },
          paragraphStyle: { namedStyleType: 'NORMAL_TEXT' },
          fields: 'namedStyleType',
        },
      },
      ...section.links.map((link) => ({
        updateTextStyle: {
          range: {
            tabId: section.tabId,
            startIndex: section.index + link.offset,
            endIndex: section.index + link.offset + link.text.length,
          },
          textStyle: { link: { tabId: link.targetTabId } },
          fields: 'link',
        },
      })),
    ];
  });

  return {
    requests: [
      ...paragraphDeletionRequests,
      ...paragraphRequests,
      ...replacements,
      ...cellRequests,
      ...cellLinkRequests,
      ...sectionRequests,
      ...sectionInsertionRequests,
      ...rowRequests,
      ...columnRequests,
      ...tabRenames,
      ...tabDeletions,
    ],
    checks,
    summary: {
      deleteParagraph: paragraphDeletionRequests.length,
      replaceParagraphText: paragraphReplacements.length,
      replaceText: replacements.length,
      replaceTableCellText: cellReplacements.length,
      applyTableCellLinks: cellLinkUpdates.length,
      deleteTableRow: rowRequests.length,
      deleteTableColumn: columnRequests.length,
      deleteSection: sectionRequests.length,
      insertSectionBeforeHeading: sectionInsertions.length,
      renameTab: tabRenames.length,
      deleteTab: tabDeletions.length,
    },
  };
}

export function verifyPatch(document, checks) {
  const tabs = flattenTabs(document.tabs);
  const failures = [];
  for (const check of checks) {
    const matches = tabs.filter((tab) => tab.tabProperties?.title === check.tabTitle);
    if (check.type === 'renameTab') {
      const renamed = tabs.filter((tab) => tab.tabProperties?.title === check.newTitle);
      if (matches.length !== 0) failures.push(`Old tab title still exists: ${check.tabTitle}`);
      if (renamed.length !== 1) failures.push(`Expected one renamed tab: ${check.newTitle}`);
      continue;
    }
    if (check.type === 'deleteTab') {
      if (matches.length !== 0) failures.push(`Tab still exists: ${check.tabTitle}`);
      continue;
    }
    if (matches.length !== 1) {
      failures.push(`Expected one tab after update: ${check.tabTitle}`);
      continue;
    }
    const text = structuralElementsText(matches[0].documentTab?.body?.content);
    if (check.type === 'deleteParagraph') {
      const paragraphs = (matches[0].documentTab?.body?.content || [])
        .filter((element) => element.paragraph)
        .map((element) => structuralElementsText([element]).trim());
      if (paragraphs.includes(check.text)) failures.push(`Deleted paragraph remains: ${check.text}`);
    } else if (check.type === 'replaceParagraphText') {
      const paragraphs = (matches[0].documentTab?.body?.content || [])
        .filter((element) => element.paragraph)
        .map((element) => structuralElementsText([element]).trim());
      if (paragraphs.includes(check.oldText)) failures.push(`Old paragraph remains: ${check.oldText}`);
      if (paragraphs.filter((value) => value === check.newText).length !== 1) {
        failures.push(`Updated paragraph not found: ${check.newText}`);
      }
      if ((check.links || []).length > 0) {
        const paragraph = (matches[0].documentTab?.body?.content || [])
          .find((element) => element.paragraph && structuralElementsText([element]).trim() === check.newText);
        const linkedText = (paragraph?.paragraph?.elements || []).map((element) => ({
          text: elementText(element),
          textRun: element.textRun,
        }));
        for (const link of check.links) {
          const targetTabId = resolveTab(tabs, link.tabTitle).tabProperties.tabId;
          const runs = linkedText.filter((run) => run.text.includes(link.text));
          const target = runs[0]?.textRun?.textStyle?.link;
          if (runs.length !== 1 || (target?.tabId !== targetTabId && !target?.url?.includes(`tab=${targetTabId}`))) {
            failures.push(`Updated paragraph link does not match: ${link.text}`);
          }
        }
      }
    } else if (check.type === 'replaceText') {
      if (!check.oldTextContainedInNewText && countOccurrences(text, check.oldText) !== 0) {
        failures.push(`Old text remains: ${check.oldText}`);
      }
      if (check.newText
        && countOccurrences(text, check.newText) < check.newTextMinimumCount) {
        failures.push(`New text count is below the expected minimum: ${check.newText}`);
      }
    } else if (check.type === 'replaceTableCellText') {
      const rows = tables(matches[0])
        .filter((table) => !check.tableContainsText || table.text.includes(check.tableContainsText))
        .flatMap((table) => table.rows)
        .filter((row) => row.text.includes(check.rowContainsText));
      const expectedCellText = check.verifyCellText || check.newText;
      const cells = rows.length === 1
        ? rows[0].cells.filter((cell) => cell.text.trim() === expectedCellText)
        : [];
      if (cells.length !== 1) {
        failures.push(
          `Updated table cell text not found in ${check.tabTitle} / ${check.rowContainsText}: ${expectedCellText}`,
        );
      } else if (!cellLinksMatch(cells[0], check.links, tabs)) {
        failures.push(`Updated table cell links do not match: ${check.newText}`);
      }
    } else if (check.type === 'applyTableCellLinks') {
      const rows = tables(matches[0])
        .filter((table) => !check.tableContainsText || table.text.includes(check.tableContainsText))
        .flatMap((table) => table.rows)
        .filter((row) => row.text.includes(check.rowContainsText));
      const cells = rows.length === 1
        ? rows[0].cells.filter((cell) => cell.text.includes(check.cellContainsText))
        : [];
      if (cells.length !== 1 || !cellLinksMatch(cells[0], check.links, tabs)) {
        failures.push(`Table cell links do not match: ${check.cellContainsText}`);
      }
    } else if (check.type === 'deleteTableRow') {
      const targetTables = tables(matches[0]).filter((table) => (
        !check.tableContainsText || table.text.includes(check.tableContainsText)
      ));
      const rowStillExists = targetTables
        .flatMap((table) => table.rows)
        .some((row) => row.text.includes(check.containsText));
      if (rowStillExists) failures.push(`Deleted row text remains: ${check.containsText}`);
    } else if (check.type === 'deleteTableColumn') {
      const headerStillExists = tables(matches[0])
        .filter((table) => table.text.includes(check.tableContainsText))
        .some((table) => table.rows[0]?.cells.some((cell) => cell.text.trim() === check.expectedHeader));
      if (headerStillExists) failures.push(`Deleted column header remains: ${check.expectedHeader}`);
    } else if (check.type === 'deleteSection') {
      const headings = sections(matches[0]);
      if (headings.some((heading) => heading.text === check.startHeading)) {
        failures.push(`Deleted section heading remains: ${check.startHeading}`);
      }
      if (headings.filter((heading) => heading.text === check.endHeading).length !== 1) {
        failures.push(`Section end heading count mismatch: ${check.endHeading}`);
      }
    } else if (check.type === 'insertSectionBeforeHeading') {
      const headings = sections(matches[0]);
      if (headings.filter((heading) => heading.text === check.heading).length !== 1) {
        failures.push(`Inserted section heading count mismatch: ${check.heading}`);
      }
      if (countOccurrences(text, check.body) !== 1) {
        failures.push(`Inserted section body count mismatch: ${check.body}`);
      }
    }
  }
  return failures;
}

export function verifyManifest(document, manifest) {
  const tabs = flattenTabs(document.tabs);
  const failures = [];
  for (const operation of manifest.operations || []) {
    const matches = tabs.filter((tab) => tab.tabProperties?.title === operation.tabTitle);
    if (operation.type === 'renameTab') {
      const renamed = tabs.filter((tab) => tab.tabProperties?.title === operation.newTitle);
      if (matches.length !== 0) failures.push(`Old tab title still exists: ${operation.tabTitle}`);
      if (renamed.length !== 1) failures.push(`Expected one renamed tab: ${operation.newTitle}`);
      continue;
    }
    if (operation.type === 'deleteTab') {
      if (matches.length !== 0) failures.push(`Tab still exists: ${operation.tabTitle}`);
      continue;
    }
    if (matches.length !== 1) {
      failures.push(`Expected one tab after update: ${operation.tabTitle}`);
      continue;
    }
    const text = structuralElementsText(matches[0].documentTab?.body?.content);
    if (operation.type === 'deleteParagraph') {
      const paragraphs = (matches[0].documentTab?.body?.content || [])
        .filter((element) => element.paragraph)
        .map((element) => structuralElementsText([element]).trim());
      if (paragraphs.includes(operation.text)) failures.push(`Deleted paragraph remains: ${operation.text}`);
    } else if (operation.type === 'replaceParagraphText') {
      const paragraphs = (matches[0].documentTab?.body?.content || [])
        .filter((element) => element.paragraph)
        .map((element) => structuralElementsText([element]).trim());
      if (paragraphs.includes(operation.oldText)) failures.push(`Old paragraph remains: ${operation.oldText}`);
      if (paragraphs.filter((value) => value === operation.newText).length !== 1) {
        failures.push(`Updated paragraph not found: ${operation.newText}`);
      }
      if ((operation.links || []).length > 0) {
        const paragraph = (matches[0].documentTab?.body?.content || [])
          .find((element) => element.paragraph && structuralElementsText([element]).trim() === operation.newText);
        const linkedText = (paragraph?.paragraph?.elements || []).map((element) => ({
          text: elementText(element),
          textRun: element.textRun,
        }));
        for (const link of operation.links) {
          const targetTabId = resolveTab(tabs, link.tabTitle).tabProperties.tabId;
          const runs = linkedText.filter((run) => run.text.includes(link.text));
          const target = runs[0]?.textRun?.textStyle?.link;
          if (runs.length !== 1 || (target?.tabId !== targetTabId && !target?.url?.includes(`tab=${targetTabId}`))) {
            failures.push(`Updated paragraph link does not match: ${link.text}`);
          }
        }
      }
    } else if (operation.type === 'replaceText') {
      if (operation.newText && countOccurrences(text, operation.newText) < 1) {
        failures.push(`New text not found: ${operation.newText}`);
      }
      if (!operation.newText.includes(operation.oldText) && countOccurrences(text, operation.oldText) !== 0) {
        failures.push(`Old text remains: ${operation.oldText}`);
      }
    } else if (operation.type === 'replaceTableCellText') {
      const rows = tables(matches[0])
        .filter((table) => {
          const marker = operation.verifyTableContainsText || operation.tableContainsText;
          return !marker || table.text.includes(marker);
        })
        .flatMap((table) => table.rows)
        .filter((row) => row.text.includes(operation.verifyRowContainsText || operation.rowContainsText));
      const expectedCellText = operation.verifyCellText || operation.newText;
      const cells = rows.length === 1
        ? rows[0].cells.filter((cell) => cell.text.trim() === expectedCellText)
        : [];
      if (cells.length !== 1) {
        failures.push(
          `Updated table cell text not found in ${operation.tabTitle} / ${operation.rowContainsText}: ${expectedCellText}`,
        );
      } else if (!cellLinksMatch(cells[0], operation.links || [], tabs)) {
        failures.push(`Updated table cell links do not match: ${operation.newText}`);
      }
    } else if (operation.type === 'applyTableCellLinks') {
      const rows = tables(matches[0])
        .filter((table) => !operation.tableContainsText || table.text.includes(operation.tableContainsText))
        .flatMap((table) => table.rows)
        .filter((row) => row.text.includes(operation.rowContainsText));
      const cells = rows.length === 1
        ? rows[0].cells.filter((cell) => cell.text.includes(operation.cellContainsText))
        : [];
      if (cells.length !== 1 || !cellLinksMatch(cells[0], operation.links, tabs)) {
        failures.push(`Table cell links do not match: ${operation.cellContainsText}`);
      }
    } else if (operation.type === 'deleteTableRow') {
      const targetTables = tables(matches[0]).filter((table) => (
        !operation.tableContainsText || table.text.includes(operation.tableContainsText)
      ));
      const rowStillExists = targetTables
        .flatMap((table) => table.rows)
        .some((row) => row.text.includes(operation.containsText));
      if (rowStillExists) failures.push(`Deleted row text remains: ${operation.containsText}`);
    } else if (operation.type === 'deleteTableColumn') {
      const headerStillExists = tables(matches[0])
        .filter((table) => table.text.includes(operation.tableContainsText))
        .some((table) => table.rows[0]?.cells.some((cell) => cell.text.trim() === operation.expectedHeader));
      if (headerStillExists) failures.push(`Deleted column header remains: ${operation.expectedHeader}`);
    } else if (operation.type === 'deleteSection') {
      const headings = sections(matches[0]);
      if (headings.some((heading) => heading.text === operation.startHeading)) {
        failures.push(`Deleted section heading remains: ${operation.startHeading}`);
      }
      if (headings.filter((heading) => heading.text === operation.endHeading).length !== 1) {
        failures.push(`Section end heading count mismatch: ${operation.endHeading}`);
      }
    } else if (operation.type === 'insertSectionBeforeHeading') {
      const headings = sections(matches[0]);
      if (headings.filter((heading) => heading.text === operation.heading).length !== 1) {
        failures.push(`Inserted section heading count mismatch: ${operation.heading}`);
      }
      if (countOccurrences(text, operation.body) !== 1) {
        failures.push(`Inserted section body count mismatch: ${operation.body}`);
      }
    }
  }
  return failures;
}

export { flattenTabs, structuralElementsText };
