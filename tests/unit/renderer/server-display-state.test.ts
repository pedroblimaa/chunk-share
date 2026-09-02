import { describe, expect, it } from 'vitest'
import type { ChunkShareApi } from '../../../src/preload'
import { ServerAvailability, type ServerDisplayState } from '../../../src/shared/dashboard'
import { ServerHostingStatus, ServerLockStatus } from '../../../src/shared/domain'
import type { ServerRuntimeSnapshot } from '../../../src/shared/server-runtime'
import { ServerSyncStatus } from '../../../src/shared/server-sync'
import {
  applyJavaConfigToServerDisplayState,
  applyRuntimeSnapshotToServerDisplayState,
  createOpeningServerDisplayState
} from '../../../src/renderer/src/utils/server-display-state'
import { getDashboardPrimaryActionView } from '../../../src/renderer/src/views/dashboard/dashboard-header-action'

const WORLD_A_ID = '00000000-0000-4000-8000-00000000003a'
const WORLD_B_ID = '00000000-0000-4000-8000-00000000003b'

declare global {
  interface Window {
    chunkShare: ChunkShareApi
  }
}

describe('server display runtime attribution', () => {
  it('does not apply another world crash to the selected world', () => {
    const selectedWorld = createServerDisplayState()
    const crashedRuntime = {
      status: 'crashed',
      runningWorldId: null,
      runtimeWorldId: WORLD_A_ID,
      errorMessage: 'World A crashed.',
      connectionAddresses: [],
      players: { online: 0, max: 20 },
      resources: { cpuPercent: 0, memoryUsedMb: 0, memoryTotalMb: 4096, isMocked: true },
      logs: [
        {
          id: 'world-a-crash',
          timestamp: '12:00:00',
          source: 'ChunkShare',
          message: 'World A crashed.',
          tone: 'error'
        }
      ]
    } satisfies ServerRuntimeSnapshot

    const result = applyRuntimeSnapshotToServerDisplayState(selectedWorld, crashedRuntime)

    expect(result).toMatchObject({
      selectedWorldId: WORLD_B_ID,
      runningWorldId: null,
      serverStatus: 'stopped',
      consoleLogs: []
    })
  })

  it('creates a world-specific updating state while its Drive snapshot loads', () => {
    const serverDisplayState = createServerDisplayState()
    serverDisplayState.worlds = [
      {
        worldId: WORLD_A_ID,
        javaConfig: { mode: 'custom', executablePath: 'C:\\Java\\bin\\java.exe' },
        serverAvailability: ServerAvailability.RemoteAvailable,
        serverName: 'World A',
        serverStatus: 'stopped',
        serverType: 'Vanilla',
        minecraftVersion: '1.21.8',
        currentHost: null,
        syncStatus: serverDisplayState.syncStatus,
        players: { online: 0, max: 20 }
      }
    ]

    const result = createOpeningServerDisplayState(serverDisplayState, WORLD_A_ID)

    expect(result).toMatchObject({
      selectedWorldId: WORLD_A_ID,
      javaConfig: { mode: 'custom', executablePath: 'C:\\Java\\bin\\java.exe' },
      serverName: 'World A',
      serverStatus: 'updating',
      connectionAddress: null,
      consoleLogs: []
    })
  })

  it('updates the selected world and catalog Java config together', () => {
    const serverDisplayState = createServerDisplayState()
    serverDisplayState.worlds = [
      {
        worldId: WORLD_B_ID,
        javaConfig: serverDisplayState.javaConfig,
        serverAvailability: ServerAvailability.LocalReady,
        serverName: 'World B',
        serverStatus: 'stopped',
        serverType: 'Vanilla',
        minecraftVersion: '1.21.8',
        currentHost: null,
        syncStatus: serverDisplayState.syncStatus,
        players: { online: 0, max: 20 }
      }
    ]
    const javaConfig = { mode: 'custom', executablePath: 'C:\\Java\\bin\\java.exe' } as const

    const result = applyJavaConfigToServerDisplayState(serverDisplayState, WORLD_B_ID, javaConfig)

    expect(result.javaConfig).toEqual(javaConfig)
    expect(result.worlds[0]?.javaConfig).toEqual(javaConfig)
  })

  it('updates a background world without changing the current selection', () => {
    const serverDisplayState = createServerDisplayState()
    serverDisplayState.worlds = [
      {
        worldId: WORLD_A_ID,
        javaConfig: { mode: 'system', executablePath: null },
        serverAvailability: ServerAvailability.LocalReady,
        serverName: 'World A',
        serverStatus: 'stopped',
        serverType: 'Vanilla',
        minecraftVersion: '1.21.8',
        currentHost: null,
        syncStatus: serverDisplayState.syncStatus,
        players: { online: 0, max: 20 }
      }
    ]
    const javaConfig = { mode: 'custom', executablePath: 'C:\\Java\\bin\\java.exe' } as const

    const result = applyJavaConfigToServerDisplayState(serverDisplayState, WORLD_A_ID, javaConfig)

    expect(result.selectedWorldId).toBe(WORLD_B_ID)
    expect(result.javaConfig).toEqual(serverDisplayState.javaConfig)
    expect(result.worlds[0]?.javaConfig).toEqual(javaConfig)
  })

  it('prioritizes a remote starting state over downloading an uninstalled server', () => {
    const serverDisplayState = createServerDisplayState()
    serverDisplayState.serverAvailability = ServerAvailability.RemoteAvailable
    serverDisplayState.serverStatus = 'starting'
    serverDisplayState.syncStatus = {
      ...serverDisplayState.syncStatus,
      status: ServerSyncStatus.LockedByOther,
      serverLock: {
        status: ServerLockStatus.Locked,
        lockedBy: {
          id: 'owner',
          displayName: 'Owner Player',
          email: 'owner@example.com',
          avatarUrl: null,
          avatarInitials: 'OP'
        },
        sessionId: 'starting-session',
        saveVersion: 1,
        hostingStatus: ServerHostingStatus.Starting,
        startedAt: '2026-08-01T12:00:00.000Z',
        lastHeartbeat: '2026-08-01T12:00:00.000Z',
        connectionAddresses: []
      },
      isStartAllowed: false
    }

    expect(
      getDashboardPrimaryActionView({ dashboardSnapshot: serverDisplayState, downloadEulaAccepted: false })
    ).toMatchObject({ kind: 'none', isDisabled: true })
  })

  it('offers to rebuild an incompatible local runtime after EULA acceptance', () => {
    const serverDisplayState = createServerDisplayState()
    serverDisplayState.syncStatus = {
      ...serverDisplayState.syncStatus,
      status: ServerSyncStatus.Incompatible,
      isStartAllowed: false
    }

    expect(
      getDashboardPrimaryActionView({ dashboardSnapshot: serverDisplayState, downloadEulaAccepted: false })
    ).toMatchObject({ kind: 'download-server', isDisabled: true })
    expect(
      getDashboardPrimaryActionView({ dashboardSnapshot: serverDisplayState, downloadEulaAccepted: true })
    ).toMatchObject({ kind: 'download-server', isDisabled: false })
  })
})

function createServerDisplayState(): ServerDisplayState {
  const syncStatus = {
    status: ServerSyncStatus.NoCloudSave,
    latestSave: null,
    serverLock: { status: ServerLockStatus.Unlocked } as const,
    localSaveVersion: null,
    cloudSaveVersion: null,
    lockedBy: null,
    isStaleLock: false,
    isStartAllowed: true
  }

  return {
    signedInUser: null,
    selectedWorldId: WORLD_B_ID,
    runningWorldId: WORLD_A_ID,
    worlds: [],
    javaConfig: { mode: 'system', executablePath: null },
    serverAvailability: ServerAvailability.LocalReady,
    serverName: 'World B',
    serverStatus: 'stopped',
    serverType: 'Vanilla',
    minecraftVersion: '1.21.8',
    currentHost: null,
    syncStatus,
    connectionAddress: null,
    connectionAddresses: [],
    players: { online: 0, max: 20 },
    resources: { cpuPercent: 0, memoryUsedMb: 0, memoryTotalMb: 4096, isMocked: true },
    consoleLogs: [],
    allowedPlayers: []
  }
}
