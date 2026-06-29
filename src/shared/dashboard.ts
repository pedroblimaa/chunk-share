import type { ServerStatus } from './domain'
import type { ServerConnectionAddress } from './server-runtime'
import type { ServerSyncSnapshot } from './server-sync'

export type { ServerStatus } from './domain'

export enum ServerAvailability {
  LocalReady = 'local-ready',
  None = 'none',
  RemoteAvailable = 'remote-available'
}

export interface SignedInUser {
  id: string
  name: string
  email: string
  avatarUrl: string | null
  avatarInitials: string
}

export interface AllowedPlayer {
  id: string
  name: string
  status: 'online' | 'offline'
}

export interface ServerResourceUsage {
  cpuPercent: number
  memoryUsedMb: number
  memoryTotalMb: number
  isMocked: boolean
}

export interface PlayerSummary {
  online: number
  max: number
}

export interface ConsoleLogLine {
  id: string
  timestamp: string
  source: string
  message: string
  tone: 'default' | 'success' | 'warning' | 'error'
}

export interface ServerDisplayState {
  signedInUser: SignedInUser | null
  serverAvailability: ServerAvailability
  serverName: string
  serverStatus: ServerStatus
  serverType: string
  minecraftVersion: string
  currentHost: string | null
  syncStatus: ServerSyncSnapshot
  connectionAddress: string | null
  connectionAddresses: ServerConnectionAddress[]
  players: PlayerSummary
  resources: ServerResourceUsage
  consoleLogs: ConsoleLogLine[]
  allowedPlayers: AllowedPlayer[]
}
