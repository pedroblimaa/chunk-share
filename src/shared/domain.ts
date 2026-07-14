import type { ServerSyncSnapshot } from './server-sync'

export type ServerStatus =
  | 'not-configured'
  | 'stopped'
  | 'updating'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'crashed'
  | 'error'

export type ServerType = 'vanilla' | 'paper' | 'fabric' | 'forge'

export type MinecraftVersion = string

export enum ServerLockStatus {
  Unlocked = 'unlocked',
  Locked = 'locked'
}

export enum ServerHostingStatus {
  Starting = 'starting',
  Running = 'running',
  Stopping = 'stopping'
}

export interface Player {
  id: string
  displayName: string
  email: string
  avatarUrl: string | null
  avatarInitials: string
}

export interface ServerConnectionAddress {
  label: string
  address: string
  isPrimary: boolean
}

export interface ServerConfig {
  name: string
  serverType: ServerType
  minecraftVersion: MinecraftVersion
  serverFolderPath: string | null
  port: number
}

export interface JavaConfig {
  mode: 'system' | 'custom'
  executablePath: string | null
  detectedVersion: string | null
  isValidated: boolean
}

export type ServerSetupStatus = 'not-configured' | 'downloading' | 'ready' | 'error'

export interface ServerSetupState {
  status: ServerSetupStatus
  errorMessage: string | null
  completedAt: string | null
}

export type LatestSave = {
  saveVersion: number
  fileName: string
  uploadedAt: string
  uploadedBy: Player
  serverName?: string
  minecraftVersion: MinecraftVersion
  serverType: ServerType
} | null

export type ServerLock =
  | {
      status: ServerLockStatus.Unlocked
    }
  | {
      status: ServerLockStatus.Locked
      lockedBy: Player
      sessionId: string
      saveVersion: number
      hostingStatus: ServerHostingStatus
      startedAt: string
      lastHeartbeat: string
      connectionAddresses: ServerConnectionAddress[]
    }

export interface LocalState {
  player: Player | null
  serverConfig: ServerConfig
  javaConfig: JavaConfig
  serverSetup: ServerSetupState
  localSaveVersion: number | null
  activeSessionId: string | null
  dirty: boolean
}

export interface ServerStorageSnapshot {
  latestSave: LatestSave
  serverLock: ServerLock
  serverSync: ServerSyncSnapshot
  localState: LocalState
}
