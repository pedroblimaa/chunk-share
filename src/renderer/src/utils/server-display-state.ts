import type { ServerDisplayState } from '../../../shared/dashboard'
import type { JavaConfig } from '../../../shared/domain'
import {
  isServerActiveStatus,
  type ServerConnectionAddress,
  type ServerRuntimeSnapshot
} from '../../../shared/server-runtime'
import type { WorldId } from '../../../shared/world'

export function loadServerDisplayState(): Promise<ServerDisplayState> {
  return window.chunkShare.dashboard.getSnapshot()
}

export function createOpeningServerDisplayState(
  serverDisplayState: ServerDisplayState,
  worldId: WorldId
): ServerDisplayState {
  const world = serverDisplayState.worlds.find((candidate) => candidate.worldId === worldId)
  if (!world) {
    return serverDisplayState
  }

  return {
    ...serverDisplayState,
    selectedWorldId: worldId,
    javaConfig: world.javaConfig,
    serverAvailability: world.serverAvailability,
    serverName: world.serverName,
    serverStatus: 'updating',
    serverType: world.serverType,
    minecraftVersion: world.minecraftVersion,
    currentHost: world.currentHost,
    syncStatus: world.syncStatus,
    connectionAddress: null,
    connectionAddresses: [],
    players: world.players,
    resources: {
      ...serverDisplayState.resources,
      cpuPercent: 0,
      memoryUsedMb: 0
    },
    consoleLogs: [],
    allowedPlayers: []
  }
}

export function applyJavaConfigToServerDisplayState(
  serverDisplayState: ServerDisplayState,
  worldId: WorldId,
  javaConfig: JavaConfig
): ServerDisplayState {
  const worlds = serverDisplayState.worlds.map((world) =>
    world.worldId === worldId ? { ...world, javaConfig } : world
  )

  return serverDisplayState.selectedWorldId === worldId
    ? { ...serverDisplayState, javaConfig, worlds }
    : { ...serverDisplayState, worlds }
}

export function applyRuntimeSnapshotToServerDisplayState(
  serverDisplayState: ServerDisplayState,
  runtimeSnapshot: ServerRuntimeSnapshot
): ServerDisplayState {
  if (
    runtimeSnapshot.runtimeWorldId &&
    runtimeSnapshot.runtimeWorldId !== serverDisplayState.selectedWorldId
  ) {
    return {
      ...serverDisplayState,
      runningWorldId: runtimeSnapshot.runningWorldId
    }
  }

  const serverIsActive = isServerActiveStatus(runtimeSnapshot.status)
  const connectionAddresses = serverIsActive
    ? runtimeSnapshot.connectionAddresses
    : serverDisplayState.connectionAddresses

  return {
    ...serverDisplayState,
    runningWorldId: runtimeSnapshot.runningWorldId,
    serverStatus:
      serverDisplayState.serverStatus === 'not-configured' && runtimeSnapshot.status === 'stopped'
        ? serverDisplayState.serverStatus
        : runtimeSnapshot.status,
    currentHost: getCurrentHost(serverDisplayState, serverIsActive),
    connectionAddress: getPrimaryConnectionAddress(connectionAddresses),
    connectionAddresses,
    players: {
      online: serverIsActive ? runtimeSnapshot.players.online : 0,
      max: runtimeSnapshot.players.max
    },
    resources: {
      ...runtimeSnapshot.resources,
      cpuPercent: serverIsActive ? runtimeSnapshot.resources.cpuPercent : 0,
      memoryUsedMb: serverIsActive ? runtimeSnapshot.resources.memoryUsedMb : 0
    },
    consoleLogs: runtimeSnapshot.logs
  }
}

function getCurrentHost(serverDisplayState: ServerDisplayState, serverIsActive: boolean): string | null {
  return serverIsActive ? (serverDisplayState.signedInUser?.name ?? 'You') : serverDisplayState.currentHost
}

function getPrimaryConnectionAddress(addresses: ServerConnectionAddress[]): string | null {
  return addresses.find((address) => address.isPrimary)?.address ?? addresses[0]?.address ?? null
}
