import type {
  CloudStorageProvider,
  CloudStorageProviderSwitchDataMode,
  CloudStorageProviderSwitchPreview,
  CloudStorageSettings
} from '../../../../../../shared/cloud-storage.model'
import type { ActiveStorageSettingsOperation, GoogleDriveStatusViewMap } from '../../settings.model'

export type StorageModeProvider = CloudStorageProvider.Local | CloudStorageProvider.GoogleDrive

export interface StorageModeSettingsCardProps {
  storageErrorMessage: string | null
  storageProviderSwitchPreview: CloudStorageProviderSwitchPreview | null
  storageProviderSettings: CloudStorageSettings | null
  activeStorageOperation: ActiveStorageSettingsOperation
  storageIsBusy: boolean
  googleDriveStatusViewMap: GoogleDriveStatusViewMap
  onClearGoogleDriveFolder: () => Promise<boolean>
  onCancelStorageProviderSwitch: () => void
  onDismissStorageError: () => void
  onPrepareStorageProviderSwitch: (provider: CloudStorageProvider) => void
  onSetupDefaultGoogleDriveFolder: () => void
  onSwitchStorageProvider: (
    provider: CloudStorageProvider,
    dataMode: CloudStorageProviderSwitchDataMode,
    expectedPreview?: CloudStorageProviderSwitchPreview
  ) => void
  onValidateGoogleDriveFolder: () => void
}
