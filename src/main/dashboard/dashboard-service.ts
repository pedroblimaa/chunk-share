import type { MockUser, ServerDisplayState } from '../../shared/dashboard'
import {
  ServerHostingStatus,
  ServerLockStatus,
  type ServerConfig,
  type ServerStatus,
  type ServerStorageSnapshot
} from '../../shared/domain'
import { isServerActiveStatus, type ServerConnectionAddress } from '../../shared/server-runtime'
import { ServerSyncStatus } from '../../shared/server-sync'
import { getServerRuntimeSnapshot } from '../server-runtime/server-runtime-service'
import { getServerSyncSnapshot } from '../server-sync/server-sync-service'
import { getSignedInMockUser } from '../mock-dashboard'

function formatServerType(serverType: ServerConfig['serverType']): string {
  return `${serverType.charAt(0).toUpperCase()}${serverType.slice(1)}`
}

function getCurrentHost(
  storageSnapshot: ServerStorageSnapshot,
  signedInUser: MockUser | null,
  serverIsRunning: boolean
): string | null {
  if (serverIsRunning) {
    return signedInUser?.name ?? 'You'
  }

  return storageSnapshot.serverSync.lockedBy?.displayName ?? null
}

function getSnapshotConnectionAddresses(
  storageSnapshot: ServerStorageSnapshot,
  runtimeAddresses: ServerConnectionAddress[],
  serverIsRunning: boolean
): ServerConnectionAddress[] {
  if (serverIsRunning) {
    return runtimeAddresses
  }

  return storageSnapshot.serverLock.status === ServerLockStatus.Locked
    ? storageSnapshot.serverLock.connectionAddresses
    : []
}

function getPrimaryConnectionAddress(addresses: ServerConnectionAddress[]): string | null {
  return addresses.find((address) => address.isPrimary)?.address ?? addresses[0]?.address ?? null
}

function getRemoteHostingStatus(storageSnapshot: ServerStorageSnapshot): ServerStatus | null {
  if (
    storageSnapshot.serverSync.status !== ServerSyncStatus.LockedByOther ||
    storageSnapshot.serverLock.status !== ServerLockStatus.Locked
  ) {
    return null
  }

  const statusByHostingStatus: Record<ServerHostingStatus, ServerStatus> = {
    [ServerHostingStatus.Starting]: 'starting',
    [ServerHostingStatus.Running]: 'running',
    [ServerHostingStatus.Stopping]: 'stopping'
  }

  return statusByHostingStatus[storageSnapshot.serverLock.hostingStatus]
}

function getDisplayServerStatus(
  storageSnapshot: ServerStorageSnapshot,
  runtimeStatus: ServerStatus,
  serverConfigured: boolean
): ServerStatus {
  if (!serverConfigured) {
    return 'not-configured'
  }

  if (isServerActiveStatus(runtimeStatus)) {
    return runtimeStatus
  }

  return getRemoteHostingStatus(storageSnapshot) ?? runtimeStatus
}

function buildServerDisplayState(
  storageSnapshot: ServerStorageSnapshot,
  signedInUser: MockUser | null
): ServerDisplayState {
  const runtimeSnapshot = getServerRuntimeSnapshot()
  const { localState, serverSync } = storageSnapshot
  const serverConfigured = localState.serverSetup.status === 'ready'
  const serverStatus = getDisplayServerStatus(
    storageSnapshot,
    runtimeSnapshot.status,
    serverConfigured
  )
  const serverIsRunning = isServerActiveStatus(runtimeSnapshot.status)
  const connectionAddresses = getSnapshotConnectionAddresses(
    storageSnapshot,
    runtimeSnapshot.connectionAddresses,
    serverIsRunning
  )

  return {
    signedInUser,
    serverName: localState.serverConfig.name,
    serverStatus,
    serverType: formatServerType(localState.serverConfig.serverType),
    minecraftVersion: localState.serverConfig.minecraftVersion,
    currentHost: getCurrentHost(storageSnapshot, signedInUser, serverIsRunning),
    syncStatus: serverSync,
    connectionAddress: getPrimaryConnectionAddress(connectionAddresses),
    connectionAddresses,
    players: runtimeSnapshot.players,
    resources: runtimeSnapshot.resources,
    consoleLogs: runtimeSnapshot.logs,
    allowedPlayers: signedInUser
      ? [
          {
            id: signedInUser.id,
            name: signedInUser.name,
            status: runtimeSnapshot.players.online > 0 ? 'online' : 'offline'
          }
        ]
      : []
  }
}

export async function getServerDisplayState(): Promise<ServerDisplayState> {
  return buildServerDisplayState(await getServerSyncSnapshot(), getSignedInMockUser())
}
