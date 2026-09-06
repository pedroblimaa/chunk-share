import './AppSidebar.css'

import { useEffect, useRef } from 'react'
import chunkshareMark from '../../../assets/chunkshare-mark.png'
import MaterialIcon from '../MaterialIcon/MaterialIcon'
import Tooltip from '../Tooltip/Tooltip'
import type { AppSidebarItem, AppSidebarProps } from './AppSidebar.model'

function AppSidebar({
  activeItem,
  isOpen = false,
  onClose,
  onOpenServers,
  onOpenSettings
}: AppSidebarProps): React.JSX.Element {
  const sidebarRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!isOpen) {
      return undefined
    }

    sidebarRef.current?.focus()

    function closeFromEscape(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onClose?.()
      }
    }

    window.addEventListener('keydown', closeFromEscape)

    return () => window.removeEventListener('keydown', closeFromEscape)
  }, [isOpen, onClose])

  useEffect(() => {
    const desktopQuery = window.matchMedia('(min-width: 1401px)')

    function closeAtDesktopWidth(event: MediaQueryListEvent): void {
      if (event.matches) {
        onClose?.()
      }
    }

    desktopQuery.addEventListener('change', closeAtDesktopWidth)

    return () => desktopQuery.removeEventListener('change', closeAtDesktopWidth)
  }, [onClose])

  function getNavItemClassName(item: AppSidebarItem): string {
    return `dashboard-nav-item${activeItem === item ? ' is-active' : ''}`
  }

  function openServers(): void {
    onClose?.()
    onOpenServers?.()
  }

  function openSettings(): void {
    onClose?.()
    onOpenSettings?.()
  }

  return (
    <>
      <button
        aria-label="Close navigation"
        className={`dashboard-sidebar-backdrop${isOpen ? ' is-open' : ''}`}
        type="button"
        onClick={onClose}
      />
      <aside
        ref={sidebarRef}
        className={`dashboard-sidebar${isOpen ? ' is-open' : ''}`}
        id="app-sidebar"
        tabIndex={-1}
      >
        <div className="dashboard-brand">
          <div className="dashboard-brand-mark">
            <img src={chunkshareMark} alt="" aria-hidden="true" />
          </div>
          <div>
            <h1>ChunkShare</h1>
            <p>Management Hub</p>
          </div>
        </div>

        <nav className="dashboard-nav" aria-label="Primary navigation">
          <button
            className={getNavItemClassName('servers')}
            type="button"
            aria-current={activeItem === 'servers' ? 'page' : undefined}
            onClick={openServers}
          >
            <MaterialIcon name="dashboard" filled />
            <span>Servers</span>
          </button>
          <Tooltip content="Backups are coming later.">
            <button className={getNavItemClassName('backups')} type="button" disabled>
              <MaterialIcon name="backup" />
              <span>Backups</span>
            </button>
          </Tooltip>
          <button
            className={getNavItemClassName('settings')}
            type="button"
            aria-current={activeItem === 'settings' ? 'page' : undefined}
            onClick={openSettings}
          >
            <MaterialIcon name="settings" />
            <span>Settings</span>
          </button>
        </nav>
      </aside>
    </>
  )
}

export default AppSidebar
