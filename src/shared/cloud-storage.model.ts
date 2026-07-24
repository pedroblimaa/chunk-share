export enum CloudStorageProvider {
  Local = 'local',
  GoogleDrive = 'google-drive'
}

export enum StorageSwitchDataMode {
  CopyCurrentToTarget = 'copy-current-to-target',
  UseTargetAsIs = 'use-target-as-is'
}

export enum StorageProviderCopyPhase {
  PreparingSource = 'preparing-source',
  PreparingTarget = 'preparing-target',
  Copying = 'copying',
  Finalizing = 'finalizing',
  Restoring = 'restoring'
}

export enum GoogleDriveSetupStatus {
  NotConfigured = 'not-configured',
  NeedsAuth = 'needs-auth',
  Valid = 'valid',
  Blocked = 'blocked'
}

export interface GoogleDriveFolderConfig {
  folderId: string
  folderName: string
  ownerAccountId: string | null
  worldFileIds: GoogleDriveWorldFileIds | null
  configuredAt: string
  validatedAt: string | null
}

export interface GoogleDriveWorldFileIds {
  controlFileId: string
  worldFileId: string
}

export interface GoogleDriveWorldReference extends GoogleDriveWorldFileIds {
  folderId: string
}

export interface GoogleDriveStorageState {
  status: GoogleDriveSetupStatus
  folder: GoogleDriveFolderConfig | null
  errorMessage: string | null
}

export interface CloudStorageSettings {
  activeProvider: CloudStorageProvider
  googleDrive: GoogleDriveStorageState
}

export interface CloudStorageProviderDataSummary {
  provider: CloudStorageProvider
  latestSaveVersion: number | null
  latestSaveRecordedAt: string | null
  hasWorldFile: boolean
}

export interface CloudStorageProviderSwitchPreview {
  source: CloudStorageProviderDataSummary
  target: CloudStorageProviderDataSummary
}

export interface StorageProviderCopyProgress {
  phase: StorageProviderCopyPhase
  completedFiles: number
  totalFiles: number
}

export type CloudStorageProviderSwitchRequest =
  | {
      provider: CloudStorageProvider
      dataMode: StorageSwitchDataMode.UseTargetAsIs
    }
  | {
      provider: CloudStorageProvider
      dataMode: StorageSwitchDataMode.CopyCurrentToTarget
      expectedPreview: CloudStorageProviderSwitchPreview
    }
