import type { ReactNode } from 'react'
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
  SwitchProvider = 'switch-provider'
}

export type GoogleDriveStatusViewMap = Record<GoogleDriveSetupStatus, GoogleDriveStatusView>

export interface StorageProviderOperationState {
  errorMessage: string | null
  isBusy: boolean
  operation: StorageSettingsOperation
}

export interface StorageProviderSettingsController {
  storageProviderSettings: CloudStorageSettings | null
  storageProviderSwitchPreview: CloudStorageProviderSwitchPreview | null
  activeStorageProvider: CloudStorageProvider | null
  operationState: StorageProviderOperationState
  dismissStorageError: () => void
  requestGoogleDriveDisconnect: () => Promise<boolean>
  requestGoogleDriveSetup: () => void
  requestStorageProviderSwitch: (provider: CloudStorageProvider) => void
  requestStorageProviderSwitchPreview: (provider: CloudStorageProvider) => void
  resetStorageProviderSwitchPreview: () => void
}

export interface StorageProviderSettingsProviderProps {
  children: ReactNode
}
