import type {
  CloudStorageProviderSwitchPreview,
  StorageProviderCopyProgress
} from '../../../../../../shared/cloud-storage.model'
import type { StorageSettingsOperation } from '../../settings.model'

export interface StorageProviderSwitchDialogProps {
  errorMessage: string | null
  operation: StorageSettingsOperation
  preview: CloudStorageProviderSwitchPreview | null
  progress: StorageProviderCopyProgress | null
  onActivateTarget: () => void
  onCancel: () => void
  onCopyCurrentData: () => void
  onRetry: () => void
}

export interface StorageProviderSwitchChoiceProps {
  operation: StorageSettingsOperation
  preview: CloudStorageProviderSwitchPreview
  progress: StorageProviderCopyProgress | null
  onActivateTarget: () => void
  onCancel: () => void
  onCopyCurrentData: () => void
}

export interface StorageProviderSwitchChoiceLabels {
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
