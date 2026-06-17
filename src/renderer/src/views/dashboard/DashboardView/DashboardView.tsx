import './DashboardView.css'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ServerDisplayState } from '../../../../../shared/dashboard'
import { ServerHostingStatus, ServerLockStatus } from '../../../../../shared/domain'
import type {
  ServerConnectionAddress,
  ServerRuntimeSnapshot
} from '../../../../../shared/server-runtime'
import { ServerSyncStatus } from '../../../../../shared/server-sync'
import AppSidebar from '../../../components/shared/AppSidebar/AppSidebar'
import MaterialIcon from '../../../components/shared/MaterialIcon/MaterialIcon'
import { loadServerDisplayState } from '../../../utils/server-display-state'
import { formatLatestSaveLabel, getServerSyncView } from '../../../utils/server-sync-ui'
import ConsoleOutput from '../components/ConsoleOutput/ConsoleOutput'
import DashboardStatCard from '../components/DashboardStatCard/DashboardStatCard'
import ServerHeader from '../components/ServerHeader/ServerHeader'
import ServerStatePanel from '../components/ServerStatePanel/ServerStatePanel'
import TopBar from '../components/TopBar/TopBar'

interface DashboardPreviewProps {
  serverDisplayState: ServerDisplayState
  onServerDisplayStateChange: (serverDisplayState: ServerDisplayState) => void
  onNavigateToServers: () => void
}

type CopyStatus = 'idle' | 'copied' | 'failed'

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

function getPrimaryConnectionAddress(addresses: ServerConnectionAddress[]): string | null {
  const address = addresses.find((a) => a.isPrimary)?.address ?? addresses[0]?.address

  return address || null
}

function isServerActive(status: ServerDisplayState['serverStatus']): boolean {
  return status === 'starting' || status === 'running' || status === 'stopping'
}

function getCurrentHost(snapshot: ServerDisplayState, serverIsActive: boolean): string | null {
  return serverIsActive ? (snapshot.signedInUser?.name ?? 'You') : snapshot.currentHost
}

function applyRuntimeSnapshot(
  snapshot: ServerDisplayState,
  runtimeSnapshot: ServerRuntimeSnapshot
): ServerDisplayState {
  const serverIsActive = isServerActive(runtimeSnapshot.status)

  const players = {
    online: serverIsActive ? runtimeSnapshot.players.online : 0,
    max: runtimeSnapshot.players.max
  }

  const resources = {
    ...runtimeSnapshot.resources,
    cpuPercent: serverIsActive ? runtimeSnapshot.resources.cpuPercent : 0,
    memoryUsedMb: serverIsActive ? runtimeSnapshot.resources.memoryUsedMb : 0
  }
  const connectionAddresses = serverIsActive
    ? runtimeSnapshot.connectionAddresses
    : snapshot.connectionAddresses

  return {
    ...snapshot,
    serverStatus:
      snapshot.serverStatus === 'not-configured' && runtimeSnapshot.status === 'stopped'
        ? snapshot.serverStatus
        : runtimeSnapshot.status,
    currentHost: getCurrentHost(snapshot, serverIsActive),
    connectionAddress: getPrimaryConnectionAddress(connectionAddresses),
    connectionAddresses,
    players,
    resources,
    consoleLogs: runtimeSnapshot.logs
  }
}

function DashboardView({
  serverDisplayState,
  onServerDisplayStateChange,
  onNavigateToServers
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
      updateServerDisplayState(applyRuntimeSnapshot(serverDisplayStateRef.current, runtimeSnapshot))
    },
    [updateServerDisplayState]
  )

  const refreshServerDisplayState = useCallback(
    async (nextRuntimeSnapshot: ServerRuntimeSnapshot): Promise<void> => {
      try {
        const nextServerDisplayState = await loadServerDisplayState()
        updateServerDisplayState(applyRuntimeSnapshot(nextServerDisplayState, nextRuntimeSnapshot))
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unable to refresh dashboard.'
        setRuntimeErrorMessage(message)
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

        const message = error instanceof Error ? error.message : 'Unable to load server runtime.'
        setRuntimeErrorMessage(message)
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
          const message = error instanceof Error ? error.message : 'Unable to refresh dashboard.'
          setRuntimeErrorMessage(message)
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
      const message = error instanceof Error ? error.message : 'Unable to toggle server.'
      setRuntimeErrorMessage(message)
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

  function handleHeaderServerAction(): void {
    if (serverIsJoinable) {
      setConnectionDetailsOpen(true)
      return
    }

    void handleServerToggle()
  }

  const dashboardSnapshot = serverDisplayState
  const syncView = getServerSyncView(dashboardSnapshot.syncStatus)
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
  const toggleButtonTooltip = syncBlocksStart ? syncView.message : undefined
  const connectionAddressDetails = dashboardSnapshot.connectionAddresses
    .map((connectionAddress) => `${connectionAddress.label}: ${connectionAddress.address}`)
    .join(', ')

  const errorCopyButtonLabel = COPY_STATUS_LABELS[errorCopyStatus]
  const errorCopyButtonStateClass = errorCopyStatus === 'idle' ? '' : ` is-${errorCopyStatus}`
  const addressCopyButtonLabel = COPY_STATUS_LABELS[addressCopyStatus]
  const addressCopyButtonStateClass = addressCopyStatus === 'idle' ? '' : ` is-${addressCopyStatus}`
  const latestSaveLabel = formatLatestSaveLabel(dashboardSnapshot.syncStatus.latestSave)
  const lastActiveLabel = isServerActive(dashboardSnapshot.serverStatus)
    ? 'Active now'
    : latestSaveLabel

  return (
    <div
      className={`dashboard-screen dashboard-screen-${dashboardSnapshot.serverStatus}${
        isServerToggleAnimating ? ' is-server-toggle-animating' : ''
      }`}
    >
      <AppSidebar addServerDisabled addServerTitle="Only one server is supported in the MVP." />

      <div className="dashboard-main">
        <TopBar
          user={dashboardSnapshot.signedInUser}
          breadcrumbs={[
            { label: 'Servers', onClick: onNavigateToServers },
            { label: dashboardSnapshot.serverName }
          ]}
          createInstanceDisabled
          createInstanceTitle="Only one server is supported in the MVP."
        />

        <main className="dashboard-content">
          {runtimeErrorMessage && (
            <div className="dashboard-runtime-error" role="alert">
              <MaterialIcon name="error" />
              <span>{runtimeErrorMessage}</span>
              <button
                aria-label={errorCopyButtonLabel}
                className={`dashboard-runtime-error-copy${errorCopyButtonStateClass}`}
                title={errorCopyButtonLabel}
                type="button"
                onClick={copyRuntimeError}
              >
                <MaterialIcon name={COPY_STATUS_ICONS[errorCopyStatus]} />
              </button>
            </div>
          )}

          <ServerHeader
            name={dashboardSnapshot.serverName}
            status={dashboardSnapshot.serverStatus}
            connectionAddress={dashboardSnapshot.connectionAddress}
            connectionAddressDetails={connectionAddressDetails}
            connectionDetailsOpen={connectionDetailsOpen}
            isAnimating={isServerToggleAnimating}
            toggleDisabled={headerToggleDisabled}
            toggleButtonTooltip={serverIsJoinable ? 'Show connection details' : toggleButtonTooltip}
            toggleButtonLabel={serverIsJoinable ? 'Join Server' : undefined}
            toggleButtonIcon={serverIsJoinable ? 'login' : undefined}
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
              toggleButtonAriaLabel={serverIsJoinable ? 'Show connection details' : undefined}
              toggleButtonTooltip={
                serverIsJoinable ? 'Show connection details' : toggleButtonTooltip
              }
              onToggleServer={handleHeaderServerAction}
            />

            <div className="dashboard-side-stats">
              <DashboardStatCard icon="save" label="Latest Save" value={latestSaveLabel} />
              <DashboardStatCard
                icon="info"
                label="World Version"
                value={dashboardSnapshot.minecraftVersion}
              />
              <div className="compact-stat-grid">
                <section className="compact-stat-card">
                  <p>Current Host</p>
                  <strong>{dashboardSnapshot.currentHost ?? 'None'}</strong>
                </section>
                <section className="compact-stat-card">
                  <p>Players</p>
                  <strong>
                    {dashboardSnapshot.players.online}{' '}
                    <span>/ {dashboardSnapshot.players.max}</span>
                  </strong>
                </section>
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
