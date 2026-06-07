import { contextBridge, ipcRenderer } from 'electron'
import type { DashboardSnapshot } from '../shared/dashboard'
import {
  AUTH_SIGN_IN_WITH_GOOGLE_CHANNEL,
  DASHBOARD_SNAPSHOT_CHANNEL
} from '../shared/ipc-channels'

const chunkShareApi = {
  auth: {
    signInWithGoogle: (): Promise<DashboardSnapshot> =>
      ipcRenderer.invoke(AUTH_SIGN_IN_WITH_GOOGLE_CHANNEL)
  },
  dashboard: {
    getSnapshot: (): Promise<DashboardSnapshot> => ipcRenderer.invoke(DASHBOARD_SNAPSHOT_CHANNEL)
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
