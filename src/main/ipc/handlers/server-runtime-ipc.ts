import { BrowserWindow } from 'electron'
import type { ServerRuntimeEvent } from '../../../shared/server-runtime'
import {
  SERVER_RUNTIME_EVENTS_CHANNEL,
  SERVER_RUNTIME_DOWNLOAD_SHARED_SAVE_CHANNEL,
  SERVER_RUNTIME_SNAPSHOT_CHANNEL,
  SERVER_RUNTIME_START_CHANNEL,
  SERVER_RUNTIME_STOP_CHANNEL
} from '../../../shared/ipc-channels'
import {
  downloadLatestSharedSave,
  getServerRuntimeSnapshot,
  startMinecraftServer,
  stopMinecraftServer,
  subscribeToServerRuntime
} from '../../server-runtime/server-runtime-service'
import { handleIpc, sendIpcEvent } from '../typed-ipc'

export function registerServerRuntimeIpcHandlers(): void {
  handleIpc(SERVER_RUNTIME_SNAPSHOT_CHANNEL, () => getServerRuntimeSnapshot())
  handleIpc(SERVER_RUNTIME_DOWNLOAD_SHARED_SAVE_CHANNEL, () => downloadLatestSharedSave())
  handleIpc(SERVER_RUNTIME_START_CHANNEL, () => startMinecraftServer())
  handleIpc(SERVER_RUNTIME_STOP_CHANNEL, () => stopMinecraftServer())

  subscribeToServerRuntime((runtimeEvent: ServerRuntimeEvent) => {
    BrowserWindow.getAllWindows().forEach((browserWindow) => {
      sendIpcEvent(browserWindow.webContents, SERVER_RUNTIME_EVENTS_CHANNEL, runtimeEvent)
    })
  })
}
