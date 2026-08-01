export type AppSidebarItem = 'servers' | 'backups' | 'settings'

export interface AppSidebarProps {
  activeItem: AppSidebarItem
  addServerDisabled?: boolean
  addServerTitle?: string | undefined
  onAddServer?: (() => void) | undefined
  onOpenServers?: () => void
  onOpenSettings?: () => void
}
