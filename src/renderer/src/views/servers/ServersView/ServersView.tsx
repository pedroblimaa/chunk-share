import './ServersView.css'

import { useEffect, useState } from 'react'
import { ServerAvailability, type ServerDisplayState } from '../../../../../shared/dashboard'
import { isServerActiveStatus, type ServerRuntimeSnapshot } from '../../../../../shared/server-runtime'
import { ServerSyncStatus } from '../../../../../shared/server-sync'
import AppSidebar from '../../../components/shared/AppSidebar/AppSidebar'
import Button from '../../../components/shared/Button/Button'
import ConfirmationDialog from '../../../components/shared/ConfirmationDialog/ConfirmationDialog'
import MaterialIcon from '../../../components/shared/MaterialIcon/MaterialIcon'
import { getErrorMessage } from '../../../utils/error-message'
import { formatLatestSaveLabel } from '../../../utils/server-sync-ui'
import TopBar from '../../dashboard/components/TopBar/TopBar'
import ServerCard, { type ServerCardSummary } from '../components/ServerCard/ServerCard'

interface ServersViewProps {
  onCreateServer: () => void
  onDeleteServer: () => Promise<void>
  onJoinSharedWorld: () => void
  serverDisplayState: ServerDisplayState
  onOpenServer: () => void
  onOpenSettings: () => void
  onSignOut: () => void
  onRefreshServerDisplayState: () => Promise<void>
}

const SINGLE_SERVER_DISABLED_REASON = 'Only one server is supported in the MVP.'
type CopyStatus = 'idle' | 'copied' | 'failed'

function getCardServerStatus(
  serverDisplayState: ServerDisplayState,
  runtimeSnapshot: ServerRuntimeSnapshot | null
): ServerCardSummary['status'] {
  if (runtimeSnapshot && isServerActiveStatus(runtimeSnapshot.status)) {
    return runtimeSnapshot.status
  }

  return serverDisplayState.serverStatus === 'not-configured' ? 'stopped' : serverDisplayState.serverStatus
}

function createConfiguredServer(
  serverDisplayState: ServerDisplayState,
  runtimeSnapshot: ServerRuntimeSnapshot | null,
  signedInUserName: string | null
): ServerCardSummary[] {
  if (serverDisplayState.serverAvailability === ServerAvailability.None) {
    return []
  }

  const serverIsActive = runtimeSnapshot ? isServerActiveStatus(runtimeSnapshot.status) : false
  const syncLockedHost =
    serverDisplayState.syncStatus.status === ServerSyncStatus.LockedByOther
      ? serverDisplayState.syncStatus.lockedBy?.displayName
      : null

  return [
    {
      id: 'configured-server',
      name: serverDisplayState.serverName,
      status: getCardServerStatus(serverDisplayState, runtimeSnapshot),
      type: serverDisplayState.serverType,
      minecraftVersion: serverDisplayState.minecraftVersion,
      latestSaveLabel: formatLatestSaveLabel(serverDisplayState.syncStatus.latestSave),
      syncStatus: serverDisplayState.syncStatus,
      currentHost: serverIsActive
        ? (signedInUserName ?? 'You')
        : (syncLockedHost ?? serverDisplayState.currentHost),
      availability: {
        cloud: serverDisplayState.syncStatus.cloudSaveVersion !== null,
        device: serverDisplayState.serverAvailability === ServerAvailability.LocalReady
      },
      players: {
        online: serverIsActive ? (runtimeSnapshot?.players.online ?? 0) : 0,
        max: runtimeSnapshot?.players.max ?? serverDisplayState.players.max
      }
    }
  ]
}

function ServersView({
  serverDisplayState,
  onCreateServer,
  onDeleteServer,
  onJoinSharedWorld,
  onOpenServer,
  onOpenSettings,
  onSignOut,
  onRefreshServerDisplayState
}: ServersViewProps): React.JSX.Element {
  const [runtimeSnapshot, setRuntimeSnapshot] = useState<ServerRuntimeSnapshot | null>(null)
  const servers = createConfiguredServer(
    serverDisplayState,
    runtimeSnapshot,
    serverDisplayState.signedInUser?.name ?? null
  )
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
    })
  }, [])

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
      await onDeleteServer()
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
  const serverIsActive = runtimeSnapshot ? isServerActiveStatus(runtimeSnapshot.status) : false
  const deleteDisabled = isDeletingServer || serverIsActive
  const deleteDisabledReason = serverIsActive ? 'Stop the hosted server before removing it.' : undefined

  return (
    <div className="dashboard-screen servers-screen">
      <AppSidebar
        activeItem="servers"
        addServerDisabled={hasServers}
        addServerTitle={hasServers ? SINGLE_SERVER_DISABLED_REASON : undefined}
        onAddServer={hasServers ? undefined : onCreateServer}
        onOpenServers={onRefreshServerDisplayState}
        onOpenSettings={onOpenSettings}
      />

      <div className="dashboard-main">
        <TopBar
          user={serverDisplayState.signedInUser}
          breadcrumbs={[{ label: 'Servers' }]}
          createInstanceDisabled={hasServers}
          createInstanceTitle={hasServers ? SINGLE_SERVER_DISABLED_REASON : undefined}
          refreshAction={{ isRefreshing, label: 'Refresh servers', onClick: refreshServers }}
          onCreateInstance={hasServers ? undefined : onCreateServer}
          onOpenSettings={onOpenSettings}
          onSignOut={onSignOut}
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
                  deleteDisabled={deleteDisabled}
                  deleteTitle={deleteDisabledReason}
                  key={server.id}
                  server={server}
                  onDelete={() => setServerPendingDelete(server)}
                  onOpen={onOpenServer}
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
                  Create Instance
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
