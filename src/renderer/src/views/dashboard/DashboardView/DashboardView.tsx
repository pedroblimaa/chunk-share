import './DashboardView.css'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ServerDisplayState } from '../../../../../shared/dashboard'
import { ServerHostingStatus, ServerLockStatus } from '../../../../../shared/domain'
import { isServerActiveStatus, type ServerRuntimeSnapshot } from '../../../../../shared/server-runtime'
import { ServerSyncStatus } from '../../../../../shared/server-sync'
import AppSidebar from '../../../components/shared/AppSidebar/AppSidebar'
import Card from '../../../components/shared/Card/Card'
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
import ServerStatePanel from '../components/ServerStatePanel/ServerStatePanel'
import TopBar from '../components/TopBar/TopBar'

interface DashboardPreviewProps {
  serverDisplayState: ServerDisplayState
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
  serverIsJoinable,
  syncBlocksStart
}: {
  dashboardSnapshot: ServerDisplayState
  serverIsJoinable: boolean
  syncBlocksStart: boolean
}): HeaderToggleButtonView {
  const syncView = getServerSyncView(dashboardSnapshot.syncStatus)

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
  serverDisplayState,
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
  const [connectionDetailsOpen, setConnectionDetailsOpen] = useState(false)

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

  async function copyConnectionAddress(): Promise<void> {
    if (!dashboardSnapshot.connectionAddress) {
      return
    }

    await navigator.clipboard.writeText(dashboardSnapshot.connectionAddress)
  }

  async function copyRuntimeError(): Promise<void> {
    if (!runtimeErrorMessage) {
      return
    }

    try {
      await navigator.clipboard.writeText(runtimeErrorMessage)
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
    setRuntimeErrorMessage(null)
    setErrorCopyStatus('idle')
  }

  function handleHeaderServerAction(): void {
    if (serverIsJoinable) {
      setConnectionDetailsOpen(true)
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
  const toggleDisabled =
    dashboardSnapshot.serverStatus === 'not-configured' ||
    dashboardSnapshot.serverStatus === 'starting' ||
    dashboardSnapshot.serverStatus === 'stopping' ||
    dashboardSnapshot.serverStatus === 'crashed' ||
    syncBlocksStart

  const headerToggleDisabled = serverIsJoinable ? false : toggleDisabled
  const headerToggleButtonView = getHeaderToggleButtonView({
    dashboardSnapshot,
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
          {runtimeErrorMessage ? (
            <Toast
              action={{
                icon: COPY_STATUS_ICONS[errorCopyStatus],
                label: errorCopyButtonLabel,
                onClick: copyRuntimeError
              }}
              icon="error"
              message={runtimeErrorMessage}
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
            isAnimating={isServerToggleAnimating}
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
            onToggleConnectionDetails={toggleConnectionDetails}
            onToggleServer={handleHeaderServerAction}
          />

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
        </main>
      </div>
    </div>
  )
}

export default DashboardView
