import './AppSidebar.css'

import MaterialIcon from '../MaterialIcon/MaterialIcon'

function AppSidebar(): React.JSX.Element {
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
        <a className="dashboard-nav-item is-active" href="#">
          <MaterialIcon name="dashboard" filled />
          <span>Dashboard</span>
        </a>
        <a className="dashboard-nav-item" href="#">
          <MaterialIcon name="backup" />
          <span>Backups</span>
        </a>
        <a className="dashboard-nav-item" href="#">
          <MaterialIcon name="settings" />
          <span>Settings</span>
        </a>
      </nav>

      <div className="dashboard-sidebar-footer">
        <button className="secondary-sidebar-button" type="button">
          <MaterialIcon name="add" />
          <span>Add Server</span>
        </button>
      </div>
    </aside>
  )
}

export default AppSidebar
