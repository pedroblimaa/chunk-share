import type { CloudStorageProvider } from '../../../../../../shared/cloud-storage.model'

export interface StorageProviderOptionProps {
  describedBy?: string
  icon: string
  isSelected: boolean
  label: string
  onSelect: (provider: CloudStorageProvider) => void
  provider: CloudStorageProvider
}
