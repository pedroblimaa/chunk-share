export type ServerStatus = 'not-configured' | 'stopped' | 'starting' | 'running' | 'crashed'

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

export type LatestWorld =
  | {
      status: 'empty'
    }
  | {
      status: 'ready'
      worldVersion: number
      fileName: string
      uploadedAt: string
      uploadedBy: Player
    }

export type ServerLock =
  | {
      status: 'unlocked'
    }
  | {
      status: 'locked'
      lockedBy: Player
      sessionId: string
      worldVersion: number
      startedAt: string
      lastHeartbeat: string
    }

export interface LocalState {
  player: Player | null
  serverConfig: ServerConfig
  javaConfig: JavaConfig
  localWorldVersion: number | null
  activeSessionId: string | null
  dirty: boolean
}

export interface StorageSnapshot {
  latestWorld: LatestWorld
  serverLock: ServerLock
  localState: LocalState
}
