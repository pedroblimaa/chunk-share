import extractZip from 'extract-zip'
import { mkdir, readdir, readFile, stat } from 'fs/promises'
import { join } from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ServerHostingStatus, ServerLockStatus } from '../../../src/shared/domain'
import { ServerSetupProgressStep } from '../../../src/shared/server-setup'
import { STALE_LOCK_THRESHOLD_MS } from '../../../src/shared/server-sync'
import { CloudStorageProvider, GoogleDriveSetupStatus } from '../../../src/shared/cloud-storage.model'
import {
  getServerRuntimeSnapshot,
  startMinecraftServer,
  stopMinecraftServer
} from '../../../src/main/server-runtime/server-runtime-service'
import { setupVanillaServer } from '../../../src/main/server-setup/server-setup-service'
import { deleteConfiguredServer } from '../../../src/main/storage/core/storage-service'
import { createLocalStorageAdapter } from '../../../src/main/storage/adapters/local-storage-adapter'
import type { StorageAdapter } from '../../../src/main/storage/adapters/storage-adapter.model'
import { getSelectedWorldContext } from '../../../src/main/storage/core/world-context'
import {
  readAppState,
  readLocalState,
  savePlayer
} from '../../../src/main/storage/persistence/local-state-store'
import {
  TEST_WORLD_DATA,
  TEST_WORLD_NAME,
  TEST_WORLD_PORT,
  createLocalTestWorld
} from '../support/world-test-data'
import {
  getMinecraftProcessMock,
  getMinecraftSpawnInvocation,
  resetMinecraftProcessMock
} from '../support/minecraft/minecraft-process-mock'
import {
  TEST_MINECRAFT_METADATA_URL,
  TEST_MINECRAFT_VERSION
} from '../support/minecraft/minecraft-download-mock-handlers'
import {
  GOOGLE_TEST_ACCOUNTS,
  GOOGLE_TEST_IDS,
  googleDriveTestEnvironment
} from '../../support/google-drive/google-drive-test-environment'
import { publishServerSave } from '../../../src/main/storage/server-save/server-save-publisher'
import { integrationTestDataPath } from '../support/integration-test-storage'
import {
  readCloudStorageSettings,
  writeCloudStorageSettings
} from '../../../src/main/storage/persistence/local-state-store'

const INTEGRATION_WAIT_TIMEOUT_MS = 5_000

vi.mock('child_process', async () => {
  const actual = await vi.importActual<typeof import('child_process')>('child_process')
  const processMock = await import('../support/minecraft/minecraft-process-mock')

  return { ...actual, spawn: processMock.spawnMinecraftProcess }
})

vi.mock(
  '../../../src/main/auth/auth-service',
  () => import('../support/google-drive/google-auth-service-mock')
)

describe('world lifecycle', () => {
  beforeEach(resetMinecraftProcessMock)

  it('creates a new local world', async () => {
    const progressSteps: ServerSetupProgressStep[] = []
    await savePlayer(GOOGLE_TEST_ACCOUNTS.owner.session.player)

    const localState = await setupVanillaServer(
      {
        eulaAccepted: true,
        minecraftVersion: TEST_MINECRAFT_VERSION,
        minecraftVersionMetadataUrl: TEST_MINECRAFT_METADATA_URL,
        name: TEST_WORLD_NAME,
        port: TEST_WORLD_PORT
      },
      ({ step }) => progressSteps.push(step)
    )

    expect(localState).toMatchObject({
      serverConfig: {
        minecraftVersion: TEST_MINECRAFT_VERSION,
        name: TEST_WORLD_NAME,
        port: TEST_WORLD_PORT,
        serverType: 'vanilla'
      },
      serverSetup: { status: 'ready' }
    })
    expect(progressSteps).toEqual(Object.values(ServerSetupProgressStep))
    await expect(readAppState()).resolves.toMatchObject({
      selectedWorldId: expect.any(String),
      worlds: [{ id: expect.any(String) }]
    })
    const worldPaths = (await getSelectedWorldContext()).paths
    await expect(stat(worldPaths.serverJarFile)).resolves.toMatchObject({ size: expect.any(Number) })
    await expect(readFile(worldPaths.serverEulaFile, 'utf8')).resolves.toContain('eula=true')
    await expect(readFile(worldPaths.serverPropertiesFile, 'utf8')).resolves.toContain(
      `server-port=${TEST_WORLD_PORT}`
    )
  })

  it('starts, stops, and publishes the world', async () => {
    await createLocalTestWorld()
    const worldContext = await getSelectedWorldContext()

    await expect(startMinecraftServer()).resolves.toMatchObject({
      runningWorldId: worldContext.worldId,
      status: 'starting'
    })
    expect(getMinecraftSpawnInvocation()).toEqual({
      args: ['-Xmx4G', '-Xms2G', '-jar', 'server.jar', 'nogui'],
      command: 'java',
      options: {
        cwd: worldContext.paths.serverFolder,
        windowsHide: true
      }
    })

    getMinecraftProcessMock().emitReady()
    await vi.waitFor(
      async () => {
        expect(getServerRuntimeSnapshot().status).toBe('running')
        await expect((await getLocalStorageAdapter()).readServerLock()).resolves.toMatchObject({
          hostingStatus: ServerHostingStatus.Running,
          status: ServerLockStatus.Locked
        })
      },
      { timeout: INTEGRATION_WAIT_TIMEOUT_MS }
    )

    await expect(stopMinecraftServer()).resolves.toMatchObject({ status: 'stopping' })
    await vi.waitFor(() => expect(getServerRuntimeSnapshot().status).toBe('stopped'), {
      timeout: INTEGRATION_WAIT_TIMEOUT_MS
    })

    expect(getMinecraftProcessMock().commands.slice(-2)).toEqual(['save-all flush\n', 'stop\n'])
    await expect(readPublishedWorldData()).resolves.toBe(TEST_WORLD_DATA)
    await expect((await getLocalStorageAdapter()).readLatestSave()).resolves.toMatchObject({
      minecraftVersion: TEST_MINECRAFT_VERSION,
      saveVersion: 1,
      serverName: TEST_WORLD_NAME
    })
    await expect((await getLocalStorageAdapter()).readServerLock()).resolves.toEqual({
      status: ServerLockStatus.Unlocked
    })
    await expect(readLocalState()).resolves.toMatchObject({
      activeSessionId: null,
      localSaveVersion: 1
    })

    const publishLogs = getServerRuntimeSnapshot().logs.map(({ message }) => message)
    expect(publishLogs).toEqual(
      expect.arrayContaining([
        'Checking the latest shared save...',
        'Compressing the server save...',
        'Preparing shared storage...',
        'Uploading the server save...',
        'Updating save metadata...',
        'Finalizing the shared save...'
      ])
    )
    expect(publishLogs).toEqual(
      expect.arrayContaining([expect.stringMatching(/^Server save v1 published in .+\.$/)])
    )
    expect(publishLogs.some((message) => message.includes('completed in'))).toBe(false)
  })

  it('clears the hosting lock when Java exits before the server is ready', async () => {
    await createLocalTestWorld()
    const storageAdapter = await getLocalStorageAdapter()

    await startMinecraftServer()
    getMinecraftProcessMock().stderr.write(
      'UnsupportedClassVersionError: class file version 69.0, this runtime only recognizes up to 52.0\n'
    )
    getMinecraftProcessMock().emit('close', 1)

    await vi.waitFor(
      async () => {
        expect(getServerRuntimeSnapshot()).toMatchObject({ runningWorldId: null, status: 'error' })
        await expect(storageAdapter.readServerLock()).resolves.toEqual({
          status: ServerLockStatus.Unlocked
        })
        await expect(readLocalState()).resolves.toMatchObject({ activeSessionId: null })
      },
      { timeout: INTEGRATION_WAIT_TIMEOUT_MS }
    )
  })

  it('deletes a local world and keeps its server-folder backup', async () => {
    await createLocalTestWorld()
    await publishServerSave()
    const worldPaths = (await getSelectedWorldContext()).paths

    const snapshot = await deleteConfiguredServer()

    expect(snapshot.localState.serverSetup.status).toBe('not-configured')
    expect(snapshot.latestSave).toBeNull()
    await expect(stat(worldPaths.serverFolder)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(stat(worldPaths.storageWorldFile)).rejects.toMatchObject({ code: 'ENOENT' })
    const backupFolderNames = await readdir(worldPaths.backupsFolder)
    expect(backupFolderNames).toHaveLength(1)
    const backupFolderName = backupFolderNames[0]
    if (!backupFolderName) {
      throw new Error('Expected the deleted world backup folder to exist.')
    }
    await expect(
      readFile(join(worldPaths.backupsFolder, backupFolderName, 'world', 'level.dat'), 'utf8')
    ).resolves.toBe(TEST_WORLD_DATA)
  })

  it('deletes a local world after its hosting lock becomes stale', async () => {
    await createLocalTestWorld()
    const storageAdapter = await getLocalStorageAdapter()
    const staleHeartbeat = new Date(Date.now() - STALE_LOCK_THRESHOLD_MS - 1).toISOString()

    await storageAdapter.updateServerLock(() => ({
      status: ServerLockStatus.Locked,
      lockedBy: GOOGLE_TEST_ACCOUNTS.owner.session.player,
      sessionId: 'stale-session',
      saveVersion: 0,
      hostingStatus: ServerHostingStatus.Starting,
      startedAt: staleHeartbeat,
      lastHeartbeat: staleHeartbeat,
      connectionAddresses: []
    }))

    await expect(deleteConfiguredServer()).resolves.toMatchObject({
      localState: { serverSetup: { status: 'not-configured' } }
    })
  })

  it('keeps a local world protected while its hosting lock is fresh', async () => {
    await createLocalTestWorld()
    const storageAdapter = await getLocalStorageAdapter()
    const now = new Date().toISOString()

    await storageAdapter.updateServerLock(() => ({
      status: ServerLockStatus.Locked,
      lockedBy: GOOGLE_TEST_ACCOUNTS.owner.session.player,
      sessionId: 'fresh-session',
      saveVersion: 0,
      hostingStatus: ServerHostingStatus.Starting,
      startedAt: now,
      lastHeartbeat: now,
      connectionAddresses: []
    }))

    await expect(deleteConfiguredServer()).rejects.toThrow(
      `Cannot remove this server while ${GOOGLE_TEST_ACCOUNTS.owner.session.player.displayName} is hosting it.`
    )
  })

  it('deletes an owned Google Drive world and resets its local configuration', async () => {
    await createLocalTestWorld(GOOGLE_TEST_IDS.world)
    await configureOwnedGoogleDriveWorld()

    const snapshot = await deleteConfiguredServer()

    expect(snapshot.localState.serverSetup.status).toBe('not-configured')
    expect(googleDriveTestEnvironment.getFileContentByName('control.json')).toBeNull()
    expect(googleDriveTestEnvironment.getFileContentByName('world.zip')).toBeNull()
    await expect(readCloudStorageSettings()).resolves.toEqual({
      activeProvider: CloudStorageProvider.Local,
      googleDrive: {
        errorMessage: null,
        folder: null,
        status: GoogleDriveSetupStatus.NotConfigured
      }
    })
  })
})

async function readPublishedWorldData(): Promise<string> {
  const extractedWorldPath = join(integrationTestDataPath, 'published-world')
  const worldFilePath = (await getSelectedWorldContext()).paths.storageWorldFile
  await mkdir(extractedWorldPath, { recursive: true })
  await extractZip(worldFilePath, { dir: extractedWorldPath })

  return readFile(join(extractedWorldPath, 'world', 'level.dat'), 'utf8')
}

function configureOwnedGoogleDriveWorld(): Promise<void> {
  const now = '2026-07-25T12:00:00.000Z'

  return writeCloudStorageSettings({
    activeProvider: CloudStorageProvider.GoogleDrive,
    googleDrive: {
      errorMessage: null,
      folder: {
        configuredAt: now,
        folderId: GOOGLE_TEST_IDS.folder,
        ownerAccountId: GOOGLE_TEST_ACCOUNTS.owner.session.player.id,
        validatedAt: now,
        worldFileIds: {
          controlFileId: GOOGLE_TEST_IDS.controlFile,
          worldFileId: GOOGLE_TEST_IDS.worldFile
        }
      },
      status: GoogleDriveSetupStatus.Valid
    }
  })
}

async function getLocalStorageAdapter(): Promise<StorageAdapter> {
  return createLocalStorageAdapter(await getSelectedWorldContext())
}
