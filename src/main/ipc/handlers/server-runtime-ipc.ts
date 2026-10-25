import { BrowserWindow } from 'electron'
import { confirmSaveDownload } from '../../storage/server-save/confirm-save-download'
import type { ServerRuntimeEvent } from '../../../shared/server-runtime'
import {
  SERVER_SAVE_CONFIRM_DOWNLOAD_CHANNEL,
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
import { withSaveConflict } from '../server-save-conflict'
import { handleIpc, sendIpcEvent } from '../typed-ipc'

export function registerServerRuntimeIpcHandlers(): void {
  handleIpc(SERVER_SAVE_CONFIRM_DOWNLOAD_CHANNEL, (_, token: unknown) => {
    if (typeof token !== 'string') {
      throw new Error('Invalid download confirmation.')
    }

    return confirmSaveDownload(token)
  })
  handleIpc(SERVER_RUNTIME_SNAPSHOT_CHANNEL, () => getServerRuntimeSnapshot())
  handleIpc(SERVER_RUNTIME_DOWNLOAD_SHARED_SAVE_CHANNEL, () =>
    withSaveConflict(() => downloadLatestSharedSave())
  )
  handleIpc(SERVER_RUNTIME_START_CHANNEL, () => withSaveConflict(() => startMinecraftServer()))
  handleIpc(SERVER_RUNTIME_STOP_CHANNEL, () => stopMinecraftServer())

  subscribeToServerRuntime((runtimeEvent: ServerRuntimeEvent) => {
    BrowserWindow.getAllWindows().forEach((browserWindow) => {
      sendIpcEvent(browserWindow.webContents, SERVER_RUNTIME_EVENTS_CHANNEL, runtimeEvent)
    })
  })
}
