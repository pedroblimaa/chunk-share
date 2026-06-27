import type {
  CloudStorageProviderDataSummary,
  CloudStorageProviderSwitchPreview
} from '../../../../../../shared/cloud-storage.model'
import type { ActiveStorageSettingsOperation } from '../../settings.model'

export interface StorageProviderSwitchPanelProps {
  hasError: boolean
  operation: ActiveStorageSettingsOperation
  preview: CloudStorageProviderSwitchPreview | null
  onActivateTarget: () => void
  onCancel: () => void
  onCopyCurrentData: () => void
  onRetry: () => void
}

export interface StorageProviderSwitchChoiceProps {
  operation: ActiveStorageSettingsOperation
  preview: CloudStorageProviderSwitchPreview
  onActivateTarget: () => void
  onCancel: () => void
  onCopyCurrentData: () => void
}

export interface StorageProviderDataSummaryProps {
  label: string
  summary: CloudStorageProviderDataSummary
}

export interface StorageProviderSwitchChoiceCopy {
  title: string
  description: string
  activateLabel: string
  copyLabel: string
}

export enum StorageProviderSwitchScenario {
  BothHaveData = 'both-have-data',
  SourceOnly = 'source-only',
  TargetOnly = 'target-only',
  BothEmpty = 'both-empty'
}
