import { mkdir, mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { basename, join } from 'path'
import {
  CloudStorageProvider,
  StorageProviderCopyPhase,
  type CloudStorageProviderDataSummary,
  type CloudStorageProviderSwitchPreview
} from '../../../shared/cloud-storage.model'
import type { StorageAdapter } from '../adapters/storage-adapter.model'
import { StorageError } from './storage-error'
import type {
  StorageProviderCopyProgressListener,
  StorageProviderDataBackup
} from './storage-provider-copy.model'

export class CopySession {
  private sourceBackup: StorageProviderDataBackup | null = null
  private targetBackup: StorageProviderDataBackup | null = null
  private targetAdapter: StorageAdapter | null = null
  private tempFolderPath: string | null = null
  preview: CloudStorageProviderSwitchPreview | null = null

  constructor(private onProgress: StorageProviderCopyProgressListener) {}

  report(phase: StorageProviderCopyPhase, completedFiles: number, totalFiles: number): void {
    this.onProgress({ phase, completedFiles, totalFiles })
  }

  finalize(): void {
    this.report(StorageProviderCopyPhase.Finalizing, 0, 0)
  }

  async prepare(
    sourceProvider: CloudStorageProvider,
    sourceAdapter: StorageAdapter,
    targetProvider: CloudStorageProvider,
    targetAdapter: StorageAdapter
  ): Promise<void> {
    this.targetAdapter = targetAdapter
    this.tempFolderPath = await mkdtemp(join(tmpdir(), 'chunk-share-provider-copy-'))

    try {
      this.sourceBackup = await this.backupData(
        sourceAdapter,
        join(this.tempFolderPath, 'source'),
        StorageProviderCopyPhase.PreparingSource
      )

      assertSourceBackupIsValid(this.sourceBackup)

      this.targetBackup = await this.backupData(
        targetAdapter,
        join(this.tempFolderPath, 'target'),
        StorageProviderCopyPhase.PreparingTarget
      )

      this.preview = createSwitchPreview(sourceProvider, this.sourceBackup, targetProvider, this.targetBackup)
    } catch (error) {
      await this.dispose()
      throw error
    }
  }

  replaceTarget(): Promise<void> {
    if (!this.targetAdapter || !this.sourceBackup) {
      throw new StorageError('Cannot replace target data before preparing the copy session.')
    }

    return this.replaceData(this.targetAdapter, this.sourceBackup, StorageProviderCopyPhase.Copying)
  }

  restoreTarget(): Promise<void> {
    if (!this.targetAdapter || !this.targetBackup) {
      throw new StorageError('Cannot restore target data before preparing the copy session.')
    }

    return this.replaceData(this.targetAdapter, this.targetBackup, StorageProviderCopyPhase.Restoring)
  }

  async dispose(): Promise<void> {
    if (!this.tempFolderPath) {
      return Promise.resolve()
    }

    const tempFolderPath = this.tempFolderPath
    this.tempFolderPath = null

    return rm(tempFolderPath, { recursive: true, force: true }).catch(() => undefined)
  }

  private async backupData(
    storageAdapter: StorageAdapter,
    versionsFolderPath: string,
    phase: StorageProviderCopyPhase
  ): Promise<StorageProviderDataBackup> {
    const [latestSave, versionFiles] = await Promise.all([
      storageAdapter.readLatestSave(),
      storageAdapter.listServerSaveVersions()
    ])

    await mkdir(versionsFolderPath, { recursive: true })
    this.report(phase, 0, versionFiles.length)

    for (const [index, versionFile] of versionFiles.entries()) {
      assertSafeVersionFileName(versionFile.fileName)
      await storageAdapter.downloadServerSaveVersion(
        versionFile.fileName,
        join(versionsFolderPath, versionFile.fileName)
      )
      this.report(phase, index + 1, versionFiles.length)
    }

    return { latestSave, versionFiles, versionsFolderPath }
  }

  private async replaceData(
    storageAdapter: StorageAdapter,
    backup: StorageProviderDataBackup,
    phase: StorageProviderCopyPhase
  ): Promise<void> {
    this.report(phase, 0, backup.versionFiles.length)
    await storageAdapter.resetServerSaves()

    for (const [index, versionFile] of backup.versionFiles.entries()) {
      await storageAdapter.uploadServerSaveVersion(
        versionFile.fileName,
        join(backup.versionsFolderPath, versionFile.fileName)
      )
      this.report(phase, index + 1, backup.versionFiles.length)
    }

    await storageAdapter.writeLatestSave(backup.latestSave)
    await storageAdapter.resetServerLock()
  }
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
    latestSaveRecordedAt: backup.latestSave?.uploadedAt ?? null,
    versionCount: backup.versionFiles.length
  }
}

function assertSourceBackupIsValid(backup: StorageProviderDataBackup): void {
  if (!backup.latestSave && backup.versionFiles.length === 0) {
    throw new StorageError('Cannot copy saves because the source provider is empty.')
  }

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

function assertSafeVersionFileName(fileName: string): void {
  if (basename(fileName) !== fileName) {
    throw new StorageError(`Invalid server save version filename: ${fileName}`)
  }
}
