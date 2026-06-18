import { ServerHostingStatus, ServerLockStatus, type LatestSave } from '../../../shared/domain'
import { ServerSyncStatus, type ServerSyncSnapshot } from '../../../shared/server-sync'
import {
  SERVER_SYNC_VIEW_BY_STATUS,
  ServerSyncTone,
  type ServerSyncView
} from './server-sync-ui-constants'

export function getServerSyncView(syncStatus: ServerSyncSnapshot): ServerSyncView {
  const view = SERVER_SYNC_VIEW_BY_STATUS[syncStatus.status]

  if (syncStatus.status === ServerSyncStatus.LockedByOther) {
    const hostName = syncStatus.lockedBy?.displayName ?? 'someone'
    const hostingStatus =
      syncStatus.serverLock.status === ServerLockStatus.Locked
        ? syncStatus.serverLock.hostingStatus
        : null
    const remoteHostIsStarting = hostingStatus === ServerHostingStatus.Starting
    const remoteHostIsStopping = hostingStatus === ServerHostingStatus.Stopping
    const remoteHostIsTransitioning = remoteHostIsStarting || remoteHostIsStopping
    const transitionLabel = remoteHostIsStopping ? 'Stopping' : 'Starting'

    return {
      ...view,
      label: remoteHostIsTransitioning
        ? `${transitionLabel} with ${hostName}`
        : `Online with ${hostName}`,
      tone: remoteHostIsTransitioning ? ServerSyncTone.Warning : view.tone,
      actionLabel: remoteHostIsTransitioning ? `${transitionLabel}...` : view.actionLabel,
      message: remoteHostIsTransitioning
        ? remoteHostIsStopping
          ? 'The host is stopping the server and publishing the latest save.'
          : 'The host is starting the server. Connection will be available soon.'
        : view.message
    }
  }

  if (syncStatus.status === ServerSyncStatus.MissingCloudFile && syncStatus.latestSave) {
    return {
      ...view,
      message: `The latest save metadata points to ${syncStatus.latestSave.fileName}, but the file was not found.`
    }
  }

  return view
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
      return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(value, unit)
    }
  }

  return 'Just now'
}
