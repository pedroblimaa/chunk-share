import { mkdir, mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  CloudStorageProvider,
  StorageProviderCopyPhase,
  type CloudStorageProviderDataSummary,
  type CloudStorageProviderSwitchPreview
} from '../../../../shared/cloud-storage.model'
import type { LatestSave } from '../../../../shared/domain'
import type { ServerSavesReplacement, StorageAdapter } from '../../adapters/storage-adapter.model'
import { StorageError } from '../support/storage-error'
import type { StorageProviderCopyProgressListener } from './provider-copy.model'

interface CopySource {
  adapter: StorageAdapter
  latestSave: Exclude<LatestSave, null>
  localZipPath: string
}

export class CopySession {
  private source: CopySource | null = null
  private targetAdapter: StorageAdapter | null = null
  private targetReplacement: ServerSavesReplacement | null = null
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
      const [sourceLatestSave, sourceHasWorldFile, targetLatestSave, targetHasWorldFile] = await Promise.all([
        sourceAdapter.readLatestSave(),
        sourceAdapter.worldFileExists(),
        targetAdapter.readLatestSave(),
        targetAdapter.worldFileExists()
      ])

      assertSourceDataIsValid(sourceLatestSave, sourceHasWorldFile)

      this.source = {
        adapter: sourceAdapter,
        latestSave: sourceLatestSave,
        localZipPath: join(this.tempFolderPath, 'world.zip')
      }
      this.preview = {
        source: createProviderDataSummary(sourceProvider, sourceLatestSave, sourceHasWorldFile),
        target: createProviderDataSummary(targetProvider, targetLatestSave, targetHasWorldFile)
      }
    } catch (error) {
      await this.dispose()
      throw error
    }
  }

  async replaceTarget(): Promise<void> {
    if (!this.source || !this.targetAdapter) {
      throw new StorageError('Cannot replace target data before preparing the copy session.')
    }

    await mkdir(this.tempFolderPath!, { recursive: true })
    this.report(StorageProviderCopyPhase.PreparingSource, 0, 1)
    await this.source.adapter.downloadWorld(this.source.localZipPath)
    this.report(StorageProviderCopyPhase.PreparingSource, 1, 1)

    this.report(StorageProviderCopyPhase.PreparingTarget, 0, 0)
    this.targetReplacement = await this.targetAdapter.stageServerSavesReplacement()

    this.report(StorageProviderCopyPhase.Copying, 0, 1)
    await this.targetAdapter.uploadWorld(this.source.localZipPath)
    this.report(StorageProviderCopyPhase.Copying, 1, 1)
    await this.targetAdapter.writeLatestSave(this.source.latestSave)
    await this.targetAdapter.resetServerLock()
  }

  commitTarget(): Promise<void> {
    return this.targetReplacement?.commit() ?? Promise.resolve()
  }

  restoreTarget(): Promise<void> {
    if (!this.targetReplacement) {
      return Promise.resolve()
    }

    this.report(StorageProviderCopyPhase.Restoring, 0, 0)
    return this.targetReplacement.rollback()
  }

  async dispose(): Promise<void> {
    if (!this.tempFolderPath) {
      return Promise.resolve()
    }

    const tempFolderPath = this.tempFolderPath
    this.tempFolderPath = null

    return rm(tempFolderPath, { recursive: true, force: true }).catch(() => undefined)
  }
}

function createProviderDataSummary(
  provider: CloudStorageProvider,
  latestSave: LatestSave,
  hasWorldFile: boolean
): CloudStorageProviderDataSummary {
  return {
    provider,
    latestSaveVersion: latestSave?.saveVersion ?? null,
    latestSaveRecordedAt: latestSave?.uploadedAt ?? null,
    hasWorldFile
  }
}

function assertSourceDataIsValid(
  latestSave: LatestSave,
  hasWorldFile: boolean
): asserts latestSave is Exclude<LatestSave, null> {
  if (!latestSave) {
    throw new StorageError('Cannot copy saves because the source provider has no latest save.')
  }

  if (!hasWorldFile) {
    throw new StorageError('Cannot copy saves because the world file is missing from the source provider.')
  }
}
