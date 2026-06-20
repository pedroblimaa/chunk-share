export type AppSidebarItem = 'servers' | 'backups' | 'settings'

export interface AppSidebarProps {
  activeItem: AppSidebarItem
  addServerDisabled?: boolean
  addServerTitle?: string
  onAddServer?: () => void
  onOpenServers?: () => void
  onOpenSettings?: () => void
}
