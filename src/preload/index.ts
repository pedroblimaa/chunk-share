import { contextBridge } from 'electron'
import type {
  CloudStorageProvider,
  CloudStorageProviderSwitchRequest,
  StorageProviderCopyProgress
} from '../shared/cloud-storage.model'
import type { ServerConfig } from '../shared/domain'
import {
  AUTH_GET_SESSION_CHANNEL,
  AUTH_SIGN_IN_WITH_GOOGLE_CHANNEL,
  AUTH_SIGN_OUT_CHANNEL,
  DASHBOARD_SNAPSHOT_CHANNEL,
  DASHBOARD_SELECT_WORLD_CHANNEL,
  DRIVE_JOIN_CONSUME_PENDING_LINK_CHANNEL,
  DRIVE_JOIN_LINK_AVAILABLE_CHANNEL,
  DRIVE_JOIN_WORLD_CHANNEL,
  DRIVE_SHARING_GET_AVAILABILITY_CHANNEL,
  DRIVE_SHARING_INVITE_MEMBER_CHANNEL,
  DRIVE_SHARING_REVOKE_MEMBER_CHANNEL,
  SERVER_RUNTIME_EVENTS_CHANNEL,
  SERVER_RUNTIME_DOWNLOAD_SHARED_SAVE_CHANNEL,
  SERVER_RUNTIME_SNAPSHOT_CHANNEL,
  SERVER_RUNTIME_START_CHANNEL,
  SERVER_RUNTIME_STOP_CHANNEL,
  SERVER_SETUP_LIST_VANILLA_VERSIONS_CHANNEL,
  SERVER_SETUP_DOWNLOAD_SHARED_SERVER_CHANNEL,
  SERVER_SETUP_PROGRESS_CHANNEL,
  SERVER_SETUP_SETUP_VANILLA_SERVER_CHANNEL,
  STORAGE_CLEAR_GOOGLE_DRIVE_FOLDER_CHANNEL,
  STORAGE_CLOUD_SETTINGS_CHANNEL,
  STORAGE_DELETE_SERVER_CHANNEL,
  STORAGE_GET_PROVIDER_SWITCH_PREVIEW_CHANNEL,
  STORAGE_OPERATION_EVENTS_CHANNEL,
  STORAGE_OPERATION_SNAPSHOT_CHANNEL,
  STORAGE_PROVIDER_COPY_PROGRESS_CHANNEL,
  STORAGE_RESET_SERVER_LOCK_CHANNEL,
  STORAGE_SAVE_SERVER_CONFIG_CHANNEL,
  STORAGE_SET_PROVIDER_CHANNEL,
  STORAGE_SETUP_GOOGLE_DRIVE_FOLDER_CHANNEL,
  STORAGE_SNAPSHOT_CHANNEL,
  STORAGE_VALIDATE_GOOGLE_DRIVE_FOLDER_CHANNEL
} from '../shared/ipc-channels'
import type { ServerRuntimeEvent } from '../shared/server-runtime'
import type { StorageOperationSnapshot } from '../shared/storage-operation'
import type {
  ServerSetupProgressEvent,
  DownloadSharedServerInput,
  SetupVanillaServerInput
} from '../shared/server-setup'
import { invokeIpc, subscribeToIpcEvent } from './typed-ipc'

const chunkShareApi = {
  auth: {
    getSession: () => invokeIpc(AUTH_GET_SESSION_CHANNEL),
    signInWithGoogle: () => invokeIpc(AUTH_SIGN_IN_WITH_GOOGLE_CHANNEL),
    signOut: () => invokeIpc(AUTH_SIGN_OUT_CHANNEL)
  },
  dashboard: {
    getSnapshot: () => invokeIpc(DASHBOARD_SNAPSHOT_CHANNEL),
    selectWorld: (worldId: string) => invokeIpc(DASHBOARD_SELECT_WORLD_CHANNEL, worldId)
  },
  driveJoin: {
    consumePendingLink: () => invokeIpc(DRIVE_JOIN_CONSUME_PENDING_LINK_CHANNEL),
    joinWorld: (joinLink: string) => invokeIpc(DRIVE_JOIN_WORLD_CHANNEL, joinLink),
    onLinkAvailable: (listener: () => void): (() => void) =>
      subscribeToIpcEvent(DRIVE_JOIN_LINK_AVAILABLE_CHANNEL, listener)
  },
  driveSharing: {
    getAvailability: () => invokeIpc(DRIVE_SHARING_GET_AVAILABILITY_CHANNEL),
    inviteMember: (email: string) => invokeIpc(DRIVE_SHARING_INVITE_MEMBER_CHANNEL, email),
    revokeMember: (permissionId: string) => invokeIpc(DRIVE_SHARING_REVOKE_MEMBER_CHANNEL, permissionId)
  },
  serverRuntime: {
    getSnapshot: () => invokeIpc(SERVER_RUNTIME_SNAPSHOT_CHANNEL),
    downloadSharedSave: () => invokeIpc(SERVER_RUNTIME_DOWNLOAD_SHARED_SAVE_CHANNEL),
    start: () => invokeIpc(SERVER_RUNTIME_START_CHANNEL),
    stop: () => invokeIpc(SERVER_RUNTIME_STOP_CHANNEL),
    onEvent: (listener: (event: ServerRuntimeEvent) => void): (() => void) =>
      subscribeToIpcEvent(SERVER_RUNTIME_EVENTS_CHANNEL, listener)
  },
  storage: {
    getSnapshot: () => invokeIpc(STORAGE_SNAPSHOT_CHANNEL),
    getCloudStorageSettings: () => invokeIpc(STORAGE_CLOUD_SETTINGS_CHANNEL),
    getOperationSnapshot: () => invokeIpc(STORAGE_OPERATION_SNAPSHOT_CHANNEL),
    onOperationChanged: (listener: (snapshot: StorageOperationSnapshot) => void): (() => void) =>
      subscribeToIpcEvent(STORAGE_OPERATION_EVENTS_CHANNEL, listener),
    setupGoogleDriveFolder: () => invokeIpc(STORAGE_SETUP_GOOGLE_DRIVE_FOLDER_CHANNEL),
    validateGoogleDriveFolder: () => invokeIpc(STORAGE_VALIDATE_GOOGLE_DRIVE_FOLDER_CHANNEL),
    clearGoogleDriveFolder: () => invokeIpc(STORAGE_CLEAR_GOOGLE_DRIVE_FOLDER_CHANNEL),
    getCloudStorageProviderSwitchPreview: (provider: CloudStorageProvider) =>
      invokeIpc(STORAGE_GET_PROVIDER_SWITCH_PREVIEW_CHANNEL, provider),
    setCloudStorageProvider: (request: CloudStorageProviderSwitchRequest) =>
      invokeIpc(STORAGE_SET_PROVIDER_CHANNEL, request),
    onProviderCopyProgress: (listener: (progress: StorageProviderCopyProgress) => void): (() => void) =>
      subscribeToIpcEvent(STORAGE_PROVIDER_COPY_PROGRESS_CHANNEL, listener),
    deleteServer: (worldId: string) => invokeIpc(STORAGE_DELETE_SERVER_CHANNEL, worldId),
    resetServerLock: () => invokeIpc(STORAGE_RESET_SERVER_LOCK_CHANNEL),
    saveServerConfig: (serverConfig: ServerConfig) =>
      invokeIpc(STORAGE_SAVE_SERVER_CONFIG_CHANNEL, serverConfig)
  },
  serverSetup: {
    listVanillaVersions: () => invokeIpc(SERVER_SETUP_LIST_VANILLA_VERSIONS_CHANNEL),
    downloadSharedServer: (input: DownloadSharedServerInput) =>
      invokeIpc(SERVER_SETUP_DOWNLOAD_SHARED_SERVER_CHANNEL, input),
    setupVanillaServer: (input: SetupVanillaServerInput) =>
      invokeIpc(SERVER_SETUP_SETUP_VANILLA_SERVER_CHANNEL, input),
    onProgress: (listener: (event: ServerSetupProgressEvent) => void): (() => void) =>
      subscribeToIpcEvent(SERVER_SETUP_PROGRESS_CHANNEL, listener)
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
