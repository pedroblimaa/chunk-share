import type { DashboardSnapshot, MockUser } from '../../shared/dashboard'
import type { LatestWorld, LocalState, ServerConfig, StorageSnapshot } from '../../shared/domain'
import { getServerRuntimeSnapshot } from '../server-runtime/server-runtime-service'
import { getStorageSnapshot } from '../storage/storage-service'
import { getSignedInMockUser } from '../mock-dashboard'

function formatServerType(serverType: ServerConfig['serverType']): string {
  return `${serverType.charAt(0).toUpperCase()}${serverType.slice(1)}`
}

function formatLatestSaveLabel(latestWorld: LatestWorld): string {
  if (latestWorld.status === 'empty') {
    return 'Not published yet'
  }

  return formatRelativeTime(new Date(latestWorld.uploadedAt))
}

function formatRelativeTime(date: Date): string {
  const elapsedMs = date.getTime() - Date.now()
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000]
  ]

  for (const [unit, unitMs] of units) {
    const value = Math.trunc(elapsedMs / unitMs)

    if (Math.abs(value) >= 1) {
      return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(value, unit)
    }
  }

  return 'Just now'
}

function getWorldVersion(latestWorld: LatestWorld, localState: LocalState): number {
  if (latestWorld.status === 'ready') {
    return latestWorld.worldVersion
  }

  return localState.localWorldVersion ?? 0
}

function getCurrentHost(signedInUser: MockUser | null, serverIsRunning: boolean): string | null {
  return serverIsRunning ? (signedInUser?.name ?? 'You') : null
}

function buildDashboardSnapshot(
  storageSnapshot: StorageSnapshot,
  signedInUser: MockUser | null
): DashboardSnapshot {
  const runtimeSnapshot = getServerRuntimeSnapshot()
  const { latestWorld, localState } = storageSnapshot
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
    lastActiveLabel: serverIsRunning ? 'Active now' : formatLatestSaveLabel(latestWorld),
    currentHost: getCurrentHost(signedInUser, serverIsRunning),
    latestSaveLabel: formatLatestSaveLabel(latestWorld),
    worldVersion: getWorldVersion(latestWorld, localState),
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
  return buildDashboardSnapshot(await getStorageSnapshot(), getSignedInMockUser())
}
