import { structuralElementsText } from './document-patch.mjs';

function countOccurrences(text, search) {
  return text.split(search).length - 1;
}

function tabsByTitle(documentTabs) {
  const tabs = new Map();
  for (const tab of documentTabs) {
    const title = tab.tabProperties?.title;
    if (!title) continue;
    if (tabs.has(title)) throw new Error(`Duplicate Google Docs tab title: ${title}`);
    tabs.set(title, tab);
  }
  return tabs;
}

function inlineImageElements(elements = []) {
  const images = [];
  for (const element of elements) {
    if (element.paragraph) {
      for (const item of element.paragraph.elements || []) {
        if (item.inlineObjectElement?.inlineObjectId) {
          images.push({
            imageObjectId: item.inlineObjectElement.inlineObjectId,
            startIndex: item.startIndex,
            endIndex: item.endIndex,
          });
        }
      }
    } else if (element.table) {
      for (const row of element.table.tableRows || []) {
        for (const cell of row.tableCells || []) images.push(...inlineImageElements(cell.content));
      }
    } else if (element.tableOfContents) {
      images.push(...inlineImageElements(element.tableOfContents.content));
    }
  }
  return images;
}

export function planImageSync(manifestTabs, documentTabs) {
  const liveByTitle = tabsByTitle(documentTabs);
  const replacements = [];

  for (const source of manifestTabs.filter((tab) => tab.screenExamples.length > 0)) {
    const tab = liveByTitle.get(source.tabTitle);
    if (!tab) throw new Error(`Google Docs tab is missing: ${source.tabTitle}`);
    const imageElements = inlineImageElements(tab.documentTab?.body?.content);
    if (imageElements.length !== source.screenExamples.length) {
      throw new Error(
        `Image count mismatch in ${source.tabTitle}: expected ${source.screenExamples.length}, got ${imageElements.length}.`,
      );
    }

    const text = structuralElementsText(tab.documentTab?.body?.content);
    source.screenExamples.forEach((example, index) => {
      const caption = `▼ 画面例${example.number}：${example.label}`;
      const imageElement = imageElements[index];
      if (countOccurrences(text, caption) !== 1) {
        throw new Error(`Expected one image caption in ${source.tabTitle}: ${caption}`);
      }
      const inlineObject = tab.documentTab?.inlineObjects?.[imageElement.imageObjectId];
      if (!inlineObject) {
        throw new Error(`Inline image object is missing in ${source.tabTitle}: ${imageElement.imageObjectId}`);
      }
      if (!Number.isInteger(imageElement.startIndex) || !Number.isInteger(imageElement.endIndex)) {
        throw new Error(`Inline image range is missing in ${source.tabTitle}: ${imageElement.imageObjectId}`);
      }
      const objectSize = inlineObject.inlineObjectProperties?.embeddedObject?.size;
      if (!objectSize?.width || !objectSize?.height) {
        throw new Error(`Inline image size is missing in ${source.tabTitle}: ${imageElement.imageObjectId}`);
      }
      replacements.push({
        tabTitle: source.tabTitle,
        tabId: tab.tabProperties.tabId,
        imageObjectId: imageElement.imageObjectId,
        startIndex: imageElement.startIndex,
        endIndex: imageElement.endIndex,
        objectSize,
        image: example.image,
        caption,
      });
    });
  }

  return replacements;
}

export function imageReplacementRequests(replacements, uriByImage) {
  return [...replacements]
    .sort((left, right) => (
      left.tabId.localeCompare(right.tabId) || right.startIndex - left.startIndex
    ))
    .flatMap((replacement) => [
      {
        deleteContentRange: {
          range: {
            tabId: replacement.tabId,
            startIndex: replacement.startIndex,
            endIndex: replacement.endIndex,
          },
        },
      },
      {
        insertInlineImage: {
          uri: uriByImage.get(replacement.image),
          location: {
            tabId: replacement.tabId,
            index: replacement.startIndex,
          },
          objectSize: replacement.objectSize,
        },
      },
    ]);
}

export function verifyImageSync(documentTabs, replacements, uriByImage) {
  const liveByTitle = tabsByTitle(documentTabs);
  return replacements.flatMap((replacement) => {
    const tab = liveByTitle.get(replacement.tabTitle);
    const sourceUri = tab?.documentTab?.inlineObjects?.[replacement.imageObjectId]
      ?.inlineObjectProperties?.embeddedObject?.imageProperties?.sourceUri;
    return sourceUri === uriByImage.get(replacement.image)
      ? []
      : [`${replacement.tabTitle} / ${replacement.caption}`];
  });
}
