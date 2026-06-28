import type { CloudStorageProvider } from '../../../../../../shared/cloud-storage.model'

export type StorageModeProvider = CloudStorageProvider.Local | CloudStorageProvider.GoogleDrive

export interface StorageModeSettingsCardProps {
  onStorageProviderChange: () => Promise<void>
}
