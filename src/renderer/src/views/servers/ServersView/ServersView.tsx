import './ServersView.css'

import { useEffect, useState } from 'react'
import { ServerAvailability, type ServerDisplayState } from '../../../../../shared/dashboard'
import { isServerActiveStatus, type ServerRuntimeSnapshot } from '../../../../../shared/server-runtime'
import type { WorldId } from '../../../../../shared/world'
import AppSidebar from '../../../components/shared/AppSidebar/AppSidebar'
import Button from '../../../components/shared/Button/Button'
import ConfirmationDialog from '../../../components/shared/ConfirmationDialog/ConfirmationDialog'
import MaterialIcon from '../../../components/shared/MaterialIcon/MaterialIcon'
import { getErrorMessage } from '../../../utils/error-message'
import { formatLatestSaveLabel } from '../../../utils/server-sync-ui'
import TopBar from '../../dashboard/components/TopBar/TopBar'
import ServerCard, { type ServerCardSummary } from '../components/ServerCard/ServerCard'

interface ServersViewProps {
  isSidebarOpen: boolean
  onCreateServer: () => void
  onCloseSidebar: () => void
  onDeleteServer: (worldId: WorldId) => Promise<void>
  onJoinSharedWorld: () => void
  serverDisplayState: ServerDisplayState
  onOpenServer: (worldId: WorldId) => void
  onOpenSettings: () => void
  onSignOut: () => void
  onRefreshServerDisplayState: () => Promise<void>
  onToggleSidebar: () => void
}

const RUNNING_SERVER_DISABLED_REASON = 'Stop the running server before creating another one.'
type CopyStatus = 'idle' | 'copied' | 'failed'

function createConfiguredServers(
  serverDisplayState: ServerDisplayState,
  runtimeSnapshot: ServerRuntimeSnapshot | null
): ServerCardSummary[] {
  return serverDisplayState.worlds.map((world) => {
    const serverIsActive = Boolean(
      runtimeSnapshot &&
      runtimeSnapshot.runningWorldId === world.worldId &&
      isServerActiveStatus(runtimeSnapshot.status)
    )

    return {
      id: world.worldId,
      name: world.serverName,
      status: serverIsActive ? (runtimeSnapshot?.status ?? world.serverStatus) : world.serverStatus,
      type: world.serverType,
      minecraftVersion: world.minecraftVersion,
      latestSaveLabel: formatLatestSaveLabel(world.syncStatus.latestSave),
      syncStatus: world.syncStatus,
      serverAvailability: world.serverAvailability,
      currentHost: serverIsActive ? (serverDisplayState.signedInUser?.name ?? 'You') : world.currentHost,
      availability: {
        cloud: world.syncStatus.cloudSaveVersion !== null,
        device: world.serverAvailability === ServerAvailability.LocalReady
      },
      players: {
        online: serverIsActive ? (runtimeSnapshot?.players.online ?? 0) : 0,
        max: serverIsActive ? (runtimeSnapshot?.players.max ?? world.players.max) : world.players.max
      }
    }
  })
}

function ServersView({
  isSidebarOpen,
  serverDisplayState,
  onCreateServer,
  onCloseSidebar,
  onDeleteServer,
  onJoinSharedWorld,
  onOpenServer,
  onOpenSettings,
  onSignOut,
  onRefreshServerDisplayState,
  onToggleSidebar
}: ServersViewProps): React.JSX.Element {
  const [runtimeSnapshot, setRuntimeSnapshot] = useState<ServerRuntimeSnapshot | null>(null)
  const servers = createConfiguredServers(serverDisplayState, runtimeSnapshot)
  const hasServers = servers.length > 0
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle')
  const [isDeletingServer, setIsDeletingServer] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [serverPendingDelete, setServerPendingDelete] = useState<ServerCardSummary | null>(null)

  useEffect(() => {
    let isMounted = true

    window.chunkShare.serverRuntime
      .getSnapshot()
      .then((nextRuntimeSnapshot) => {
        if (isMounted) {
          setRuntimeSnapshot(nextRuntimeSnapshot)
        }
      })
      .catch(() => undefined)

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    return window.chunkShare.serverRuntime.onEvent((runtimeEvent) => {
      setRuntimeSnapshot(runtimeEvent.snapshot)

      if (!isServerActiveStatus(runtimeEvent.snapshot.status)) {
        void onRefreshServerDisplayState().catch(() => undefined)
      }
    })
  }, [onRefreshServerDisplayState])

  useEffect(() => {
    void onRefreshServerDisplayState().catch(() => undefined)
  }, [onRefreshServerDisplayState])

  useEffect(() => {
    if (copyStatus === 'idle') {
      return undefined
    }

    const resetCopyStatusTimer = window.setTimeout(() => {
      setCopyStatus('idle')
    }, 1600)

    return () => window.clearTimeout(resetCopyStatusTimer)
  }, [copyStatus])

  async function copyError(): Promise<void> {
    if (!errorMessage) {
      return
    }

    try {
      await navigator.clipboard.writeText(errorMessage)
      setCopyStatus('copied')
    } catch {
      setCopyStatus('failed')
    }
  }

  async function confirmDeleteServer(): Promise<void> {
    setIsDeletingServer(true)
    setErrorMessage(null)

    try {
      if (!serverPendingDelete) {
        return
      }

      await onDeleteServer(serverPendingDelete.id)
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error, 'Unable to remove server.'))
    } finally {
      setIsDeletingServer(false)
      setServerPendingDelete(null)
    }
  }

  async function refreshServers(): Promise<void> {
    setErrorMessage(null)
    setIsRefreshing(true)

    try {
      await onRefreshServerDisplayState()
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error, 'Unable to refresh servers.'))
    } finally {
      setIsRefreshing(false)
    }
  }

  const copyButtonLabel =
    copyStatus === 'copied' ? 'Copied' : copyStatus === 'failed' ? 'Copy Failed' : 'Copy Error'
  const copyButtonStateClass = copyStatus === 'idle' ? '' : ` is-${copyStatus}`
  const runningWorldId = runtimeSnapshot
    ? isServerActiveStatus(runtimeSnapshot.status)
      ? runtimeSnapshot.runningWorldId
      : null
    : serverDisplayState.runningWorldId
  const serverIsActive = runningWorldId !== null
  const createDisabled = serverIsActive

  return (
    <div className="dashboard-screen servers-screen">
      <AppSidebar
        activeItem="servers"
        isOpen={isSidebarOpen}
        onClose={onCloseSidebar}
        onOpenServers={onRefreshServerDisplayState}
        onOpenSettings={onOpenSettings}
      />

      <div className="dashboard-main">
        <TopBar
          isSidebarOpen={isSidebarOpen}
          user={serverDisplayState.signedInUser}
          breadcrumbs={[{ label: 'Servers' }]}
          createServerDisabled={createDisabled}
          createServerTitle={createDisabled ? RUNNING_SERVER_DISABLED_REASON : undefined}
          refreshAction={{ isRefreshing, label: 'Refresh servers', onClick: refreshServers }}
          onCreateServer={createDisabled ? undefined : onCreateServer}
          onOpenSettings={onOpenSettings}
          onSignOut={onSignOut}
          onToggleSidebar={onToggleSidebar}
        />

        <main className="dashboard-content servers-content">
          {errorMessage && (
            <div className="servers-error-message" role="alert">
              <MaterialIcon name="error" />
              <span>{errorMessage}</span>
              <button
                aria-label={copyButtonLabel}
                className={`servers-error-copy-button${copyButtonStateClass}`}
                type="button"
                onClick={copyError}
              >
                <MaterialIcon
                  name={
                    copyStatus === 'copied'
                      ? 'check'
                      : copyStatus === 'failed'
                        ? 'error_outline'
                        : 'content_copy'
                  }
                />
              </button>
            </div>
          )}

          {hasServers ? (
            <section className="servers-grid" aria-label="Servers">
              {servers.map((server, index) => (
                <ServerCard
                  animationDelayMs={index * 80}
                  deleteDisabled={isDeletingServer || (serverIsActive && runningWorldId === server.id)}
                  deleteTitle={
                    serverIsActive && runningWorldId === server.id
                      ? 'Stop this server before removing it.'
                      : undefined
                  }
                  key={server.id}
                  server={server}
                  onDelete={() => setServerPendingDelete(server)}
                  onOpen={() => onOpenServer(server.id)}
                />
              ))}
            </section>
          ) : (
            <section className="servers-empty-state">
              <MaterialIcon name="dns" />
              <h3>No servers yet</h3>
              <p>Create your first managed Minecraft server to start sharing a world.</p>
              <div className="servers-empty-actions">
                <Button icon="add" onClick={onCreateServer}>
                  Create Server
                </Button>
                <Button icon="link" variant="secondary" onClick={onJoinSharedWorld}>
                  Join Shared World
                </Button>
              </div>
            </section>
          )}
        </main>

        {serverPendingDelete && (
          <ConfirmationDialog
            confirmIcon="delete"
            confirmLabel={isDeletingServer ? 'Removing...' : 'Remove Server'}
            description="ChunkShare will keep a local backup. If you own this shared world, it will also be deleted from Google Drive and friends will lose access."
            icon="delete"
            isLoading={isDeletingServer}
            title={`Remove ${serverPendingDelete.name}?`}
            onCancel={() => setServerPendingDelete(null)}
            onConfirm={confirmDeleteServer}
          />
        )}
      </div>
    </div>
  )
}

export default ServersView
