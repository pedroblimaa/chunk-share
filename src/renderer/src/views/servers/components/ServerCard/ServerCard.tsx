import './ServerCard.css'

import type { KeyboardEvent } from 'react'
import type { ServerStatus } from '../../../../../../shared/dashboard'
import { ServerSyncStatus, type ServerSyncSnapshot } from '../../../../../../shared/server-sync'
import MaterialIcon from '../../../../components/shared/MaterialIcon/MaterialIcon'
import { getServerSyncView } from '../../../../utils/server-sync-ui'

export interface ServerCardSummary {
  id: string
  name: string
  status: ServerStatus
  type: string
  minecraftVersion: string
  latestSaveLabel: string
  syncStatus: ServerSyncSnapshot
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

function getStatusLabel(server: ServerCardSummary): string {
  if (server.status === 'stopped' && server.syncStatus.status === ServerSyncStatus.LockedByOther) {
    return 'Online'
  }

  const statusLabels: Record<ServerStatus, string> = {
    crashed: 'Needs Attention',
    error: 'Error',
    'not-configured': 'Not Configured',
    running: 'Running',
    starting: 'Starting',
    stopping: 'Stopping',
    stopped: 'Stopped'
  }

  return statusLabels[server.status]
}

function getStatusPillClassName(server: ServerCardSummary): string {
  const lockedClass =
    server.status === 'stopped' && server.syncStatus.status === ServerSyncStatus.LockedByOther
      ? ' server-status-pill-hosted'
      : ''

  return `server-status-pill server-status-pill-${server.status}${lockedClass}`
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
  const syncView = getServerSyncView(server.syncStatus)
  const serverIsJoinable = server.syncStatus.status === ServerSyncStatus.LockedByOther
  const openButtonLabel = serverIsJoinable ? 'Join' : 'Manage'
  const openButtonIcon = serverIsJoinable ? 'login' : 'settings'

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
          <span className={getStatusPillClassName(server)}>
            <span aria-hidden="true" />
            {getStatusLabel(server)}
          </span>
          <span className="server-version-pill">
            <MaterialIcon name="sell" />
            Vanilla {server.minecraftVersion}
          </span>
          <span className={`server-sync-pill server-sync-pill-${syncView.tone}`}>
            <MaterialIcon name="sync" />
            {syncView.label}
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
          <MaterialIcon name={openButtonIcon} />
          {openButtonLabel}
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
