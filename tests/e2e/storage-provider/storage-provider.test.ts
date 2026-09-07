import { readFile, rename, rm, writeFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { CloudStorageProvider, GoogleDriveSetupStatus } from '../../../src/shared/cloud-storage.model'
import type { AppState } from '../../../src/shared/world'
import {
  GOOGLE_TEST_ACCOUNTS,
  GOOGLE_TEST_IDS
} from '../../support/google-drive/google-drive-test-environment'
import {
  createElectronE2EPaths,
  launchChunkShareE2EApp,
  type ChunkShareE2EApp
} from '../support/electron-test-app'
import { GoogleDriveE2EMock } from '../support/google-drive-e2e-mock'
import {
  createLocalWorld,
  navigateToServers,
  openServerDashboard,
  publishLocalWorld,
  startServer,
  stopServer
} from '../support/local-world-e2e'

test('copies a local world to Google Drive through Settings', async () => {
  const driveMock = new GoogleDriveE2EMock()
  const paths = createElectronE2EPaths()
  await driveMock.start()

  try {
    driveMock.drive.deleteFile('owner', GOOGLE_TEST_IDS.controlFile)
    driveMock.drive.deleteFile('owner', GOOGLE_TEST_IDS.worldFile)
    let app: ChunkShareE2EApp | null = await launchChunkShareE2EApp({
      accountName: 'owner',
      driveMock,
      paths
    })

    try {
      await createLocalWorld(app)
      await publishLocalWorld(app)
      await app.close({ preserveData: true })
      app = null
      await saveLocalStorageWithDriveTarget(paths.localStateFile)
      app = await launchChunkShareE2EApp({
        accountName: 'owner',
        driveMock,
        paths
      })

      const relaunchedApp = app
      await relaunchedApp.user.click(
        relaunchedApp.page.getByRole('button', { name: 'Settings', exact: true }).first()
      )
      await relaunchedApp.user.click(relaunchedApp.page.getByRole('button', { name: /Google Drive/ }))
      await relaunchedApp.user.click(
        relaunchedApp.page.getByRole('button', { name: 'Activate Google Drive' })
      )

      await expect(relaunchedApp.page.getByRole('heading', { name: 'Switch Storage Mode' })).toBeVisible()
      await relaunchedApp.user.click(
        relaunchedApp.page.getByRole('button', {
          name: 'Copy save and activate Google Drive (Recommended)'
        })
      )

      await expect(
        relaunchedApp.page.locator('.settings-storage-panel.is-active').filter({ hasText: 'Google Drive' })
      ).toBeVisible()
      expect(driveMock.drive.getFileContentByName('control.json')).not.toBeNull()
      expect(driveMock.drive.getFileContentByName('world.zip')).not.toBeNull()

      await navigateToServers(relaunchedApp)
      await openServerDashboard(relaunchedApp)

      const downloadUpdate = relaunchedApp.page
        .getByRole('button', { name: 'Download Update' })
        .filter({ hasText: 'Download Update' })
      const startServerButton = relaunchedApp.page.getByRole('button', { name: 'Start Server', exact: true })
      await expect(downloadUpdate.or(startServerButton)).toBeVisible()

      if (await downloadUpdate.isVisible()) {
        await relaunchedApp.user.click(downloadUpdate)
        await expect(startServerButton).toBeVisible()
      }

      await startServer(relaunchedApp)
      await stopServer(relaunchedApp, 2)
    } finally {
      await app?.close()
    }
  } finally {
    try {
      await driveMock.close()
    } finally {
      await rm(paths.root, { force: true, recursive: true })
    }
  }
})

test('cancels Google Drive setup while sign-in is pending', async () => {
  const app = await launchChunkShareE2EApp({ completeGoogleAuthorization: false })

  try {
    await app.user.click(app.page.getByRole('button', { name: 'Settings', exact: true }).first())
    await app.user.click(app.page.getByRole('button', { name: /Google Drive/ }))
    await app.user.click(app.page.getByRole('button', { name: 'Set up Drive folder' }))

    await expect(app.page.getByRole('button', { name: 'Working...' })).toBeVisible()
    await app.user.click(app.page.getByRole('button', { name: 'Cancel', exact: true }))

    await expect(app.page.getByRole('button', { name: 'Set up Drive folder' })).toBeEnabled()
    await expect(app.page.locator('.settings-drive-error')).toHaveCount(0)
  } finally {
    await app.close()
  }
})

async function saveLocalStorageWithDriveTarget(localStateFile: string): Promise<void> {
  const now = '2026-07-25T12:00:00.000Z'
  const appState = JSON.parse(await readFile(localStateFile, 'utf8')) as AppState
  const selectedWorldId = appState.selectedWorldId

  if (!selectedWorldId) {
    throw new Error('Expected the E2E world to be selected.')
  }

  const nextState: AppState = {
    ...appState,
    activeProvider: CloudStorageProvider.Local,
    googleDrive: {
      rootFolderId: GOOGLE_TEST_IDS.folder,
      errorMessage: null,
      status: GoogleDriveSetupStatus.Valid
    },
    worlds: appState.worlds.map((world) =>
      world.id === selectedWorldId
        ? {
            ...world,
            googleDrive: {
              configuredAt: now,
              folderId: GOOGLE_TEST_IDS.folder,
              ownerAccountId: GOOGLE_TEST_ACCOUNTS.owner.session.player.id,
              validatedAt: now,
              worldFileIds: null
            }
          }
        : world
    )
  }

  const temporaryFile = `${localStateFile}.tmp`
  await writeFile(temporaryFile, JSON.stringify(nextState, null, 2))
  await rename(temporaryFile, localStateFile)
}
