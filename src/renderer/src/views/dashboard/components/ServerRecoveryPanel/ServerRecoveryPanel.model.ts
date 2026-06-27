import type { ServerRecoveryPhase, ServerRuntimeRecovery } from '../../../../../../shared/server-runtime'

export interface ServerRecoveryPanelProps {
  hasSharedSave: boolean
  recovery: ServerRuntimeRecovery
  onRecover: () => void
  onRestoreSharedSave: () => void
}

export interface ServerRecoveryProgressCopy {
  description: string
  label: string
}

export type ServerRecoveryProgressCopyMap = Record<ServerRecoveryPhase, ServerRecoveryProgressCopy>
