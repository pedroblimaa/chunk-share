export enum CloudStorageProvider {
  Local = 'local',
  GoogleDrive = 'google-drive'
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
  configuredAt: string
  validatedAt: string | null
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
  versionCount: number
}

export interface CloudStorageProviderSwitchPreview {
  source: CloudStorageProviderDataSummary
  target: CloudStorageProviderDataSummary
}
