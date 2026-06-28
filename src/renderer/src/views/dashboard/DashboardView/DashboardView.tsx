import './DashboardView.css'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ServerAvailability, type ServerDisplayState } from '../../../../../shared/dashboard'
import { ServerHostingStatus, ServerLockStatus } from '../../../../../shared/domain'
import { isServerActiveStatus, type ServerRuntimeSnapshot } from '../../../../../shared/server-runtime'
import { ServerSyncStatus } from '../../../../../shared/server-sync'
import AppSidebar from '../../../components/shared/AppSidebar/AppSidebar'
import Card from '../../../components/shared/Card/Card'
import ConfirmationDialog from '../../../components/shared/ConfirmationDialog/ConfirmationDialog'
import MaterialIcon from '../../../components/shared/MaterialIcon/MaterialIcon'
import Toast from '../../../components/shared/Toast/Toast'
import { getErrorMessage } from '../../../utils/error-message'
import {
  applyRuntimeSnapshotToServerDisplayState,
  loadServerDisplayState
} from '../../../utils/server-display-state'
import {
  formatLatestSaveLabel,
  getServerSaveSyncBadge,
  getServerSyncView
} from '../../../utils/server-sync-ui'
import ConsoleOutput from '../components/ConsoleOutput/ConsoleOutput'
import DashboardStatCard from '../components/DashboardStatCard/DashboardStatCard'
import ServerHeader from '../components/ServerHeader/ServerHeader'
import ServerRecoveryPanel from '../components/ServerRecoveryPanel/ServerRecoveryPanel'
import ServerStatePanel from '../components/ServerStatePanel/ServerStatePanel'
import TopBar from '../components/TopBar/TopBar'

interface DashboardPreviewProps {
  initialLoadErrorMessage: string | null
  isInitialSnapshotLoading: boolean
  serverDisplayState: ServerDisplayState
  onDismissInitialLoadError: () => void
  onServerDisplayStateChange: (serverDisplayState: ServerDisplayState) => void
  onNavigateToServers: () => void
  onOpenSettings: () => void
  onSignOut: () => void
}

type CopyStatus = 'idle' | 'copied' | 'failed'
type HeaderToggleButtonTone = 'default' | 'sync'

interface HeaderToggleButtonView {
  label?: string
  icon?: string
  tone: HeaderToggleButtonTone
  tooltip?: string
  ariaLabel?: string
}

const COPY_STATUS_LABELS: Record<CopyStatus, string> = {
  copied: 'Copied',
  failed: 'Copy Failed',
  idle: 'Copy Error'
}

const COPY_STATUS_ICONS: Record<CopyStatus, string> = {
  copied: 'check',
  failed: 'error_outline',
  idle: 'content_copy'
}

const DASHBOARD_REFRESH_INTERVAL_MS = 3_000

function getHeaderToggleButtonView({
  dashboardSnapshot,
  downloadEulaAccepted,
  isDownloadingSharedSave,
  serverIsJoinable,
  syncBlocksStart
}: {
  dashboardSnapshot: ServerDisplayState
  downloadEulaAccepted: boolean
  isDownloadingSharedSave: boolean
  serverIsJoinable: boolean
  syncBlocksStart: boolean
}): HeaderToggleButtonView {
  const syncView = getServerSyncView(dashboardSnapshot.syncStatus)

  if (isDownloadingSharedSave) {
    return {
      label: 'Downloading...',
      icon: 'sync',
      tone: 'sync',
      tooltip: 'Downloading the latest shared save to this device.'
    }
  }

  if (dashboardSnapshot.serverStatus === 'initializing') {
    return {
      label: 'Initializing...',
      icon: 'sync',
      tone: 'default',
      tooltip: 'ChunkShare is checking the previous server session.'
    }
  }

  if (dashboardSnapshot.serverStatus === 'recovering') {
    return {
      label: 'Recovering...',
      icon: 'sync',
      tone: 'default',
      tooltip: 'ChunkShare is recovering and publishing the local world.'
    }
  }

  if (dashboardSnapshot.serverStatus === 'recovery-required') {
    return {
      label: 'Recovery Required',
      icon: 'warning',
      tone: 'default',
      tooltip: 'Use Recover Server before starting another hosting session.'
    }
  }

  if (serverIsJoinable) {
    return {
      label: 'Join Server',
      icon: 'login',
      tone: 'default',
      tooltip: 'Show connection details',
      ariaLabel: 'Show connection details'
    }
  }

  if (syncBlocksStart) {
    return {
      tone: 'default',
      tooltip: syncView.message
    }
  }

  if (dashboardSnapshot.serverAvailability === ServerAvailability.RemoteAvailable) {
    return {
      label: 'Download Server',
      icon: 'download',
      tone: 'sync',
      tooltip: downloadEulaAccepted
        ? 'Download this shared server to this device.'
        : 'Accept the Minecraft EULA below to download this server.',
      ariaLabel: 'Download shared server'
    }
  }

  if (dashboardSnapshot.serverStatus !== 'stopped') {
    return { tone: 'default' }
  }

  switch (dashboardSnapshot.syncStatus.status) {
    case ServerSyncStatus.UpdateAvailable:
      return {
        label: syncView.actionLabel,
        icon: 'download',
        tone: 'sync',
        tooltip: syncView.message,
        ariaLabel: syncView.actionLabel
      }
    case ServerSyncStatus.LocalNewer:
      return {
        label: syncView.actionLabel,
        icon: 'upload',
        tone: 'sync',
        tooltip: syncView.message,
        ariaLabel: syncView.actionLabel
      }
    default:
      return { tone: 'default' }
  }
}

function DashboardView({
  initialLoadErrorMessage,
  isInitialSnapshotLoading,
  serverDisplayState,
  onDismissInitialLoadError,
  onServerDisplayStateChange,
  onNavigateToServers,
  onOpenSettings,
  onSignOut
}: DashboardPreviewProps): React.JSX.Element {
  const serverDisplayStateRef = useRef(serverDisplayState)
  const [runtimeErrorMessage, setRuntimeErrorMessage] = useState<string | null>(null)
  const [errorCopyStatus, setErrorCopyStatus] = useState<CopyStatus>('idle')
  const [addressCopyStatus, setAddressCopyStatus] = useState<CopyStatus>('idle')
  const [isServerToggleAnimating, setIsServerToggleAnimating] = useState(false)
  const [isDownloadingSharedSave, setIsDownloadingSharedSave] = useState(false)
  const [downloadEulaAccepted, setDownloadEulaAccepted] = useState(false)
  const [connectionDetailsOpen, setConnectionDetailsOpen] = useState(false)
  const [restoreSharedSaveConfirmationOpen, setRestoreSharedSaveConfirmationOpen] = useState(false)

  useEffect(() => {
    serverDisplayStateRef.current = serverDisplayState
  }, [serverDisplayState])

  const updateServerDisplayState = useCallback(
    (nextServerDisplayState: ServerDisplayState): void => {
      serverDisplayStateRef.current = nextServerDisplayState
      onServerDisplayStateChange(nextServerDisplayState)
    },
    [onServerDisplayStateChange]
  )

  const applyRuntimeSnapshotToDisplayState = useCallback(
    (runtimeSnapshot: ServerRuntimeSnapshot): void => {
      updateServerDisplayState(
        applyRuntimeSnapshotToServerDisplayState(serverDisplayStateRef.current, runtimeSnapshot)
      )
    },
    [updateServerDisplayState]
  )

  const refreshServerDisplayState = useCallback(
    async (nextRuntimeSnapshot: ServerRuntimeSnapshot): Promise<void> => {
      try {
        const nextServerDisplayState = await loadServerDisplayState()
        updateServerDisplayState(
          applyRuntimeSnapshotToServerDisplayState(nextServerDisplayState, nextRuntimeSnapshot)
        )
      } catch (error: unknown) {
        setRuntimeErrorMessage(getErrorMessage(error, 'Unable to refresh dashboard.'))
      }
    },
    [updateServerDisplayState]
  )

  useEffect(() => {
    let isMounted = true

    window.chunkShare.serverRuntime
      .getSnapshot()
      .then((nextRuntimeSnapshot) => {
        if (!isMounted) {
          return
        }

        applyRuntimeSnapshotToDisplayState(nextRuntimeSnapshot)
      })
      .catch((error: unknown) => {
        if (!isMounted) {
          return
        }

        setRuntimeErrorMessage(getErrorMessage(error, 'Unable to load server runtime.'))
      })

    return () => {
      isMounted = false
    }
  }, [applyRuntimeSnapshotToDisplayState])

  useEffect(() => {
    return window.chunkShare.serverRuntime.onEvent((runtimeEvent) => {
      setRuntimeErrorMessage(runtimeEvent.snapshot.errorMessage)
      applyRuntimeSnapshotToDisplayState(runtimeEvent.snapshot)

      if (runtimeEvent.snapshot.status === 'stopped') {
        void refreshServerDisplayState(runtimeEvent.snapshot)
      }
    })
  }, [applyRuntimeSnapshotToDisplayState, refreshServerDisplayState])

  useEffect(() => {
    const refreshTimer = window.setInterval(() => {
      window.chunkShare.serverRuntime
        .getSnapshot()
        .then(refreshServerDisplayState)
        .catch((error: unknown) => {
          setRuntimeErrorMessage(getErrorMessage(error, 'Unable to refresh dashboard.'))
        })
    }, DASHBOARD_REFRESH_INTERVAL_MS)

    return () => window.clearInterval(refreshTimer)
  }, [refreshServerDisplayState])

  useEffect(() => {
    if (!isServerToggleAnimating) {
      return undefined
    }

    const animationTimer = window.setTimeout(() => {
      setIsServerToggleAnimating(false)
    }, 520)

    return () => window.clearTimeout(animationTimer)
  }, [isServerToggleAnimating])

  useEffect(() => {
    if (errorCopyStatus === 'idle') {
      return undefined
    }

    const resetCopyStatusTimer = window.setTimeout(() => {
      setErrorCopyStatus('idle')
    }, 1600)

    return () => window.clearTimeout(resetCopyStatusTimer)
  }, [errorCopyStatus])

  useEffect(() => {
    if (addressCopyStatus === 'idle') {
      return undefined
    }

    const resetCopyStatusTimer = window.setTimeout(() => {
      setAddressCopyStatus('idle')
    }, 1600)

    return () => window.clearTimeout(resetCopyStatusTimer)
  }, [addressCopyStatus])

  async function handleServerToggle(): Promise<void> {
    setRuntimeErrorMessage(null)
    setIsServerToggleAnimating(true)
    const serverWasRunning = dashboardSnapshot.serverStatus === 'running'

    try {
      const nextRuntimeSnapshot = serverWasRunning
        ? await window.chunkShare.serverRuntime.stop()
        : await window.chunkShare.serverRuntime.start()

      applyRuntimeSnapshotToDisplayState(nextRuntimeSnapshot)
    } catch (error: unknown) {
      setRuntimeErrorMessage(getErrorMessage(error, 'Unable to toggle server.'))
    }
  }

  async function recoverServer(): Promise<void> {
    setRuntimeErrorMessage(null)

    try {
      const nextRuntimeSnapshot = await window.chunkShare.serverRuntime.recover()
      applyRuntimeSnapshotToDisplayState(nextRuntimeSnapshot)
    } catch (error: unknown) {
      setRuntimeErrorMessage(getErrorMessage(error, 'Unable to recover server.'))
    }
  }

  async function restoreSharedSave(): Promise<void> {
    setRestoreSharedSaveConfirmationOpen(false)
    setRuntimeErrorMessage(null)

    try {
      const nextRuntimeSnapshot = await window.chunkShare.serverRuntime.restoreSharedSave()
      await refreshServerDisplayState(nextRuntimeSnapshot)
    } catch (error: unknown) {
      setRuntimeErrorMessage(getErrorMessage(error, 'Unable to restore the last shared save.'))
    }
  }

  async function downloadSharedSave(): Promise<void> {
    setRuntimeErrorMessage(null)
    setIsDownloadingSharedSave(true)

    try {
      const nextRuntimeSnapshot = await window.chunkShare.serverRuntime.downloadSharedSave()
      await refreshServerDisplayState(nextRuntimeSnapshot)
    } catch (error: unknown) {
      setRuntimeErrorMessage(getErrorMessage(error, 'Unable to download the shared save.'))
    } finally {
      setIsDownloadingSharedSave(false)
    }
  }

  async function downloadRemoteServer(): Promise<void> {
    if (!downloadEulaAccepted) {
      return
    }

    setRuntimeErrorMessage(null)
    setIsDownloadingSharedSave(true)

    try {
      await window.chunkShare.serverSetup.downloadSharedServer({ eulaAccepted: true })
      updateServerDisplayState(await loadServerDisplayState())
      setDownloadEulaAccepted(false)
    } catch (error: unknown) {
      setRuntimeErrorMessage(getErrorMessage(error, 'Unable to download the shared server.'))
    } finally {
      setIsDownloadingSharedSave(false)
    }
  }

  async function copyConnectionAddress(): Promise<void> {
    if (!dashboardSnapshot.connectionAddress) {
      return
    }

    await navigator.clipboard.writeText(dashboardSnapshot.connectionAddress)
  }

  async function copyRuntimeError(): Promise<void> {
    const errorMessage = initialLoadErrorMessage ?? runtimeErrorMessage

    if (!errorMessage) {
      return
    }

    try {
      await navigator.clipboard.writeText(errorMessage)
      setErrorCopyStatus('copied')
    } catch {
      setErrorCopyStatus('failed')
    }
  }

  async function copyConnectionAddressDetails(): Promise<void> {
    if (!dashboardSnapshot.connectionAddress) {
      return
    }

    try {
      await navigator.clipboard.writeText(dashboardSnapshot.connectionAddress)
      setAddressCopyStatus('copied')
    } catch {
      setAddressCopyStatus('failed')
    }
  }

  function toggleConnectionDetails(): void {
    setConnectionDetailsOpen((isOpen) => !isOpen)
  }

  function closeConnectionDetails(): void {
    setConnectionDetailsOpen(false)
  }

  function closeRuntimeErrorToast(): void {
    onDismissInitialLoadError()
    setRuntimeErrorMessage(null)
    setErrorCopyStatus('idle')
  }

  function handleHeaderServerAction(): void {
    if (serverIsJoinable) {
      setConnectionDetailsOpen(true)
      return
    }

    if (dashboardSnapshot.serverAvailability === ServerAvailability.RemoteAvailable) {
      void downloadRemoteServer()
      return
    }

    if (dashboardSnapshot.syncStatus.status === ServerSyncStatus.UpdateAvailable) {
      void downloadSharedSave()
      return
    }

    void handleServerToggle()
  }

  const dashboardSnapshot = serverDisplayState
  const serverIsJoinable =
    dashboardSnapshot.syncStatus.status === ServerSyncStatus.LockedByOther &&
    dashboardSnapshot.syncStatus.serverLock.status === ServerLockStatus.Locked &&
    dashboardSnapshot.syncStatus.serverLock.hostingStatus === ServerHostingStatus.Running &&
    Boolean(dashboardSnapshot.connectionAddress)
  const syncBlocksStart =
    dashboardSnapshot.serverStatus !== 'running' && !dashboardSnapshot.syncStatus.isStartAllowed
  const remoteDownloadIsAvailable =
    dashboardSnapshot.serverAvailability === ServerAvailability.RemoteAvailable &&
    !serverIsJoinable &&
    !syncBlocksStart
  const toggleDisabled =
    dashboardSnapshot.serverStatus === 'not-configured' ||
    dashboardSnapshot.serverStatus === 'initializing' ||
    dashboardSnapshot.serverStatus === 'starting' ||
    dashboardSnapshot.serverStatus === 'stopping' ||
    dashboardSnapshot.serverStatus === 'recovering' ||
    dashboardSnapshot.serverStatus === 'recovery-required' ||
    dashboardSnapshot.serverStatus === 'crashed' ||
    syncBlocksStart

  const headerToggleDisabled =
    isInitialSnapshotLoading ||
    isDownloadingSharedSave ||
    (remoteDownloadIsAvailable && !downloadEulaAccepted) ||
    (serverIsJoinable ? false : toggleDisabled)
  const headerToggleButtonView = getHeaderToggleButtonView({
    dashboardSnapshot,
    downloadEulaAccepted,
    isDownloadingSharedSave,
    serverIsJoinable,
    syncBlocksStart
  })
  const connectionAddressDetails = dashboardSnapshot.connectionAddresses
    .map((connectionAddress) => `${connectionAddress.label}: ${connectionAddress.address}`)
    .join(', ')

  const errorCopyButtonLabel = COPY_STATUS_LABELS[errorCopyStatus]
  const addressCopyButtonLabel = COPY_STATUS_LABELS[addressCopyStatus]
  const addressCopyButtonStateClass = addressCopyStatus === 'idle' ? '' : ` is-${addressCopyStatus}`
  const latestSaveLabel = formatLatestSaveLabel(dashboardSnapshot.syncStatus.latestSave)
  const latestSaveSyncBadge = getServerSaveSyncBadge(dashboardSnapshot.syncStatus)
  const lastActiveLabel = isServerActiveStatus(dashboardSnapshot.serverStatus)
    ? 'Active now'
    : latestSaveLabel
  const displayedErrorMessage = initialLoadErrorMessage ?? runtimeErrorMessage

  return (
    <div
      className={`dashboard-screen dashboard-screen-${dashboardSnapshot.serverStatus}${
        isServerToggleAnimating ? ' is-server-toggle-animating' : ''
      }`}
    >
      <AppSidebar
        activeItem="servers"
        addServerDisabled
        addServerTitle="Only one server is supported in the MVP."
        onOpenServers={onNavigateToServers}
        onOpenSettings={onOpenSettings}
      />

      <div className="dashboard-main">
        <TopBar
          user={dashboardSnapshot.signedInUser}
          breadcrumbs={[
            { label: 'Servers', onClick: onNavigateToServers },
            { label: dashboardSnapshot.serverName }
          ]}
          createInstanceDisabled
          createInstanceTitle="Only one server is supported in the MVP."
          onOpenSettings={onOpenSettings}
          onSignOut={onSignOut}
        />

        <main className="dashboard-content">
          {displayedErrorMessage ? (
            <Toast
              action={{
                icon: COPY_STATUS_ICONS[errorCopyStatus],
                label: errorCopyButtonLabel,
                onClick: copyRuntimeError
              }}
              icon="error"
              message={displayedErrorMessage}
              title="Server action failed"
              tone="error"
              onClose={closeRuntimeErrorToast}
            />
          ) : null}

          <ServerHeader
            name={dashboardSnapshot.serverName}
            status={dashboardSnapshot.serverStatus}
            connectionAddress={dashboardSnapshot.connectionAddress}
            connectionAddressDetails={connectionAddressDetails}
            connectionDetailsOpen={connectionDetailsOpen}
            isAnimating={isServerToggleAnimating || isDownloadingSharedSave}
            isLoading={isDownloadingSharedSave}
            downloadEulaAccepted={downloadEulaAccepted}
            showDownloadEula={remoteDownloadIsAvailable}
            toggleDisabled={headerToggleDisabled}
            toggleButtonTooltip={headerToggleButtonView.tooltip}
            toggleButtonLabel={headerToggleButtonView.label}
            toggleButtonIcon={headerToggleButtonView.icon}
            toggleButtonTone={headerToggleButtonView.tone}
            copyConnectionDetailsLabel={addressCopyButtonLabel}
            copyConnectionDetailsStateClass={addressCopyButtonStateClass}
            onCopyConnectionAddress={copyConnectionAddress}
            onCopyConnectionAddressDetails={copyConnectionAddressDetails}
            onCloseConnectionDetails={closeConnectionDetails}
            onDownloadEulaChange={setDownloadEulaAccepted}
            onToggleConnectionDetails={toggleConnectionDetails}
            onToggleServer={handleHeaderServerAction}
          />

          {dashboardSnapshot.recovery ? (
            <ServerRecoveryPanel
              hasSharedSave={dashboardSnapshot.syncStatus.latestSave !== null}
              recovery={dashboardSnapshot.recovery}
              onRecover={() => void recoverServer()}
              onRestoreSharedSave={() => setRestoreSharedSaveConfirmationOpen(true)}
            />
          ) : null}

          <div className="dashboard-grid">
            <ServerStatePanel
              lastActiveLabel={lastActiveLabel}
              snapshot={dashboardSnapshot}
              toggleDisabled={headerToggleDisabled}
              toggleButtonAriaLabel={headerToggleButtonView.ariaLabel}
              toggleButtonTooltip={headerToggleButtonView.tooltip}
              onToggleServer={handleHeaderServerAction}
            />

            <div className="dashboard-side-stats">
              <DashboardStatCard
                badge={latestSaveSyncBadge.label}
                badgeTone={latestSaveSyncBadge.tone}
                icon="save"
                label="Latest Save"
                value={latestSaveLabel}
              />
              <DashboardStatCard
                icon="info"
                label="World Version"
                value={dashboardSnapshot.minecraftVersion}
              />
              <div className="compact-stat-grid">
                <Card className="compact-stat-card" padding="compact">
                  <p>Current Host</p>
                  <strong>{dashboardSnapshot.currentHost ?? 'None'}</strong>
                </Card>
                <Card className="compact-stat-card" padding="compact">
                  <p>Players</p>
                  <strong>
                    {dashboardSnapshot.players.online} <span>/ {dashboardSnapshot.players.max}</span>
                  </strong>
                </Card>
              </div>
            </div>
          </div>

          <ConsoleOutput logs={dashboardSnapshot.consoleLogs} />

          {isInitialSnapshotLoading ? (
            <div className="dashboard-loading-overlay" role="status" aria-live="polite">
              <div className="dashboard-loading-indicator">
                <MaterialIcon name="sync" />
                <span>Syncing server data...</span>
              </div>
            </div>
          ) : null}
        </main>
      </div>

      {restoreSharedSaveConfirmationOpen ? (
        <ConfirmationDialog
          cancelLabel="Keep Local World"
          confirmIcon="history"
          confirmLabel="Restore Shared Save"
          description="This replaces the crashed local world with the last published shared save. Local crash changes will be lost."
          icon="warning"
          title="Discard Local Crash Changes?"
          onCancel={() => setRestoreSharedSaveConfirmationOpen(false)}
          onConfirm={() => void restoreSharedSave()}
        />
      ) : null}
    </div>
  )
}

export default DashboardView
