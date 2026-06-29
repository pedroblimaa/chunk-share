import { ServerAvailability, type ServerDisplayState } from '../../../../shared/dashboard'
import { ServerHostingStatus, ServerLockStatus } from '../../../../shared/domain'
import { ServerSyncStatus } from '../../../../shared/server-sync'
import { getServerSyncView } from '../../utils/server-sync-ui'
import type { DashboardPrimaryActionInput, DashboardPrimaryActionView } from './dashboard-header-action.model'

export function getDashboardPrimaryActionView({
  dashboardSnapshot,
  downloadEulaAccepted
}: DashboardPrimaryActionInput): DashboardPrimaryActionView {
  const serverIsJoinable = getServerIsJoinable(dashboardSnapshot)
  const syncBlocksStart = getSyncBlocksStart(dashboardSnapshot)
  const serverNeedsLocalDownload = getServerNeedsLocalDownload(dashboardSnapshot)
  const serverNeedsSaveDownload = getServerNeedsSaveDownload(dashboardSnapshot)
  const syncView = getServerSyncView(dashboardSnapshot.syncStatus)

  if (serverIsJoinable) {
    return {
      kind: 'join',
      isDisabled: false,
      label: 'Join Server',
      icon: 'login',
      tone: 'default',
      tooltip: 'Show connection details',
      ariaLabel: 'Show connection details'
    }
  }

  if (serverNeedsLocalDownload) {
    return {
      kind: 'download-server',
      isDisabled: !downloadEulaAccepted,
      label: 'Download Server',
      icon: 'download',
      tone: 'sync',
      tooltip: downloadEulaAccepted
        ? 'Download this shared server before hosting.'
        : 'Accept the Minecraft EULA before downloading this shared server.',
      ariaLabel: 'Download shared server'
    }
  }

  const toggleIsDisabled =
    dashboardSnapshot.serverStatus === 'not-configured' ||
    dashboardSnapshot.serverStatus === 'starting' ||
    dashboardSnapshot.serverStatus === 'stopping' ||
    dashboardSnapshot.serverStatus === 'crashed' ||
    (syncBlocksStart && !serverNeedsSaveDownload)

  if (dashboardSnapshot.serverStatus !== 'stopped') {
    return {
      kind: 'toggle-server',
      isDisabled: toggleIsDisabled,
      tone: 'default'
    }
  }

  switch (dashboardSnapshot.syncStatus.status) {
    case ServerSyncStatus.UpdateAvailable:
      return {
        kind: 'download-save',
        isDisabled: toggleIsDisabled,
        label: syncView.actionLabel,
        icon: 'download',
        tone: 'sync',
        tooltip: syncView.message,
        ariaLabel: syncView.actionLabel
      }
    case ServerSyncStatus.LocalNewer:
      return {
        kind: 'toggle-server',
        isDisabled: toggleIsDisabled,
        label: syncView.actionLabel,
        icon: 'upload',
        tone: 'sync',
        tooltip: syncView.message,
        ariaLabel: syncView.actionLabel
      }
    default:
      return {
        kind: 'toggle-server',
        isDisabled: toggleIsDisabled,
        tone: 'default',
        tooltip: syncBlocksStart ? syncView.message : undefined
      }
  }
}

function getServerIsJoinable(dashboardSnapshot: ServerDisplayState): boolean {
  return (
    dashboardSnapshot.syncStatus.status === ServerSyncStatus.LockedByOther &&
    dashboardSnapshot.syncStatus.serverLock.status === ServerLockStatus.Locked &&
    dashboardSnapshot.syncStatus.serverLock.hostingStatus === ServerHostingStatus.Running &&
    Boolean(dashboardSnapshot.connectionAddress)
  )
}

function getSyncBlocksStart(dashboardSnapshot: ServerDisplayState): boolean {
  return dashboardSnapshot.serverStatus !== 'running' && !dashboardSnapshot.syncStatus.isStartAllowed
}

function getServerNeedsLocalDownload(dashboardSnapshot: ServerDisplayState): boolean {
  return dashboardSnapshot.serverAvailability === ServerAvailability.RemoteAvailable
}

function getServerNeedsSaveDownload(dashboardSnapshot: ServerDisplayState): boolean {
  return (
    dashboardSnapshot.serverStatus === 'stopped' &&
    dashboardSnapshot.syncStatus.status === ServerSyncStatus.UpdateAvailable
  )
}
