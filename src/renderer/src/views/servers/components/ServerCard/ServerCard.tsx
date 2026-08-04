import './ServerCard.css'

import type { KeyboardEvent } from 'react'
import type { ServerAvailability, ServerStatus } from '../../../../../../shared/dashboard'
import { ServerHostingStatus, ServerLockStatus, type ServerLock } from '../../../../../../shared/domain'
import { ServerSyncStatus, type ServerSyncSnapshot } from '../../../../../../shared/server-sync'
import Button from '../../../../components/shared/Button/Button'
import MaterialIcon from '../../../../components/shared/MaterialIcon/MaterialIcon'
import Tooltip from '../../../../components/shared/Tooltip/Tooltip'
import { getServerSyncView } from '../../../../utils/server-sync-ui'

export interface ServerCardSummary {
  id: string
  name: string
  status: ServerStatus
  type: string
  minecraftVersion: string
  latestSaveLabel: string
  syncStatus: ServerSyncSnapshot
  serverAvailability: ServerAvailability
  currentHost: string | null
  availability: {
    cloud: boolean
    device: boolean
  }
  players: {
    online: number
    max: number
  }
}

interface ServerCardProps {
  animationDelayMs: number
  deleteDisabled?: boolean
  deleteTitle?: string | undefined
  server: ServerCardSummary
  onDelete: () => void
  onOpen: () => void
}

type LockedServerSyncSnapshot = ServerSyncSnapshot & {
  serverLock: Extract<ServerLock, { status: ServerLockStatus.Locked }>
}

function getStatusLabel(server: ServerCardSummary): string {
  if (server.status === 'stopped' && server.syncStatus.status === ServerSyncStatus.LockedByOther) {
    return getRemoteHostStatusLabel(server.syncStatus)
  }

  const statusLabels: Record<ServerStatus, string> = {
    crashed: 'Needs Attention',
    error: 'Error',
    'not-configured': 'Not Configured',
    running: 'Running',
    starting: 'Starting',
    stopping: 'Stopping',
    stopped: 'Stopped',
    updating: 'Updating'
  }

  return statusLabels[server.status]
}

function getRemoteHostStatusLabel(syncStatus: ServerSyncSnapshot): string {
  if (!isRemoteLocked(syncStatus)) {
    return 'Online'
  }

  const statusLabels: Record<ServerHostingStatus, string> = {
    [ServerHostingStatus.Starting]: 'Starting',
    [ServerHostingStatus.Running]: 'Online',
    [ServerHostingStatus.Stopping]: 'Stopping'
  }

  return statusLabels[syncStatus.serverLock.hostingStatus]
}

function isRemoteLocked(syncStatus: ServerSyncSnapshot): syncStatus is LockedServerSyncSnapshot {
  return (
    syncStatus.status === ServerSyncStatus.LockedByOther &&
    syncStatus.serverLock.status === ServerLockStatus.Locked
  )
}

function isRemoteHostTransitioning(syncStatus: ServerSyncSnapshot): boolean {
  return isRemoteLocked(syncStatus) && syncStatus.serverLock.hostingStatus !== ServerHostingStatus.Running
}

function getStatusPillClassName(server: ServerCardSummary): string {
  const lockedClass = getRemoteLockStatusPillClassName(server)

  return `server-status-pill server-status-pill-${server.status}${lockedClass}`
}

function getRemoteLockStatusPillClassName(server: ServerCardSummary): string {
  if (server.status !== 'stopped' || server.syncStatus.status !== ServerSyncStatus.LockedByOther) {
    return ''
  }

  return isRemoteHostTransitioning(server.syncStatus)
    ? ' server-status-pill-remote-transitioning'
    : ' server-status-pill-hosted'
}

function isOpenKey(event: KeyboardEvent): boolean {
  return event.key === 'Enter' || event.key === ' '
}

function ServerCard({
  animationDelayMs,
  deleteDisabled = false,
  deleteTitle,
  server,
  onDelete,
  onOpen
}: ServerCardProps): React.JSX.Element {
  const syncView = getServerSyncView(server.syncStatus)
  const hasVisibleHost = server.status !== 'stopped' || server.currentHost !== null

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
        <div className="server-card-visual">
          <div className="server-card-top">
            <span className={getStatusPillClassName(server)}>
              <span aria-hidden="true" />
              {getStatusLabel(server)}
            </span>
            <span className={`server-card-sync-status server-card-sync-status-${syncView.tone}`}>
              <MaterialIcon name="sync" />
              {syncView.label}
            </span>
          </div>
        </div>

        <div className="server-card-content">
          <div className="server-card-body">
            <div>
              <h3>{server.name}</h3>
              <p>
                {server.type} {server.minecraftVersion}
              </p>
            </div>
            <div
              className="server-player-count"
              aria-label={`${server.players.online} of ${server.players.max} players`}
            >
              <MaterialIcon name="group" />
              <strong>{server.players.online}</strong>
              <span>/ {server.players.max}</span>
            </div>
          </div>

          <dl className={`server-card-stats${hasVisibleHost ? '' : ' server-card-stats-single'}`}>
            <div>
              <dt>Latest Save</dt>
              <dd>{server.latestSaveLabel}</dd>
            </div>
            {hasVisibleHost && (
              <div>
                <dt>Host</dt>
                <dd>{server.currentHost ?? 'None'}</dd>
              </div>
            )}
          </dl>

          <div className="server-card-availability" aria-label="World availability">
            <span
              className={`server-availability-device${server.availability.device ? ' is-available' : ''}`}
            >
              <MaterialIcon name="hard_drive" />
              {server.availability.device ? 'This device' : 'Not on this device'}
            </span>
            <span className={`server-availability-cloud${server.availability.cloud ? ' is-available' : ''}`}>
              <MaterialIcon name="cloud" />
              {server.availability.cloud ? 'Cloud' : 'Not in cloud'}
            </span>
          </div>
        </div>
      </div>

      <div className="server-card-footer">
        <Tooltip content={deleteDisabled ? deleteTitle : undefined} placement="left">
          <Button
            aria-label={`Delete ${server.name}`}
            className="server-delete-action"
            disabled={deleteDisabled}
            icon="delete"
            size="square"
            variant="icon"
            onClick={onDelete}
          />
        </Tooltip>
      </div>
    </article>
  )
}

export default ServerCard
