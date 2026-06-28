import { ServerAvailability, type SignedInUser, type ServerDisplayState } from '../../shared/dashboard'
import {
  ServerHostingStatus,
  ServerLockStatus,
  type Player,
  type ServerConfig,
  type ServerStatus,
  type ServerStorageSnapshot
} from '../../shared/domain'
import {
  isServerActiveStatus,
  isServerRuntimeBusyStatus,
  type ServerConnectionAddress
} from '../../shared/server-runtime'
import { ServerSyncStatus } from '../../shared/server-sync'
import { getServerRuntimeSnapshot } from '../server-runtime/server-runtime-service'
import { getServerSyncSnapshot } from '../server-sync/server-sync-service'

function formatServerType(serverType: ServerConfig['serverType']): string {
  return `${serverType.charAt(0).toUpperCase()}${serverType.slice(1)}`
}

function getCurrentHost(
  storageSnapshot: ServerStorageSnapshot,
  signedInUser: SignedInUser | null,
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
  serverAvailability: ServerAvailability
): ServerStatus {
  if (serverAvailability === ServerAvailability.None) {
    return 'not-configured'
  }

  if (isServerRuntimeBusyStatus(runtimeStatus)) {
    return runtimeStatus
  }

  return getRemoteHostingStatus(storageSnapshot) ?? runtimeStatus
}

function getServerAvailability(storageSnapshot: ServerStorageSnapshot): ServerAvailability {
  if (storageSnapshot.localState.serverSetup.status === 'ready') {
    return ServerAvailability.LocalReady
  }

  return storageSnapshot.latestSave ? ServerAvailability.RemoteAvailable : ServerAvailability.None
}

function buildServerDisplayState(storageSnapshot: ServerStorageSnapshot): ServerDisplayState {
  const runtimeSnapshot = getServerRuntimeSnapshot()
  const { localState, serverSync } = storageSnapshot
  const signedInUser = getSignedInUserFromPlayer(localState.player)
  const serverAvailability = getServerAvailability(storageSnapshot)
  const remoteSave =
    serverAvailability === ServerAvailability.RemoteAvailable ? storageSnapshot.latestSave : null
  const serverStatus = getDisplayServerStatus(storageSnapshot, runtimeSnapshot.status, serverAvailability)
  const serverIsActive = isServerActiveStatus(runtimeSnapshot.status)
  const serverIsRunning = runtimeSnapshot.status === 'running'
  const connectionAddresses = getSnapshotConnectionAddresses(
    storageSnapshot,
    runtimeSnapshot.connectionAddresses,
    serverIsRunning
  )

  return {
    signedInUser,
    serverAvailability,
    serverName: remoteSave?.serverName ?? localState.serverConfig.name,
    serverStatus,
    serverType: formatServerType(remoteSave?.serverType ?? localState.serverConfig.serverType),
    minecraftVersion: remoteSave?.minecraftVersion ?? localState.serverConfig.minecraftVersion,
    currentHost: getCurrentHost(storageSnapshot, signedInUser, serverIsActive),
    syncStatus: serverSync,
    connectionAddress: getPrimaryConnectionAddress(connectionAddresses),
    connectionAddresses,
    players: runtimeSnapshot.players,
    resources: runtimeSnapshot.resources,
    consoleLogs: runtimeSnapshot.logs,
    recovery: runtimeSnapshot.recovery,
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
  return buildServerDisplayState(await getServerSyncSnapshot())
}

function getSignedInUserFromPlayer(player: Player | null): SignedInUser | null {
  if (!player) {
    return null
  }

  return {
    id: player.id,
    name: player.displayName,
    email: player.email,
    avatarUrl: player.avatarUrl ?? null,
    avatarInitials: player.avatarInitials
  }
}
