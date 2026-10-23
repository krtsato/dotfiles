// Keep generated titles bounded so tab navigation remains readable and API-safe.
const MAX_TAB_TITLE_LENGTH = 100;

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function sourceNumber(sourceFile) {
  const match = sourceFile.match(/^(\d{2})-/);
  return match ? Number.parseInt(match[1], 10) : null;
}

export function headingTitle(sourceFile, title, numberedHeadings) {
  if (!numberedHeadings) return title;
  const number = sourceNumber(sourceFile);
  const prefix = escapeRegExp(numberedHeadings.prefix);
  const match = title.match(new RegExp(`^${prefix} (\\d{2}): (.+)$`));

  if (number !== null && number >= numberedHeadings.min && number <= numberedHeadings.max) {
    if (!match) throw new Error(`Top-level heading must start with "${numberedHeadings.prefix} ${String(number).padStart(2, '0')}: ": ${sourceFile}`);
    if (Number.parseInt(match[1], 10) !== number) {
      throw new Error(`Top-level heading number does not match the source file: ${sourceFile}`);
    }
    return match[2];
  }

  return match ? match[2] : title;
}

export function tabTitle(sourceFile, title, numberedHeadings) {
  if (!numberedHeadings) return title.slice(0, MAX_TAB_TITLE_LENGTH);
  const number = sourceNumber(sourceFile);
  const normalizedTitle = headingTitle(sourceFile, title, numberedHeadings);
  return `${number === null ? '' : `${String(number).padStart(2, '0')} `}${normalizedTitle}`
    .slice(0, MAX_TAB_TITLE_LENGTH);
}

export function assertUniqueTabTitles(tabs) {
  const sourceFilesByTitle = new Map();
  for (const tab of tabs) {
    const sourceFiles = sourceFilesByTitle.get(tab.tabTitle) || [];
    sourceFiles.push(tab.sourceFile);
    sourceFilesByTitle.set(tab.tabTitle, sourceFiles);
  }
  const duplicates = [...sourceFilesByTitle.entries()]
    .filter(([, sourceFiles]) => sourceFiles.length > 1);
  if (duplicates.length > 0) {
    const details = duplicates
      .map(([title, sourceFiles]) => `"${title}" (${sourceFiles.join(', ')})`)
      .join('; ');
    throw new Error(`Duplicate generated Google Docs tab title: ${details}`);
  }
}
