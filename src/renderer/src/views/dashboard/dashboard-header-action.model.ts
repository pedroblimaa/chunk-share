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
  label?: string
  icon?: string
  tone: DashboardPrimaryActionTone
  tooltip?: string
  ariaLabel?: string
}

export interface DashboardPrimaryActionInput {
  dashboardSnapshot: ServerDisplayState
  downloadEulaAccepted: boolean
}
