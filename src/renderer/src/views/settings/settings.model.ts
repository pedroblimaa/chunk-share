import type {
  CloudStorageProvider,
  CloudStorageProviderSwitchPreview,
  CloudStorageSettings,
  GoogleDriveSetupStatus
} from '../../../../shared/cloud-storage.model'
import type { BadgeTone } from '../../components/shared/Badge/Badge.model'

export interface GoogleDriveStatusView {
  label: string
  tone: BadgeTone
}

export enum StorageSettingsOperation {
  ClearGoogleDriveFolder = 'clear-google-drive-folder',
  Idle = 'idle',
  Load = 'load',
  PreviewProviderSwitch = 'preview-provider-switch',
  SetupGoogleDriveFolder = 'setup-google-drive-folder',
  SwitchProvider = 'switch-provider',
  ValidateGoogleDriveFolder = 'validate-google-drive-folder'
}

export type GoogleDriveStatusViewMap = Record<GoogleDriveSetupStatus, GoogleDriveStatusView>

export interface StorageProviderSettingsController {
  storageProviderSettings: CloudStorageSettings | null
  storageErrorMessage: string | null
  storageProviderSwitchPreview: CloudStorageProviderSwitchPreview | null
  activeStorageOperation: StorageSettingsOperation
  storageIsBusy: boolean
  cancelStorageProviderSwitch: () => void
  clearGoogleDriveFolder: () => Promise<boolean>
  dismissStorageError: () => void
  loadStorageSwitchPreview: (provider: CloudStorageProvider) => void
  setupDefaultGoogleDriveFolder: () => void
  switchStorageProvider: (provider: CloudStorageProvider) => void
  validateGoogleDriveFolder: () => void
}
