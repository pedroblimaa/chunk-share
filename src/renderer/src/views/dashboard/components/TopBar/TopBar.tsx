import './TopBar.css'

import { useState } from 'react'
import type { SignedInUser } from '../../../../../../shared/dashboard'
import Button from '../../../../components/shared/Button/Button'
import MaterialIcon from '../../../../components/shared/MaterialIcon/MaterialIcon'
import Popover from '../../../../components/shared/Popover/Popover'
import Tooltip from '../../../../components/shared/Tooltip/Tooltip'

interface BreadcrumbItem {
  label: string
  onClick?: () => void
}

interface TopBarRefreshAction {
  isRefreshing: boolean
  label: string
  onClick: () => void
}

interface TopBarProps {
  user: SignedInUser | null
  breadcrumbs: BreadcrumbItem[]
  isSidebarOpen?: boolean
  createServerDisabled?: boolean
  createServerTitle?: string | undefined
  refreshAction?: TopBarRefreshAction
  onCreateServer?: (() => void) | undefined
  onOpenSettings?: () => void
  onSignOut?: () => void
  onToggleSidebar?: () => void
}

function TopBar({
  user,
  breadcrumbs,
  isSidebarOpen = false,
  createServerDisabled = false,
  createServerTitle,
  refreshAction,
  onCreateServer,
  onOpenSettings,
  onSignOut,
  onToggleSidebar
}: TopBarProps): React.JSX.Element {
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)

  function toggleAccountMenu(): void {
    setAccountMenuOpen((isOpen) => !isOpen)
  }

  function signOut(): void {
    setAccountMenuOpen(false)
    onSignOut?.()
  }

  return (
    <header className="dashboard-topbar">
      <div className="dashboard-topbar-leading">
        {onToggleSidebar && (
          <button
            aria-controls="app-sidebar"
            aria-expanded={isSidebarOpen}
            aria-label={isSidebarOpen ? 'Close navigation' : 'Open navigation'}
            className="icon-button sidebar-menu-button"
            type="button"
            onClick={onToggleSidebar}
          >
            <MaterialIcon name="menu" />
          </button>
        )}
        <div className="dashboard-breadcrumbs" aria-label="Breadcrumb">
          {breadcrumbs.map((breadcrumb, index) => {
            const isLast = index === breadcrumbs.length - 1

            return (
              <span className="breadcrumb-segment" key={`${breadcrumb.label}-${index}`}>
                {breadcrumb.onClick && !isLast ? (
                  <button type="button" onClick={breadcrumb.onClick}>
                    {breadcrumb.label}
                  </button>
                ) : isLast ? (
                  <strong>{breadcrumb.label}</strong>
                ) : (
                  <span>{breadcrumb.label}</span>
                )}
                {!isLast && <MaterialIcon name="chevron_right" className="breadcrumb-icon" />}
              </span>
            )
          })}
        </div>
      </div>

      <div className="dashboard-topbar-actions">
        {refreshAction && (
          <Tooltip content={refreshAction.label}>
            <button
              aria-busy={refreshAction.isRefreshing}
              aria-label={refreshAction.label}
              className={`icon-button refresh-button${refreshAction.isRefreshing ? ' is-refreshing' : ''}`}
              disabled={refreshAction.isRefreshing}
              type="button"
              onClick={refreshAction.onClick}
            >
              <MaterialIcon name="refresh" />
            </button>
          </Tooltip>
        )}
        {onOpenSettings && (
          <button
            className="icon-button topbar-settings-button"
            type="button"
            aria-label="Settings"
            onClick={onOpenSettings}
          >
            <MaterialIcon name="settings" />
          </button>
        )}
        {(onCreateServer || createServerDisabled) && (
          <Tooltip content={createServerDisabled ? createServerTitle : undefined}>
            <Button
              disabled={createServerDisabled}
              icon="add"
              onClick={onCreateServer}
              className="create-server-button"
            >
              Create Server
            </Button>
          </Tooltip>
        )}
        <Popover
          ariaLabel="Account menu"
          className="account-menu"
          contentClassName="account-popover is-right"
          contentRole="menu"
          isOpen={accountMenuOpen}
          onClose={() => setAccountMenuOpen(false)}
          content={
            <>
              <div className="account-popover-user">
                <span>{user?.name ?? 'ChunkShare user'}</span>
                {user?.email && <small>{user.email}</small>}
              </div>
              <button className="account-popover-action" type="button" role="menuitem" onClick={signOut}>
                <MaterialIcon name="logout" />
                <span>Sign out</span>
              </button>
            </>
          }
        >
          <button
            className={`user-avatar${user?.avatarUrl ? ' has-image' : ''}`}
            type="button"
            aria-expanded={accountMenuOpen}
            aria-haspopup="menu"
            aria-label={user ? `Account menu for ${user.name}` : 'Account menu'}
            onClick={toggleAccountMenu}
          >
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt="" aria-hidden="true" />
            ) : (
              (user?.avatarInitials ?? 'CS')
            )}
          </button>
        </Popover>
      </div>
    </header>
  )
}

export default TopBar
