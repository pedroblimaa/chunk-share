export type AppSidebarItem = 'servers' | 'backups' | 'settings'

export interface AppSidebarProps {
  activeItem: AppSidebarItem
  isOpen?: boolean
  onClose?: () => void
  onOpenServers?: () => void
  onOpenSettings?: () => void
}
