import type {
  CloudStorageProvider,
  CloudStorageSettings
} from '../../../../../../shared/cloud-storage.model'
import type { GoogleDriveSettingsActionState, GoogleDriveStatusViewMap } from '../../settings.model'

export type StorageModeProvider = CloudStorageProvider.Local | CloudStorageProvider.GoogleDrive

export interface ProviderSwitchChoiceProps {
  isBusy: boolean
  providerLabel: string
  onCancel: () => void
  onSwitch: () => void
}

export interface StorageModeSettingsCardProps {
  cloudStorageErrorMessage: string | null
  cloudStorageSettings: CloudStorageSettings | null
  googleDriveAction: GoogleDriveSettingsActionState
  googleDriveIsBusy: boolean
  googleDriveStatusViewMap: GoogleDriveStatusViewMap
  onClearGoogleDriveFolder: () => void
  onDismissCloudStorageError: () => void
  onSetupDefaultGoogleDriveFolder: () => void
  onSwitchCloudStorageProvider: (provider: CloudStorageProvider) => void
  onValidateGoogleDriveFolder: () => void
}
