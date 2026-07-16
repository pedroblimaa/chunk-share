import {
  CloudStorageProvider,
  StorageProviderCopyPhase,
  type CloudStorageProviderSwitchPreview,
  type StorageProviderCopyProgress
} from '../../../../../../shared/cloud-storage.model'
import { storageProviderHasData } from '../../settings-helpers'
import { StorageSettingsOperation } from '../../settings.model'
import { StorageProviderSwitchScenario } from './StorageProviderSwitchDialog.model'

export function getStorageProviderSwitchScenario(
  preview: CloudStorageProviderSwitchPreview
): StorageProviderSwitchScenario {
  const sourceHasData = storageProviderHasData(preview.source)
  const targetHasData = storageProviderHasData(preview.target)

  if (sourceHasData && targetHasData) {
    return StorageProviderSwitchScenario.BothHaveData
  }

  if (sourceHasData) {
    return StorageProviderSwitchScenario.SourceOnly
  }

  if (targetHasData) {
    return StorageProviderSwitchScenario.TargetOnly
  }

  return StorageProviderSwitchScenario.BothEmpty
}

export function getCopyActionLabel(
  operation: StorageSettingsOperation,
  progress: StorageProviderCopyProgress | null,
  idleLabel: string
): string {
  if (operation !== StorageSettingsOperation.CopyProviderData) {
    return idleLabel
  }

  if (!progress) {
    return 'Preparing...'
  }

  switch (progress.phase) {
    case StorageProviderCopyPhase.PreparingSource:
      return formatFileProgressLabel('Preparing save', progress)
    case StorageProviderCopyPhase.PreparingTarget:
      return formatFileProgressLabel('Backing up target saves', progress)
    case StorageProviderCopyPhase.Copying:
      return formatFileProgressLabel('Copying save', progress)
    case StorageProviderCopyPhase.Finalizing:
      return 'Finalizing storage switch...'
    case StorageProviderCopyPhase.Restoring:
      return formatFileProgressLabel('Restoring previous saves', progress)
  }
}

export function formatFileProgressLabel(label: string, progress: StorageProviderCopyProgress): string {
  if (progress.totalFiles === 0) {
    return `${label}...`
  }

  return `${label}: ${progress.completedFiles} of ${progress.totalFiles}`
}

export function getProviderSwitchProgressLabel(operation: StorageSettingsOperation): string | null {
  if (operation === StorageSettingsOperation.PreviewProviderSwitch) {
    return 'Checking storage data...'
  }

  if (operation === StorageSettingsOperation.CopyProviderData) {
    return 'Copying the latest save to the selected provider...'
  }

  if (operation === StorageSettingsOperation.SwitchProvider) {
    return 'Switching storage provider...'
  }

  return null
}

export function getStorageProviderLabel(provider: CloudStorageProvider): string {
  return provider === CloudStorageProvider.Local ? 'Local Storage' : 'Google Drive'
}

export function getStorageProviderIcon(provider: CloudStorageProvider): string {
  return provider === CloudStorageProvider.Local ? 'hard_drive' : 'cloud'
}
