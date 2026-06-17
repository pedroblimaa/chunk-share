import type { DashboardSnapshot, MockUser } from '../../shared/dashboard'
import { ServerLockStatus } from '../../shared/domain'
import type { ServerConfig, StorageSnapshot } from '../../shared/domain'
import type { ServerConnectionAddress } from '../../shared/server-runtime'
import { getServerRuntimeSnapshot } from '../server-runtime/server-runtime-service'
import { getServerSyncSnapshot } from '../server-sync/server-sync-service'
import { getSignedInMockUser } from '../mock-dashboard'

function formatServerType(serverType: ServerConfig['serverType']): string {
  return `${serverType.charAt(0).toUpperCase()}${serverType.slice(1)}`
}

function getCurrentHost(
  storageSnapshot: StorageSnapshot,
  signedInUser: MockUser | null,
  serverIsRunning: boolean
): string | null {
  if (serverIsRunning) {
    return signedInUser?.name ?? 'You'
  }

  return storageSnapshot.serverSync.lockedBy?.displayName ?? null
}

function getSnapshotConnectionAddresses(
  storageSnapshot: StorageSnapshot,
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

function buildDashboardSnapshot(
  storageSnapshot: StorageSnapshot,
  signedInUser: MockUser | null
): DashboardSnapshot {
  const runtimeSnapshot = getServerRuntimeSnapshot()
  const { localState, serverSync } = storageSnapshot
  const serverConfigured = localState.serverSetup.status === 'ready'
  const serverStatus = serverConfigured ? runtimeSnapshot.status : 'not-configured'
  const serverIsRunning =
    runtimeSnapshot.status === 'starting' ||
    runtimeSnapshot.status === 'running' ||
    runtimeSnapshot.status === 'stopping'
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

export async function getDashboardSnapshot(): Promise<DashboardSnapshot> {
  return buildDashboardSnapshot(await getServerSyncSnapshot(), getSignedInMockUser())
}
