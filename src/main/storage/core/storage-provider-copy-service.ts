import { mkdtemp, mkdir, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { basename, join } from 'path'
import type {
  CloudStorageProvider,
  CloudStorageProviderDataSummary,
  CloudStorageProviderSwitchPreview,
  StorageProviderCopyProgress
} from '../../../shared/cloud-storage.model'
import { StorageProviderCopyPhase } from '../../../shared/cloud-storage.model'
import type { StorageAdapter } from '../adapters/storage-adapter.model'
import { StorageError } from './storage-error'
import type {
  StorageProviderCopyProgressListener,
  StorageProviderCopyTransaction,
  StorageProviderDataBackup
} from './storage-provider-copy.model'

export async function prepareStorageProviderCopy(
  sourceProvider: CloudStorageProvider,
  sourceAdapter: StorageAdapter,
  targetProvider: CloudStorageProvider,
  targetAdapter: StorageAdapter,
  onProgress: StorageProviderCopyProgressListener
): Promise<StorageProviderCopyTransaction> {
  const tempFolderPath = await mkdtemp(join(tmpdir(), 'chunk-share-provider-copy-'))

  try {
    const sourceBackup = await backupStorageProviderData(
      sourceAdapter,
      join(tempFolderPath, 'source'),
      StorageProviderCopyPhase.PreparingSource,
      onProgress
    )
    assertSourceBackupHasData(sourceBackup)
    assertSourceBackupIsConsistent(sourceBackup)

    const targetBackup = await backupStorageProviderData(
      targetAdapter,
      join(tempFolderPath, 'target'),
      StorageProviderCopyPhase.PreparingTarget,
      onProgress
    )
    const preview = createSwitchPreview(sourceProvider, sourceBackup, targetProvider, targetBackup)

    return {
      preview,
      replaceTarget: () =>
        replaceStorageProviderData(targetAdapter, sourceBackup, StorageProviderCopyPhase.Copying, onProgress),
      restoreTarget: () =>
        replaceStorageProviderData(
          targetAdapter,
          targetBackup,
          StorageProviderCopyPhase.Restoring,
          onProgress
        ),
      dispose: () => rm(tempFolderPath, { recursive: true, force: true })
    }
  } catch (error) {
    await rm(tempFolderPath, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }
}

async function backupStorageProviderData(
  storageAdapter: StorageAdapter,
  versionsFolderPath: string,
  phase: StorageProviderCopyPhase,
  onProgress: StorageProviderCopyProgressListener
): Promise<StorageProviderDataBackup> {
  const [latestSave, versionFiles] = await Promise.all([
    storageAdapter.readLatestSave(),
    storageAdapter.listServerSaveVersions()
  ])

  await mkdir(versionsFolderPath, { recursive: true })
  reportFileProgress(onProgress, phase, 0, versionFiles.length)

  for (const [index, versionFile] of versionFiles.entries()) {
    assertSafeVersionFileName(versionFile.fileName)
    await storageAdapter.downloadServerSaveVersion(
      versionFile.fileName,
      join(versionsFolderPath, versionFile.fileName)
    )
    reportFileProgress(onProgress, phase, index + 1, versionFiles.length)
  }

  return {
    latestSave,
    versionFiles,
    versionsFolderPath
  }
}

async function replaceStorageProviderData(
  storageAdapter: StorageAdapter,
  backup: StorageProviderDataBackup,
  phase: StorageProviderCopyPhase,
  onProgress: StorageProviderCopyProgressListener
): Promise<void> {
  reportFileProgress(onProgress, phase, 0, backup.versionFiles.length)
  await storageAdapter.resetServerSaves()

  for (const [index, versionFile] of backup.versionFiles.entries()) {
    await storageAdapter.uploadServerSaveVersion(
      versionFile.fileName,
      join(backup.versionsFolderPath, versionFile.fileName)
    )
    reportFileProgress(onProgress, phase, index + 1, backup.versionFiles.length)
  }

  await storageAdapter.writeLatestSave(backup.latestSave)
  await storageAdapter.resetServerLock()
}

function reportFileProgress(
  onProgress: StorageProviderCopyProgressListener,
  phase: StorageProviderCopyPhase,
  completedFiles: number,
  totalFiles: number
): void {
  const progress: StorageProviderCopyProgress = {
    phase,
    completedFiles,
    totalFiles
  }

  onProgress(progress)
}

function createSwitchPreview(
  sourceProvider: CloudStorageProvider,
  sourceBackup: StorageProviderDataBackup,
  targetProvider: CloudStorageProvider,
  targetBackup: StorageProviderDataBackup
): CloudStorageProviderSwitchPreview {
  return {
    source: createProviderDataSummary(sourceProvider, sourceBackup),
    target: createProviderDataSummary(targetProvider, targetBackup)
  }
}

function createProviderDataSummary(
  provider: CloudStorageProvider,
  backup: StorageProviderDataBackup
): CloudStorageProviderDataSummary {
  return {
    provider,
    latestSaveVersion: backup.latestSave?.saveVersion ?? null,
    latestSaveUploadedAt: backup.latestSave?.uploadedAt ?? null,
    versionCount: backup.versionFiles.length
  }
}

function assertSourceBackupIsConsistent(backup: StorageProviderDataBackup): void {
  if (!backup.latestSave) {
    return
  }

  const latestVersionExists = backup.versionFiles.some(
    (versionFile) =>
      versionFile.fileName === backup.latestSave?.fileName &&
      versionFile.saveVersion === backup.latestSave.saveVersion
  )

  if (!latestVersionExists) {
    throw new StorageError(
      `Cannot copy saves because ${backup.latestSave.fileName} is missing from the source provider.`
    )
  }
}

function assertSourceBackupHasData(backup: StorageProviderDataBackup): void {
  if (!backup.latestSave && backup.versionFiles.length === 0) {
    throw new StorageError('Cannot copy saves because the source provider is empty.')
  }
}

function assertSafeVersionFileName(fileName: string): void {
  if (basename(fileName) !== fileName) {
    throw new StorageError(`Invalid server save version filename: ${fileName}`)
  }
}
