import { contextBridge, ipcRenderer } from 'electron'
import type { CloudStorageSettings } from '../shared/cloud-storage.model'
import type { ServerDisplayState } from '../shared/dashboard'
import type { ServerConfig, ServerStorageSnapshot } from '../shared/domain'
import {
  AUTH_GET_SESSION_CHANNEL,
  AUTH_SIGN_IN_WITH_GOOGLE_CHANNEL,
  AUTH_SIGN_OUT_CHANNEL,
  DASHBOARD_SNAPSHOT_CHANNEL,
  SERVER_RUNTIME_EVENTS_CHANNEL,
  SERVER_RUNTIME_SNAPSHOT_CHANNEL,
  SERVER_RUNTIME_START_CHANNEL,
  SERVER_RUNTIME_STOP_CHANNEL,
  SERVER_SETUP_LIST_VANILLA_VERSIONS_CHANNEL,
  SERVER_SETUP_PROGRESS_CHANNEL,
  SERVER_SETUP_SETUP_VANILLA_SERVER_CHANNEL,
  STORAGE_CLOUD_SETTINGS_CHANNEL,
  STORAGE_DELETE_SERVER_CHANNEL,
  STORAGE_RESET_SERVER_LOCK_CHANNEL,
  STORAGE_SAVE_SERVER_CONFIG_CHANNEL,
  STORAGE_SETUP_GOOGLE_DRIVE_FOLDER_CHANNEL,
  STORAGE_SNAPSHOT_CHANNEL,
  STORAGE_VALIDATE_GOOGLE_DRIVE_FOLDER_CHANNEL
} from '../shared/ipc-channels'
import type { ServerRuntimeEvent, ServerRuntimeSnapshot } from '../shared/server-runtime'
import type {
  ServerSetupProgressEvent,
  SetupVanillaServerInput,
  VanillaMinecraftVersion
} from '../shared/server-setup'

const chunkShareApi = {
  auth: {
    getSession: (): Promise<ServerDisplayState> => ipcRenderer.invoke(AUTH_GET_SESSION_CHANNEL),
    signInWithGoogle: (): Promise<ServerDisplayState> =>
      ipcRenderer.invoke(AUTH_SIGN_IN_WITH_GOOGLE_CHANNEL),
    signOut: (): Promise<ServerDisplayState> => ipcRenderer.invoke(AUTH_SIGN_OUT_CHANNEL)
  },
  dashboard: {
    getSnapshot: (): Promise<ServerDisplayState> => ipcRenderer.invoke(DASHBOARD_SNAPSHOT_CHANNEL)
  },
  serverRuntime: {
    getSnapshot: (): Promise<ServerRuntimeSnapshot> =>
      ipcRenderer.invoke(SERVER_RUNTIME_SNAPSHOT_CHANNEL),
    start: (): Promise<ServerRuntimeSnapshot> => ipcRenderer.invoke(SERVER_RUNTIME_START_CHANNEL),
    stop: (): Promise<ServerRuntimeSnapshot> => ipcRenderer.invoke(SERVER_RUNTIME_STOP_CHANNEL),
    onEvent: (listener: (event: ServerRuntimeEvent) => void): (() => void) => {
      const runtimeListener = (_: Electron.IpcRendererEvent, event: ServerRuntimeEvent): void => {
        listener(event)
      }

      ipcRenderer.on(SERVER_RUNTIME_EVENTS_CHANNEL, runtimeListener)

      return () => ipcRenderer.removeListener(SERVER_RUNTIME_EVENTS_CHANNEL, runtimeListener)
    }
  },
  storage: {
    getSnapshot: (): Promise<ServerStorageSnapshot> => ipcRenderer.invoke(STORAGE_SNAPSHOT_CHANNEL),
    getCloudStorageSettings: (): Promise<CloudStorageSettings> =>
      ipcRenderer.invoke(STORAGE_CLOUD_SETTINGS_CHANNEL),
    setupGoogleDriveFolder: (): Promise<CloudStorageSettings> =>
      ipcRenderer.invoke(STORAGE_SETUP_GOOGLE_DRIVE_FOLDER_CHANNEL),
    validateGoogleDriveFolder: (): Promise<CloudStorageSettings> =>
      ipcRenderer.invoke(STORAGE_VALIDATE_GOOGLE_DRIVE_FOLDER_CHANNEL),
    deleteServer: (): Promise<ServerStorageSnapshot> =>
      ipcRenderer.invoke(STORAGE_DELETE_SERVER_CHANNEL),
    resetServerLock: (): Promise<ServerStorageSnapshot> =>
      ipcRenderer.invoke(STORAGE_RESET_SERVER_LOCK_CHANNEL),
    saveServerConfig: (serverConfig: ServerConfig): Promise<ServerStorageSnapshot> =>
      ipcRenderer.invoke(STORAGE_SAVE_SERVER_CONFIG_CHANNEL, serverConfig)
  },
  serverSetup: {
    listVanillaVersions: (): Promise<VanillaMinecraftVersion[]> =>
      ipcRenderer.invoke(SERVER_SETUP_LIST_VANILLA_VERSIONS_CHANNEL),
    setupVanillaServer: (input: SetupVanillaServerInput): Promise<ServerStorageSnapshot> =>
      ipcRenderer.invoke(SERVER_SETUP_SETUP_VANILLA_SERVER_CHANNEL, input),
    onProgress: (listener: (event: ServerSetupProgressEvent) => void): (() => void) => {
      const progressListener = (
        _: Electron.IpcRendererEvent,
        event: ServerSetupProgressEvent
      ): void => {
        listener(event)
      }

      ipcRenderer.on(SERVER_SETUP_PROGRESS_CHANNEL, progressListener)

      return () => ipcRenderer.removeListener(SERVER_SETUP_PROGRESS_CHANNEL, progressListener)
    }
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('chunkShare', chunkShareApi)
  } catch (error) {
    console.error(error)
  }
} else {
  throw new Error('ChunkShare requires contextIsolation to be enabled.')
}

export type ChunkShareApi = typeof chunkShareApi
