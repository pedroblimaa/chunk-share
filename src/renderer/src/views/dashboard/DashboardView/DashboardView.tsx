import './DashboardView.css'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ServerDisplayState } from '../../../../../shared/dashboard'
import type { JavaConfig } from '../../../../../shared/domain'
import type { JavaRuntimeStatus } from '../../../../../shared/java-runtime'
import type { WorldId } from '../../../../../shared/world'
import type {
  GoogleDriveSharingAvailability,
  GoogleDriveSharingState
} from '../../../../../shared/drive-sharing.model'
import { isServerActiveStatus, type ServerRuntimeSnapshot } from '../../../../../shared/server-runtime'
import AppSidebar from '../../../components/shared/AppSidebar/AppSidebar'
import Card from '../../../components/shared/Card/Card'
import MaterialIcon from '../../../components/shared/MaterialIcon/MaterialIcon'
import JavaRuntimeSelector from '../../../components/shared/JavaRuntimeSelector/JavaRuntimeSelector'
import Toast from '../../../components/shared/Toast/Toast'
import { useJavaRuntimeStatus } from '../../../hooks/useJavaRuntimeStatus'
import { getErrorMessage } from '../../../utils/error-message'
import {
  applyRuntimeSnapshotToServerDisplayState,
  loadServerDisplayState
} from '../../../utils/server-display-state'
import { formatLatestSaveLabel } from '../../../utils/server-sync-ui'
import { getDashboardPrimaryActionView } from '../dashboard-header-action'
import type { DashboardPrimaryActionKind } from '../dashboard-header-action.model'
import ConsoleOutput from '../components/ConsoleOutput/ConsoleOutput'
import DashboardStatCard from '../components/DashboardStatCard/DashboardStatCard'
import DriveSharingDialog from '../components/DriveSharingDialog/DriveSharingDialog'
import ServerHeader from '../components/ServerHeader/ServerHeader'
import ServerStatePanel from '../components/ServerStatePanel/ServerStatePanel'
import TopBar from '../components/TopBar/TopBar'

interface DashboardViewProps {
  isSidebarOpen: boolean
  serverDisplayState: ServerDisplayState
  onJavaConfigSaved: (worldId: WorldId, javaConfig: JavaConfig) => void
  onServerDisplayStateChange: (serverDisplayState: ServerDisplayState) => void
  onCreateServer: () => void
  onCloseSidebar: () => void
  onNavigateToServers: () => void
  onOpenSettings: () => void
  onSignOut: () => void
  onToggleSidebar: () => void
}

type CopyStatus = 'idle' | 'copied' | 'failed'

interface SavedJavaRuntimeStatus {
  minecraftVersion: string
  status: JavaRuntimeStatus | null
  worldId: WorldId
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

function DashboardView({
  isSidebarOpen,
  serverDisplayState,
  onJavaConfigSaved,
  onServerDisplayStateChange,
  onCreateServer,
  onCloseSidebar,
  onNavigateToServers,
  onOpenSettings,
  onSignOut,
  onToggleSidebar
}: DashboardViewProps): React.JSX.Element {
  const serverDisplayStateRef = useRef(serverDisplayState)
  const displayStateRequestIdRef = useRef(0)
  const [runtimeErrorMessage, setRuntimeErrorMessage] = useState<string | null>(null)
  const [errorCopyStatus, setErrorCopyStatus] = useState<CopyStatus>('idle')
  const [addressCopyStatus, setAddressCopyStatus] = useState<CopyStatus>('idle')
  const [isServerToggleAnimating, setIsServerToggleAnimating] = useState(false)
  const [isServerDownloadRunning, setIsServerDownloadRunning] = useState(false)
  const [connectionDetailsOpen, setConnectionDetailsOpen] = useState(false)
  const [downloadEulaAccepted, setDownloadEulaAccepted] = useState(false)
  const [isInitialSnapshotRefreshing, setIsInitialSnapshotRefreshing] = useState(true)
  const [isDashboardRefreshing, setIsDashboardRefreshing] = useState(false)
  const [driveSharingAvailability, setDriveSharingAvailability] =
    useState<GoogleDriveSharingAvailability | null>(null)
  const [sharingAvailabilityIsLoaded, setSharingAvailabilityIsLoaded] = useState(false)
  const [sharingDialogIsOpen, setSharingDialogIsOpen] = useState(false)
  const [javaConfig, setJavaConfig] = useState<JavaConfig>(() => serverDisplayState.javaConfig)
  const [savedJavaRuntimeStatus, setSavedJavaRuntimeStatus] = useState<SavedJavaRuntimeStatus | null>(null)
  const [javaConfigIsDirty, setJavaConfigIsDirty] = useState(false)
  const [javaScanId, setJavaScanId] = useState(0)
  const javaRequestIdRef = useRef(0)
  const javaSaveRequestIdRef = useRef(0)
  const javaSaveStartedRequestIdRef = useRef(0)
  const validatesDraftJavaConfig = javaConfigIsDirty || javaScanId > 0
  const { isLoading: isDraftJavaStatusLoading, status: draftJavaStatus } = useJavaRuntimeStatus(
    validatesDraftJavaConfig && serverDisplayState.selectedWorldId ? javaConfig : null,
    serverDisplayState.minecraftVersion,
    undefined,
    javaScanId
  )

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

  useEffect(() => {
    const worldId = serverDisplayState.selectedWorldId
    const minecraftVersion = serverDisplayState.minecraftVersion

    if (!worldId) {
      return
    }

    javaSaveRequestIdRef.current += 1
    const requestId = ++javaRequestIdRef.current
    window.chunkShare.javaRuntime
      .getWorldStatus(worldId, minecraftVersion)
      .then((status) => {
        if (requestId !== javaRequestIdRef.current) {
          return
        }

        setJavaConfig(status.config)
        setSavedJavaRuntimeStatus({ minecraftVersion, status, worldId })
        setJavaConfigIsDirty(false)
        setJavaScanId(0)
      })
      .catch(() => {
        if (requestId === javaRequestIdRef.current) {
          setSavedJavaRuntimeStatus({ minecraftVersion, status: null, worldId })
        }
      })

    return () => {
      javaRequestIdRef.current += 1
    }
  }, [serverDisplayState.minecraftVersion, serverDisplayState.selectedWorldId])

  useEffect(() => {
    const worldId = serverDisplayState.selectedWorldId
    const saveRequestId = javaSaveRequestIdRef.current

    if (
      !worldId ||
      !javaConfigIsDirty ||
      isDraftJavaStatusLoading ||
      !draftJavaStatus?.selectedRuntime ||
      javaSaveStartedRequestIdRef.current === saveRequestId
    ) {
      return
    }

    javaSaveStartedRequestIdRef.current = saveRequestId
    window.chunkShare.javaRuntime
      .saveConfig({ worldId, config: javaConfig })
      .then(() => {
        if (javaSaveRequestIdRef.current !== saveRequestId) {
          return
        }

        setSavedJavaRuntimeStatus({
          minecraftVersion: serverDisplayState.minecraftVersion,
          status: draftJavaStatus,
          worldId
        })
        setJavaConfigIsDirty(false)
        setJavaScanId(0)
        onJavaConfigSaved(worldId, javaConfig)
      })
      .catch((error: unknown) => {
        if (javaSaveRequestIdRef.current === saveRequestId) {
          setRuntimeErrorMessage(getErrorMessage(error, 'Unable to save Java selection.'))
        }
      })
  }, [
    draftJavaStatus,
    isDraftJavaStatusLoading,
    javaConfig,
    javaConfigIsDirty,
    onJavaConfigSaved,
    serverDisplayState.minecraftVersion,
    serverDisplayState.selectedWorldId
  ])

  useEffect(() => {
    window.chunkShare.driveSharing
      .getAvailability()
      .then(setDriveSharingAvailability)
      .catch(() => setDriveSharingAvailability(null))
      .finally(() => setSharingAvailabilityIsLoaded(true))
  }, [])

  const applyRuntimeSnapshotToDisplayState = useCallback(
    (runtimeSnapshot: ServerRuntimeSnapshot): void => {
      displayStateRequestIdRef.current += 1
      updateServerDisplayState(
        applyRuntimeSnapshotToServerDisplayState(serverDisplayStateRef.current, runtimeSnapshot)
      )
    },
    [updateServerDisplayState]
  )

  const refreshServerDisplayState = useCallback(async (): Promise<void> => {
    const requestId = ++displayStateRequestIdRef.current

    try {
      const nextServerDisplayState = await loadServerDisplayState()

      if (requestId !== displayStateRequestIdRef.current) {
        return
      }

      updateServerDisplayState(nextServerDisplayState)
    } catch (error: unknown) {
      if (requestId === displayStateRequestIdRef.current) {
        setRuntimeErrorMessage(getErrorMessage(error, 'Unable to refresh dashboard.'))
      }
    }
  }, [updateServerDisplayState])

  const refreshDashboardAfterDownload = useCallback(async (): Promise<void> => {
    await refreshServerDisplayState()
  }, [refreshServerDisplayState])

  useEffect(() => {
    let isMounted = true

    void refreshServerDisplayState().finally(() => {
      if (isMounted) {
        setIsInitialSnapshotRefreshing(false)
      }
    })

    return () => {
      isMounted = false
      displayStateRequestIdRef.current += 1
    }
  }, [refreshServerDisplayState])

  useEffect(() => {
    return window.chunkShare.serverRuntime.onEvent((runtimeEvent) => {
      setRuntimeErrorMessage(runtimeEvent.snapshot.errorMessage)

      if (runtimeEvent.snapshot.status === 'stopped') {
        void refreshServerDisplayState()
        return
      }

      applyRuntimeSnapshotToDisplayState(runtimeEvent.snapshot)
    })
  }, [applyRuntimeSnapshotToDisplayState, refreshServerDisplayState])

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

  async function refreshDashboard(): Promise<void> {
    setRuntimeErrorMessage(null)
    setIsDashboardRefreshing(true)

    try {
      await refreshServerDisplayState()
    } finally {
      setIsDashboardRefreshing(false)
    }
  }

  async function downloadServer(): Promise<void> {
    setRuntimeErrorMessage(null)
    setIsServerDownloadRunning(true)

    try {
      await window.chunkShare.serverSetup.downloadSharedServer({
        eulaAccepted: downloadEulaAccepted
      })

      await refreshDashboardAfterDownload()
      setDownloadEulaAccepted(false)
    } catch (error: unknown) {
      setRuntimeErrorMessage(getErrorMessage(error, 'Unable to download server.'))
    } finally {
      setIsServerDownloadRunning(false)
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

  async function browseForJava(): Promise<void> {
    const worldId = dashboardSnapshot.selectedWorldId
    const executablePath = await window.chunkShare.javaRuntime.browse()
    if (executablePath && serverDisplayStateRef.current.selectedWorldId === worldId) {
      changeJavaConfig({ mode: 'custom', executablePath })
    }
  }

  function changeJavaConfig(config: JavaConfig): void {
    javaSaveRequestIdRef.current += 1
    setJavaConfig(config)
    setJavaConfigIsDirty(true)
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

  function updateDriveSharingState(sharingState: GoogleDriveSharingState): void {
    setDriveSharingAvailability({ isGoogleDriveActive: true, sharingState })
  }

  function handleHeaderServerAction(): void {
    if (primaryActionView.kind === 'none') {
      return
    }

    const actionByKind: Record<Exclude<DashboardPrimaryActionKind, 'none'>, () => void> = {
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
  const savedJavaStatusIsCurrent =
    savedJavaRuntimeStatus?.worldId === dashboardSnapshot.selectedWorldId &&
    savedJavaRuntimeStatus.minecraftVersion === dashboardSnapshot.minecraftVersion
  const savedJavaStatus = savedJavaStatusIsCurrent ? savedJavaRuntimeStatus.status : null
  const currentJavaStatus = validatesDraftJavaConfig ? draftJavaStatus : savedJavaStatus
  const primaryActionView = getDashboardPrimaryActionView({
    dashboardSnapshot,
    downloadEulaAccepted
  })
  const javaBlocksPrimaryAction =
    primaryActionView.kind === 'download-server' ||
    (primaryActionView.kind === 'toggle-server' && dashboardSnapshot.serverStatus !== 'running')
  const primaryActionIsDisabled =
    isInitialSnapshotRefreshing ||
    isServerDownloadRunning ||
    primaryActionView.isDisabled ||
    (javaBlocksPrimaryAction && (!currentJavaStatus?.selectedRuntime || javaConfigIsDirty))
  const isDashboardLoading =
    isInitialSnapshotRefreshing ||
    isServerDownloadRunning ||
    (dashboardSnapshot.selectedWorldId !== null && !savedJavaStatusIsCurrent)
  const javaActionTooltip = javaBlocksPrimaryAction
    ? (currentJavaStatus?.errorMessage ??
      (isDraftJavaStatusLoading
        ? 'Checking Java compatibility...'
        : javaConfigIsDirty
          ? 'Saving Java selection...'
          : !currentJavaStatus?.selectedRuntime
            ? 'Select a compatible Java installation.'
            : undefined))
    : undefined
  const createServerIsDisabled = dashboardSnapshot.runningWorldId !== null
  const createServerDisabledReason = createServerIsDisabled
    ? 'Stop the running server before creating another one.'
    : undefined
  const connectionAddressDetails = dashboardSnapshot.connectionAddresses
    .map((connectionAddress) => `${connectionAddress.label}: ${connectionAddress.address}`)
    .join(', ')

  const errorCopyButtonLabel = COPY_STATUS_LABELS[errorCopyStatus]
  const addressCopyButtonLabel = COPY_STATUS_LABELS[addressCopyStatus]
  const addressCopyButtonStateClass = addressCopyStatus === 'idle' ? '' : ` is-${addressCopyStatus}`
  const latestSaveLabel = formatLatestSaveLabel(dashboardSnapshot.syncStatus.latestSave)
  const lastActiveLabel = isServerActiveStatus(dashboardSnapshot.serverStatus)
    ? 'Active now'
    : latestSaveLabel
  const driveSharingState = driveSharingAvailability?.sharingState ?? null
  const sharingTooltip = getSharingTooltip(sharingAvailabilityIsLoaded, driveSharingAvailability)

  return (
    <div
      className={`dashboard-screen dashboard-screen-${dashboardSnapshot.serverStatus}${
        isServerToggleAnimating ? ' is-server-toggle-animating' : ''
      }`}
    >
      <AppSidebar
        activeItem="servers"
        isOpen={isSidebarOpen}
        onClose={onCloseSidebar}
        onOpenServers={onNavigateToServers}
        onOpenSettings={onOpenSettings}
      />

      <div className="dashboard-main">
        <TopBar
          isSidebarOpen={isSidebarOpen}
          user={dashboardSnapshot.signedInUser}
          breadcrumbs={[
            { label: 'Servers', onClick: onNavigateToServers },
            { label: dashboardSnapshot.serverName }
          ]}
          createServerDisabled={createServerIsDisabled}
          createServerTitle={createServerDisabledReason}
          refreshAction={{
            isRefreshing: isDashboardRefreshing,
            label: 'Refresh server',
            onClick: refreshDashboard
          }}
          onCreateServer={createServerIsDisabled ? undefined : onCreateServer}
          onOpenSettings={onOpenSettings}
          onSignOut={onSignOut}
          onToggleSidebar={onToggleSidebar}
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
              isAnimating: isServerToggleAnimating || isServerDownloadRunning,
              label: primaryActionView.label,
              tone: primaryActionView.tone,
              tooltip: javaActionTooltip ?? primaryActionView.tooltip,
              onClick: handleHeaderServerAction
            }}
            sharingAction={{
              disabled: driveSharingState === null,
              tooltip: sharingTooltip,
              onClick: () => setSharingDialogIsOpen(true)
            }}
            downloadEula={{
              accepted: downloadEulaAccepted,
              isVisible: primaryActionView.kind === 'download-server',
              onChange: setDownloadEulaAccepted
            }}
          />

          {dashboardSnapshot.selectedWorldId && (
            <JavaRuntimeSelector
              minimal
              config={javaConfig}
              disabled={isServerActiveStatus(dashboardSnapshot.serverStatus) || !savedJavaStatusIsCurrent}
              isLoading={isDraftJavaStatusLoading || !savedJavaStatusIsCurrent}
              status={currentJavaStatus}
              onBrowse={() => browseForJava()}
              onChange={changeJavaConfig}
              onRescan={() => setJavaScanId((current) => current + 1)}
            />
          )}

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
              <div className="dashboard-primary-stats">
                <DashboardStatCard icon="save" label="Latest Save" value={latestSaveLabel} />
                <DashboardStatCard
                  icon="info"
                  label="World Version"
                  value={dashboardSnapshot.minecraftVersion}
                  detail={`(${dashboardSnapshot.serverType})`}
                />
              </div>
              <div className="compact-stat-grid">
                <Card className="compact-stat-card" padding="compact">
                  <p>
                    <MaterialIcon name="dns" />
                    Host
                  </p>
                  <strong>{dashboardSnapshot.currentHost ?? 'None'}</strong>
                </Card>
                <Card className="compact-stat-card" padding="compact">
                  <p>
                    <MaterialIcon name="group" />
                    Players
                  </p>
                  <strong>
                    {dashboardSnapshot.players.online} <span>/ {dashboardSnapshot.players.max}</span>
                  </strong>
                </Card>
              </div>
            </div>
          </div>

          <ConsoleOutput logs={dashboardSnapshot.consoleLogs} />

          {isDashboardLoading && (
            <div className="dashboard-loading-overlay" role="status" aria-live="polite">
              <div className="dashboard-loading-indicator">
                <MaterialIcon name="sync" />
                <span>Preparing server...</span>
              </div>
            </div>
          )}
        </main>

        {sharingDialogIsOpen && driveSharingState && (
          <DriveSharingDialog
            sharingState={driveSharingState}
            onChange={updateDriveSharingState}
            onClose={() => setSharingDialogIsOpen(false)}
          />
        )}
      </div>
    </div>
  )
}

function getSharingTooltip(
  sharingAvailabilityIsLoaded: boolean,
  sharingAvailability: GoogleDriveSharingAvailability | null
): string | undefined {
  if (!sharingAvailabilityIsLoaded) {
    return 'Checking sharing availability...'
  }

  if (!sharingAvailability) {
    return 'Unable to check sharing availability.'
  }

  if (!sharingAvailability.isGoogleDriveActive) {
    return 'Sharing is available only when this world uses Google Drive.'
  }

  return sharingAvailability.sharingState
    ? undefined
    : 'Only the Google Drive folder owner can invite friends.'
}

export default DashboardView
