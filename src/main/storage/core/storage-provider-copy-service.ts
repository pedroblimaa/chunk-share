import { mkdtemp, mkdir, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { basename, join } from 'path'
import type {
  CloudStorageProvider,
  CloudStorageProviderDataSummary,
  CloudStorageProviderSwitchPreview
} from '../../../shared/cloud-storage.model'
import type { StorageAdapter } from '../adapters/storage-adapter.model'
import { StorageError } from './storage-error'
import type { StorageProviderCopyTransaction, StorageProviderDataBackup } from './storage-provider-copy.model'

export async function prepareStorageProviderCopy(
  sourceProvider: CloudStorageProvider,
  sourceAdapter: StorageAdapter,
  targetProvider: CloudStorageProvider,
  targetAdapter: StorageAdapter
): Promise<StorageProviderCopyTransaction> {
  const tempFolderPath = await mkdtemp(join(tmpdir(), 'chunk-share-provider-copy-'))

  try {
    const sourceBackup = await backupStorageProviderData(sourceAdapter, join(tempFolderPath, 'source'))
    assertSourceBackupHasData(sourceBackup)
    assertSourceBackupIsConsistent(sourceBackup)

    const targetBackup = await backupStorageProviderData(targetAdapter, join(tempFolderPath, 'target'))
    const preview = createSwitchPreview(sourceProvider, sourceBackup, targetProvider, targetBackup)

    return {
      preview,
      replaceTarget: () => replaceStorageProviderData(targetAdapter, sourceBackup),
      restoreTarget: () => replaceStorageProviderData(targetAdapter, targetBackup),
      dispose: () => rm(tempFolderPath, { recursive: true, force: true })
    }
  } catch (error) {
    await rm(tempFolderPath, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }
}

async function backupStorageProviderData(
  storageAdapter: StorageAdapter,
  versionsFolderPath: string
): Promise<StorageProviderDataBackup> {
  const [latestSave, versionFiles] = await Promise.all([
    storageAdapter.readLatestSave(),
    storageAdapter.listServerSaveVersions()
  ])

  await mkdir(versionsFolderPath, { recursive: true })

  for (const versionFile of versionFiles) {
    assertSafeVersionFileName(versionFile.fileName)
    await storageAdapter.downloadServerSaveVersion(
      versionFile.fileName,
      join(versionsFolderPath, versionFile.fileName)
    )
  }

  return {
    latestSave,
    versionFiles,
    versionsFolderPath
  }
}

async function replaceStorageProviderData(
  storageAdapter: StorageAdapter,
  backup: StorageProviderDataBackup
): Promise<void> {
  await storageAdapter.resetServerSaves()

  for (const versionFile of backup.versionFiles) {
    await storageAdapter.uploadServerSaveVersion(
      versionFile.fileName,
      join(backup.versionsFolderPath, versionFile.fileName)
    )
  }

  await storageAdapter.writeLatestSave(backup.latestSave)
  await storageAdapter.resetServerLock()
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
