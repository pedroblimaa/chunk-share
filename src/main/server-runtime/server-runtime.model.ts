export type PersistedServerRuntimePhase =
  | 'lock-acquired'
  | 'launching'
  | 'process-started'
  | 'ready'
  | 'published'

export interface PersistedServerRuntimeSession {
  phase: PersistedServerRuntimePhase
  processId: number | null
  processTag: string | null
  sessionId: string
  startedAt: string
}
