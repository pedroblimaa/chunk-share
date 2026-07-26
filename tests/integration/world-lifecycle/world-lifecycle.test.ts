import extractZip from 'extract-zip'
import { mkdir, readdir, readFile, stat } from 'fs/promises'
import { join } from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ServerHostingStatus, ServerLockStatus } from '../../../src/shared/domain'
import { ServerSetupProgressStep } from '../../../src/shared/server-setup'
import { CloudStorageProvider, GoogleDriveSetupStatus } from '../../../src/shared/cloud-storage.model'
import {
  getServerRuntimeSnapshot,
  startMinecraftServer,
  stopMinecraftServer
} from '../../../src/main/server-runtime/server-runtime-service'
import { setupVanillaServer } from '../../../src/main/server-setup/server-setup-service'
import { deleteConfiguredServer } from '../../../src/main/storage/core/storage-service'
import {
  localServerBackupsFolderPath,
  localServerEulaFilePath,
  localServerFolderPath,
  localServerJarFilePath,
  localServerPropertiesFilePath,
  localStorageWorldFilePath
} from '../../../src/main/storage/core/support/storage-paths'
import { localStorageAdapter } from '../../../src/main/storage/adapters/local-storage-adapter'
import { readLocalState } from '../../../src/main/storage/persistence/local-state-store'
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
import { DEFAULT_LOCAL_STATE } from '../../../src/main/storage/core/support/storage-defaults'
import { writeLocalState } from '../../../src/main/storage/persistence/local-state-store'
import { publishServerSave } from '../../../src/main/storage/server-save/server-save-publisher'
import { integrationTestDataPath } from '../support/integration-test-storage'
import {
  readCloudStorageSettings,
  writeCloudStorageSettings
} from '../../../src/main/storage/persistence/cloud-storage-settings-store'

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
    await writeLocalState({
      ...DEFAULT_LOCAL_STATE,
      player: GOOGLE_TEST_ACCOUNTS.owner.session.player
    })

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
    await expect(stat(localServerJarFilePath)).resolves.toMatchObject({ size: expect.any(Number) })
    await expect(readFile(localServerEulaFilePath, 'utf8')).resolves.toContain('eula=true')
    await expect(readFile(localServerPropertiesFilePath, 'utf8')).resolves.toContain(
      `server-port=${TEST_WORLD_PORT}`
    )
  })

  it('starts, stops, and publishes the world', async () => {
    await createLocalTestWorld()

    await expect(startMinecraftServer()).resolves.toMatchObject({ status: 'starting' })
    expect(getMinecraftSpawnInvocation()).toEqual({
      args: ['-Xmx4G', '-Xms2G', '-jar', 'server.jar', 'nogui'],
      command: 'java',
      options: {
        cwd: localServerFolderPath,
        windowsHide: true
      }
    })

    getMinecraftProcessMock().emitReady()
    await vi.waitFor(
      async () => {
        expect(getServerRuntimeSnapshot().status).toBe('running')
        await expect(localStorageAdapter.readServerLock()).resolves.toMatchObject({
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
    await expect(localStorageAdapter.readLatestSave()).resolves.toMatchObject({
      minecraftVersion: TEST_MINECRAFT_VERSION,
      saveVersion: 1,
      serverName: TEST_WORLD_NAME
    })
    await expect(localStorageAdapter.readServerLock()).resolves.toEqual({
      status: ServerLockStatus.Unlocked
    })
    await expect(readLocalState()).resolves.toMatchObject({
      activeSessionId: null,
      localSaveVersion: 1
    })
  })

  it('deletes a local world and keeps its server-folder backup', async () => {
    await createLocalTestWorld()
    await publishServerSave()

    const snapshot = await deleteConfiguredServer()

    expect(snapshot.localState.serverSetup.status).toBe('not-configured')
    expect(snapshot.latestSave).toBeNull()
    await expect(stat(localServerFolderPath)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(stat(localStorageWorldFilePath)).rejects.toMatchObject({ code: 'ENOENT' })
    const backupFolderNames = await readdir(localServerBackupsFolderPath)
    expect(backupFolderNames).toHaveLength(1)
    await expect(
      readFile(join(localServerBackupsFolderPath, backupFolderNames[0], 'world', 'level.dat'), 'utf8')
    ).resolves.toBe(TEST_WORLD_DATA)
  })

  it('deletes an owned Google Drive world and resets its local configuration', async () => {
    await createLocalTestWorld()
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
  await mkdir(extractedWorldPath, { recursive: true })
  await extractZip(localStorageWorldFilePath, { dir: extractedWorldPath })

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
        folderName: TEST_WORLD_NAME,
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
