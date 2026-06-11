export type ServerRuntimeStatus =
  | 'stopped'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'crashed'
  | 'error'

export interface ServerRuntimeLogLine {
  id: string
  timestamp: string
  source: string
  message: string
  tone: 'default' | 'success' | 'warning' | 'error'
}

export interface ServerConnectionAddress {
  label: string
  address: string
  isPrimary: boolean
}

export interface ServerRuntimeSnapshot {
  status: ServerRuntimeStatus
  errorMessage: string | null
  connectionAddresses: ServerConnectionAddress[]
  logs: ServerRuntimeLogLine[]
}

export interface ServerRuntimeEvent {
  snapshot: ServerRuntimeSnapshot
  logLine?: ServerRuntimeLogLine
}
