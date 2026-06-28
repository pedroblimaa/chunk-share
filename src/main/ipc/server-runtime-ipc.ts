import { BrowserWindow, ipcMain } from 'electron'
import type { ServerRuntimeEvent } from '../../shared/server-runtime'
import {
  SERVER_RUNTIME_EVENTS_CHANNEL,
  SERVER_RUNTIME_DOWNLOAD_SHARED_SAVE_CHANNEL,
  SERVER_RUNTIME_RECOVER_CHANNEL,
  SERVER_RUNTIME_RESTORE_SHARED_SAVE_CHANNEL,
  SERVER_RUNTIME_SNAPSHOT_CHANNEL,
  SERVER_RUNTIME_START_CHANNEL,
  SERVER_RUNTIME_STOP_CHANNEL
} from '../../shared/ipc-channels'
import {
  downloadLatestSharedSave,
  getServerRuntimeSnapshot,
  recoverMinecraftServer,
  restoreSharedSaveAfterRecovery,
  startMinecraftServer,
  stopMinecraftServer,
  subscribeToServerRuntime
} from '../server-runtime/server-runtime-service'

export function registerServerRuntimeIpcHandlers(): void {
  ipcMain.handle(SERVER_RUNTIME_SNAPSHOT_CHANNEL, () => getServerRuntimeSnapshot())
  ipcMain.handle(SERVER_RUNTIME_START_CHANNEL, () => startMinecraftServer())
  ipcMain.handle(SERVER_RUNTIME_STOP_CHANNEL, () => stopMinecraftServer())
  ipcMain.handle(SERVER_RUNTIME_RECOVER_CHANNEL, () => recoverMinecraftServer())
  ipcMain.handle(SERVER_RUNTIME_DOWNLOAD_SHARED_SAVE_CHANNEL, () => downloadLatestSharedSave())
  ipcMain.handle(SERVER_RUNTIME_RESTORE_SHARED_SAVE_CHANNEL, () => restoreSharedSaveAfterRecovery())

  subscribeToServerRuntime((runtimeEvent: ServerRuntimeEvent) => {
    BrowserWindow.getAllWindows().forEach((browserWindow) => {
      browserWindow.webContents.send(SERVER_RUNTIME_EVENTS_CHANNEL, runtimeEvent)
    })
  })
}
