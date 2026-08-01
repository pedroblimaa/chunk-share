import type { ServerDisplayState } from '../../../../shared/dashboard'

export type DashboardPrimaryActionKind =
  | 'join'
  | 'download-server'
  | 'download-save'
  | 'toggle-server'
  | 'none'

export type DashboardPrimaryActionTone = 'default' | 'sync'

export interface DashboardPrimaryActionView {
  kind: DashboardPrimaryActionKind
  isDisabled: boolean
  label?: string | undefined
  icon?: string | undefined
  tone: DashboardPrimaryActionTone
  tooltip?: string | undefined
  ariaLabel?: string | undefined
}

export interface DashboardPrimaryActionInput {
  dashboardSnapshot: ServerDisplayState
  downloadEulaAccepted: boolean
}
