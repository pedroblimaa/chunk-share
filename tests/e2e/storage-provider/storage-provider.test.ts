import { readFile, writeFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { CloudStorageProvider, GoogleDriveSetupStatus } from '../../../src/shared/cloud-storage.model'
import type { AppState } from '../../../src/shared/world'
import {
  GOOGLE_TEST_ACCOUNTS,
  GOOGLE_TEST_IDS
} from '../../support/google-drive/google-drive-test-environment'
import { createElectronE2EPaths, launchChunkShareE2EApp } from '../support/electron-test-app'
import { GoogleDriveE2EMock } from '../support/google-drive-e2e-mock'
import {
  createLocalWorld,
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
    const app = await launchChunkShareE2EApp({
      accountName: 'owner',
      driveMock,
      paths
    })

    try {
      await createLocalWorld(app)
      await saveLocalStorageWithDriveTarget(paths.localStateFile)
      await publishLocalWorld(app)
      await app.user.click(app.page.getByRole('button', { name: 'Settings', exact: true }).first())
      await app.user.click(app.page.getByRole('button', { name: /Google Drive/ }))
      await app.user.click(app.page.getByRole('button', { name: 'Activate Google Drive' }))

      await expect(app.page.getByRole('heading', { name: 'Switch Storage Mode' })).toBeVisible()
      await app.user.click(
        app.page.getByRole('button', {
          name: 'Copy save and activate Google Drive (Recommended)'
        })
      )

      await expect(
        app.page.locator('.settings-storage-panel.is-active').filter({ hasText: 'Google Drive' })
      ).toBeVisible()
      expect(driveMock.drive.getFileContentByName('control.json')).not.toBeNull()
      expect(driveMock.drive.getFileContentByName('world.zip')).not.toBeNull()

      await app.user.click(app.page.getByRole('button', { name: 'Servers', exact: true }))
      await openServerDashboard(app)

      const downloadUpdate = app.page
        .getByRole('button', { name: 'Download Update' })
        .filter({ hasText: 'Download Update' })
      const startServerButton = app.page.getByRole('button', { name: 'Start Server', exact: true })
      await expect(downloadUpdate.or(startServerButton)).toBeVisible()

      if (await downloadUpdate.isVisible()) {
        await app.user.click(downloadUpdate)
        await expect(startServerButton).toBeVisible()
      }

      await startServer(app)
      await stopServer(app, 2)
    } finally {
      await app.close()
    }
  } finally {
    await driveMock.close()
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

  await writeFile(localStateFile, JSON.stringify(nextState, null, 2))
}
