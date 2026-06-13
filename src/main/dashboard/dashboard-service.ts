import type { DashboardSnapshot, MockUser } from '../../shared/dashboard'
import type { ServerConfig, StorageSnapshot } from '../../shared/domain'
import { getServerRuntimeSnapshot } from '../server-runtime/server-runtime-service'
import { getServerSyncSnapshot } from '../server-sync/server-sync-service'
import { getSignedInMockUser } from '../mock-dashboard'

function formatServerType(serverType: ServerConfig['serverType']): string {
  return `${serverType.charAt(0).toUpperCase()}${serverType.slice(1)}`
}

function getCurrentHost(signedInUser: MockUser | null, serverIsRunning: boolean): string | null {
  return serverIsRunning ? (signedInUser?.name ?? 'You') : null
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

  return {
    signedInUser,
    serverName: localState.serverConfig.name,
    serverStatus,
    serverType: formatServerType(localState.serverConfig.serverType),
    minecraftVersion: localState.serverConfig.minecraftVersion,
    currentHost: getCurrentHost(signedInUser, serverIsRunning),
    syncStatus: serverSync,
    connectionAddress:
      runtimeSnapshot.connectionAddresses.find((address) => address.isPrimary)?.address ??
      runtimeSnapshot.connectionAddresses[0]?.address ??
      null,
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
