import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { GOOGLE_DRIVE_SCOPE, GOOGLE_OAUTH_SCOPES } from '../../../src/main/auth/auth-constants'
import {
  DEFAULT_APP_STATE,
  createDefaultLocalWorldState
} from '../../../src/main/storage/core/support/storage-defaults'
import { CloudStorageProvider, GoogleDriveSetupStatus } from '../../../src/shared/cloud-storage.model'
import type { AppState } from '../../../src/shared/world'
import {
  GOOGLE_TEST_ACCOUNTS,
  GOOGLE_TEST_IDS
} from '../../support/google-drive/google-drive-test-environment'
import {
  createElectronE2EPaths,
  launchChunkShareE2EApp,
  type ElectronE2EPaths
} from '../support/electron-test-app'
import { GoogleDriveE2EMock } from '../support/google-drive-e2e-mock'

test('signs in with Google and restores the saved session', async () => {
  const app = await launchChunkShareE2EApp({ authenticated: false })

  try {
    const { page, user } = app
    const accountMenu = page.getByRole('button', { name: 'Account menu for E2E Player' })

    await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible()
    await user.click(page.getByRole('button', { name: 'Sign in with Google' }))

    await expect(page.getByText('No servers yet')).toBeVisible()
    await expect(accountMenu).toBeVisible()
    await expectSavedLogin(app.paths.localStateFile, app.paths.userDataFolder)

    await page.reload()

    await expect(page.getByText('No servers yet')).toBeVisible()
    await expect(accountMenu).toBeVisible()
  } finally {
    await app.close()
  }
})

test('requests Drive access in the same sign-in after an expired configured session', async () => {
  const driveMock = new GoogleDriveE2EMock()
  const paths = createElectronE2EPaths()
  await driveMock.start()

  try {
    const seedApp = await launchChunkShareE2EApp({
      accountName: 'owner',
      driveMock,
      paths
    })

    try {
      await expect(seedApp.page.getByRole('button', { name: 'Account menu for Owner Player' })).toBeVisible()
      await seedApp.setGoogleAuthTokens({
        accessToken: 'expired-owner-access-token',
        expiresAt: '2000-01-01T00:00:00.000Z',
        refreshToken: null,
        scope: [...GOOGLE_OAUTH_SCOPES, GOOGLE_DRIVE_SCOPE].join(' ')
      })
    } finally {
      await seedApp.close({ preserveData: true })
    }

    await saveExpiredConfiguredDriveSession(paths)
    const app = await launchChunkShareE2EApp({
      accountName: 'owner',
      authenticated: false,
      driveMock,
      paths
    })

    try {
      await expect(app.page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible()
      await app.user.click(app.page.getByRole('button', { name: 'Sign in with Google' }))
      await expect(app.page.getByRole('button', { name: 'Account menu for Owner Player' })).toBeVisible()
      await expect(app.page.getByText('Shared Test World')).toBeVisible()

      const authorizationUrls = await app.getGoogleAuthorizationUrls()
      expect(authorizationUrls).toHaveLength(1)
      expect(getRequestedScopes(authorizationUrls[0])).toEqual(
        expect.arrayContaining([...GOOGLE_OAUTH_SCOPES, GOOGLE_DRIVE_SCOPE])
      )
    } finally {
      await app.close()
    }
  } finally {
    await driveMock.close()
  }
})

test('cancels a pending Google sign-in without showing an error', async () => {
  const app = await launchChunkShareE2EApp({
    authenticated: false,
    completeGoogleAuthorization: false
  })

  try {
    const signInButton = app.page.getByRole('button', { name: 'Sign in with Google' })
    await app.user.click(signInButton)

    await expect(app.page.getByRole('button', { name: 'Signing in...' })).toBeVisible()
    await app.user.click(app.page.getByRole('button', { name: 'Cancel', exact: true }))

    await expect(signInButton).toBeVisible()
    await expect(signInButton).toBeEnabled()
    await expect(app.page.locator('.login-error')).toHaveCount(0)
  } finally {
    await app.close()
  }
})

function getRequestedScopes(authorizationUrl: string | undefined): string[] {
  if (!authorizationUrl) {
    return []
  }

  return new URL(authorizationUrl).searchParams.get('scope')?.split(' ').filter(Boolean) ?? []
}

async function saveExpiredConfiguredDriveSession(paths: ElectronE2EPaths): Promise<void> {
  const now = '2026-07-25T12:00:00.000Z'
  const defaultWorld = createDefaultLocalWorldState(GOOGLE_TEST_IDS.world, now)
  const world = {
    ...defaultWorld,
    googleDrive: {
      configuredAt: now,
      folderId: GOOGLE_TEST_IDS.folder,
      ownerAccountId: GOOGLE_TEST_ACCOUNTS.owner.session.player.id,
      validatedAt: now,
      worldFileIds: {
        controlFileId: GOOGLE_TEST_IDS.controlFile,
        worldFileId: GOOGLE_TEST_IDS.worldFile
      }
    },
    serverConfig: {
      ...defaultWorld.serverConfig,
      name: 'Shared Test World',
      minecraftVersion: '1.21.8'
    }
  }
  const appState: AppState = {
    ...DEFAULT_APP_STATE,
    activeProvider: CloudStorageProvider.GoogleDrive,
    googleDrive: {
      errorMessage: null,
      status: GoogleDriveSetupStatus.Valid
    },
    player: GOOGLE_TEST_ACCOUNTS.owner.session.player,
    selectedWorldId: world.id,
    worlds: [world]
  }

  await mkdir(paths.root, { recursive: true })
  await writeFile(paths.localStateFile, JSON.stringify(appState, null, 2))
}

async function expectSavedLogin(localStateFile: string, userDataFolder: string): Promise<void> {
  const localState: unknown = JSON.parse(await readFile(localStateFile, 'utf8'))
  const storedTokens = await readFile(join(userDataFolder, 'google-auth-tokens.json'), 'utf8')

  expect(localState).toMatchObject({
    player: {
      displayName: 'E2E Player',
      email: 'e2e@example.com',
      id: 'e2e-player'
    }
  })
  expect(JSON.parse(storedTokens)).toMatchObject({
    encryptedTokens: expect.any(String)
  })
  expect(storedTokens).not.toContain('e2e-access-token')
}
