import fs from 'node:fs/promises';
import path from 'node:path';
import { marked } from 'marked';
import { assertUniqueTabTitles, tabTitle } from './document-naming.mjs';
import { loadConfig } from './config.mjs';

const { config, sourceDir, buildDir, screenDirectory, screenLabelFile } = await loadConfig();
const labels = config.labels || {
  tabReference: 'Tab',
  unresolvedReference: 'To be added',
  screenExamplesHeading: 'Screen examples',
  screenExample: 'Screen example',
};
const escapedScreenDirectory = screenDirectory.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const screenPattern = new RegExp(`${escapedScreenDirectory}/[0-9A-Za-z._-]+\\.(?:png|jpe?g|gif)`, 'g');

function walkTokens(tokens, visitor) {
  for (const token of tokens) {
    visitor(token);
    for (const key of ['tokens', 'items', 'header', 'rows']) {
      const value = token[key];
      if (!Array.isArray(value)) continue;
      for (const child of value) {
        if (Array.isArray(child)) {
          walkTokens(child, visitor);
        } else if (child && typeof child === 'object') {
          walkTokens([child], visitor);
        }
      }
    }
  }
}

function markdownTargets(tokens) {
  const targets = [];
  walkTokens(tokens, (token) => {
    if (token.type === 'link' && token.href) targets.push(token.href);
    if (token.type === 'codespan') targets.push(token.text);
    if (typeof token.text === 'string') {
      targets.push(...token.text.matchAll(/(?:^|[\s（(])([0-9A-Za-z._-]+\.md)(?=$|[\s）、),])/g));
    }
  });
  return targets
    .map((target) => Array.isArray(target) ? target[1] : target)
    .map((target) => target.split('#')[0])
    .filter((target) => /^[0-9A-Za-z._-]+\.md$/.test(target));
}

function screenTargets(markdown) {
  return [...markdown.matchAll(screenPattern)]
    .map((match) => match[0]);
}

function screenLabels(markdown) {
  const labels = new Map();
  for (const line of markdown.split('\n')) {
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
    const image = cells.flatMap((cell) => cell.match(new RegExp(`\\x60(${escapedScreenDirectory}/[0-9A-Za-z._-]+\\.(?:png|jpe?g|gif))\\x60`)) || []).at(1);
    if (!image) continue;
    if (cells.length === 3 && cells[2].includes(`${screenDirectory}/`)) {
      labels.set(image, `${cells[0]}：${cells[1]}`);
    } else if (cells.length >= 2) {
      labels.set(image, cells[0]);
    }
  }
  return labels;
}

function headingText(tokens, fallback) {
  const heading = tokens.find((token) => token.type === 'heading' && token.depth === 1);
  return heading?.text?.trim() || fallback;
}

function replaceScreenReferences(markdown, screenExamples) {
  const examplesByImage = new Map(screenExamples.map((example) => [example.image, example]));
  const referencePattern = new RegExp(`\\x60?(${escapedScreenDirectory}/[0-9A-Za-z._-]+\\.(?:png|jpe?g|gif))\\x60?`, 'g');
  return markdown.replace(referencePattern, (raw, image) => {
    const example = examplesByImage.get(image);
    return example ? `${labels.screenExample}${example.number}` : raw;
  });
}

function replaceReferences(markdown, titleByFile, unresolvedReferences, screenExamples) {
  let output = markdown;
  output = output.replace(/\[([^\]]+)\]\(([^)]+\.md)(?:#[^)]+)?\)/g, (raw, _label, file) => {
    const target = path.basename(file);
    if (titleByFile.has(target)) return `${labels.tabReference}「${titleByFile.get(target)}」`;
    return unresolvedReferences.has(target) ? labels.unresolvedReference : raw;
  });

  output = output.replace(/`([0-9A-Za-z._-]+\.md)`/g, (raw, file) => {
    if (titleByFile.has(file)) return `${labels.tabReference}「${titleByFile.get(file)}」`;
    return unresolvedReferences.has(file) ? labels.unresolvedReference : raw;
  });

  for (const reference of unresolvedReferences) output = output.replaceAll(reference, labels.unresolvedReference);

  return replaceScreenReferences(output, screenExamples);
}

const sourceFiles = (await fs.readdir(sourceDir, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
  .map((entry) => entry.name);

const screenNameByImage = screenLabelFile
  ? screenLabels(await fs.readFile(screenLabelFile, 'utf8'))
  : new Map();
const orderedFiles = [
  config.indexFile,
  ...sourceFiles.sort().filter((file) => file !== config.indexFile),
];

const tabs = [];
for (const sourceFile of orderedFiles) {
  const markdown = await fs.readFile(path.join(sourceDir, sourceFile), 'utf8');
  const tokens = marked.lexer(markdown);
  const title = headingText(tokens, sourceFile.replace(/\.md$/, ''));
  const references = [...new Set(markdownTargets(tokens))];
  const images = [...new Set(screenTargets(markdown))];

  for (const image of images) {
    await fs.access(path.join(sourceDir, image));
  }

  tabs.push({
    sourceFile,
    title,
    tabTitle: tabTitle(sourceFile, title, config.numberedHeadings),
    markdown,
    references,
    images,
    screenExamples: images.map((image, index) => ({
      image,
      number: index + 1,
      label: screenNameByImage.get(image) || path.basename(image),
    })),
  });
}

assertUniqueTabTitles(tabs);
const titleByFile = new Map(tabs.map((tab) => [tab.sourceFile, tab.tabTitle]));
const unresolvedReferences = [...new Set(tabs.flatMap((tab) => tab.references))]
  .filter((reference) => !titleByFile.has(reference))
  .sort();
const unresolvedReferenceSet = new Set(unresolvedReferences);

const manifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  documentTitle: config.documentTitle,
  imageWidthPt: config.imageWidthPt,
  tabLinkDocumentId: config.tabLinkDocumentId,
  pdf: config.pdf,
  temporaryImagePrefix: config.temporaryImagePrefix,
  allowPublicTemporaryImages: config.allowPublicTemporaryImages || false,
  labels,
  tabs,
  unresolvedReferences,
};

await fs.mkdir(buildDir, { recursive: true });
await fs.writeFile(
  path.join(buildDir, 'requirements.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
);

const preview = tabs.map((tab) => {
  const markdown = replaceReferences(tab.markdown, titleByFile, unresolvedReferenceSet, tab.screenExamples);
  const images = tab.images.length === 0
    ? ''
    : `\n\n## ${labels.screenExamplesHeading}\n\n${tab.images.map((image) => {
      const example = tab.screenExamples.find((item) => item.image === image);
      const relativeImage = path.relative(buildDir, path.join(sourceDir, image)).split(path.sep).join('/');
      return `### ▼ ${labels.screenExample}${example.number}：${example.label}\n\n![${labels.screenExample}${example.number}](${relativeImage})`;
    }).join('\n\n')}`;
  return `<!-- Google Docs tab: ${tab.tabTitle} -->\n\n${markdown}${images}`;
}).join('\n\n---\n\n');

await fs.writeFile(path.join(buildDir, 'preview.md'), `${preview}\n`);

console.log(`Generated ${tabs.length} tabs in ${path.relative(process.cwd(), buildDir)}`);
if (unresolvedReferences.length > 0) {
  console.warn(`Unresolved Markdown references: ${unresolvedReferences.join(', ')}`);
}
