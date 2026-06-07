import './ServerStatePanel.css'

import type { DashboardSnapshot } from '../../../../../../shared/dashboard'
import MaterialIcon from '../../../../components/shared/MaterialIcon/MaterialIcon'

interface ServerStatePanelProps {
  snapshot: DashboardSnapshot
  onToggleServer: () => void
}

function formatState(status: DashboardSnapshot['serverStatus']): string {
  if (status === 'not-configured') {
    return 'Not Configured'
  }

  return status[0].toUpperCase() + status.slice(1)
}

function ServerStatePanel({ snapshot, onToggleServer }: ServerStatePanelProps): React.JSX.Element {
  const memoryPercent =
    snapshot.resources.memoryTotalMb === 0
      ? 0
      : (snapshot.resources.memoryUsedMb / snapshot.resources.memoryTotalMb) * 100

  return (
    <section
      className={`server-state-panel server-state-panel-${snapshot.serverStatus}`}
      aria-live="polite"
    >
      <div className="server-state-pattern" />
      <div className="server-state-content">
        <p className="panel-kicker">Current State</p>
        <div className="server-state-summary">
          <button
            className="power-indicator"
            type="button"
            aria-label={snapshot.serverStatus === 'running' ? 'Stop server' : 'Start server'}
            onClick={onToggleServer}
          >
            <MaterialIcon name="power_settings_new" />
          </button>
          <div>
            <h3>{formatState(snapshot.serverStatus)}</h3>
            <p>Last active: {snapshot.lastActiveLabel}</p>
          </div>
        </div>

        <div className="resource-grid">
          <div className="resource-meter">
            <p>CPU Usage</p>
            <strong>{snapshot.resources.cpuPercent.toFixed(1)}%</strong>
            <span className="meter-track">
              <span style={{ width: `${snapshot.resources.cpuPercent}%` }} />
            </span>
          </div>

          <div className="resource-meter">
            <p>Memory</p>
            <strong>
              {snapshot.resources.memoryUsedMb} / {snapshot.resources.memoryTotalMb} MB
            </strong>
            <span className="meter-track">
              <span style={{ width: `${memoryPercent}%` }} />
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}

export default ServerStatePanel
