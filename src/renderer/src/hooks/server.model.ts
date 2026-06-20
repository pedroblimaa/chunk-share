import type { ServerDisplayState } from '../../../shared/dashboard'

export type AppView = 'servers' | 'server-detail' | 'server-setup' | 'settings'

export interface UseServerActionsInput {
  canAutoRefresh: boolean
  handleStorageError: (error: unknown) => boolean
  setAppView: (appView: AppView) => void
  setErrorMessage: (message: string | null) => void
  setServerDisplayState: (serverDisplayState: ServerDisplayState) => void
}

export interface ServerActions {
  completeServerSetup: () => Promise<void>
  deleteServer: () => Promise<void>
  openServerDashboard: () => Promise<void>
  refreshServerDisplayState: () => Promise<void>
}
