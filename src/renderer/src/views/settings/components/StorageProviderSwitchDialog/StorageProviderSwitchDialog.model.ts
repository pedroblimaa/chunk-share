import type {
  CloudStorageProviderDataSummary,
  CloudStorageProviderSwitchPreview,
  StorageProviderCopyProgress
} from '../../../../../../shared/cloud-storage.model'
import type { ActiveStorageSettingsOperation } from '../../settings.model'

export interface StorageProviderSwitchDialogProps {
  errorMessage: string | null
  operation: ActiveStorageSettingsOperation
  preview: CloudStorageProviderSwitchPreview | null
  progress: StorageProviderCopyProgress | null
  onActivateTarget: () => void
  onCancel: () => void
  onCopyCurrentData: () => void
  onRetry: () => void
}

export interface StorageProviderSwitchChoiceProps {
  operation: ActiveStorageSettingsOperation
  preview: CloudStorageProviderSwitchPreview
  progress: StorageProviderCopyProgress | null
  onActivateTarget: () => void
  onCancel: () => void
  onCopyCurrentData: () => void
}

export interface StorageProviderDataSummaryProps {
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
