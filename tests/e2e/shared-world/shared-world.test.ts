import { ZipArchive } from 'archiver'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { expect, test } from '@playwright/test'
import { CloudStorageProvider, GoogleDriveSetupStatus } from '../../../src/shared/cloud-storage.model'
import type { AppState } from '../../../src/shared/world'
import { ServerHostingStatus, ServerLockStatus } from '../../../src/shared/domain'
import type { StorageControl } from '../../../src/main/storage/adapters/storage-adapter.model'
import {
  DEFAULT_APP_STATE,
  createDefaultLocalWorldState
} from '../../../src/main/storage/core/support/storage-defaults'
import {
  GOOGLE_TEST_ACCOUNTS,
  GOOGLE_TEST_IDS
} from '../../support/google-drive/google-drive-test-environment'
import {
  E2E_WORLD_DATA,
  createElectronE2EPaths,
  expectServerRunning,
  launchChunkShareE2EApp,
  readSelectedWorldE2EPaths,
  type ChunkShareE2EApp,
  type ElectronE2EPaths
} from '../support/electron-test-app'
import { GoogleDriveE2EMock } from '../support/google-drive-e2e-mock'
import { openServerDashboard } from '../support/local-world-e2e'

test('owner invites a friend who joins and downloads the shared world', async () => {
  const driveMock = new GoogleDriveE2EMock()
  const ownerPaths = createElectronE2EPaths()
  let ownerApp: ChunkShareE2EApp | null = null
  let friendApp: ChunkShareE2EApp | null = null

  await driveMock.start()

  try {
    await prepareSharedWorld(driveMock, ownerPaths)
    ownerApp = await launchChunkShareE2EApp({
      accountName: 'owner',
      driveMock,
      paths: ownerPaths
    })

    await openSharedWorldDashboard(ownerApp)
    const joinLink = await inviteFriend(ownerApp)

    friendApp = await launchChunkShareE2EApp({ accountName: 'friend', driveMock })
    await joinAndDownloadSharedWorld(friendApp, joinLink)

    expect(driveMock.drive.getLastPickerFileIds()).toEqual([
      GOOGLE_TEST_IDS.controlFile,
      GOOGLE_TEST_IDS.worldFile
    ])
    expect(driveMock.drive.listPermissions('owner')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          emailAddress: GOOGLE_TEST_ACCOUNTS.friend.session.player.email,
          role: 'writer'
        })
      ])
    )
    await expectJoinedWorldFiles(friendApp.paths)
  } finally {
    await friendApp?.close()
    await ownerApp?.close()
    await driveMock.close()
  }
})

test('opens a Drive world before its delayed snapshot finishes loading', async () => {
  const driveMock = new GoogleDriveE2EMock()
  const ownerPaths = createElectronE2EPaths()
  let ownerApp: ChunkShareE2EApp | null = null

  await driveMock.start()

  try {
    await prepareSharedWorld(driveMock, ownerPaths)
    ownerApp = await launchChunkShareE2EApp({ accountName: 'owner', driveMock, paths: ownerPaths })
    const refreshButton = ownerApp.page.getByRole('button', { name: 'Refresh servers' })
    await ownerApp.user.click(refreshButton)
    await expect(refreshButton).toHaveAttribute('aria-busy', 'false')
    driveMock.delayRequest({
      delayMs: 1_500,
      method: 'GET',
      times: 10
    })

    const openWorld = ownerApp.user.click(
      ownerApp.page.getByRole('button', { name: 'Download', exact: true })
    )

    await expect(ownerApp.page.getByRole('heading', { name: 'Shared Test World' })).toBeVisible({
      timeout: 1_000
    })
    await expect(ownerApp.page.getByText('UPDATING', { exact: true })).toBeVisible()
    await expect(ownerApp.page.getByRole('button', { name: 'Updating...' })).toHaveAttribute(
      'aria-busy',
      'true'
    )
    await openWorld
  } finally {
    await ownerApp?.close()
    await driveMock.close()
  }
})

test('shows a remote starting state instead of a spinning download action', async () => {
  const driveMock = new GoogleDriveE2EMock()
  const ownerPaths = createElectronE2EPaths()
  let ownerApp: ChunkShareE2EApp | null = null
  let friendApp: ChunkShareE2EApp | null = null

  await driveMock.start()

  try {
    await prepareSharedWorld(driveMock, ownerPaths)
    ownerApp = await launchChunkShareE2EApp({ accountName: 'owner', driveMock, paths: ownerPaths })
    await openSharedWorldDashboard(ownerApp)
    await downloadSharedServer(ownerApp)
    const joinLink = await inviteFriend(ownerApp)

    friendApp = await launchChunkShareE2EApp({ accountName: 'friend', driveMock })
    await joinSharedWorld(friendApp, joinLink)

    driveMock.delayRequest({
      delayMs: 1_500,
      method: 'PATCH',
      occurrence: 2,
      pathname: `/upload/drive/v3/files/${GOOGLE_TEST_IDS.controlFile}`
    })
    await ownerApp.user.click(ownerApp.page.getByRole('button', { name: 'Start Server', exact: true }))
    await expectDriveControl(driveMock, {
      serverLock: {
        hostingStatus: ServerHostingStatus.Starting,
        status: ServerLockStatus.Locked
      }
    })

    await friendApp.user.click(friendApp.page.getByRole('button', { name: 'Download', exact: true }))

    await expect(friendApp.page.getByRole('button', { name: 'Starting...' })).toBeVisible()
    await expect(friendApp.page.getByRole('button', { name: 'Download shared server' })).toHaveCount(0)

    await expectDriveControl(driveMock, {
      serverLock: {
        hostingStatus: ServerHostingStatus.Running,
        status: ServerLockStatus.Locked
      }
    })
    await stopServer(ownerApp, 2)
  } finally {
    await friendApp?.close()
    await ownerApp?.close()
    await driveMock.close()
  }
})

test('hands hosting from the owner to a friend', async () => {
  const driveMock = new GoogleDriveE2EMock()
  const ownerPaths = createElectronE2EPaths()
  let ownerApp: ChunkShareE2EApp | null = null
  let friendApp: ChunkShareE2EApp | null = null

  await driveMock.start()

  try {
    await prepareSharedWorld(driveMock, ownerPaths)
    ownerApp = await launchChunkShareE2EApp({
      accountName: 'owner',
      driveMock,
      paths: ownerPaths
    })

    await openSharedWorldDashboard(ownerApp)
    await downloadSharedServer(ownerApp)
    const joinLink = await inviteFriend(ownerApp)

    friendApp = await launchChunkShareE2EApp({ accountName: 'friend', driveMock })
    await joinAndDownloadSharedWorld(friendApp, joinLink)

    await friendApp.user.click(
      friendApp.page.getByLabel('Breadcrumb').getByRole('button', { name: 'Servers', exact: true })
    )
    await expect(
      friendApp.page.getByRole('button', { name: 'Open Shared Test World', exact: true })
    ).toBeVisible()

    await startServer(ownerApp)
    await openServerDashboard(friendApp, 'Shared Test World')

    await expect(friendApp.page.getByText('Online with Owner Player')).toBeVisible()
    await expect(friendApp.page.getByText('Owner Player', { exact: true })).toBeVisible()
    await expect(friendApp.page.getByRole('button', { name: 'Start Server', exact: true })).toHaveCount(0)
    await friendApp.user.click(friendApp.page.getByRole('button', { name: 'Join Server' }))
    await expect(friendApp.page.getByText(/:25565/)).toBeVisible()

    await stopServer(ownerApp, 2)
    await refreshServer(friendApp)
    await friendApp.user.click(
      friendApp.page.getByRole('button', { name: 'Download Update' }).filter({
        hasText: 'Download Update'
      })
    )
    await expect(friendApp.page.getByRole('button', { name: 'Start Server', exact: true })).toBeVisible()
    await expectLocalSaveVersion(friendApp.paths, 2)

    await startServer(friendApp)
    await expectDriveControl(driveMock, {
      serverLock: {
        hostingStatus: ServerHostingStatus.Running,
        lockedBy: GOOGLE_TEST_ACCOUNTS.friend.session.player,
        status: ServerLockStatus.Locked
      }
    })
    await stopServer(friendApp, 3)
  } finally {
    await friendApp?.close()
    await ownerApp?.close()
    await driveMock.close()
  }
})

test('refreshes the server list when another machine starts hosting', async () => {
  const driveMock = new GoogleDriveE2EMock()
  const ownerPaths = createElectronE2EPaths()
  let ownerApp: ChunkShareE2EApp | null = null
  let friendApp: ChunkShareE2EApp | null = null

  await driveMock.start()

  try {
    await prepareSharedWorld(driveMock, ownerPaths)
    ownerApp = await launchChunkShareE2EApp({
      accountName: 'owner',
      driveMock,
      paths: ownerPaths
    })

    await openSharedWorldDashboard(ownerApp)
    await downloadSharedServer(ownerApp)
    const joinLink = await inviteFriend(ownerApp)

    friendApp = await launchChunkShareE2EApp({ accountName: 'friend', driveMock })
    await joinAndDownloadSharedWorld(friendApp, joinLink)
    await friendApp.user.click(
      friendApp.page.getByLabel('Breadcrumb').getByRole('button', { name: 'Servers', exact: true })
    )

    const serverCard = friendApp.page.getByRole('article').filter({
      has: friendApp.page.getByRole('heading', { name: 'Shared Test World' })
    })

    await expect(
      serverCard.getByRole('button', { name: 'Open Shared Test World', exact: true })
    ).toBeVisible()
    await startServer(ownerApp)
    await expect(
      serverCard.getByRole('button', { name: 'Open Shared Test World', exact: true })
    ).toBeVisible()

    await friendApp.user.click(friendApp.page.getByRole('button', { name: 'Refresh servers' }))

    await expect(serverCard).toContainText('Online with Owner Player')
    await expect(serverCard.getByText('Owner Player', { exact: true })).toBeVisible()
    await expect(serverCard.getByRole('button', { name: 'Join', exact: true })).toBeVisible()

    await stopServer(ownerApp, 2)
  } finally {
    await friendApp?.close()
    await ownerApp?.close()
    await driveMock.close()
  }
})

test('keeps the shared state safe when publishing fails and allows a retry', async () => {
  const driveMock = new GoogleDriveE2EMock()
  const ownerPaths = createElectronE2EPaths()
  let ownerApp: ChunkShareE2EApp | null = null

  await driveMock.start()

  try {
    await prepareSharedWorld(driveMock, ownerPaths)
    ownerApp = await launchChunkShareE2EApp({
      accountName: 'owner',
      driveMock,
      paths: ownerPaths
    })

    await openSharedWorldDashboard(ownerApp)
    await downloadSharedServer(ownerApp)
    await startServer(ownerApp)

    driveMock.failNextRequest({
      method: 'PATCH',
      pathname: `/upload/drive/v3/files/${GOOGLE_TEST_IDS.worldFile}`,
      status: 503
    })
    await ownerApp.user.click(ownerApp.page.getByRole('button', { name: 'Stop Server', exact: true }))

    await expect(ownerApp.page.getByRole('alert')).toContainText('Unable to publish server save')
    await expect(ownerApp.page.getByLabel('Server console output')).not.toContainText(
      'Server save v2 published in'
    )
    await expectDriveControl(driveMock, {
      latestSave: { saveVersion: 1 },
      serverLock: {
        hostingStatus: ServerHostingStatus.Stopping,
        status: ServerLockStatus.Locked
      }
    })

    await startServer(ownerApp)
    await stopServer(ownerApp, 2)
  } finally {
    await ownerApp?.close()
    await driveMock.close()
  }
})

test('restores a shared world after relaunch and publishes the next version', async () => {
  const driveMock = new GoogleDriveE2EMock()
  const ownerPaths = createElectronE2EPaths()
  let ownerApp: ChunkShareE2EApp | null = null

  await driveMock.start()

  try {
    await prepareSharedWorld(driveMock, ownerPaths)
    ownerApp = await launchChunkShareE2EApp({
      accountName: 'owner',
      driveMock,
      paths: ownerPaths
    })

    await openSharedWorldDashboard(ownerApp)
    await downloadSharedServer(ownerApp)
    await startServer(ownerApp)
    await stopServer(ownerApp, 2)
    await ownerApp.close({ preserveData: true })
    ownerApp = null

    ownerApp = await launchChunkShareE2EApp({
      accountName: 'owner',
      driveMock,
      paths: ownerPaths
    })
    await openServerDashboard(ownerApp, 'Shared Test World')

    await expect(ownerApp.page.getByRole('heading', { name: 'Shared Test World' })).toBeVisible()
    await expect(ownerApp.page.getByRole('button', { name: 'Start Server', exact: true })).toBeVisible()
    await expectLocalSaveVersion(ownerApp.paths, 2)

    await startServer(ownerApp)
    await stopServer(ownerApp, 3)
  } finally {
    await ownerApp?.close()
    await driveMock.close()
  }
})

async function prepareSharedWorld(
  driveMock: GoogleDriveE2EMock,
  ownerPaths: ElectronE2EPaths
): Promise<void> {
  await Promise.all([
    saveOwnerDriveSettings(ownerPaths),
    createSharedServerZip().then((worldZip) => {
      const uploaded = driveMock.drive.uploadFile('owner', GOOGLE_TEST_IDS.worldFile, worldZip, true)

      expect(uploaded).toBe(true)
    })
  ])
}

async function openSharedWorldDashboard(app: ChunkShareE2EApp): Promise<void> {
  await app.user.click(app.page.getByRole('button', { name: 'Download', exact: true }))
  await expect(app.page.getByRole('heading', { name: 'Shared Test World' })).toBeVisible()
}

async function inviteFriend(ownerApp: ChunkShareE2EApp): Promise<string> {
  const { page, user } = ownerApp

  await user.click(page.getByRole('button', { name: 'More server actions' }))
  await user.click(page.getByRole('menuitem', { name: 'Invite' }))

  await user.fill(page.getByLabel('Invite via Email'), GOOGLE_TEST_ACCOUNTS.friend.session.player.email)
  await user.click(page.getByRole('button', { name: 'Send Invitation' }))

  await expect(page.getByText(GOOGLE_TEST_ACCOUNTS.friend.session.player.email)).toBeVisible()
  await expect(page.getByText('Editor', { exact: true })).toBeVisible()

  const joinLink = await page.getByLabel('Quick Share Link').inputValue()
  expect(joinLink).toContain(`folderId=${GOOGLE_TEST_IDS.folder}`)
  expect(joinLink).toContain(`controlFileId=${GOOGLE_TEST_IDS.controlFile}`)
  expect(joinLink).toContain(`worldFileId=${GOOGLE_TEST_IDS.worldFile}`)
  await user.click(page.getByRole('button', { name: 'Close dialog' }))

  return joinLink
}

async function joinAndDownloadSharedWorld(friendApp: ChunkShareE2EApp, joinLink: string): Promise<void> {
  await joinSharedWorld(friendApp, joinLink)
  await openSharedWorldDashboard(friendApp)
  await downloadSharedServer(friendApp)
}

async function joinSharedWorld(friendApp: ChunkShareE2EApp, joinLink: string): Promise<void> {
  const { page, user } = friendApp

  await user.click(page.getByRole('button', { name: 'Join Shared World' }))
  await expect(page.getByText(/select both control\.json and world\.zip/i)).toBeVisible()
  await user.fill(page.getByLabel('Join link'), joinLink)
  await user.click(page.getByRole('button', { name: 'Join World' }))

  await expect(page.getByRole('heading', { name: 'Shared Test World' })).toBeVisible()
  await expectJoinedDriveSettings(friendApp.paths)
}

async function downloadSharedServer(app: ChunkShareE2EApp): Promise<void> {
  const { page, user } = app

  await user.check(page.getByLabel('I agree to the Minecraft EULA'))
  await user.click(page.getByRole('button', { name: 'Download shared server' }))
  await expect(page.getByRole('button', { name: 'Start Server', exact: true })).toBeVisible()
}

async function startServer(app: ChunkShareE2EApp): Promise<void> {
  await app.user.click(app.page.getByRole('button', { name: 'Start Server', exact: true }))
  await expectServerRunning(app)
}

async function stopServer(app: ChunkShareE2EApp, publishedVersion: number): Promise<void> {
  await app.user.click(app.page.getByRole('button', { name: 'Stop Server', exact: true }))
  await expect(app.page.getByText('STOPPED', { exact: true })).toBeVisible()
  await expect(app.page.getByLabel('Server console output')).toContainText(
    new RegExp(`Server save v${publishedVersion} published in \\d+(?:\\.\\d+)? (?:ms|s)\\.`)
  )
}

async function refreshServer(app: ChunkShareE2EApp): Promise<void> {
  await app.user.click(app.page.getByRole('button', { name: 'Refresh server' }))
}

async function saveOwnerDriveSettings(paths: ElectronE2EPaths): Promise<void> {
  const now = '2026-07-25T12:00:00.000Z'
  const world = {
    ...createDefaultLocalWorldState(GOOGLE_TEST_IDS.world, now),
    googleDrive: {
      configuredAt: now,
      folderId: GOOGLE_TEST_IDS.folder,
      ownerAccountId: GOOGLE_TEST_ACCOUNTS.owner.session.player.id,
      validatedAt: now,
      worldFileIds: null
    },
    serverConfig: {
      ...createDefaultLocalWorldState(GOOGLE_TEST_IDS.world, now).serverConfig,
      name: 'Shared Test World',
      minecraftVersion: '1.21.8'
    }
  }
  const appState: AppState = {
    ...DEFAULT_APP_STATE,
    player: GOOGLE_TEST_ACCOUNTS.owner.session.player,
    selectedWorldId: world.id,
    activeProvider: CloudStorageProvider.GoogleDrive,
    googleDrive: {
      errorMessage: null,
      status: GoogleDriveSetupStatus.Valid
    },
    worlds: [world]
  }

  await mkdir(paths.root, { recursive: true })
  await writeFile(paths.localStateFile, JSON.stringify(appState, null, 2))
}

async function createSharedServerZip(): Promise<Uint8Array> {
  const archive = new ZipArchive({ zlib: { level: 6 } })
  const output = new PassThrough()
  const chunks: Buffer[] = []
  const completed = new Promise<void>((resolve, reject) => {
    output.on('data', (chunk: Buffer) => chunks.push(chunk))
    output.once('end', resolve)
    output.once('error', reject)
    archive.once('error', reject)
    archive.once('warning', reject)
  })

  archive.pipe(output)
  archive.append('chunkshare-e2e-server', { name: 'server.jar' })
  archive.append('server-port=25565\n', { name: 'server.properties' })
  archive.append(E2E_WORLD_DATA, { name: 'world/level.dat' })

  await archive.finalize()
  await completed

  return new Uint8Array(Buffer.concat(chunks))
}

async function expectJoinedDriveSettings(paths: ElectronE2EPaths): Promise<void> {
  const appState: unknown = JSON.parse(await readFile(paths.localStateFile, 'utf8'))

  expect(appState).toMatchObject({
    activeProvider: CloudStorageProvider.GoogleDrive,
    googleDrive: {
      status: GoogleDriveSetupStatus.Valid
    },
    selectedWorldId: GOOGLE_TEST_IDS.world,
    worlds: [
      {
        id: GOOGLE_TEST_IDS.world,
        googleDrive: {
          folderId: GOOGLE_TEST_IDS.folder,
          ownerAccountId: null,
          worldFileIds: {
            controlFileId: GOOGLE_TEST_IDS.controlFile,
            worldFileId: GOOGLE_TEST_IDS.worldFile
          }
        }
      }
    ]
  })
}

async function expectLocalSaveVersion(paths: ElectronE2EPaths, expectedVersion: number): Promise<void> {
  const localState: unknown = JSON.parse(await readFile(paths.localStateFile, 'utf8'))

  expect(localState).toMatchObject({
    worlds: [{ localSaveVersion: expectedVersion }]
  })
}

async function expectDriveControl(
  driveMock: GoogleDriveE2EMock,
  expectedControl: Record<string, unknown>
): Promise<void> {
  await expect.poll(() => readDriveControl(driveMock)).toMatchObject(expectedControl)
}

function readDriveControl(driveMock: GoogleDriveE2EMock): StorageControl {
  const content = driveMock.drive.getFileContentByName('control.json')

  if (typeof content !== 'string') {
    throw new Error('The E2E Drive control.json is unavailable.')
  }

  return JSON.parse(content) as StorageControl
}

async function expectJoinedWorldFiles(paths: ElectronE2EPaths): Promise<void> {
  const worldPaths = await readSelectedWorldE2EPaths(paths)

  await expect(readFile(join(worldPaths.serverFolder, 'server.jar'), 'utf8')).resolves.toBe(
    'chunkshare-e2e-server'
  )
  await expect(readFile(join(worldPaths.serverFolder, 'world', 'level.dat'), 'utf8')).resolves.toBe(
    E2E_WORLD_DATA
  )
  await expect(readFile(join(worldPaths.serverFolder, 'eula.txt'), 'utf8')).resolves.toContain('eula=true')

  const localState: unknown = JSON.parse(await readFile(paths.localStateFile, 'utf8'))
  expect(localState).toMatchObject({
    worlds: [
      {
        localSaveVersion: 1,
        serverConfig: {
          minecraftVersion: '1.21.8',
          name: 'Shared Test World'
        },
        serverSetup: {
          status: 'ready'
        }
      }
    ]
  })
}
