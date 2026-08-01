import { describe, expect, it } from 'vitest'
import type { ChunkShareApi } from '../../../src/preload'
import { ServerAvailability, type ServerDisplayState } from '../../../src/shared/dashboard'
import { ServerLockStatus } from '../../../src/shared/domain'
import type { ServerRuntimeSnapshot } from '../../../src/shared/server-runtime'
import { ServerSyncStatus } from '../../../src/shared/server-sync'
import { applyRuntimeSnapshotToServerDisplayState } from '../../../src/renderer/src/utils/server-display-state'

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
