import { ipcMain } from 'electron'
import {
  STORAGE_CLEAR_GOOGLE_DRIVE_FOLDER_CHANNEL,
  STORAGE_CLOUD_SETTINGS_CHANNEL,
  STORAGE_DELETE_SERVER_CHANNEL,
  STORAGE_GET_PROVIDER_SWITCH_PREVIEW_CHANNEL,
  STORAGE_PROVIDER_COPY_PROGRESS_CHANNEL,
  STORAGE_RESET_SERVER_LOCK_CHANNEL,
  STORAGE_SAVE_SERVER_CONFIG_CHANNEL,
  STORAGE_SET_PROVIDER_CHANNEL,
  STORAGE_SETUP_GOOGLE_DRIVE_FOLDER_CHANNEL,
  STORAGE_SNAPSHOT_CHANNEL,
  STORAGE_VALIDATE_GOOGLE_DRIVE_FOLDER_CHANNEL
} from '../../shared/ipc-channels'
import {
  clearGoogleDriveFolder,
  getCloudStorageSettings,
  getCloudStorageProviderSwitchPreview as getStorageProviderSwitchPreview,
  setCloudStorageProvider,
  setupGoogleDriveFolder,
  validateGoogleDriveFolder
} from '../storage/core/cloud-storage-service'
import {
  deleteConfiguredServer,
  getStorageSnapshot,
  resetServerLock,
  updateServerConfig
} from '../storage/core/storage-service'
import { StorageError } from '../storage/core/storage-error'
import {
  isCloudStorageProvider as isValidProvider,
  isCloudStorageProviderSwitchRequest as isValidProviderSwitchRequest,
  isServerConfig
} from '../storage/core/storage-validation'

export function registerStorageIpcHandlers(): void {
  ipcMain.handle(STORAGE_SNAPSHOT_CHANNEL, () => getStorageSnapshot())

  ipcMain.handle(STORAGE_CLOUD_SETTINGS_CHANNEL, () => getCloudStorageSettings())

  ipcMain.handle(STORAGE_SETUP_GOOGLE_DRIVE_FOLDER_CHANNEL, () => setupGoogleDriveFolder())

  ipcMain.handle(STORAGE_VALIDATE_GOOGLE_DRIVE_FOLDER_CHANNEL, () => validateGoogleDriveFolder())

  ipcMain.handle(STORAGE_CLEAR_GOOGLE_DRIVE_FOLDER_CHANNEL, () => clearGoogleDriveFolder())

  ipcMain.handle(STORAGE_GET_PROVIDER_SWITCH_PREVIEW_CHANNEL, (_, provider: unknown) => {
    if (!isValidProvider(provider)) {
      throw new StorageError('Invalid cloud storage provider preview payload.')
    }

    return getStorageProviderSwitchPreview(provider)
  })

  ipcMain.handle(STORAGE_SET_PROVIDER_CHANNEL, (event, request: unknown) => {
    if (!isValidProviderSwitchRequest(request)) {
      throw new StorageError('Invalid cloud storage provider switch payload.')
    }

    return setCloudStorageProvider(request, (progress) => {
      try {
        if (!event.sender.isDestroyed()) {
          event.sender.send(STORAGE_PROVIDER_COPY_PROGRESS_CHANNEL, progress)
        }
      } catch {
        // Progress reporting must not interrupt a storage copy already in flight.
      }
    })
  })

  ipcMain.handle(STORAGE_DELETE_SERVER_CHANNEL, () => deleteConfiguredServer())

  ipcMain.handle(STORAGE_RESET_SERVER_LOCK_CHANNEL, () => resetServerLock())

  ipcMain.handle(STORAGE_SAVE_SERVER_CONFIG_CHANNEL, (_, serverConfig: unknown) => {
    if (!isServerConfig(serverConfig)) {
      throw new StorageError('Invalid server config payload.')
    }

    return updateServerConfig(serverConfig)
  })
}
