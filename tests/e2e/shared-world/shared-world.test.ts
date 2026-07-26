import { ZipArchive } from 'archiver'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { expect, test } from '@playwright/test'
import {
  CloudStorageProvider,
  GoogleDriveSetupStatus,
  type CloudStorageSettings
} from '../../../src/shared/cloud-storage.model'
import {
  GOOGLE_TEST_ACCOUNTS,
  GOOGLE_TEST_IDS
} from '../../support/google-drive/google-drive-test-environment'
import {
  E2E_WORLD_DATA,
  createElectronE2EPaths,
  launchChunkShareE2EApp,
  type ChunkShareE2EApp,
  type ElectronE2EPaths
} from '../support/electron-test-app'
import { GoogleDriveE2EMock } from '../support/google-drive-e2e-mock'

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

async function inviteFriend(ownerApp: ChunkShareE2EApp): Promise<string> {
  const { page, user } = ownerApp

  await user.click(page.getByRole('button', { name: 'Download', exact: true }))
  await expect(page.getByRole('heading', { name: 'Shared Test World' })).toBeVisible()
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

  return joinLink
}

async function joinAndDownloadSharedWorld(friendApp: ChunkShareE2EApp, joinLink: string): Promise<void> {
  const { page, user } = friendApp

  await user.click(page.getByRole('button', { name: 'Join Shared World' }))
  await user.fill(page.getByLabel('Join link'), joinLink)
  await user.click(page.getByRole('button', { name: 'Join World' }))

  await expect(page.getByRole('heading', { name: 'Shared Test World' })).toBeVisible()
  await expectJoinedDriveSettings(friendApp.paths)

  await user.click(page.getByRole('button', { name: 'Download', exact: true }))
  await user.check(page.getByLabel('I agree to the Minecraft EULA'))
  await user.click(page.getByRole('button', { name: 'Download shared server' }))
  await expect(page.getByRole('button', { name: 'Start Server', exact: true })).toBeVisible()
}

async function saveOwnerDriveSettings(paths: ElectronE2EPaths): Promise<void> {
  const settings: CloudStorageSettings = {
    activeProvider: CloudStorageProvider.GoogleDrive,
    googleDrive: {
      errorMessage: null,
      folder: {
        configuredAt: '2026-07-25T12:00:00.000Z',
        folderId: GOOGLE_TEST_IDS.folder,
        folderName: 'Shared Test World',
        ownerAccountId: GOOGLE_TEST_ACCOUNTS.owner.session.player.id,
        validatedAt: '2026-07-25T12:00:00.000Z',
        worldFileIds: null
      },
      status: GoogleDriveSetupStatus.Valid
    }
  }

  await mkdir(paths.root, { recursive: true })
  await writeFile(join(paths.root, 'cloudStorageSettings.json'), JSON.stringify(settings, null, 2))
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
  const settings: unknown = JSON.parse(await readFile(join(paths.root, 'cloudStorageSettings.json'), 'utf8'))

  expect(settings).toMatchObject({
    activeProvider: CloudStorageProvider.GoogleDrive,
    googleDrive: {
      folder: {
        folderId: GOOGLE_TEST_IDS.folder,
        ownerAccountId: null,
        worldFileIds: {
          controlFileId: GOOGLE_TEST_IDS.controlFile,
          worldFileId: GOOGLE_TEST_IDS.worldFile
        }
      },
      status: GoogleDriveSetupStatus.Valid
    }
  })
}

async function expectJoinedWorldFiles(paths: ElectronE2EPaths): Promise<void> {
  await expect(readFile(join(paths.serverFolder, 'server.jar'), 'utf8')).resolves.toBe(
    'chunkshare-e2e-server'
  )
  await expect(readFile(join(paths.serverFolder, 'world', 'level.dat'), 'utf8')).resolves.toBe(E2E_WORLD_DATA)
  await expect(readFile(join(paths.serverFolder, 'eula.txt'), 'utf8')).resolves.toContain('eula=true')

  const localState: unknown = JSON.parse(await readFile(paths.localStateFile, 'utf8'))
  expect(localState).toMatchObject({
    localSaveVersion: 1,
    serverConfig: {
      minecraftVersion: '1.21.8',
      name: 'Shared Test World'
    },
    serverSetup: {
      status: 'ready'
    }
  })
}
