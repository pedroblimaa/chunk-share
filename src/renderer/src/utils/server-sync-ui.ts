import { ServerHostingStatus, ServerLockStatus, type LatestSave } from '../../../shared/domain'
import { ServerSyncStatus, type ServerSyncSnapshot } from '../../../shared/server-sync'
import { SERVER_SYNC_VIEW_BY_STATUS, ServerSyncTone, type ServerSyncView } from './server-sync-ui-constants'

export type ServerSaveSyncBadgeTone = 'neutral' | 'success' | 'warning' | 'danger'

export interface ServerSaveSyncBadge {
  label: string
  tone: ServerSaveSyncBadgeTone
}

export function getServerSyncView(syncStatus: ServerSyncSnapshot): ServerSyncView {
  const view = SERVER_SYNC_VIEW_BY_STATUS[syncStatus.status]

  if (syncStatus.status === ServerSyncStatus.LockedByOther) {
    const hostName = syncStatus.lockedBy?.displayName ?? 'someone'
    const hostingStatus =
      syncStatus.serverLock.status === ServerLockStatus.Locked ? syncStatus.serverLock.hostingStatus : null
    const remoteHostIsStarting = hostingStatus === ServerHostingStatus.Starting
    const remoteHostIsStopping = hostingStatus === ServerHostingStatus.Stopping
    const remoteHostIsPublishing = hostingStatus === ServerHostingStatus.Publishing
    const remoteHostIsTransitioning = remoteHostIsStarting || remoteHostIsStopping || remoteHostIsPublishing
    const transitionLabel = getRemoteHostTransitionLabel(hostingStatus)
    const transitionMessage = getRemoteHostTransitionMessage(hostingStatus)

    return {
      ...view,
      label: remoteHostIsTransitioning ? `${transitionLabel} with ${hostName}` : `Online with ${hostName}`,
      tone: remoteHostIsTransitioning ? ServerSyncTone.Warning : view.tone,
      actionLabel: remoteHostIsTransitioning ? `${transitionLabel}...` : view.actionLabel,
      message: remoteHostIsTransitioning ? transitionMessage : view.message
    }
  }

  if (syncStatus.status === ServerSyncStatus.MissingCloudFile && syncStatus.latestSave) {
    return {
      ...view,
      message: 'The shared world file was not found.'
    }
  }

  return view
}

function getRemoteHostTransitionLabel(hostingStatus: ServerHostingStatus | null): string {
  if (hostingStatus === ServerHostingStatus.Publishing) {
    return 'Publishing save'
  }

  return hostingStatus === ServerHostingStatus.Stopping ? 'Stopping' : 'Starting'
}

function getRemoteHostTransitionMessage(hostingStatus: ServerHostingStatus | null): string {
  if (hostingStatus === ServerHostingStatus.Publishing) {
    return 'The host is publishing the latest save. It will be available soon.'
  }

  if (hostingStatus === ServerHostingStatus.Stopping) {
    return 'The host is stopping the server. The latest save will be published soon.'
  }

  return 'The host is starting the server. Connection will be available soon.'
}

export function getServerSaveSyncBadge(syncStatus: ServerSyncSnapshot): ServerSaveSyncBadge {
  const { cloudSaveVersion, localSaveVersion, status } = syncStatus

  if (status === ServerSyncStatus.MissingCloudFile) {
    return { label: 'Missing file', tone: 'danger' }
  }

  if (status === ServerSyncStatus.Incompatible) {
    return { label: 'Mismatch', tone: 'danger' }
  }

  if (!cloudSaveVersion) {
    return { label: 'No cloud save', tone: 'neutral' }
  }

  if (!localSaveVersion || cloudSaveVersion > localSaveVersion) {
    return {
      label: SERVER_SYNC_VIEW_BY_STATUS[ServerSyncStatus.UpdateAvailable].label,
      tone: 'warning'
    }
  }

  if (localSaveVersion > cloudSaveVersion) {
    return {
      label: SERVER_SYNC_VIEW_BY_STATUS[ServerSyncStatus.LocalNewer].label,
      tone: 'warning'
    }
  }

  return { label: SERVER_SYNC_VIEW_BY_STATUS[ServerSyncStatus.Ready].label, tone: 'success' }
}

export function formatLatestSaveLabel(latestSave: LatestSave): string {
  if (!latestSave) {
    return 'Not published yet'
  }

  return formatRelativeTime(new Date(latestSave.uploadedAt))
}

function formatRelativeTime(date: Date): string {
  const elapsedMs = date.getTime() - Date.now()
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000]
  ]

  for (const [unit, unitMs] of units) {
    const value = Math.trunc(elapsedMs / unitMs)

    if (Math.abs(value) >= 1) {
      return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(value, unit)
    }
  }

  return 'Just now'
}
