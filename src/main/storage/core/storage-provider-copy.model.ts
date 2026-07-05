import type { StorageProviderCopyProgress } from '../../../shared/cloud-storage.model'
import type { LatestSave } from '../../../shared/domain'
import type { ServerSaveVersionFile } from '../adapters/storage-adapter.model'

export interface StorageProviderDataBackup {
  latestSave: LatestSave
  versionFiles: ServerSaveVersionFile[]
  versionsFolderPath: string
}

export type StorageProviderCopyProgressListener = (progress: StorageProviderCopyProgress) => void
