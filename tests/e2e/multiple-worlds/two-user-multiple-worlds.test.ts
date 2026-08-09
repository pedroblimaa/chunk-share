import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { StorageControl } from '../../../src/main/storage/adapters/storage-adapter.model'
import {
  DEFAULT_APP_STATE,
  createDefaultLocalWorldState
} from '../../../src/main/storage/core/support/storage-defaults'
import { CloudStorageProvider, GoogleDriveSetupStatus } from '../../../src/shared/cloud-storage.model'
import { ServerHostingStatus, ServerLockStatus } from '../../../src/shared/domain'
import type { AppState, LocalWorldState } from '../../../src/shared/world'
import {
  GOOGLE_TEST_ACCOUNTS,
  type GoogleTestAccountName
} from '../../support/google-drive/google-drive-test-environment'
import {
  createElectronE2EPaths,
  expectServerRunning,
  launchChunkShareE2EApp,
  type ChunkShareE2EApp,
  type ElectronE2EPaths
} from '../support/electron-test-app'
import { GoogleDriveE2EMock } from '../support/google-drive-e2e-mock'
import { openServerDashboard } from '../support/local-world-e2e'

const WORLD_A = {
  id: '00000000-0000-4000-8000-000000000061',
  name: 'Parallel World Alpha',
  port: 25570
}
const WORLD_B = {
  id: '00000000-0000-4000-8000-000000000062',
  name: 'Parallel World Beta',
  port: 25571
}
const NOW = '2026-08-01T12:00:00.000Z'

interface DriveWorldFixture {
  controlFileId: string
  folderId: string
  worldFileId: string
}

test('allows two users to host different shared worlds at the same time', async () => {
  const driveMock = new GoogleDriveE2EMock()
  const ownerPaths = createElectronE2EPaths()
  const friendPaths = createElectronE2EPaths()
  let ownerApp: ChunkShareE2EApp | null = null
  let friendApp: ChunkShareE2EApp | null = null

  await driveMock.start()

  try {
    const worldA = createDriveWorld(driveMock, WORLD_A)
    const worldB = createDriveWorld(driveMock, WORLD_B)
    driveMock.drive.createWriterPermission('owner', GOOGLE_TEST_ACCOUNTS.friend.session.player.email, false)
    await Promise.all([
      driveMock.drive.authorizeGoogleDriveFilesForAccount('friend', [
        worldA.controlFileId,
        worldA.worldFileId
      ]),
      driveMock.drive.authorizeGoogleDriveFilesForAccount('friend', [
        worldB.controlFileId,
        worldB.worldFileId
      ]),
      prepareUserState(ownerPaths, 'owner', WORLD_A.id, [worldA, worldB]),
      prepareUserState(friendPaths, 'friend', WORLD_B.id, [worldA, worldB])
    ])

    ownerApp = await launchChunkShareE2EApp({
      accountName: 'owner',
      driveMock,
      paths: ownerPaths
    })
    friendApp = await launchChunkShareE2EApp({
      accountName: 'friend',
      driveMock,
      paths: friendPaths
    })

    await openWorld(ownerApp, WORLD_A.name)
    await openWorld(friendApp, WORLD_B.name)
    await startServer(ownerApp)
    await startServer(friendApp)

    await expect
      .poll(() => readDriveControl(driveMock, worldA.controlFileId))
      .toMatchObject({
        worldId: WORLD_A.id,
        serverLock: {
          hostingStatus: ServerHostingStatus.Running,
          lockedBy: GOOGLE_TEST_ACCOUNTS.owner.session.player,
          status: ServerLockStatus.Locked
        }
      })
    await expect
      .poll(() => readDriveControl(driveMock, worldB.controlFileId))
      .toMatchObject({
        worldId: WORLD_B.id,
        serverLock: {
          hostingStatus: ServerHostingStatus.Running,
          lockedBy: GOOGLE_TEST_ACCOUNTS.friend.session.player,
          status: ServerLockStatus.Locked
        }
      })

    await stopServer(ownerApp, 2)
    await expectServerRunning(friendApp)
    expect(readDriveControl(driveMock, worldB.controlFileId)).toMatchObject({
      latestSave: { saveVersion: 1 },
      serverLock: {
        lockedBy: GOOGLE_TEST_ACCOUNTS.friend.session.player,
        status: ServerLockStatus.Locked
      }
    })

    await stopServer(friendApp, 2)

    expect(readDriveControl(driveMock, worldA.controlFileId)).toMatchObject({
      latestSave: { saveVersion: 2 },
      serverLock: { status: ServerLockStatus.Unlocked }
    })
    expect(readDriveControl(driveMock, worldB.controlFileId)).toMatchObject({
      latestSave: { saveVersion: 2 },
      serverLock: { status: ServerLockStatus.Unlocked }
    })
  } finally {
    await friendApp?.close()
    await ownerApp?.close()
    await driveMock.close()
  }
})

function createDriveWorld(driveMock: GoogleDriveE2EMock, world: typeof WORLD_A): DriveWorldFixture {
  const folderId = requireFileId(
    driveMock.drive.createFile('owner', {
      mimeType: 'application/vnd.google-apps.folder',
      name: world.name
    })
  )
  const controlFileId = requireFileId(
    driveMock.drive.createFile('owner', {
      mimeType: 'application/json',
      name: 'control.json',
      parents: [folderId]
    })
  )
  const worldFileId = requireFileId(
    driveMock.drive.createFile('owner', {
      mimeType: 'application/zip',
      name: 'world.zip',
      parents: [folderId]
    })
  )
  const control: StorageControl = {
    formatVersion: 1,
    worldId: world.id,
    latestSave: {
      minecraftVersion: '1.21.8',
      saveVersion: 1,
      serverName: world.name,
      serverType: 'vanilla',
      uploadedAt: NOW,
      uploadedBy: GOOGLE_TEST_ACCOUNTS.owner.session.player
    },
    serverLock: { status: ServerLockStatus.Unlocked },
    storageMutation: null
  }

  expect(driveMock.drive.uploadFile('owner', controlFileId, JSON.stringify(control), false)).toBe(true)
  expect(driveMock.drive.uploadFile('owner', worldFileId, `initial-${world.id}`, true)).toBe(true)

  return { controlFileId, folderId, worldFileId }
}

async function prepareUserState(
  paths: ElectronE2EPaths,
  accountName: GoogleTestAccountName,
  selectedWorldId: string,
  driveWorlds: DriveWorldFixture[]
): Promise<void> {
  const worlds = [WORLD_A, WORLD_B].map((world, index) => {
    const driveWorld = driveWorlds[index]
    if (!driveWorld) {
      throw new Error(`Missing Drive fixture for ${world.id}.`)
    }

    return createUserWorld(world, driveWorld, accountName, world.id === selectedWorldId)
  })
  const appState: AppState = {
    ...DEFAULT_APP_STATE,
    activeProvider: CloudStorageProvider.GoogleDrive,
    googleDrive: { errorMessage: null, status: GoogleDriveSetupStatus.Valid },
    player: GOOGLE_TEST_ACCOUNTS[accountName].session.player,
    selectedWorldId,
    worlds
  }

  await mkdir(paths.root, { recursive: true })
  await writeFile(paths.localStateFile, JSON.stringify(appState, null, 2))
  await installWorld(paths, worlds.find(({ id }) => id === selectedWorldId) as LocalWorldState)
}

function createUserWorld(
  world: typeof WORLD_A,
  driveWorld: DriveWorldFixture,
  accountName: GoogleTestAccountName,
  isInstalled: boolean
): LocalWorldState {
  return {
    ...createDefaultLocalWorldState(world.id, NOW),
    googleDrive: {
      configuredAt: NOW,
      folderId: driveWorld.folderId,
      ownerAccountId: accountName === 'owner' ? GOOGLE_TEST_ACCOUNTS.owner.session.player.id : null,
      validatedAt: NOW,
      worldFileIds: {
        controlFileId: driveWorld.controlFileId,
        worldFileId: driveWorld.worldFileId
      }
    },
    localSaveVersion: isInstalled ? 1 : null,
    serverConfig: {
      ...createDefaultLocalWorldState(world.id, NOW).serverConfig,
      minecraftVersion: '1.21.8',
      name: world.name,
      port: world.port
    },
    serverSetup: isInstalled
      ? { completedAt: NOW, errorMessage: null, status: 'ready' }
      : { completedAt: null, errorMessage: null, status: 'not-configured' }
  }
}

async function installWorld(paths: ElectronE2EPaths, world: LocalWorldState): Promise<void> {
  const serverFolder = join(paths.root, '.servers', world.id)
  await mkdir(join(serverFolder, 'world'), { recursive: true })
  await Promise.all([
    writeFile(join(serverFolder, 'server.jar'), 'chunkshare-e2e-server'),
    writeFile(join(serverFolder, 'server.properties'), `server-port=${world.serverConfig.port}\n`),
    writeFile(join(serverFolder, 'eula.txt'), 'eula=true\n'),
    writeFile(join(serverFolder, 'world', 'level.dat'), `world-${world.id}`)
  ])
}

async function startServer(app: ChunkShareE2EApp): Promise<void> {
  const startButton = app.page.getByRole('button', { name: 'Start Server', exact: true })
  await expect(startButton).toBeEnabled()
  await app.user.click(startButton)
  await expectServerRunning(app)
}

async function openWorld(app: ChunkShareE2EApp, worldName: string): Promise<void> {
  await openServerDashboard(app, worldName)
}

async function stopServer(app: ChunkShareE2EApp, publishedVersion: number): Promise<void> {
  await app.user.click(app.page.getByRole('button', { name: 'Stop Server', exact: true }))
  await expect(app.page.getByText('STOPPED', { exact: true })).toBeVisible()
  await expect(app.page.getByLabel('Server console output')).toContainText(
    new RegExp(`Server save v${publishedVersion} published in \\d+(?:\\.\\d+)? (?:ms|s)\\.`)
  )
}

function readDriveControl(driveMock: GoogleDriveE2EMock, controlFileId: string): StorageControl {
  const content = driveMock.drive.getFileContent('owner', controlFileId)

  if (typeof content !== 'string') {
    throw new Error(`Drive control ${controlFileId} is unavailable.`)
  }

  return JSON.parse(content) as StorageControl
}

function requireFileId(file: { id?: string | null } | null): string {
  if (!file?.id) {
    throw new Error('Expected the mocked Drive file to be created.')
  }

  return file.id
}
