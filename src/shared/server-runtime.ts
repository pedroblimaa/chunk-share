import type { ServerConnectionAddress, ServerStatus } from './domain'

export type { ServerConnectionAddress } from './domain'

export type ServerRuntimeStatus = Exclude<ServerStatus, 'not-configured'>

export type ServerRecoveryPhase = 'starting' | 'saving' | 'publishing' | 'restoring'

export interface ServerRuntimeRecovery {
  phase: ServerRecoveryPhase | null
  attemptFailed: boolean
  processIsRunning: boolean
}

export function isServerActiveStatus(status: ServerRuntimeStatus | ServerStatus): boolean {
  return status === 'starting' || status === 'running' || status === 'stopping' || status === 'recovering'
}

export function isServerRuntimeBusyStatus(status: ServerRuntimeStatus | ServerStatus): boolean {
  return status === 'initializing' || isServerActiveStatus(status)
}

export interface ServerRuntimeLogLine {
  id: string
  timestamp: string
  source: string
  message: string
  tone: 'default' | 'success' | 'warning' | 'error'
}

export interface ServerRuntimePlayers {
  online: number
  max: number
}

export interface ServerRuntimeResources {
  cpuPercent: number
  memoryUsedMb: number
  memoryTotalMb: number
  isMocked: boolean
}

export interface ServerRuntimeSnapshot {
  status: ServerRuntimeStatus
  errorMessage: string | null
  connectionAddresses: ServerConnectionAddress[]
  players: ServerRuntimePlayers
  resources: ServerRuntimeResources
  logs: ServerRuntimeLogLine[]
  recovery: ServerRuntimeRecovery | null
}

export interface ServerRuntimeEvent {
  snapshot: ServerRuntimeSnapshot
  logLine?: ServerRuntimeLogLine
}
