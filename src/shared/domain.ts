export type ServerStatus =
  | 'not-configured'
  | 'stopped'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'crashed'
  | 'error'

export type ServerType = 'vanilla' | 'paper' | 'fabric' | 'forge'

export type MinecraftVersion = string

export interface Player {
  id: string
  displayName: string
  email: string
  avatarInitials: string
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
  minecraftVersion: MinecraftVersion
  serverType: ServerType
} | null

export type ServerLock =
  | {
      status: 'unlocked'
    }
  | {
      status: 'locked'
      lockedBy: Player
      sessionId: string
      saveVersion: number
      startedAt: string
      lastHeartbeat: string
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

export interface StorageSnapshot {
  latestSave: LatestSave
  serverLock: ServerLock
  localState: LocalState
}
