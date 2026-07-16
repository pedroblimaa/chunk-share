import { CloudStorageProvider } from '../../../shared/cloud-storage.model'
import { StorageError } from '../core/support/storage-error'
import { hasValidGoogleDriveFolder } from '../core/support/storage-validation'
import { readCloudStorageSettings } from '../persistence/cloud-storage-settings-store'
import { googleDriveStorageAdapter } from './google-drive-storage-adapter'
import { localStorageAdapter } from './local-storage-adapter'
import type { StorageAdapter } from './storage-adapter.model'

export async function getActiveStorageAdapter(): Promise<StorageAdapter> {
  const settings = await readCloudStorageSettings()

  return getStorageAdapterForProvider(settings.activeProvider)
}

export async function getStorageAdapterForProvider(provider: CloudStorageProvider): Promise<StorageAdapter> {
  if (provider === CloudStorageProvider.Local) {
    return localStorageAdapter
  }

  const settings = await readCloudStorageSettings()

  if (!hasValidGoogleDriveFolder(settings.googleDrive)) {
    throw new StorageError(
      'Google Drive storage is selected, but the Drive folder is not configured or valid.'
    )
  }

  return googleDriveStorageAdapter
}
