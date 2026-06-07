import './TopBar.css'

import type { MockUser } from '../../../../../../shared/dashboard'
import MaterialIcon from '../../../../components/shared/MaterialIcon/MaterialIcon'

interface TopBarProps {
  serverName: string
  user: MockUser | null
}

function TopBar({ serverName, user }: TopBarProps): React.JSX.Element {
  return (
    <header className="dashboard-topbar">
      <div className="dashboard-breadcrumbs" aria-label="Breadcrumb">
        <span>Servers</span>
        <MaterialIcon name="chevron_right" className="breadcrumb-icon" />
        <strong>{serverName}</strong>
      </div>

      <div className="dashboard-topbar-actions">
        <button className="icon-button" type="button" aria-label="Notifications">
          <MaterialIcon name="notifications" />
        </button>
        <button className="icon-button" type="button" aria-label="Settings">
          <MaterialIcon name="settings" />
        </button>
        <button className="create-instance-button" type="button">
          <MaterialIcon name="add" />
          <span>Create Instance</span>
        </button>
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
