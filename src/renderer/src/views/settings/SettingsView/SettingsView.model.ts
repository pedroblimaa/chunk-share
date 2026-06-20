import type { ServerDisplayState } from '../../../../../shared/dashboard'

export interface SettingsViewProps {
  serverDisplayState: ServerDisplayState
  onCreateServer: () => void
  onNavigateToServers: () => void
  onOpenSettings: () => void
  onSignOut: () => void
}
