import './TopBar.css'

import type { MockUser } from '../../../../../../shared/dashboard'
import Button from '../../../../components/shared/Button/Button'
import MaterialIcon from '../../../../components/shared/MaterialIcon/MaterialIcon'
import Tooltip from '../../../../components/shared/Tooltip/Tooltip'

interface BreadcrumbItem {
  label: string
  onClick?: () => void
}

interface TopBarProps {
  user: MockUser | null
  breadcrumbs: BreadcrumbItem[]
  createInstanceDisabled?: boolean
  createInstanceTitle?: string
  onCreateInstance?: () => void
}

function TopBar({
  user,
  breadcrumbs,
  createInstanceDisabled = false,
  createInstanceTitle,
  onCreateInstance
}: TopBarProps): React.JSX.Element {
  return (
    <header className="dashboard-topbar">
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

      <div className="dashboard-topbar-actions">
        <button className="icon-button" type="button" aria-label="Notifications">
          <MaterialIcon name="notifications" />
        </button>
        <button className="icon-button" type="button" aria-label="Settings">
          <MaterialIcon name="settings" />
        </button>
        <Tooltip content={createInstanceDisabled ? createInstanceTitle : undefined}>
          <Button
            disabled={createInstanceDisabled}
            icon="add"
            onClick={onCreateInstance}
            className="create-instance-button"
          >
            Create Instance
          </Button>
        </Tooltip>
        <div
          className="user-avatar"
          aria-label={user ? `Signed in as ${user.name}` : 'Signed in user'}
        >
          {user?.avatarInitials ?? 'CS'}
        </div>
      </div>
    </header>
  )
}

export default TopBar
