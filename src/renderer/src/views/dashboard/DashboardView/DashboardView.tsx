import './DashboardView.css'

import { useEffect, useState } from 'react'
import type { DashboardSnapshot } from '../../../../../shared/dashboard'
import type { ServerRuntimeSnapshot } from '../../../../../shared/server-runtime'
import AppSidebar from '../../../components/shared/AppSidebar/AppSidebar'
import MaterialIcon from '../../../components/shared/MaterialIcon/MaterialIcon'
import ConsoleOutput from '../components/ConsoleOutput/ConsoleOutput'
import DashboardStatCard from '../components/DashboardStatCard/DashboardStatCard'
import ServerHeader from '../components/ServerHeader/ServerHeader'
import ServerStatePanel from '../components/ServerStatePanel/ServerStatePanel'
import TopBar from '../components/TopBar/TopBar'

interface DashboardPreviewProps {
  snapshot: DashboardSnapshot
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

const MOCK_LATEST_SAVE_LABEL = '2 hours ago'
const MOCK_WORLD_VERSION_LABEL = '1.21.1'

function getPrimaryConnectionAddress(runtimeSnapshot: ServerRuntimeSnapshot): string | null {
  const addresses = runtimeSnapshot.connectionAddresses
  const address = addresses.find((a) => a.isPrimary)?.address ?? addresses[0]?.address

  return address || null
}

function isServerActive(status: ServerRuntimeSnapshot['status']): boolean {
  return status === 'starting' || status === 'running' || status === 'stopping'
}

function getCurrentHost(snapshot: DashboardSnapshot, serverIsActive: boolean): string | null {
  return serverIsActive ? (snapshot.signedInUser?.name ?? 'You') : null
}

function applyRuntimeSnapshot(
  snapshot: DashboardSnapshot,
  runtimeSnapshot: ServerRuntimeSnapshot
): DashboardSnapshot {
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

  return {
    ...snapshot,
    serverStatus:
      snapshot.serverStatus === 'not-configured' && runtimeSnapshot.status === 'stopped'
        ? snapshot.serverStatus
        : runtimeSnapshot.status,
    lastActiveLabel: serverIsActive ? 'Active now' : snapshot.lastActiveLabel,
    currentHost: getCurrentHost(snapshot, serverIsActive),
    connectionAddress: getPrimaryConnectionAddress(runtimeSnapshot),
    players,
    resources,
    consoleLogs: runtimeSnapshot.logs
  }
}

function DashboardView({
  snapshot,
  onNavigateToServers
}: DashboardPreviewProps): React.JSX.Element {
  const [dashboardSnapshot, setDashboardSnapshot] = useState(snapshot)
  const [runtimeSnapshot, setRuntimeSnapshot] = useState<ServerRuntimeSnapshot | null>(null)
  const [runtimeErrorMessage, setRuntimeErrorMessage] = useState<string | null>(null)
  const [errorCopyStatus, setErrorCopyStatus] = useState<CopyStatus>('idle')
  const [addressCopyStatus, setAddressCopyStatus] = useState<CopyStatus>('idle')
  const [isServerToggleAnimating, setIsServerToggleAnimating] = useState(false)

  useEffect(() => {
    let isMounted = true

    window.chunkShare.serverRuntime
      .getSnapshot()
      .then((nextRuntimeSnapshot) => {
        if (!isMounted) {
          return
        }

        setRuntimeSnapshot(nextRuntimeSnapshot)
        setDashboardSnapshot((currentSnapshot) =>
          applyRuntimeSnapshot(currentSnapshot, nextRuntimeSnapshot)
        )
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
  }, [])

  useEffect(() => {
    return window.chunkShare.serverRuntime.onEvent((runtimeEvent) => {
      setRuntimeSnapshot(runtimeEvent.snapshot)
      setRuntimeErrorMessage(runtimeEvent.snapshot.errorMessage)
      setDashboardSnapshot((currentSnapshot) =>
        applyRuntimeSnapshot(currentSnapshot, runtimeEvent.snapshot)
      )
    })
  }, [])

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

    try {
      const nextRuntimeSnapshot =
        dashboardSnapshot.serverStatus === 'running'
          ? await window.chunkShare.serverRuntime.stop()
          : await window.chunkShare.serverRuntime.start()

      setRuntimeSnapshot(nextRuntimeSnapshot)
      setDashboardSnapshot((currentSnapshot) =>
        applyRuntimeSnapshot(currentSnapshot, nextRuntimeSnapshot)
      )
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
    if (!connectionAddressDetails) {
      return
    }

    try {
      await navigator.clipboard.writeText(connectionAddressDetails)
      setAddressCopyStatus('copied')
    } catch {
      setAddressCopyStatus('failed')
    }
  }

  const toggleDisabled =
    dashboardSnapshot.serverStatus === 'not-configured' ||
    dashboardSnapshot.serverStatus === 'starting' ||
    dashboardSnapshot.serverStatus === 'stopping' ||
    dashboardSnapshot.serverStatus === 'crashed'
  const connectionAddressDetails = runtimeSnapshot?.connectionAddresses
    .map((connectionAddress) => `${connectionAddress.label}: ${connectionAddress.address}`)
    .join(', ')
  const errorCopyButtonLabel = COPY_STATUS_LABELS[errorCopyStatus]
  const errorCopyButtonStateClass = errorCopyStatus === 'idle' ? '' : ` is-${errorCopyStatus}`
  const addressCopyButtonLabel = COPY_STATUS_LABELS[addressCopyStatus]
  const addressCopyButtonStateClass = addressCopyStatus === 'idle' ? '' : ` is-${addressCopyStatus}`

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

          {connectionAddressDetails && (
            <div className="dashboard-runtime-addresses">
              <MaterialIcon name="lan" />
              <span>{connectionAddressDetails}</span>
              <button
                aria-label={addressCopyButtonLabel}
                className={`dashboard-runtime-copy-button${addressCopyButtonStateClass}`}
                title={addressCopyButtonLabel}
                type="button"
                onClick={copyConnectionAddressDetails}
              >
                <MaterialIcon name={COPY_STATUS_ICONS[addressCopyStatus]} />
              </button>
            </div>
          )}

          <ServerHeader
            name={dashboardSnapshot.serverName}
            status={dashboardSnapshot.serverStatus}
            connectionAddress={dashboardSnapshot.connectionAddress}
            isAnimating={isServerToggleAnimating}
            toggleDisabled={toggleDisabled}
            onCopyConnectionAddress={copyConnectionAddress}
            onToggleServer={handleServerToggle}
          />

          <div className="dashboard-grid">
            <ServerStatePanel
              snapshot={dashboardSnapshot}
              toggleDisabled={toggleDisabled}
              onToggleServer={handleServerToggle}
            />

            <div className="dashboard-side-stats">
              <DashboardStatCard
                icon="save"
                label="Latest Save"
                value={MOCK_LATEST_SAVE_LABEL}
                badge="Mocked"
              />
              <DashboardStatCard
                icon="info"
                label="World Version"
                value={MOCK_WORLD_VERSION_LABEL}
                badge="Mocked"
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
