import './DashboardView.css'

import { useEffect, useState } from 'react'
import type { ConsoleLogLine, DashboardSnapshot } from '../../../../../shared/dashboard'
import AppSidebar from '../../../components/shared/AppSidebar/AppSidebar'
import ConsoleOutput from '../components/ConsoleOutput/ConsoleOutput'
import DashboardStatCard from '../components/DashboardStatCard/DashboardStatCard'
import ServerHeader from '../components/ServerHeader/ServerHeader'
import ServerStatePanel from '../components/ServerStatePanel/ServerStatePanel'
import TopBar from '../components/TopBar/TopBar'

interface DashboardPreviewProps {
  snapshot: DashboardSnapshot
}

type ConsoleLogEntry = Pick<ConsoleLogLine, 'source' | 'message' | 'tone'>

const STARTED_SERVER_LOGS: ConsoleLogEntry[] = [
  {
    source: 'Server thread/INFO',
    message: 'Preparing spawn area for world "Vanilla Survival"',
    tone: 'default'
  },
  {
    source: 'Server thread/INFO',
    message: 'Starting Minecraft server on play.chunkshare.app',
    tone: 'default'
  },
  {
    source: 'Server thread/INFO',
    message: 'Done! Server is ready for players.',
    tone: 'success'
  }
]

const STOPPED_SERVER_LOGS: ConsoleLogEntry[] = [
  {
    source: 'Server thread/INFO',
    message: 'Stopping server',
    tone: 'default'
  },
  {
    source: 'Server thread/INFO',
    message: 'Saving players',
    tone: 'default'
  },
  {
    source: 'Server thread/INFO',
    message: 'Saving worlds',
    tone: 'default'
  },
  {
    source: 'Server thread/INFO',
    message: 'Server stopped gracefully.',
    tone: 'success'
  }
]

function getConsoleTimestamp(): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(new Date())
}

function createConsoleLogs(prefix: string, entries: ConsoleLogEntry[]): ConsoleLogLine[] {
  const timestamp = getConsoleTimestamp()

  return entries.map((entry, index) => ({
    id: `${prefix}-${timestamp}-${index}`,
    timestamp,
    ...entry
  }))
}

function startServer(snapshot: DashboardSnapshot): DashboardSnapshot {
  return {
    ...snapshot,
    serverStatus: 'running',
    lastActiveLabel: 'Active now',
    currentHost: snapshot.signedInUser?.name ?? 'You',
    players: {
      ...snapshot.players,
      online: 1
    },
    resources: {
      cpuPercent: 18.4,
      memoryUsedMb: 2460,
      memoryTotalMb: snapshot.resources.memoryTotalMb
    },
    consoleLogs: createConsoleLogs('server-started', STARTED_SERVER_LOGS)
  }
}

function stopServer(snapshot: DashboardSnapshot): DashboardSnapshot {
  return {
    ...snapshot,
    serverStatus: 'stopped',
    lastActiveLabel: 'Just now',
    currentHost: null,
    latestSaveLabel: 'Just now',
    players: {
      ...snapshot.players,
      online: 0
    },
    resources: {
      cpuPercent: 0,
      memoryUsedMb: 0,
      memoryTotalMb: snapshot.resources.memoryTotalMb
    },
    consoleLogs: createConsoleLogs('server-stopped', STOPPED_SERVER_LOGS)
  }
}

function DashboardView({ snapshot }: DashboardPreviewProps): React.JSX.Element {
  const [dashboardSnapshot, setDashboardSnapshot] = useState(snapshot)
  const [isServerToggleAnimating, setIsServerToggleAnimating] = useState(false)

  useEffect(() => {
    if (!isServerToggleAnimating) {
      return undefined
    }

    const animationTimer = window.setTimeout(() => {
      setIsServerToggleAnimating(false)
    }, 520)

    return () => window.clearTimeout(animationTimer)
  }, [isServerToggleAnimating])

  function handleServerToggle(): void {
    setDashboardSnapshot((currentSnapshot) =>
      currentSnapshot.serverStatus === 'running'
        ? stopServer(currentSnapshot)
        : startServer(currentSnapshot)
    )
    setIsServerToggleAnimating(true)
  }

  return (
    <div
      className={`dashboard-screen dashboard-screen-${dashboardSnapshot.serverStatus}${
        isServerToggleAnimating ? ' is-server-toggle-animating' : ''
      }`}
    >
      <AppSidebar />

      <div className="dashboard-main">
        <TopBar serverName={dashboardSnapshot.serverName} user={dashboardSnapshot.signedInUser} />

        <main className="dashboard-content">
          <ServerHeader
            name={dashboardSnapshot.serverName}
            status={dashboardSnapshot.serverStatus}
            connectionAddress={dashboardSnapshot.connectionAddress}
            isAnimating={isServerToggleAnimating}
            onToggleServer={handleServerToggle}
          />

          <div className="dashboard-grid">
            <ServerStatePanel snapshot={dashboardSnapshot} onToggleServer={handleServerToggle} />

            <div className="dashboard-side-stats">
              <DashboardStatCard
                icon="save"
                label="Latest Save"
                value={dashboardSnapshot.latestSaveLabel}
              />
              <DashboardStatCard
                icon="info"
                label="World Version"
                value={`${dashboardSnapshot.minecraftVersion} (${dashboardSnapshot.serverType})`}
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
