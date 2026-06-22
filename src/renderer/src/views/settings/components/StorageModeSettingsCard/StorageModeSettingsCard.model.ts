import type { CloudStorageSettings } from '../../../../../../shared/cloud-storage.model'
import type { GoogleDriveSettingsActionState, GoogleDriveStatusViewMap } from '../../settings.model'

export interface StorageModeSettingsCardProps {
  cloudStorageSettings: CloudStorageSettings | null
  googleDriveAction: GoogleDriveSettingsActionState
  googleDriveErrorMessage: string | null
  googleDriveIsBusy: boolean
  googleDriveStatusViewMap: GoogleDriveStatusViewMap
  onClearGoogleDriveFolder: () => void
  onSetupDefaultGoogleDriveFolder: () => void
  onValidateGoogleDriveFolder: () => void
}
