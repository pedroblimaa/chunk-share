import './ServerCard.css'

import type { KeyboardEvent } from 'react'
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
  deleteDisabled?: boolean
  server: ServerCardSummary
  onDelete: () => void
  onOpen: () => void
}

function getStatusLabel(status: ServerStatus): string {
  const statusLabels: Record<ServerStatus, string> = {
    crashed: 'Needs Attention',
    error: 'Error',
    'not-configured': 'Not Configured',
    running: 'Ready',
    starting: 'Starting',
    stopping: 'Stopping',
    stopped: 'Stopped'
  }

  return statusLabels[status]
}

function isOpenKey(event: KeyboardEvent): boolean {
  return event.key === 'Enter' || event.key === ' '
}

function ServerCard({
  animationDelayMs,
  deleteDisabled = false,
  server,
  onDelete,
  onOpen
}: ServerCardProps): React.JSX.Element {
  function openFromKeyboard(event: KeyboardEvent): void {
    if (!isOpenKey(event)) {
      return
    }

    event.preventDefault()
    onOpen()
  }

  return (
    <article
      className={`server-card server-card-${server.status}`}
      style={{ animationDelay: `${animationDelayMs}ms` }}
    >
      <div
        className="server-card-open-area"
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={openFromKeyboard}
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
      </div>

      <div className="server-card-footer">
        <button className="server-manage-action" type="button" onClick={onOpen}>
          <MaterialIcon name="settings" />
          Manage
        </button>
        <button
          aria-label={`Delete ${server.name}`}
          className="server-delete-action"
          disabled={deleteDisabled}
          title="Delete server and create a local backup"
          type="button"
          onClick={onDelete}
        >
          <MaterialIcon name="delete" />
        </button>
      </div>
    </article>
  )
}

export default ServerCard
