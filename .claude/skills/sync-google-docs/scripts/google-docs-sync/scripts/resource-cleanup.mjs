import fs from 'node:fs/promises';

export class ResourceCleanupError extends AggregateError {
  constructor(label, failures) {
    super(
      failures.map((failure) => failure.error),
      `Failed to delete ${label}: ${failures.map((failure) => failure.fileId).join(', ')}`,
    );
    this.name = 'ResourceCleanupError';
    this.resourceIds = failures.map((failure) => failure.fileId);
  }
}

export async function deleteDriveFiles(drive, fileIds, label = 'temporary Drive files') {
  const results = await Promise.allSettled(
    fileIds.map((fileId) => drive.files.delete({ fileId })),
  );
  const failures = results.flatMap((result, index) => (
    result.status === 'rejected'
      ? [{ fileId: fileIds[index], error: result.reason }]
      : []
  ));
  if (failures.length > 0) {
    throw new ResourceCleanupError(label, failures);
  }
}

export async function trashDriveFile(drive, fileId, label = 'temporary Drive file') {
  try {
    await drive.files.update({
      fileId,
      supportsAllDrives: true,
      requestBody: { trashed: true },
    });
  } catch (error) {
    throw new Error(`Failed to trash ${label}: ${fileId}`, { cause: error });
  }
}

export async function discardIncompleteDocument(drive, documentId, statePath) {
  await trashDriveFile(drive, documentId, 'incomplete Google Docs document');
  await fs.rm(statePath, { force: true });
}

export async function deleteDocumentTabs(docs, documentId, tabs) {
  try {
    await docs.documents.batchUpdate({
      documentId,
      requestBody: {
        requests: tabs.map((tab) => ({ deleteTab: { tabId: tab.tabId } })),
      },
    });
  } catch (error) {
    throw new Error(
      `Failed to delete incomplete Google Docs tabs: ${tabs.map((tab) => tab.tabId).join(', ')}`,
      { cause: error },
    );
  }
}

export function operationAndCleanupError(operationError, cleanupError, message) {
  return new AggregateError([operationError, cleanupError], message);
}

export function completedPublishError(error, documentId) {
  if (error instanceof ResourceCleanupError) {
    return new Error(
      `Document ${documentId} was published, but temporary image cleanup failed: ${error.resourceIds.join(', ')}`,
      { cause: error },
    );
  }
  return new Error(
    `Document ${documentId} was published, but the local result could not be written.`,
    { cause: error },
  );
}
