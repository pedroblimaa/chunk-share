import type {
  CloudStorageProvider,
  CloudStorageProviderDataSummary,
  CloudStorageProviderSwitchPreview
} from '../../../../../../shared/cloud-storage.model'
import type { StorageSettingsOperation } from '../../settings.model'

export interface StorageProviderSwitchPanelProps {
  hasError: boolean
  operation: StorageSettingsOperation
  preview: CloudStorageProviderSwitchPreview | null
  onActivateTarget: (provider: CloudStorageProvider) => void
  onCancel: () => void
  onRetry: () => void
}

export interface StorageProviderSwitchChoiceProps {
  operation: StorageSettingsOperation
  preview: CloudStorageProviderSwitchPreview
  onActivateTarget: (provider: CloudStorageProvider) => void
  onCancel: () => void
}

export interface StorageProviderDataSummaryProps {
  label: string
  summary: CloudStorageProviderDataSummary
}

export interface StorageProviderSwitchChoiceLabels {
  title: string
  description: string
  activateLabel: string
}

export enum StorageProviderSwitchScenario {
  BothHaveData = 'both-have-data',
  SourceOnly = 'source-only',
  TargetOnly = 'target-only',
  BothEmpty = 'both-empty'
}
