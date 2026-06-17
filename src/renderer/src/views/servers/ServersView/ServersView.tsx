import './ServersView.css'

import { useEffect, useState } from 'react'
import type { DashboardSnapshot } from '../../../../../shared/dashboard'
import type { StorageSnapshot } from '../../../../../shared/domain'
import type { ServerRuntimeSnapshot } from '../../../../../shared/server-runtime'
import { ServerSyncStatus } from '../../../../../shared/server-sync'
import AppSidebar from '../../../components/shared/AppSidebar/AppSidebar'
import Button from '../../../components/shared/Button/Button'
import ConfirmationDialog from '../../../components/shared/ConfirmationDialog/ConfirmationDialog'
import MaterialIcon from '../../../components/shared/MaterialIcon/MaterialIcon'
import { formatLatestSaveLabel } from '../../../utils/server-sync-ui'
import TopBar from '../../dashboard/components/TopBar/TopBar'
import ServerCard, { type ServerCardSummary } from '../components/ServerCard/ServerCard'

interface ServersViewProps {
  onCreateServer: () => void
  onDeleteServer: () => Promise<void>
  snapshot: DashboardSnapshot
  storageSnapshot: StorageSnapshot | null
  onOpenServer: () => void
  onRefreshStorageSnapshot: () => Promise<void>
}

const SINGLE_SERVER_DISABLED_REASON = 'Only one server is supported in the MVP.'
const STORAGE_REFRESH_INTERVAL_MS = 3_000
type CopyStatus = 'idle' | 'copied' | 'failed'

function formatServerType(serverType: string): string {
  return `${serverType.charAt(0).toUpperCase()}${serverType.slice(1)}`
}

function isServerActive(status: ServerRuntimeSnapshot['status']): boolean {
  return status === 'starting' || status === 'running' || status === 'stopping'
}

function createConfiguredServer(
  storageSnapshot: StorageSnapshot | null,
  runtimeSnapshot: ServerRuntimeSnapshot | null,
  signedInUserName: string | null
): ServerCardSummary[] {
  if (!storageSnapshot || storageSnapshot.localState.serverSetup.status !== 'ready') {
    return []
  }

  const { serverConfig } = storageSnapshot.localState
  const serverIsActive = runtimeSnapshot ? isServerActive(runtimeSnapshot.status) : false
  const syncLockedHost =
    storageSnapshot.serverSync.status === ServerSyncStatus.LockedByOther
      ? storageSnapshot.serverSync.lockedBy?.displayName
      : null

  return [
    {
      id: 'configured-server',
      name: serverConfig.name,
      status: runtimeSnapshot?.status ?? 'stopped',
      type: formatServerType(serverConfig.serverType),
      minecraftVersion: serverConfig.minecraftVersion,
      latestSaveLabel: formatLatestSaveLabel(storageSnapshot.serverSync.latestSave),
      syncStatus: storageSnapshot.serverSync,
      currentHost: serverIsActive ? (signedInUserName ?? 'You') : (syncLockedHost ?? null),
      players: {
        online: serverIsActive ? (runtimeSnapshot?.players.online ?? 0) : 0,
        max: runtimeSnapshot?.players.max ?? 5
      }
    }
  ]
}

function ServersView({
  snapshot,
  storageSnapshot,
  onCreateServer,
  onDeleteServer,
  onOpenServer,
  onRefreshStorageSnapshot
}: ServersViewProps): React.JSX.Element {
  const [runtimeSnapshot, setRuntimeSnapshot] = useState<ServerRuntimeSnapshot | null>(null)
  const servers = createConfiguredServer(
    storageSnapshot,
    runtimeSnapshot,
    snapshot.signedInUser?.name ?? null
  )
  const hasServers = servers.length > 0
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | null>(null)
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle')
  const [isDeletingServer, setIsDeletingServer] = useState(false)
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
    void onRefreshStorageSnapshot().catch(() => undefined)

    const refreshTimer = window.setInterval(() => {
      void onRefreshStorageSnapshot().catch(() => undefined)
    }, STORAGE_REFRESH_INTERVAL_MS)

    return () => window.clearInterval(refreshTimer)
  }, [onRefreshStorageSnapshot])

  useEffect(() => {
    if (copyStatus === 'idle') {
      return undefined
    }

    const resetCopyStatusTimer = window.setTimeout(() => {
      setCopyStatus('idle')
    }, 1600)

    return () => window.clearTimeout(resetCopyStatusTimer)
  }, [copyStatus])

  async function copyDeleteError(): Promise<void> {
    if (!deleteErrorMessage) {
      return
    }

    try {
      await navigator.clipboard.writeText(deleteErrorMessage)
      setCopyStatus('copied')
    } catch {
      setCopyStatus('failed')
    }
  }

  async function confirmDeleteServer(): Promise<void> {
    setIsDeletingServer(true)
    setDeleteErrorMessage(null)

    try {
      await onDeleteServer()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unable to delete server.'
      setDeleteErrorMessage(message)
    } finally {
      setIsDeletingServer(false)
      setServerPendingDelete(null)
    }
  }

  const copyButtonLabel =
    copyStatus === 'copied' ? 'Copied' : copyStatus === 'failed' ? 'Copy Failed' : 'Copy Error'
  const copyButtonStateClass = copyStatus === 'idle' ? '' : ` is-${copyStatus}`

  return (
    <div className="dashboard-screen servers-screen">
      <AppSidebar
        addServerDisabled={hasServers}
        addServerTitle={hasServers ? SINGLE_SERVER_DISABLED_REASON : undefined}
        onAddServer={hasServers ? undefined : onCreateServer}
      />

      <div className="dashboard-main">
        <TopBar
          user={snapshot.signedInUser}
          breadcrumbs={[{ label: 'Servers' }]}
          createInstanceDisabled={hasServers}
          createInstanceTitle={hasServers ? SINGLE_SERVER_DISABLED_REASON : undefined}
          onCreateInstance={hasServers ? undefined : onCreateServer}
        />

        <main className="dashboard-content servers-content">
          {deleteErrorMessage && (
            <div className="servers-error-message" role="alert">
              <MaterialIcon name="error" />
              <span>{deleteErrorMessage}</span>
              <button
                aria-label={copyButtonLabel}
                className={`servers-error-copy-button${copyButtonStateClass}`}
                title={copyButtonLabel}
                type="button"
                onClick={copyDeleteError}
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
                  deleteDisabled={isDeletingServer}
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
              <Button icon="add" className="servers-empty-action" onClick={onCreateServer}>
                Create Instance
              </Button>
            </section>
          )}
        </main>

        {serverPendingDelete && (
          <ConfirmationDialog
            confirmIcon="delete"
            confirmLabel={isDeletingServer ? 'Deleting...' : 'Delete Server'}
            description="ChunkShare will move the server folder into a local backup before removing it from the server list."
            icon="delete"
            isLoading={isDeletingServer}
            title={`Delete ${serverPendingDelete.name}?`}
            onCancel={() => setServerPendingDelete(null)}
            onConfirm={confirmDeleteServer}
          />
        )}
      </div>
    </div>
  )
}

export default ServersView
