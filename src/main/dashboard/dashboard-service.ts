import {
  ServerAvailability,
  type ServerCatalogEntry,
  type ServerDisplayState,
  type SignedInUser
} from '../../shared/dashboard'
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
  type ServerConnectionAddress,
  type ServerRuntimeSnapshot
} from '../../shared/server-runtime'
import { ServerSyncStatus, type ServerSyncSnapshot } from '../../shared/server-sync'
import type { LocalWorldState, WorldId } from '../../shared/world'
import { getServerRuntimeSnapshot } from '../server-runtime/server-runtime-service'
import {
  DEFAULT_JAVA_CONFIG,
  DEFAULT_SERVER_CONFIG,
  DEFAULT_SERVER_LOCK
} from '../storage/core/support/storage-defaults'
import { readAppState } from '../storage/persistence/local-state-store'
import { inspectWorldCatalog, isWorldCatalogEntryVisible } from '../world-catalog/world-catalog-service'

type SelectedWorldDisplayData = Omit<
  ServerDisplayState,
  'signedInUser' | 'selectedWorldId' | 'runningWorldId' | 'worlds'
>

interface WorldDisplayData extends SelectedWorldDisplayData {
  worldId: WorldId
}

export async function getServerDisplayState(): Promise<ServerDisplayState> {
  const appState = await readAppState()
  const runtimeSnapshot = getServerRuntimeSnapshot()
  const signedInUser = getSignedInUserFromPlayer(appState.player)
  const catalog = (await inspectWorldCatalog(appState)).filter(isWorldCatalogEntryVisible)
  const worlds = catalog.map((inspection): WorldDisplayData => {
    if (inspection.error) {
      if (inspection.world.id === appState.selectedWorldId) {
        throw inspection.error
      }

      return createUnavailableWorldDisplayData(inspection.world, inspection.isInstalled)
    }

    if (!inspection.storageSnapshot) {
      return createInstalledOnlyWorldDisplayData(inspection.world)
    }

    return buildWorldDisplayData(
      inspection.world.id,
      inspection.storageSnapshot,
      inspection.isInstalled,
      signedInUser,
      appState.selectedWorldId,
      runtimeSnapshot
    )
  })
  const selectedWorld = worlds.find(({ worldId }) => worldId === appState.selectedWorldId)
  const selectedDisplay = selectedWorld ?? createEmptyWorldDisplayData()

  return {
    signedInUser,
    selectedWorldId: selectedWorld?.worldId ?? null,
    runningWorldId: runtimeSnapshot.runningWorldId,
    worlds: worlds.map(toServerCatalogEntry),
    javaConfig: selectedDisplay.javaConfig,
    serverAvailability: selectedDisplay.serverAvailability,
    serverName: selectedDisplay.serverName,
    serverStatus: selectedDisplay.serverStatus,
    serverType: selectedDisplay.serverType,
    minecraftVersion: selectedDisplay.minecraftVersion,
    currentHost: selectedDisplay.currentHost,
    syncStatus: selectedDisplay.syncStatus,
    connectionAddress: selectedDisplay.connectionAddress,
    connectionAddresses: selectedDisplay.connectionAddresses,
    players: selectedDisplay.players,
    resources: selectedDisplay.resources,
    consoleLogs: selectedDisplay.consoleLogs,
    allowedPlayers: selectedDisplay.allowedPlayers
  }
}

function buildWorldDisplayData(
  worldId: WorldId,
  storageSnapshot: ServerStorageSnapshot,
  isInstalled: boolean,
  signedInUser: SignedInUser | null,
  selectedWorldId: WorldId | null,
  runtimeSnapshot: ServerRuntimeSnapshot
): WorldDisplayData {
  const { localState, serverSync } = storageSnapshot
  const serverAvailability = getServerAvailability(storageSnapshot, isInstalled)
  const remoteSave =
    serverAvailability === ServerAvailability.RemoteAvailable ? storageSnapshot.latestSave : null
  const runtimeAppliesToWorld = getRuntimeAppliesToWorld(
    worldId,
    selectedWorldId,
    runtimeSnapshot.runtimeWorldId,
    runtimeSnapshot.status
  )
  const runtimeStatus = runtimeAppliesToWorld ? runtimeSnapshot.status : 'stopped'
  const serverStatus = getDisplayServerStatus(storageSnapshot, runtimeStatus, serverAvailability)
  const serverIsRunning = runtimeAppliesToWorld && isServerActiveStatus(runtimeSnapshot.status)
  const connectionAddresses = getSnapshotConnectionAddresses(
    storageSnapshot,
    runtimeSnapshot.connectionAddresses,
    serverIsRunning
  )

  return {
    worldId,
    javaConfig: localState.javaConfig,
    serverAvailability,
    serverName: remoteSave?.serverName ?? localState.serverConfig.name,
    serverStatus,
    serverType: formatServerType(remoteSave?.serverType ?? localState.serverConfig.serverType),
    minecraftVersion: remoteSave?.minecraftVersion ?? localState.serverConfig.minecraftVersion,
    currentHost: getCurrentHost(storageSnapshot, signedInUser, serverIsRunning),
    syncStatus: serverSync,
    connectionAddress: getPrimaryConnectionAddress(connectionAddresses),
    connectionAddresses,
    players: {
      online: serverIsRunning ? runtimeSnapshot.players.online : 0,
      max: runtimeSnapshot.players.max
    },
    resources: runtimeAppliesToWorld ? runtimeSnapshot.resources : createEmptyResources(),
    consoleLogs: runtimeAppliesToWorld ? runtimeSnapshot.logs : [],
    allowedPlayers: signedInUser
      ? [
          {
            id: signedInUser.id,
            name: signedInUser.name,
            status: serverIsRunning && runtimeSnapshot.players.online > 0 ? 'online' : 'offline'
          }
        ]
      : []
  }
}

function getRuntimeAppliesToWorld(
  worldId: WorldId,
  selectedWorldId: WorldId | null,
  runtimeWorldId: WorldId | null,
  runtimeStatus: ServerStatus
): boolean {
  if (runtimeWorldId) {
    return runtimeWorldId === worldId
  }

  return runtimeStatus === 'stopped' && selectedWorldId === worldId
}

function toServerCatalogEntry(world: WorldDisplayData): ServerCatalogEntry {
  return {
    worldId: world.worldId,
    javaConfig: world.javaConfig,
    serverAvailability: world.serverAvailability,
    serverName: world.serverName,
    serverStatus: world.serverStatus,
    serverType: world.serverType,
    minecraftVersion: world.minecraftVersion,
    currentHost: world.currentHost,
    syncStatus: world.syncStatus,
    players: world.players
  }
}

function createEmptyWorldDisplayData(): SelectedWorldDisplayData {
  return {
    javaConfig: { ...DEFAULT_JAVA_CONFIG },
    serverAvailability: ServerAvailability.None,
    serverName: DEFAULT_SERVER_CONFIG.name,
    serverStatus: 'not-configured',
    serverType: formatServerType(DEFAULT_SERVER_CONFIG.serverType),
    minecraftVersion: DEFAULT_SERVER_CONFIG.minecraftVersion,
    currentHost: null,
    syncStatus: createEmptySyncStatus(),
    connectionAddress: null,
    connectionAddresses: [],
    players: { online: 0, max: 20 },
    resources: createEmptyResources(),
    consoleLogs: [],
    allowedPlayers: []
  }
}

function createInstalledOnlyWorldDisplayData(world: LocalWorldState): WorldDisplayData {
  return createWorldStateFallback(world, ServerAvailability.LocalReady, 'stopped')
}

function createUnavailableWorldDisplayData(world: LocalWorldState, isInstalled: boolean): WorldDisplayData {
  return createWorldStateFallback(
    world,
    isInstalled ? ServerAvailability.LocalReady : ServerAvailability.RemoteAvailable,
    'error'
  )
}

function createWorldStateFallback(
  world: LocalWorldState,
  serverAvailability: ServerAvailability,
  serverStatus: ServerStatus
): WorldDisplayData {
  return {
    worldId: world.id,
    javaConfig: world.javaConfig,
    serverAvailability,
    serverName: world.serverConfig.name,
    serverStatus,
    serverType: formatServerType(world.serverConfig.serverType),
    minecraftVersion: world.serverConfig.minecraftVersion,
    currentHost: null,
    syncStatus: createEmptySyncStatus(world.localSaveVersion),
    connectionAddress: null,
    connectionAddresses: [],
    players: { online: 0, max: 20 },
    resources: createEmptyResources(),
    consoleLogs: [],
    allowedPlayers: []
  }
}

function createEmptySyncStatus(localSaveVersion: number | null = null): ServerSyncSnapshot {
  return {
    status: ServerSyncStatus.NoCloudSave,
    latestSave: null,
    serverLock: DEFAULT_SERVER_LOCK,
    localSaveVersion,
    cloudSaveVersion: null,
    lockedBy: null,
    isStaleLock: false,
    isStartAllowed: true
  }
}

function createEmptyResources(): ServerDisplayState['resources'] {
  return {
    cpuPercent: 0,
    memoryUsedMb: 0,
    memoryTotalMb: 4096,
    isMocked: true
  }
}

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

  if (isServerActiveStatus(runtimeStatus) || runtimeStatus === 'crashed' || runtimeStatus === 'error') {
    return runtimeStatus
  }

  return getRemoteHostingStatus(storageSnapshot) ?? runtimeStatus
}

function getServerAvailability(
  storageSnapshot: ServerStorageSnapshot,
  isInstalled: boolean
): ServerAvailability {
  if (isInstalled) {
    return ServerAvailability.LocalReady
  }

  return storageSnapshot.latestSave ? ServerAvailability.RemoteAvailable : ServerAvailability.None
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
