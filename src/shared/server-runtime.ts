import type { ServerConnectionAddress, ServerStatus } from './domain'
import type { WorldId } from './world'

export type { ServerConnectionAddress } from './domain'

export type ServerRuntimeStatus =
  | 'stopped'
  | 'updating'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'crashed'
  | 'error'

export function isServerActiveStatus(status: ServerRuntimeStatus | ServerStatus): boolean {
  return status === 'starting' || status === 'running' || status === 'stopping'
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
  runningWorldId: WorldId | null
  errorMessage: string | null
  connectionAddresses: ServerConnectionAddress[]
  players: ServerRuntimePlayers
  resources: ServerRuntimeResources
  logs: ServerRuntimeLogLine[]
}

export interface ServerRuntimeEvent {
  snapshot: ServerRuntimeSnapshot
  logLine?: ServerRuntimeLogLine
}
