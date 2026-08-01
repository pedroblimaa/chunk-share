import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CloudStorageProvider } from '../../../src/shared/cloud-storage.model'
import { ServerHostingStatus, ServerLockStatus } from '../../../src/shared/domain'
import { ServerSyncStatus } from '../../../src/shared/server-sync'
import {
  DEFAULT_APP_STATE,
  DEFAULT_LOCAL_STATE,
  createDefaultLocalWorldState
} from '../../../src/main/storage/core/support/storage-defaults'
import type { AppState } from '../../../src/shared/world'
import type { StorageAdapter } from '../../../src/main/storage/adapters/storage-adapter.model'
import { getServerSyncSnapshot } from '../../../src/main/server-sync/server-sync-service'
import { createWorldContext } from '../../../src/main/storage/core/world-context'

const mocks = vi.hoisted(() => ({
  getStorageAdapterForProvider: vi.fn(),
  readAppState: vi.fn(),
  readWorldLocalState: vi.fn()
}))

vi.mock('../../../src/main/storage/persistence/local-state-store', () => ({
  readAppState: mocks.readAppState,
  readWorldLocalState: mocks.readWorldLocalState
}))

vi.mock('../../../src/main/storage/adapters/storage-adapter-service', () => ({
  getStorageAdapterForProvider: mocks.getStorageAdapterForProvider
}))

vi.mock('../../../src/main/server-runtime/lifecycle/hosting-lock-manager', () => ({
  getActiveRuntimeSessionId: vi.fn(() => null)
}))

const WORLD_A_ID = '00000000-0000-4000-8000-00000000002a'
const WORLD_B_ID = '00000000-0000-4000-8000-00000000002b'

describe('server sync world capture', () => {
  beforeEach(() => vi.clearAllMocks())

  it('keeps one world context when selection changes during the snapshot', async () => {
    const worldA = {
      ...createDefaultLocalWorldState(WORLD_A_ID),
      serverConfig: { ...DEFAULT_LOCAL_STATE.serverConfig, name: 'World A' }
    }
    const worldB = {
      ...createDefaultLocalWorldState(WORLD_B_ID),
      serverConfig: { ...DEFAULT_LOCAL_STATE.serverConfig, name: 'World B' }
    }
    const appState: AppState = {
      ...DEFAULT_APP_STATE,
      activeProvider: CloudStorageProvider.Local,
      selectedWorldId: WORLD_A_ID,
      worlds: [worldA, worldB]
    }
    const storageAdapter = {
      readServerSyncData: vi.fn().mockResolvedValue({
        latestSave: null,
        serverLock: { status: ServerLockStatus.Unlocked },
        worldFileExists: false
      })
    } as unknown as StorageAdapter
    mocks.readAppState.mockResolvedValue(appState)
    mocks.getStorageAdapterForProvider.mockImplementation(async () => {
      appState.selectedWorldId = WORLD_B_ID
      return storageAdapter
    })
    mocks.readWorldLocalState.mockImplementation(async (worldId) => {
      expect(worldId).toBe(WORLD_A_ID)
      return { ...DEFAULT_LOCAL_STATE, serverConfig: worldA.serverConfig }
    })

    const snapshot = await getServerSyncSnapshot()

    expect(mocks.getStorageAdapterForProvider).toHaveBeenCalledWith(
      CloudStorageProvider.Local,
      expect.objectContaining({ worldId: WORLD_A_ID })
    )
    expect(snapshot.localState.serverConfig.name).toBe('World A')
  })

  it('allows retrying a lock owned by the persisted world session', async () => {
    const persistedSessionId = 'persisted-session'
    const world = createDefaultLocalWorldState(WORLD_A_ID)
    const storageAdapter = {
      readServerSyncData: vi.fn().mockResolvedValue({
        latestSave: null,
        serverLock: {
          status: ServerLockStatus.Locked,
          lockedBy: {
            id: 'owner',
            displayName: 'Owner',
            email: 'owner@example.com',
            avatarUrl: null,
            avatarInitials: 'O'
          },
          sessionId: persistedSessionId,
          saveVersion: 1,
          hostingStatus: ServerHostingStatus.Stopping,
          startedAt: new Date().toISOString(),
          lastHeartbeat: new Date().toISOString(),
          connectionAddresses: []
        },
        worldFileExists: true
      })
    } as unknown as StorageAdapter
    mocks.readWorldLocalState.mockResolvedValue({
      ...DEFAULT_LOCAL_STATE,
      activeSessionId: persistedSessionId
    })

    const snapshot = await getServerSyncSnapshot({
      ...createWorldContext(world),
      storageAdapter
    })

    expect(snapshot.serverSync).toMatchObject({
      isStartAllowed: true,
      status: ServerSyncStatus.NoCloudSave
    })
  })
})
