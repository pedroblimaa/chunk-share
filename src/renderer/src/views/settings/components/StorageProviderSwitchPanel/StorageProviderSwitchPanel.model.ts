import type {
  CloudStorageProviderDataSummary,
  CloudStorageProviderSwitchPreview
} from '../../../../../../shared/cloud-storage.model'
import type { ActiveStorageSettingsOperation } from '../../settings.model'

export interface StorageProviderSwitchPanelProps {
  hasError: boolean
  operation: ActiveStorageSettingsOperation
  preview: CloudStorageProviderSwitchPreview | null
  onCancel: () => void
  onReplace: () => void
  onRetry: () => void
  onUseExisting: () => void
}

export interface StorageProviderSwitchChoiceProps {
  operation: ActiveStorageSettingsOperation
  preview: CloudStorageProviderSwitchPreview
  onCancel: () => void
  onReplace: () => void
  onUseExisting: () => void
}

export interface StorageProviderDataSummaryProps {
  label: string
  summary: CloudStorageProviderDataSummary
}
