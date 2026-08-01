import './AppSidebar.css'

import Button from '../Button/Button'
import MaterialIcon from '../MaterialIcon/MaterialIcon'
import Tooltip from '../Tooltip/Tooltip'
import type { AppSidebarItem, AppSidebarProps } from './AppSidebar.model'

function AppSidebar({
  activeItem,
  addServerDisabled = false,
  addServerTitle,
  onAddServer,
  onOpenServers,
  onOpenSettings
}: AppSidebarProps): React.JSX.Element {
  function getNavItemClassName(item: AppSidebarItem): string {
    return `dashboard-nav-item${activeItem === item ? ' is-active' : ''}`
  }

  return (
    <aside className="dashboard-sidebar">
      <div className="dashboard-brand">
        <div className="dashboard-brand-mark">
          <MaterialIcon name="dns" />
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
          onClick={onOpenServers}
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
          onClick={onOpenSettings}
        >
          <MaterialIcon name="settings" />
          <span>Settings</span>
        </button>
      </nav>

      <div className="dashboard-sidebar-footer">
        <Tooltip content={addServerDisabled ? addServerTitle : undefined} placement="top">
          <Button
            variant="secondary"
            size="large"
            fullWidth
            icon="add"
            disabled={addServerDisabled}
            onClick={onAddServer}
          >
            Add Server
          </Button>
        </Tooltip>
      </div>
    </aside>
  )
}

export default AppSidebar
