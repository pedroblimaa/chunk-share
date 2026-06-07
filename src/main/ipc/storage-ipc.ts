import { ipcMain } from 'electron'
import {
  STORAGE_SAVE_SERVER_CONFIG_CHANNEL,
  STORAGE_SNAPSHOT_CHANNEL
} from '../../shared/ipc-channels'
import { getStorageSnapshot, updateServerConfig } from '../storage/storage-service'
import { StorageError } from '../storage/storage-error'
import { isServerConfig } from '../storage/storage-validation'

export function registerStorageIpcHandlers(): void {
  ipcMain.handle(STORAGE_SNAPSHOT_CHANNEL, () => getStorageSnapshot())

  ipcMain.handle(STORAGE_SAVE_SERVER_CONFIG_CHANNEL, (_, serverConfig: unknown) => {
    if (!isServerConfig(serverConfig)) {
      throw new StorageError('Invalid server config payload.')
    }

    return updateServerConfig(serverConfig)
  })
}
