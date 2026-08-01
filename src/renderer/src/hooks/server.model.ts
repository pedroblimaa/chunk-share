import type { ServerDisplayState } from '../../../shared/dashboard'
import type { WorldId } from '../../../shared/world'

export type AppView = 'servers' | 'server-detail' | 'server-setup' | 'settings'

export interface UseServerActionsInput {
  canAutoRefresh: boolean
  handleStorageError: (error: unknown) => boolean
  serverDisplayState: ServerDisplayState | null
  setAppView: (appView: AppView) => void
  setErrorMessage: (message: string | null) => void
  setServerDisplayState: (serverDisplayState: ServerDisplayState) => void
}

export interface ServerActions {
  completeServerSetup: () => Promise<void>
  deleteServer: (worldId: WorldId) => Promise<void>
  openServerDashboard: (worldId: WorldId) => Promise<void>
  refreshServerDisplayState: () => Promise<void>
}
