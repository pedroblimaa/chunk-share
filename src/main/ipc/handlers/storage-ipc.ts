import { ipcMain } from 'electron'
import {
  STORAGE_CLEAR_GOOGLE_DRIVE_FOLDER_CHANNEL,
  STORAGE_CLOUD_SETTINGS_CHANNEL,
  STORAGE_DELETE_SERVER_CHANNEL,
  STORAGE_GET_PROVIDER_SWITCH_PREVIEW_CHANNEL,
  STORAGE_RESET_SERVER_LOCK_CHANNEL,
  STORAGE_SAVE_SERVER_CONFIG_CHANNEL,
  STORAGE_SET_PROVIDER_CHANNEL,
  STORAGE_SETUP_GOOGLE_DRIVE_FOLDER_CHANNEL,
  STORAGE_SNAPSHOT_CHANNEL,
  STORAGE_VALIDATE_GOOGLE_DRIVE_FOLDER_CHANNEL
} from '../../../shared/ipc-channels'
// TODO: Standardize service imports across auth, dashboard, server-runtime, server-setup,
// cloud-storage, and storage IPC handlers with namespace imports such as `* as storageService`.
import {
  clearGoogleDriveFolder,
  getCloudStorageSettings,
  getCloudStorageProviderSwitchPreview as getStorageProviderSwitchPreview,
  setCloudStorageProvider,
  setupGoogleDriveFolder,
  validateGoogleDriveFolder
} from '../../storage/core/cloud-storage-service'
import {
  deleteConfiguredWorld,
  getStorageSnapshot,
  resetServerLock,
  updateServerConfig
} from '../../storage/core/storage-service'
import { isWorldId } from '../../../shared/world'
import { StorageError } from '../../storage/core/support/storage-error'
import {
  isCloudStorageProvider as isValidProvider,
  isValidProviderSwitchRequest,
  isServerConfig
} from '../../storage/core/support/storage-validation'
import { createCopyProgressSender } from '../support/storage-progress-sender'

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

    return setCloudStorageProvider(request, createCopyProgressSender(event.sender))
  })

  ipcMain.handle(STORAGE_DELETE_SERVER_CHANNEL, (_, worldId: unknown) => {
    if (!isWorldId(worldId)) {
      throw new StorageError('Invalid world deletion payload.')
    }

    return deleteConfiguredWorld(worldId)
  })

  ipcMain.handle(STORAGE_RESET_SERVER_LOCK_CHANNEL, () => resetServerLock())

  ipcMain.handle(STORAGE_SAVE_SERVER_CONFIG_CHANNEL, (_, serverConfig: unknown) => {
    if (!isServerConfig(serverConfig)) {
      throw new StorageError('Invalid server config payload.')
    }

    return updateServerConfig(serverConfig)
  })
}
