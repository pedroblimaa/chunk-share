import {
  CloudStorageProvider,
  StorageProviderCopyPhase,
  type CloudStorageProviderDataSummary,
  type CloudStorageProviderSwitchPreview,
  type CloudStorageSettings,
  type StorageProviderCopyProgress
} from '../../../shared/cloud-storage.model'
import { ServerLockStatus } from '../../../shared/domain'
import { getStorageAdapterForProvider } from '../adapters/storage-adapter-service'
import type { StorageAdapter } from '../adapters/storage-adapter.model'
import { StorageError } from './storage-error'
import type { StorageProviderCopyProgressListener } from './storage-provider-copy.model'
import { CopySession } from './copy-session'

export async function executeStorageProviderCopy(
  currentSettings: CloudStorageSettings,
  validatedSettings: CloudStorageSettings,
  targetProvider: CloudStorageProvider,
  expectedPreview: CloudStorageProviderSwitchPreview,
  onCopyProgress: StorageProviderCopyProgressListener,
  activateProvider: (
    settings: CloudStorageSettings,
    provider: CloudStorageProvider
  ) => Promise<CloudStorageSettings>
): Promise<CloudStorageSettings> {
  const session = new CopySession(onCopyProgress)
  const sourceProvider = currentSettings.activeProvider
  const sourceAdapter = await getStorageAdapterForProvider(sourceProvider)
  const targetAdapter = await getStorageAdapterForProvider(targetProvider)

  try {
    return await targetAdapter.runExclusiveStorageMutation(async () => {
      await assertStorageAdapterIsUnlocked(targetAdapter)
      await session.prepare(sourceProvider, sourceAdapter, targetProvider, targetAdapter)
      assertSwitchPreviewIsCurrent(expectedPreview, session.preview!)

      let nextSettings: CloudStorageSettings

      try {
        await session.replaceTarget()
        session.finalize()
        nextSettings = await activateProvider(validatedSettings, targetProvider)
      } catch (error) {
        await session.restoreTarget()
        throw error
      }

      try {
        await session.commitTarget()
      } catch (error) {
        console.error(
          'Storage provider switched, but its previous save-history backup was not deleted.',
          error
        )
      }

      return nextSettings
    })
  } finally {
    await session.dispose()
  }
}

async function assertStorageAdapterIsUnlocked(storageAdapter: StorageAdapter): Promise<void> {
  const serverLock = await storageAdapter.readServerLock()

  if (serverLock.status === ServerLockStatus.Locked) {
    throw new StorageError(
      `Cannot replace storage data while ${serverLock.lockedBy.displayName} is hosting this server.`
    )
  }
}

export function createVisibleProgressReporter(
  sourceProvider: CloudStorageProvider,
  targetProvider: CloudStorageProvider,
  onCopyProgress: StorageProviderCopyProgressListener
): StorageProviderCopyProgressListener {
  return (progress) => {
    const visibleProgress = getVisibleProviderCopyProgress(sourceProvider, targetProvider, progress)

    if (visibleProgress) {
      onCopyProgress(visibleProgress)
    }
  }
}

function getVisibleProviderCopyProgress(
  sourceProvider: CloudStorageProvider,
  targetProvider: CloudStorageProvider,
  progress: StorageProviderCopyProgress
): StorageProviderCopyProgress | null {
  if (
    progress.phase === StorageProviderCopyPhase.Finalizing ||
    progress.phase === StorageProviderCopyPhase.Restoring
  ) {
    return progress
  }

  const visibleCopyPhase =
    sourceProvider === CloudStorageProvider.GoogleDrive && targetProvider === CloudStorageProvider.Local
      ? StorageProviderCopyPhase.PreparingSource
      : StorageProviderCopyPhase.Copying

  if (progress.phase !== visibleCopyPhase) {
    return null
  }

  return { ...progress, phase: StorageProviderCopyPhase.Copying }
}

function assertSwitchPreviewIsCurrent(
  expected: CloudStorageProviderSwitchPreview,
  current: CloudStorageProviderSwitchPreview
): void {
  if (
    !cloudStorageProviderDataSummariesMatch(expected.source, current.source) ||
    !cloudStorageProviderDataSummariesMatch(expected.target, current.target)
  ) {
    throw new StorageError('Storage data changed. Review the provider switch again.')
  }
}

function cloudStorageProviderDataSummariesMatch(
  expected: CloudStorageProviderDataSummary,
  current: CloudStorageProviderDataSummary
): boolean {
  return (
    expected.provider === current.provider &&
    expected.latestSaveVersion === current.latestSaveVersion &&
    expected.latestSaveRecordedAt === current.latestSaveRecordedAt &&
    expected.versionCount === current.versionCount
  )
}
