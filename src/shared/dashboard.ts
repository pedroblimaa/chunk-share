export type ServerStatus = 'not-configured' | 'stopped' | 'starting' | 'running' | 'crashed'

export interface MockUser {
  id: string
  name: string
  email: string
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

export interface DashboardSnapshot {
  signedInUser: MockUser | null
  serverName: string
  serverStatus: ServerStatus
  serverType: string
  minecraftVersion: string
  lastActiveLabel: string
  currentHost: string | null
  latestSaveLabel: string
  worldVersion: number
  connectionAddress: string | null
  players: PlayerSummary
  resources: ServerResourceUsage
  consoleLogs: ConsoleLogLine[]
  allowedPlayers: AllowedPlayer[]
}
