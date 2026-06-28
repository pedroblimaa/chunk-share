import './ServerCard.css'

import type { KeyboardEvent } from 'react'
import type { ServerStatus } from '../../../../../../shared/dashboard'
import { ServerHostingStatus, ServerLockStatus, type ServerLock } from '../../../../../../shared/domain'
import { ServerSyncStatus, type ServerSyncSnapshot } from '../../../../../../shared/server-sync'
import Badge from '../../../../components/shared/Badge/Badge'
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
  deleteTitle?: string
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
    initializing: 'Initializing',
    'not-configured': 'Not Configured',
    recovering: 'Recovering',
    'recovery-required': 'Recovery Required',
    running: 'Running',
    starting: 'Starting',
    stopping: 'Stopping',
    stopped: 'Stopped'
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

function isRemoteHostRunning(syncStatus: ServerSyncSnapshot): boolean {
  return isRemoteLocked(syncStatus) && syncStatus.serverLock.hostingStatus === ServerHostingStatus.Running
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
  const serverIsJoinable = isRemoteHostRunning(server.syncStatus)
  const serverNeedsSetup = !server.availability.device
  const openButtonLabel = serverIsJoinable ? 'Join' : serverNeedsSetup ? 'Download' : 'Manage'
  const openButtonIcon = serverIsJoinable ? 'login' : serverNeedsSetup ? 'download' : 'settings'

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

        <div className="server-card-availability" aria-label="World availability">
          <Badge icon="hard_drive" size="small" tone={server.availability.device ? 'success' : 'disabled'}>
            {server.availability.device ? 'This device' : 'Not on this device'}
          </Badge>
          <Badge icon="cloud" size="small" tone={server.availability.cloud ? 'info' : 'disabled'}>
            {server.availability.cloud ? 'Cloud' : 'Not in cloud'}
          </Badge>
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
        <Button
          className="server-manage-action"
          icon={openButtonIcon}
          size="default"
          variant="secondary"
          onClick={onOpen}
        >
          {openButtonLabel}
        </Button>
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
