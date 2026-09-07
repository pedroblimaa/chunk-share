import { readFile, writeFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { CloudStorageProvider, GoogleDriveSetupStatus } from '../../../src/shared/cloud-storage.model'
import type { AppState } from '../../../src/shared/world'
import { GOOGLE_TEST_IDS } from '../../support/google-drive/google-drive-test-environment'
import {
  createElectronE2EPaths,
  E2E_SERVER_NAME,
  launchChunkShareE2EApp,
  type ChunkShareE2EApp
} from '../support/electron-test-app'
import { GoogleDriveE2EMock } from '../support/google-drive-e2e-mock'

test('shows Google Drive setup progress while creating a Drive world', async () => {
  const driveMock = new GoogleDriveE2EMock()
  const paths = createElectronE2EPaths()
  let app: ChunkShareE2EApp | null = null
  await driveMock.start()

  try {
    app = await launchChunkShareE2EApp({ accountName: 'owner', driveMock, paths })
    await app.close({ preserveData: true })
    app = null
    await activateGoogleDrive(paths.localStateFile)
    app = await launchChunkShareE2EApp({ accountName: 'owner', driveMock, paths })

    const { page, user } = app
    await user.click(page.getByRole('button', { name: 'Create Server', exact: true }).first())
    await user.fill(page.getByLabel('Server Name'), E2E_SERVER_NAME)
    await user.check(page.getByLabel('I have read and accept the Minecraft EULA.'))
    driveMock.delayRequest({ delayMs: 500, method: 'GET', pathname: '/drive/v3/files' })
    await user.click(page.getByRole('button', { name: 'Create Server', exact: true }))

    await expect(page.getByText('Setting up Google Drive', { exact: true }).locator('..')).toHaveClass(
      /setup-progress-step-active/
    )
    await expect(page.getByText('Server setup completed.')).toBeVisible()
  } finally {
    await app?.close()
    await driveMock.close()
  }
})

async function activateGoogleDrive(localStateFile: string): Promise<void> {
  const appState = JSON.parse(await readFile(localStateFile, 'utf8')) as AppState
  const nextState: AppState = {
    ...appState,
    activeProvider: CloudStorageProvider.GoogleDrive,
    googleDrive: {
      rootFolderId: GOOGLE_TEST_IDS.folder,
      errorMessage: null,
      status: GoogleDriveSetupStatus.Valid
    }
  }

  await writeFile(localStateFile, JSON.stringify(nextState, null, 2))
}
