import { CloudStorageProvider, GoogleDriveSetupStatus } from '../../../../../../shared/cloud-storage.model'
import type { BadgeTone } from '../../../../components/shared/Badge/Badge.model'
import { StorageSettingsOperation, type StorageProviderSettingsController } from '../../settings.model'
import { GOOGLE_DRIVE_STATUS_VIEW } from '../StorageModeSettingsCard/storage-mode-settings.constants'

export function useDrivePanelState(
  storage: StorageProviderSettingsController,
  onActivate: () => void
): DrivePanelState {
  const driveState = storage.storageProviderSettings?.googleDrive
  const isValid = driveState?.status === GoogleDriveSetupStatus.Valid
  const isActive = storage.activeStorageProvider === CloudStorageProvider.GoogleDrive
  const canBeActivated = isValid && !isActive
  const activationIsRunning =
    storage.operationState.operation === StorageSettingsOperation.PreviewProviderSwitch ||
    storage.operationState.operation === StorageSettingsOperation.SwitchProvider
  const primaryActionIsRunning =
    storage.operationState.operation === StorageSettingsOperation.SetupGoogleDriveFolder ||
    (canBeActivated && activationIsRunning)
  const googleSignInIsRunning =
    storage.operationState.operation === StorageSettingsOperation.SetupGoogleDriveFolder
  const hasConfiguredFolder = Boolean(driveState?.folder)

  return {
    isValid,
    isActive,
    statusView: GOOGLE_DRIVE_STATUS_VIEW[driveState?.status ?? GoogleDriveSetupStatus.NotConfigured],
    validatedAt: driveState?.folder?.validatedAt ?? null,
    errorMessage: driveState?.errorMessage ?? null,
    hasFolder: Boolean(driveState?.folder),
    googleSignInIsRunning,
    primaryActionIsRunning,
    controlsAreDisabled: storage.operationState.isBusy || storage.storageProviderSettings === null,
    primaryAction: getPrimaryActionButton(primaryActionIsRunning, canBeActivated, hasConfiguredFolder),
    runPrimaryAction: canBeActivated ? onActivate : storage.requestGoogleDriveSetup
  }
}

export interface DrivePanelState {
  isValid: boolean
  isActive: boolean
  statusView: { label: string; tone: BadgeTone }
  validatedAt: string | null
  errorMessage: string | null
  hasFolder: boolean
  googleSignInIsRunning: boolean
  primaryActionIsRunning: boolean
  controlsAreDisabled: boolean
  primaryAction: { icon: string; label: string }
  runPrimaryAction: () => void
}

function getPrimaryActionButton(
  isRunning: boolean,
  canBeActivated: boolean,
  hasConfiguredFolder: boolean
): { icon: string; label: string } {
  if (isRunning) {
    return { icon: 'progress_activity', label: 'Working...' }
  }

  if (canBeActivated) {
    return { icon: 'swap_horiz', label: 'Activate Google Drive' }
  }

  return {
    icon: hasConfiguredFolder ? 'sync' : 'create_new_folder',
    label: hasConfiguredFolder ? 'Recheck Drive folder' : 'Set up Drive folder'
  }
}
