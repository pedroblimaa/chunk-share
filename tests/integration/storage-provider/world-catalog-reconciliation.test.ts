import { mkdir, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CloudStorageProvider,
  GoogleDriveSetupStatus,
  StorageSwitchDataMode,
  type CloudStorageSettings
} from '../../../src/shared/cloud-storage.model'
import { ServerAvailability } from '../../../src/shared/dashboard'
import { ServerSyncStatus } from '../../../src/shared/server-sync'
import { getServerDisplayState } from '../../../src/main/dashboard/dashboard-service'
import {
  getServerRuntimeSnapshot,
  startMinecraftServer,
  stopMinecraftServer
} from '../../../src/main/server-runtime/server-runtime-service'
import { setupVanillaServer } from '../../../src/main/server-setup/server-setup-service'
import {
  getCloudStorageProviderSwitchPreview,
  setCloudStorageProvider
} from '../../../src/main/storage/core/cloud-storage-service'
import { createGoogleDriveStorageAdapter } from '../../../src/main/storage/adapters/google-drive-storage-adapter'
import { getSelectedWorldContext } from '../../../src/main/storage/core/world-context'
import {
  createWorld,
  readAppState,
  updateWorld,
  writeAppState
} from '../../../src/main/storage/persistence/local-state-store'
import { publishServerSave } from '../../../src/main/storage/server-save/server-save-publisher'
import { DEFAULT_SERVER_SETUP_STATE } from '../../../src/main/storage/core/support/storage-defaults'
import { saveOwnerGoogleDriveWorld } from '../share-join/share-join-test-data'
import {
  TEST_MINECRAFT_METADATA_URL,
  TEST_MINECRAFT_VERSION
} from '../support/minecraft/minecraft-download-mock-handlers'
import {
  getMinecraftProcessMock,
  resetMinecraftProcessMock
} from '../support/minecraft/minecraft-process-mock'
import {
  TEST_WORLD_DATA,
  TEST_WORLD_NAME,
  TEST_WORLD_PORT,
  createLocalTestWorld
} from '../support/world-test-data'

vi.mock('child_process', async () => {
  const actual = await vi.importActual<typeof import('child_process')>('child_process')
  const processMock = await import('../support/minecraft/minecraft-process-mock')

  return { ...actual, spawn: processMock.spawnMinecraftProcess }
})

vi.mock(
  '../../../src/main/auth/auth-service',
  () => import('../support/google-drive/google-auth-service-mock')
)

const WORLD_A_ID = '00000000-0000-4000-8000-000000000051'
const WORLD_D_ID = '00000000-0000-4000-8000-000000000054'
const WAIT_TIMEOUT_MS = 5_000

describe('world catalog provider reconciliation', () => {
  beforeEach(resetMinecraftProcessMock)

  it('keeps an installed-only world visible after switching to Google Drive', async () => {
    await createLocalTestWorld(WORLD_A_ID)
    await configureGoogleDriveAsAvailable()

    await expect(
      getCloudStorageProviderSwitchPreview(CloudStorageProvider.GoogleDrive)
    ).resolves.toMatchObject({
      target: { hasWorldFile: false, latestSaveVersion: null }
    })
    await switchProvider(CloudStorageProvider.GoogleDrive)

    const displayState = await getServerDisplayState()
    expect(displayState.selectedWorldId).toBe(WORLD_A_ID)
    expect(displayState.worlds).toEqual([
      expect.objectContaining({
        worldId: WORLD_A_ID,
        serverAvailability: ServerAvailability.LocalReady,
        syncStatus: expect.objectContaining({ latestSave: null })
      })
    ])

    await startMinecraftServer()
    getMinecraftProcessMock().emitReady()
    await waitForRuntimeStatus('running')
    await stopMinecraftServer()
    await waitForRuntimeStatus('stopped')

    const worldContext = await getSelectedWorldContext()
    expect(worldContext.world.googleDrive).not.toBeNull()
    await expect(createGoogleDriveStorageAdapter(worldContext).readLatestSave()).resolves.toMatchObject({
      saveVersion: 1
    })
  })

  it('shows a local-provider-only world as downloadable after switching to Local', async () => {
    await createLocalTestWorld(WORLD_A_ID)
    await publishServerSave()
    await removeSelectedWorldInstallation()
    await setActiveProviderForTest(CloudStorageProvider.GoogleDrive)

    await switchProvider(CloudStorageProvider.Local)

    const displayState = await getServerDisplayState()
    expect(displayState.selectedWorldId).toBe(WORLD_A_ID)
    expect(displayState.worlds).toEqual([
      expect.objectContaining({
        worldId: WORLD_A_ID,
        serverAvailability: ServerAvailability.RemoteAvailable
      })
    ])
  })

  it('uses normal sync state when a Drive world is also installed', async () => {
    await saveOwnerGoogleDriveWorld()
    await setActiveProviderForTest(CloudStorageProvider.Local)
    await installSelectedWorld()
    const driveWorldId = (await readAppState()).selectedWorldId

    if (!driveWorldId) {
      throw new Error('Expected the Drive world to remain selected.')
    }

    await updateWorld(driveWorldId, (world) => ({ ...world, localSaveVersion: 1 }))

    await switchProvider(CloudStorageProvider.GoogleDrive)

    const displayState = await getServerDisplayState()
    expect(displayState.worlds).toEqual([
      expect.objectContaining({
        worldId: displayState.selectedWorldId,
        serverAvailability: ServerAvailability.LocalReady,
        syncStatus: expect.objectContaining({
          latestSave: expect.objectContaining({ saveVersion: 1 }),
          localSaveVersion: 1,
          status: ServerSyncStatus.Ready
        })
      })
    ])
  })

  it('omits a world that is neither installed nor in the active provider', async () => {
    await createWorld(WORLD_D_ID)
    await setActiveProviderForTest(CloudStorageProvider.GoogleDrive)

    await switchProvider(CloudStorageProvider.Local)

    expect(await getServerDisplayState()).toMatchObject({
      selectedWorldId: null,
      worlds: []
    })
    expect(await readAppState()).toMatchObject({ selectedWorldId: null })
  })

  it('selects a world available in the new provider when the previous selection disappears', async () => {
    await saveOwnerGoogleDriveWorld()
    const driveWorldId = (await readAppState()).selectedWorldId
    await setActiveProviderForTest(CloudStorageProvider.Local)
    await createLocalTestWorld(WORLD_A_ID)
    await publishServerSave()
    await removeSelectedWorldInstallation()

    await switchProvider(CloudStorageProvider.GoogleDrive)

    expect(await getServerDisplayState()).toMatchObject({
      selectedWorldId: driveWorldId,
      worlds: [expect.objectContaining({ worldId: driveWorldId })]
    })
    expect(await readAppState()).toMatchObject({ selectedWorldId: driveWorldId })
  })

  it('blocks a provider switch while a world runs and allows it after a clean stop', async () => {
    await createLocalTestWorld(WORLD_A_ID)
    await configureGoogleDriveAsAvailable()
    await startMinecraftServer()
    getMinecraftProcessMock().emitReady()
    await waitForRuntimeStatus('running')

    await expect(switchProvider(CloudStorageProvider.GoogleDrive)).rejects.toThrow(
      'Cannot change storage settings while the Minecraft server is active.'
    )

    await stopMinecraftServer()
    await waitForRuntimeStatus('stopped')

    await expect(switchProvider(CloudStorageProvider.GoogleDrive)).resolves.toMatchObject({
      activeProvider: CloudStorageProvider.GoogleDrive
    })
  })
})

function switchProvider(provider: CloudStorageProvider): Promise<CloudStorageSettings> {
  return setCloudStorageProvider({
    dataMode: StorageSwitchDataMode.UseTargetAsIs,
    provider
  })
}

async function configureGoogleDriveAsAvailable(): Promise<void> {
  const appState = await readAppState()
  await writeAppState({
    ...appState,
    googleDrive: {
      errorMessage: null,
      status: GoogleDriveSetupStatus.Valid
    }
  })
}

async function setActiveProviderForTest(provider: CloudStorageProvider): Promise<void> {
  const appState = await readAppState()
  await writeAppState({ ...appState, activeProvider: provider })
}

async function installSelectedWorld(): Promise<void> {
  await setupVanillaServer({
    eulaAccepted: true,
    minecraftVersion: TEST_MINECRAFT_VERSION,
    minecraftVersionMetadataUrl: TEST_MINECRAFT_METADATA_URL,
    name: TEST_WORLD_NAME,
    port: TEST_WORLD_PORT
  })

  const worldFolderPath = join((await getSelectedWorldContext()).paths.serverFolder, 'world')
  await mkdir(worldFolderPath, { recursive: true })
  await writeFile(join(worldFolderPath, 'level.dat'), TEST_WORLD_DATA)
}

async function removeSelectedWorldInstallation(): Promise<void> {
  const context = await getSelectedWorldContext()
  await rm(context.paths.serverFolder, { force: true, recursive: true })
  await updateWorld(context.worldId, (world) => ({
    ...world,
    localSaveVersion: null,
    serverSetup: { ...DEFAULT_SERVER_SETUP_STATE }
  }))
}

async function waitForRuntimeStatus(status: string): Promise<void> {
  await vi.waitFor(() => expect(getServerRuntimeSnapshot().status).toBe(status), {
    timeout: WAIT_TIMEOUT_MS
  })
}
