import './DashboardView.css'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ServerDisplayState } from '../../../../../shared/dashboard'
import { isServerActiveStatus, type ServerRuntimeSnapshot } from '../../../../../shared/server-runtime'
import AppSidebar from '../../../components/shared/AppSidebar/AppSidebar'
import Card from '../../../components/shared/Card/Card'
import MaterialIcon from '../../../components/shared/MaterialIcon/MaterialIcon'
import Toast from '../../../components/shared/Toast/Toast'
import { getErrorMessage } from '../../../utils/error-message'
import {
  applyRuntimeSnapshotToServerDisplayState,
  loadServerDisplayState
} from '../../../utils/server-display-state'
import { formatLatestSaveLabel, getServerSaveSyncBadge } from '../../../utils/server-sync-ui'
import { getDashboardPrimaryActionView } from '../dashboard-header-action'
import type { DashboardPrimaryActionKind } from '../dashboard-header-action.model'
import ConsoleOutput from '../components/ConsoleOutput/ConsoleOutput'
import DashboardStatCard from '../components/DashboardStatCard/DashboardStatCard'
import ServerHeader from '../components/ServerHeader/ServerHeader'
import ServerStatePanel from '../components/ServerStatePanel/ServerStatePanel'
import TopBar from '../components/TopBar/TopBar'

interface DashboardViewProps {
  serverDisplayState: ServerDisplayState
  onServerDisplayStateChange: (serverDisplayState: ServerDisplayState) => void
  onNavigateToServers: () => void
  onOpenSettings: () => void
  onSignOut: () => void
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

function DashboardView({
  serverDisplayState,
  onServerDisplayStateChange,
  onNavigateToServers,
  onOpenSettings,
  onSignOut
}: DashboardViewProps): React.JSX.Element {
  const serverDisplayStateRef = useRef(serverDisplayState)
  const [runtimeErrorMessage, setRuntimeErrorMessage] = useState<string | null>(null)
  const [errorCopyStatus, setErrorCopyStatus] = useState<CopyStatus>('idle')
  const [addressCopyStatus, setAddressCopyStatus] = useState<CopyStatus>('idle')
  const [isServerToggleAnimating, setIsServerToggleAnimating] = useState(false)
  const [connectionDetailsOpen, setConnectionDetailsOpen] = useState(false)
  const [downloadEulaAccepted, setDownloadEulaAccepted] = useState(false)
  const [isInitialSnapshotRefreshing, setIsInitialSnapshotRefreshing] = useState(true)
  const [initialLoadErrorMessage, setInitialLoadErrorMessage] = useState<string | null>(null)

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

  const refreshDashboardAfterDownload = useCallback(async (): Promise<void> => {
    const nextRuntimeSnapshot = await window.chunkShare.serverRuntime.getSnapshot()

    await refreshServerDisplayState(nextRuntimeSnapshot)
  }, [refreshServerDisplayState])

  useEffect(() => {
    let shouldIgnoreResult = false

    async function refreshInitialServerDisplayState(): Promise<void> {
      try {
        const nextServerDisplayState = await loadServerDisplayState()

        if (!shouldIgnoreResult) {
          updateServerDisplayState(nextServerDisplayState)
        }
      } catch (error: unknown) {
        if (!shouldIgnoreResult) {
          setInitialLoadErrorMessage(getErrorMessage(error, 'Unable to refresh server data.'))
        }
      } finally {
        if (!shouldIgnoreResult) {
          setIsInitialSnapshotRefreshing(false)
        }
      }
    }

    refreshInitialServerDisplayState()

    return () => {
      shouldIgnoreResult = true
    }
  }, [updateServerDisplayState])

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

  async function downloadServer(): Promise<void> {
    setRuntimeErrorMessage(null)
    setIsServerToggleAnimating(true)

    try {
      await window.chunkShare.serverSetup.downloadSharedServer({
        eulaAccepted: downloadEulaAccepted
      })

      await refreshDashboardAfterDownload()
      setDownloadEulaAccepted(false)
    } catch (error: unknown) {
      setRuntimeErrorMessage(getErrorMessage(error, 'Unable to download server.'))
    } finally {
      setIsServerToggleAnimating(false)
    }
  }

  async function downloadLatestSave(): Promise<void> {
    setRuntimeErrorMessage(null)
    setIsServerToggleAnimating(true)

    try {
      await window.chunkShare.serverRuntime.downloadSharedSave()
      await refreshDashboardAfterDownload()
    } catch (error: unknown) {
      setRuntimeErrorMessage(getErrorMessage(error, 'Unable to download latest save.'))
    } finally {
      setIsServerToggleAnimating(false)
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
    setInitialLoadErrorMessage(null)
    setRuntimeErrorMessage(null)
    setErrorCopyStatus('idle')
  }

  function handleHeaderServerAction(): void {
    const actionByKind: Record<DashboardPrimaryActionKind, () => void> = {
      join: () => setConnectionDetailsOpen(true),
      'download-server': () => {
        downloadServer()
      },
      'download-save': () => {
        downloadLatestSave()
      },
      'toggle-server': () => {
        handleServerToggle()
      }
    }

    actionByKind[primaryActionView.kind]()
  }

  const dashboardSnapshot = serverDisplayState
  const primaryActionView = getDashboardPrimaryActionView({
    dashboardSnapshot,
    downloadEulaAccepted
  })
  const primaryActionIsDisabled = isInitialSnapshotRefreshing || primaryActionView.isDisabled
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
            server={{
              name: dashboardSnapshot.serverName,
              status: dashboardSnapshot.serverStatus
            }}
            connection={{
              connectionAddress: dashboardSnapshot.connectionAddress,
              connectionAddressDetails,
              connectionDetailsOpen,
              copyConnectionDetailsLabel: addressCopyButtonLabel,
              copyConnectionDetailsStateClass: addressCopyButtonStateClass,
              onCopyConnectionAddress: copyConnectionAddress,
              onCopyConnectionAddressDetails: copyConnectionAddressDetails,
              onCloseConnectionDetails: closeConnectionDetails,
              onToggleConnectionDetails: toggleConnectionDetails
            }}
            primaryAction={{
              disabled: primaryActionIsDisabled,
              icon: primaryActionView.icon,
              isAnimating: isServerToggleAnimating,
              label: primaryActionView.label,
              tone: primaryActionView.tone,
              tooltip: primaryActionView.tooltip,
              onClick: handleHeaderServerAction
            }}
            downloadEula={{
              accepted: downloadEulaAccepted,
              isVisible: primaryActionView.kind === 'download-server',
              onChange: setDownloadEulaAccepted
            }}
          />

          <div className="dashboard-grid">
            <ServerStatePanel
              lastActiveLabel={lastActiveLabel}
              snapshot={dashboardSnapshot}
              toggleDisabled={primaryActionIsDisabled}
              toggleButtonAriaLabel={primaryActionView.ariaLabel}
              toggleButtonTooltip={primaryActionView.tooltip}
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

          {isInitialSnapshotRefreshing && (
            <div className="dashboard-loading-overlay" role="status" aria-live="polite">
              <div className="dashboard-loading-indicator">
                <MaterialIcon name="sync" />
                <span>Syncing server data...</span>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

export default DashboardView
