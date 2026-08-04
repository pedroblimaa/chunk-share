import type { ServerDisplayState } from '../../../../../shared/dashboard'

export interface SettingsViewProps {
  isSidebarOpen: boolean
  serverDisplayState: ServerDisplayState
  onCreateServer: () => void
  onCloseSidebar: () => void
  onNavigateToServers: () => void
  onOpenSettings: () => void
  onSignOut: () => void
  onStorageProviderChange: () => Promise<void>
  onToggleSidebar: () => void
}
