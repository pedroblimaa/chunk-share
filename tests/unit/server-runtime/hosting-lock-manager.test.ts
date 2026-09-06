import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ServerHostingStatus,
  ServerLockStatus,
  type ServerLock,
  type ServerStorageSnapshot
} from '../../../src/shared/domain'
import type { StorageAdapter } from '../../../src/main/storage/adapters/storage-adapter.model'
import { createDefaultLocalWorldState } from '../../../src/main/storage/core/support/storage-defaults'
import { createWorldContext } from '../../../src/main/storage/core/world-context'
import type { WorldOperationContext } from '../../../src/main/storage/core/world-operation-context'
import {
  clearHostingLockAfterStartFailure,
  createHostingLock,
  getActiveRuntimeSessionId,
  markHostingLockPublishing,
  releaseActiveRuntimeSession
} from '../../../src/main/server-runtime/lifecycle/hosting-lock-manager'

vi.mock('../../../src/main/storage/persistence/local-state-store', () => ({
  saveWorldActiveSessionId: vi.fn().mockResolvedValue({})
}))

const WORLD_A_ID = '00000000-0000-4000-8000-00000000001a'
const WORLD_B_ID = '00000000-0000-4000-8000-00000000001b'

describe('hosting lock runtime ownership', () => {
  beforeEach(() => vi.clearAllMocks())

  it('scopes the active session to its world and releases only the local claim after a crash', async () => {
    const testStorage = createTestStorageAdapter()
    const operationContext = createOperationContext(WORLD_A_ID, testStorage.storageAdapter)

    const sessionId = await createHostingLock(operationContext, createStorageSnapshot(operationContext), [])

    expect(getActiveRuntimeSessionId(WORLD_A_ID)).toBe(sessionId)
    expect(getActiveRuntimeSessionId(WORLD_B_ID)).toBeNull()
    releaseActiveRuntimeSession(WORLD_A_ID, sessionId)
    expect(getActiveRuntimeSessionId(WORLD_A_ID)).toBeNull()
    expect(testStorage.getServerLock()).toMatchObject({
      sessionId,
      status: ServerLockStatus.Locked
    })
  })

  it('does not clear a newer runtime session when old cleanup finishes late', async () => {
    let worldALock: ServerLock = { status: ServerLockStatus.Unlocked }
    let finishWorldAClear = (): void => {
      throw new Error('World A cleanup did not start.')
    }
    let worldAUpdateCount = 0
    const worldAAdapter = {
      assertNoStorageMutationInProgress: vi.fn().mockResolvedValue(undefined),
      updateServerLock: vi.fn((update: (currentLock: ServerLock) => ServerLock | null) => {
        worldAUpdateCount += 1

        if (worldAUpdateCount === 2) {
          return new Promise<boolean>((resolve) => {
            finishWorldAClear = () => {
              worldALock = update(worldALock) ?? worldALock
              resolve(true)
            }
          })
        }

        worldALock = update(worldALock) ?? worldALock
        return Promise.resolve(true)
      })
    } as unknown as StorageAdapter
    const worldAContext = createOperationContext(WORLD_A_ID, worldAAdapter)
    const sessionA = await createHostingLock(worldAContext, createStorageSnapshot(worldAContext), [])
    const oldCleanup = clearHostingLockAfterStartFailure(worldAContext, sessionA)

    const worldBStorage = createTestStorageAdapter()
    const worldBContext = createOperationContext(WORLD_B_ID, worldBStorage.storageAdapter)
    const sessionB = await createHostingLock(worldBContext, createStorageSnapshot(worldBContext), [])
    finishWorldAClear()
    await oldCleanup

    expect(getActiveRuntimeSessionId(WORLD_B_ID)).toBe(sessionB)
    expect(worldALock).toEqual({ status: ServerLockStatus.Unlocked })
    releaseActiveRuntimeSession(WORLD_B_ID, sessionB)
  })

  it('reclaims a lock owned by the persisted world session', async () => {
    const persistedSessionId = 'persisted-session'
    const testStorage = createTestStorageAdapter(createLockedServerLock(persistedSessionId))
    const operationContext = createOperationContext(WORLD_A_ID, testStorage.storageAdapter)

    const sessionId = await createHostingLock(
      operationContext,
      createStorageSnapshot(operationContext, persistedSessionId),
      []
    )

    expect(sessionId).not.toBe(persistedSessionId)
    expect(testStorage.getServerLock()).toMatchObject({
      sessionId,
      status: ServerLockStatus.Locked
    })
    releaseActiveRuntimeSession(WORLD_A_ID, sessionId)
  })

  it('rejects a lock that does not match the persisted world session', async () => {
    const testStorage = createTestStorageAdapter(createLockedServerLock('another-session'))
    const operationContext = createOperationContext(WORLD_A_ID, testStorage.storageAdapter)

    await expect(
      createHostingLock(operationContext, createStorageSnapshot(operationContext, 'local-session'), [])
    ).rejects.toThrow('already hosting it')
  })

  it.each([ServerHostingStatus.Starting, ServerHostingStatus.Running, ServerHostingStatus.Stopping])(
    'marks a %s lock as publishing',
    async (hostingStatus) => {
      const sessionId = 'publishing-session'
      const testStorage = createTestStorageAdapter(createLockedServerLock(sessionId, hostingStatus))
      const operationContext = createOperationContext(WORLD_A_ID, testStorage.storageAdapter)

      await markHostingLockPublishing(operationContext, sessionId)

      expect(testStorage.getServerLock()).toMatchObject({
        sessionId,
        hostingStatus: ServerHostingStatus.Publishing
      })
    }
  )
})

function createOperationContext(worldId: string, storageAdapter: StorageAdapter): WorldOperationContext {
  return {
    ...createWorldContext(createDefaultLocalWorldState(worldId)),
    storageAdapter
  }
}

interface TestStorageAdapter {
  storageAdapter: StorageAdapter
  getServerLock: () => ServerLock
}

function createTestStorageAdapter(
  initialServerLock: ServerLock = { status: ServerLockStatus.Unlocked }
): TestStorageAdapter {
  let serverLock = initialServerLock

  return {
    storageAdapter: {
      assertNoStorageMutationInProgress: vi.fn().mockResolvedValue(undefined),
      updateServerLock: vi.fn(async (update: (currentLock: ServerLock) => ServerLock | null) => {
        serverLock = update(serverLock) ?? serverLock
        return true
      })
    } as unknown as StorageAdapter,
    getServerLock: () => serverLock
  }
}

function createStorageSnapshot(
  operationContext: WorldOperationContext,
  activeSessionId: string | null = null
): ServerStorageSnapshot {
  return {
    latestSave: null,
    localState: {
      activeSessionId,
      dirty: false,
      javaConfig: { executablePath: null },
      localSaveVersion: null,
      player: {
        id: 'owner',
        displayName: 'Owner',
        email: 'owner@example.com',
        avatarUrl: null,
        avatarInitials: 'O'
      },
      serverConfig: operationContext.world.serverConfig,
      serverSetup: operationContext.world.serverSetup
    }
  } as ServerStorageSnapshot
}

function createLockedServerLock(
  sessionId: string,
  hostingStatus: ServerHostingStatus = ServerHostingStatus.Stopping
): ServerLock {
  const now = new Date().toISOString()

  return {
    status: ServerLockStatus.Locked,
    lockedBy: {
      id: 'owner',
      displayName: 'Owner',
      email: 'owner@example.com',
      avatarUrl: null,
      avatarInitials: 'O'
    },
    sessionId,
    saveVersion: 1,
    hostingStatus,
    startedAt: now,
    lastHeartbeat: now,
    connectionAddresses: []
  }
}
