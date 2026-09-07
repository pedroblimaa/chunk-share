export type AppSidebarItem = 'servers' | 'settings'

export interface AppSidebarProps {
  activeItem: AppSidebarItem
  isOpen?: boolean
  onClose?: () => void
  onOpenServers?: () => void
  onOpenSettings?: () => void
}
