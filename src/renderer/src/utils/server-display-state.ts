import type { ServerDisplayState } from '../../../shared/dashboard'
import {
  isServerActiveStatus,
  type ServerConnectionAddress,
  type ServerRuntimeSnapshot
} from '../../../shared/server-runtime'

export function loadServerDisplayState(): Promise<ServerDisplayState> {
  return window.chunkShare.dashboard.getSnapshot()
}

export function applyRuntimeSnapshotToServerDisplayState(
  serverDisplayState: ServerDisplayState,
  runtimeSnapshot: ServerRuntimeSnapshot
): ServerDisplayState {
  const serverIsActive = isServerActiveStatus(runtimeSnapshot.status)
  let connectionAddresses = serverDisplayState.connectionAddresses

  if (runtimeSnapshot.status === 'running') {
    connectionAddresses = runtimeSnapshot.connectionAddresses
  } else if (serverIsActive) {
    connectionAddresses = []
  }

  return {
    ...serverDisplayState,
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
    consoleLogs: runtimeSnapshot.logs,
    recovery: runtimeSnapshot.recovery
  }
}

function getCurrentHost(serverDisplayState: ServerDisplayState, serverIsActive: boolean): string | null {
  return serverIsActive ? (serverDisplayState.signedInUser?.name ?? 'You') : serverDisplayState.currentHost
}

function getPrimaryConnectionAddress(addresses: ServerConnectionAddress[]): string | null {
  return addresses.find((address) => address.isPrimary)?.address ?? addresses[0]?.address ?? null
}
