import type { StorageProviderCopyProgress } from '../../../shared/cloud-storage.model'

export type StorageProviderCopyProgressListener = (progress: StorageProviderCopyProgress) => void
