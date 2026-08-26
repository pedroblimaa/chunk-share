import { readFile, writeFile } from 'fs/promises'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ServerHostingStatus, ServerLockStatus } from '../../../src/shared/domain'
import {
  getServerRuntimeSnapshot,
  startMinecraftServer,
  stopMinecraftServer,
  subscribeToServerRuntime
} from '../../../src/main/server-runtime/server-runtime-service'
import { setupVanillaServer } from '../../../src/main/server-setup/server-setup-service'
import { getServerDisplayState } from '../../../src/main/dashboard/dashboard-service'
import { createLocalStorageAdapter } from '../../../src/main/storage/adapters/local-storage-adapter'
import {
  deleteConfiguredServer,
  deleteConfiguredWorld,
  resetServerLock
} from '../../../src/main/storage/core/storage-service'
import { getSelectedWorldContext, getWorldContext } from '../../../src/main/storage/core/world-context'
import {
  readWorld,
  saveWorldJavaConfig,
  selectWorld
} from '../../../src/main/storage/persistence/local-state-store'
import { TEST_WORLD_NAME, TEST_WORLD_PORT, createLocalTestWorld } from '../support/world-test-data'
import {
  TEST_MINECRAFT_METADATA_URL,
  TEST_MINECRAFT_VERSION
} from '../support/minecraft/minecraft-download-mock-handlers'
import {
  getMinecraftProcessMock,
  getMinecraftSpawnInvocation,
  resetMinecraftProcessMock
} from '../support/minecraft/minecraft-process-mock'
import { GOOGLE_TEST_ACCOUNTS } from '../../support/google-drive/google-drive-test-environment'

const INTEGRATION_WAIT_TIMEOUT_MS = 5_000

vi.mock('child_process', async () => {
  const actual = await vi.importActual<typeof import('child_process')>('child_process')
  const processMock = await import('../support/minecraft/minecraft-process-mock')

  return {
    ...actual,
    execFile: processMock.inspectJavaProcess,
    spawn: processMock.spawnMinecraftProcess
  }
})

vi.mock(
  '../../../src/main/auth/auth-service',
  () => import('../support/google-drive/google-auth-service-mock')
)

describe('multi-world runtime', () => {
  beforeEach(resetMinecraftProcessMock)

  it('keeps lifecycle work on the captured world and releases the local claim after a crash', async () => {
    const worldAId = '00000000-0000-4000-8000-00000000000a'
    const worldBId = '00000000-0000-4000-8000-00000000000b'
    await createLocalTestWorld(worldAId)
    const worldAContext = await getSelectedWorldContext()
    const worldAStorage = createLocalStorageAdapter(worldAContext)
    await createLocalTestWorld(worldBId)
    const worldBContext = await getSelectedWorldContext()
    const worldBStorage = createLocalStorageAdapter(worldBContext)
    await selectWorld(worldAId)

    await startAndWaitForRunning()
    await selectWorld(worldBId)

    await expect(startMinecraftServer()).rejects.toThrow('Minecraft server is already running.')
    await expect(setupTestWorld()).rejects.toThrow(
      'Stop the running Minecraft server before changing server setup.'
    )
    getMinecraftProcessMock().emit('close', 1)
    await vi.waitFor(
      () => {
        expect(getServerRuntimeSnapshot()).toMatchObject({
          runningWorldId: null,
          runtimeWorldId: worldAId,
          status: 'crashed'
        })
      },
      { timeout: INTEGRATION_WAIT_TIMEOUT_MS }
    )

    await expect(worldAStorage.readServerLock()).resolves.toMatchObject({
      status: ServerLockStatus.Locked
    })
    await expect(readWorld(worldAId)).resolves.toMatchObject({ activeSessionId: expect.any(String) })
    await expect(worldBStorage.readServerLock()).resolves.toEqual({ status: ServerLockStatus.Unlocked })

    await expect(startMinecraftServer()).resolves.toMatchObject({
      runningWorldId: worldBId,
      runtimeWorldId: worldBId,
      status: 'starting'
    })
    expect(getMinecraftSpawnInvocation().options.cwd).toBe(worldBContext.paths.serverFolder)
    getMinecraftProcessMock().emitReady()
    await waitForRuntimeStatus('running')
    await stopAndWaitForStopped()

    await expect(worldAStorage.readServerLock()).resolves.toMatchObject({
      status: ServerLockStatus.Locked
    })
    await expect(worldBStorage.readServerLock()).resolves.toEqual({ status: ServerLockStatus.Unlocked })
  })

  it('publishes and unlocks the running world after selection changes', async () => {
    const worldAId = '00000000-0000-4000-8000-00000000000c'
    const worldBId = '00000000-0000-4000-8000-00000000000d'
    await createLocalTestWorld(worldAId)
    const worldAStorage = createLocalStorageAdapter(await getSelectedWorldContext())
    await createLocalTestWorld(worldBId)
    const worldBStorage = createLocalStorageAdapter(await getSelectedWorldContext())
    await selectWorld(worldAId)

    await startAndWaitForRunning()
    await selectWorld(worldBId)
    await stopAndWaitForStopped()

    await expect(worldAStorage.readLatestSave()).resolves.toMatchObject({ saveVersion: 1 })
    await expect(worldAStorage.readServerLock()).resolves.toEqual({ status: ServerLockStatus.Unlocked })
    await expect(readWorld(worldAId)).resolves.toMatchObject({
      activeSessionId: null,
      localSaveVersion: 1
    })
    await expect(worldBStorage.readLatestSave()).resolves.toBeNull()
    await expect(readWorld(worldBId)).resolves.toMatchObject({
      activeSessionId: null,
      localSaveVersion: null
    })
  })

  it('cleanly hands runtime and saves from one world to another', async () => {
    const worldAId = '00000000-0000-4000-8000-000000000024'
    const worldBId = '00000000-0000-4000-8000-000000000025'
    await createLocalTestWorld(worldAId)
    const worldAStorage = createLocalStorageAdapter(await getSelectedWorldContext())
    await createLocalTestWorld(worldBId)
    const worldBContext = await getSelectedWorldContext()
    const worldBStorage = createLocalStorageAdapter(worldBContext)

    await selectWorld(worldAId)
    await startAndWaitForRunning()
    await stopAndWaitForStopped()
    await selectWorld(worldBId)
    await startAndWaitForRunning()

    expect(getMinecraftSpawnInvocation().options.cwd).toBe(worldBContext.paths.serverFolder)

    await stopAndWaitForStopped()

    await expect(worldAStorage.readLatestSave()).resolves.toMatchObject({ saveVersion: 1 })
    await expect(worldBStorage.readLatestSave()).resolves.toMatchObject({ saveVersion: 1 })
    await expect(readWorld(worldAId)).resolves.toMatchObject({
      activeSessionId: null,
      localSaveVersion: 1
    })
    await expect(readWorld(worldBId)).resolves.toMatchObject({
      activeSessionId: null,
      localSaveVersion: 1
    })
  })

  it('allows deleting a different world while one world is running', async () => {
    const worldAId = '00000000-0000-4000-8000-00000000000e'
    const worldBId = '00000000-0000-4000-8000-00000000000f'
    await createLocalTestWorld(worldAId)
    await createLocalTestWorld(worldBId)
    await selectWorld(worldAId)
    await startAndWaitForRunning()

    await expect(deleteConfiguredWorld(worldBId)).resolves.toMatchObject({
      localState: { activeSessionId: expect.any(String) }
    })
    await expect(readWorld(worldBId)).rejects.toThrow(`World ${worldBId} was not found.`)
    expect(getServerRuntimeSnapshot()).toMatchObject({ runningWorldId: worldAId, status: 'running' })

    await stopAndWaitForStopped()
  })

  it('rejects deleting the running world by ID after selection changes', async () => {
    const worldAId = '00000000-0000-4000-8000-000000000026'
    const worldBId = '00000000-0000-4000-8000-000000000027'
    await createLocalTestWorld(worldAId)
    await createLocalTestWorld(worldBId)
    await selectWorld(worldAId)
    await startAndWaitForRunning()
    await selectWorld(worldBId)

    await expect(deleteConfiguredWorld(worldAId)).rejects.toThrow(
      'Cannot remove this server while it is running.'
    )
    await expect(readWorld(worldAId)).resolves.toMatchObject({ id: worldAId })
    await expect(readWorld(worldBId)).resolves.toMatchObject({ id: worldBId })
    expect(getServerRuntimeSnapshot()).toMatchObject({ runningWorldId: worldAId, status: 'running' })

    await stopAndWaitForStopped()
  })

  it('keeps catalog and selected-world runtime states independent', async () => {
    const worldAId = '00000000-0000-4000-8000-000000000020'
    const worldBId = '00000000-0000-4000-8000-000000000021'
    await createLocalTestWorld(worldAId)
    await createLocalTestWorld(worldBId)
    await selectWorld(worldAId)
    await startAndWaitForRunning()
    await selectWorld(worldBId)
    await saveWorldJavaConfig(worldBId, {
      mode: 'custom',
      executablePath: 'C:\\Java\\bin\\java.exe'
    })

    const displayState = await getServerDisplayState()

    expect(displayState).toMatchObject({
      selectedWorldId: worldBId,
      runningWorldId: worldAId,
      javaConfig: { mode: 'custom', executablePath: 'C:\\Java\\bin\\java.exe' },
      serverStatus: 'stopped'
    })
    expect(displayState.worlds).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ worldId: worldAId, serverStatus: 'running' }),
        expect.objectContaining({
          worldId: worldBId,
          javaConfig: { mode: 'custom', executablePath: 'C:\\Java\\bin\\java.exe' },
          serverStatus: 'stopped'
        })
      ])
    )

    await stopAndWaitForStopped()
  })

  it('keeps the catalog usable and repairs the targeted non-selected world', async () => {
    const worldAId = '00000000-0000-4000-8000-000000000022'
    const worldBId = '00000000-0000-4000-8000-000000000023'
    await createLocalTestWorld(worldAId)
    await createLocalTestWorld(worldBId)
    const worldAContext = await getWorldContext(worldAId)
    const control = JSON.parse(await readFile(worldAContext.paths.storageControlFile, 'utf8')) as Record<
      string,
      unknown
    >
    await writeFile(
      worldAContext.paths.storageControlFile,
      JSON.stringify({
        ...control,
        serverLock: { status: ServerLockStatus.Locked }
      })
    )

    await expect(getServerDisplayState()).resolves.toMatchObject({
      selectedWorldId: worldBId,
      worlds: expect.arrayContaining([
        expect.objectContaining({ worldId: worldAId, serverStatus: 'error' }),
        expect.objectContaining({ worldId: worldBId, serverStatus: 'stopped' })
      ])
    })

    await selectWorld(worldAId)
    await expect(getServerDisplayState()).rejects.toThrow('Invalid data shape')
    await resetServerLock()
    await expect(getServerDisplayState()).resolves.toMatchObject({
      selectedWorldId: worldAId,
      serverStatus: 'stopped'
    })
  })

  it('emits a released running-world claim when start is blocked', async () => {
    await createLocalTestWorld()
    const storageAdapter = createLocalStorageAdapter(await getSelectedWorldContext())
    await storageAdapter.updateServerLock(() => ({
      status: ServerLockStatus.Locked,
      lockedBy: {
        ...GOOGLE_TEST_ACCOUNTS.owner.session.player,
        id: 'another-player',
        displayName: 'Another player'
      },
      sessionId: 'another-session',
      saveVersion: 0,
      hostingStatus: ServerHostingStatus.Running,
      startedAt: new Date().toISOString(),
      lastHeartbeat: new Date().toISOString(),
      connectionAddresses: []
    }))
    const snapshots: ReturnType<typeof getServerRuntimeSnapshot>[] = []
    const unsubscribe = subscribeToServerRuntime(({ snapshot }) => snapshots.push(snapshot))

    await expect(startMinecraftServer()).rejects.toThrow('already hosted by Another player')
    unsubscribe()

    expect(snapshots.at(-1)).toMatchObject({ runningWorldId: null, status: 'error' })
    expect(getServerRuntimeSnapshot()).toMatchObject({ runningWorldId: null, status: 'error' })
  })

  it('serializes server start against setup and deletion', async () => {
    await createLocalTestWorld()

    const startPromise = startMinecraftServer()
    await expect(deleteConfiguredServer()).rejects.toThrow(
      'Cannot remove this server while another storage operation is in progress.'
    )
    await expect(setupTestWorld()).rejects.toThrow(
      'Cannot set up a server while another storage operation is in progress.'
    )
    await expect(startPromise).resolves.toMatchObject({ status: 'starting' })

    await stopAndWaitForStopped()
  })
})

async function startAndWaitForRunning(): Promise<void> {
  await startMinecraftServer()
  getMinecraftProcessMock().emitReady()
  await waitForRuntimeStatus('running')
}

async function stopAndWaitForStopped(): Promise<void> {
  await stopMinecraftServer()
  await waitForRuntimeStatus('stopped')
}

async function waitForRuntimeStatus(status: 'running' | 'stopped'): Promise<void> {
  await vi.waitFor(() => expect(getServerRuntimeSnapshot().status).toBe(status), {
    timeout: INTEGRATION_WAIT_TIMEOUT_MS
  })
}

function setupTestWorld(): ReturnType<typeof setupVanillaServer> {
  return setupVanillaServer({
    eulaAccepted: true,
    minecraftVersion: TEST_MINECRAFT_VERSION,
    minecraftVersionMetadataUrl: TEST_MINECRAFT_METADATA_URL,
    name: TEST_WORLD_NAME,
    port: TEST_WORLD_PORT,
    javaConfig: { mode: 'system', executablePath: null }
  })
}
