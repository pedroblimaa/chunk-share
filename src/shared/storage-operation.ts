export enum ExclusiveStorageOperation {
  ServerDownload = 'server-download',
  ServerDelete = 'server-delete',
  ServerSetup = 'server-setup',
  StorageSettingsChange = 'storage-settings-change',
  ServerStart = 'server-start'
}

export interface StorageOperationSnapshot {
  activeOperation: ExclusiveStorageOperation | null
  revision: number
}
