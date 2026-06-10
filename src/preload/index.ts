import { contextBridge, ipcRenderer } from 'electron'
import type { DashboardSnapshot } from '../shared/dashboard'
import type { ServerConfig, StorageSnapshot } from '../shared/domain'
import type { SetupVanillaServerInput, VanillaMinecraftVersion } from '../shared/server-setup'
import {
  AUTH_SIGN_IN_WITH_GOOGLE_CHANNEL,
  DASHBOARD_SNAPSHOT_CHANNEL,
  SERVER_SETUP_LIST_VANILLA_VERSIONS_CHANNEL,
  SERVER_SETUP_SETUP_VANILLA_SERVER_CHANNEL,
  STORAGE_SAVE_SERVER_CONFIG_CHANNEL,
  STORAGE_SNAPSHOT_CHANNEL
} from '../shared/ipc-channels'

const chunkShareApi = {
  auth: {
    signInWithGoogle: (): Promise<DashboardSnapshot> =>
      ipcRenderer.invoke(AUTH_SIGN_IN_WITH_GOOGLE_CHANNEL)
  },
  dashboard: {
    getSnapshot: (): Promise<DashboardSnapshot> => ipcRenderer.invoke(DASHBOARD_SNAPSHOT_CHANNEL)
  },
  storage: {
    getSnapshot: (): Promise<StorageSnapshot> => ipcRenderer.invoke(STORAGE_SNAPSHOT_CHANNEL),
    saveServerConfig: (serverConfig: ServerConfig): Promise<StorageSnapshot> =>
      ipcRenderer.invoke(STORAGE_SAVE_SERVER_CONFIG_CHANNEL, serverConfig)
  },
  serverSetup: {
    listVanillaVersions: (): Promise<VanillaMinecraftVersion[]> =>
      ipcRenderer.invoke(SERVER_SETUP_LIST_VANILLA_VERSIONS_CHANNEL),
    setupVanillaServer: (input: SetupVanillaServerInput): Promise<StorageSnapshot> =>
      ipcRenderer.invoke(SERVER_SETUP_SETUP_VANILLA_SERVER_CHANNEL, input)
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
