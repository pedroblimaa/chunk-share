import './ServerCard.css'

import type { ServerStatus } from '../../../../../../shared/dashboard'
import MaterialIcon from '../../../../components/shared/MaterialIcon/MaterialIcon'

export interface ServerCardSummary {
  id: string
  name: string
  status: ServerStatus
  type: string
  minecraftVersion: string
  latestSaveLabel: string
  currentHost: string | null
  players: {
    online: number
    max: number
  }
}

interface ServerCardProps {
  animationDelayMs: number
  server: ServerCardSummary
  onOpen: () => void
}

function getStatusLabel(status: ServerStatus): string {
  const statusLabels: Record<ServerStatus, string> = {
    crashed: 'Needs Attention',
    'not-configured': 'Not Configured',
    running: 'Ready',
    starting: 'Starting',
    stopped: 'Stopped'
  }

  return statusLabels[status]
}

function ServerCard({ animationDelayMs, server, onOpen }: ServerCardProps): React.JSX.Element {
  return (
    <button
      className={`server-card server-card-${server.status}`}
      style={{ animationDelay: `${animationDelayMs}ms` }}
      type="button"
      onClick={onOpen}
    >
      <div className="server-card-top">
        <span className={`server-status-pill server-status-pill-${server.status}`}>
          <span aria-hidden="true" />
          {getStatusLabel(server.status)}
        </span>
        <span className="server-version-pill">
          <MaterialIcon name="sell" />
          Vanilla {server.minecraftVersion}
        </span>
      </div>

      <div className="server-card-body">
        <div>
          <h3>{server.name}</h3>
          <p>{server.type}</p>
        </div>
        <div className="server-player-count" aria-label="Players">
          <strong>{server.players.online}</strong>
          <span>/ {server.players.max}</span>
        </div>
      </div>

      <dl className="server-card-stats">
        <div>
          <dt>Latest Save</dt>
          <dd>{server.latestSaveLabel}</dd>
        </div>
        <div>
          <dt>Host</dt>
          <dd>{server.currentHost ?? 'None'}</dd>
        </div>
      </dl>

      <div className="server-card-footer">
        <span className="server-manage-action">
          <MaterialIcon name="settings" />
          Manage
        </span>
      </div>
    </button>
  )
}

export default ServerCard
