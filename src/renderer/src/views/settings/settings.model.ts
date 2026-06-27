import type { GoogleDriveSetupStatus } from '../../../../shared/cloud-storage.model'
import type { BadgeTone } from '../../components/shared/Badge/Badge.model'

export interface GoogleDriveStatusView {
  label: string
  tone: BadgeTone
}

export enum StorageSettingsOperation {
  ClearGoogleDriveFolder = 'clear-google-drive-folder',
  CopyProviderData = 'copy-provider-data',
  Load = 'load',
  PreviewProviderSwitch = 'preview-provider-switch',
  SetupGoogleDriveFolder = 'setup-google-drive-folder',
  SwitchProvider = 'switch-provider'
}

export type ActiveStorageSettingsOperation = StorageSettingsOperation | null

export type GoogleDriveStatusViewMap = Record<GoogleDriveSetupStatus, GoogleDriveStatusView>
