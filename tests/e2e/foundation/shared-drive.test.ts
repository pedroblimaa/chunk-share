import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test, type ElectronApplication } from '@playwright/test'
import {
  GOOGLE_TEST_ACCOUNTS,
  GOOGLE_TEST_IDS,
  type GoogleTestAccountName
} from '../../support/google-drive/google-drive-test-environment'
import { launchChunkShareE2EApp, type ChunkShareE2EApp } from '../support/electron-test-app'
import { GoogleDriveE2EMock } from '../support/google-drive-e2e-mock'

test('shares one Drive state between isolated Electron instances', async () => {
  const driveMock = new GoogleDriveE2EMock()
  let ownerApp: ChunkShareE2EApp | null = null
  let friendApp: ChunkShareE2EApp | null = null

  await driveMock.start()

  try {
    await grantFriendDriveAccess(driveMock)
    ownerApp = await launchChunkShareE2EApp({ accountName: 'owner', driveMock })
    friendApp = await launchChunkShareE2EApp({ accountName: 'friend', driveMock })

    expect(ownerApp.paths.root).not.toBe(friendApp.paths.root)
    await expect(ownerApp.page.getByRole('button', { name: 'Account menu for Owner Player' })).toBeVisible()
    await expect(friendApp.page.getByRole('button', { name: 'Account menu for Friend Player' })).toBeVisible()

    const updatedControl = JSON.stringify({ source: 'friend-instance' })
    await uploadDriveFile(friendApp.electronApp, 'friend', GOOGLE_TEST_IDS.controlFile, updatedControl)

    await expect(readDriveFile(ownerApp.electronApp, 'owner', GOOGLE_TEST_IDS.controlFile)).resolves.toBe(
      updatedControl
    )
  } finally {
    await friendApp?.close()
    await ownerApp?.close()
    await driveMock.close()
  }
})

test('applies a configured Drive failure only once', async () => {
  const driveMock = new GoogleDriveE2EMock()
  await driveMock.start()

  try {
    driveMock.failNextRequest({
      method: 'PATCH',
      pathname: `/upload/drive/v3/files/${GOOGLE_TEST_IDS.worldFile}`,
      status: 503
    })

    const requestUrl = `${driveMock.url}/upload/drive/v3/files/${GOOGLE_TEST_IDS.worldFile}`
    const firstResponse = await fetch(requestUrl, createUploadRequest('owner', 'first update'))
    const secondResponse = await fetch(requestUrl, createUploadRequest('owner', 'second update'))

    expect(firstResponse.status).toBe(503)
    expect(secondResponse.ok).toBe(true)
    expect(driveMock.drive.getFileContentByName('world.zip')).toEqual(
      new TextEncoder().encode('second update')
    )
  } finally {
    await driveMock.close()
  }
})

test('reuses persisted authentication when relaunching the same app data', async () => {
  const firstLaunch = await launchChunkShareE2EApp()
  const tokenFile = join(firstLaunch.paths.userDataFolder, 'google-auth-tokens.json')
  const storedTokens = await readFile(tokenFile, 'utf8')

  await firstLaunch.close({ preserveData: true })
  const secondLaunch = await launchChunkShareE2EApp({ paths: firstLaunch.paths })

  try {
    await expect(readFile(tokenFile, 'utf8')).resolves.toBe(storedTokens)
  } finally {
    await secondLaunch.close()
  }
})

async function grantFriendDriveAccess(driveMock: GoogleDriveE2EMock): Promise<void> {
  driveMock.drive.createWriterPermission('owner', GOOGLE_TEST_ACCOUNTS.friend.session.player.email, false)
  await driveMock.drive.authorizeGoogleDriveFilesForAccount('friend', [
    GOOGLE_TEST_IDS.controlFile,
    GOOGLE_TEST_IDS.worldFile
  ])
}

function uploadDriveFile(
  electronApp: ElectronApplication,
  accountName: GoogleTestAccountName,
  fileId: string,
  content: string
): Promise<void> {
  return electronApp.evaluate(
    async (_electronModule, fixture) => {
      const module = process.getBuiltinModule('node:module')
      const path = process.getBuiltinModule('node:path')
      const requireFromApp = module.createRequire(path.join(process.cwd(), 'package.json'))
      const { OAuth2Client } = requireFromApp('google-auth-library')
      const oauthClient = new OAuth2Client()
      oauthClient.setCredentials({ access_token: fixture.token })

      await oauthClient.fetch(
        `https://www.googleapis.com/upload/drive/v3/files/${fixture.fileId}?uploadType=media`,
        {
          body: fixture.content,
          headers: { 'Content-Type': 'application/json' },
          method: 'PATCH'
        }
      )
    },
    {
      content,
      fileId,
      token: GOOGLE_TEST_ACCOUNTS[accountName].token
    }
  )
}

function readDriveFile(
  electronApp: ElectronApplication,
  accountName: GoogleTestAccountName,
  fileId: string
): Promise<string> {
  return electronApp.evaluate(
    async (_electronModule, fixture) => {
      const module = process.getBuiltinModule('node:module')
      const path = process.getBuiltinModule('node:path')
      const requireFromApp = module.createRequire(path.join(process.cwd(), 'package.json'))
      const { OAuth2Client } = requireFromApp('google-auth-library')
      const oauthClient = new OAuth2Client()
      oauthClient.setCredentials({ access_token: fixture.token })
      const response = await oauthClient.fetch(
        `https://www.googleapis.com/drive/v3/files/${fixture.fileId}?alt=media`
      )

      return Buffer.from(response.data).toString('utf8')
    },
    {
      fileId,
      token: GOOGLE_TEST_ACCOUNTS[accountName].token
    }
  )
}

function createUploadRequest(accountName: GoogleTestAccountName, content: string): RequestInit {
  return {
    body: content,
    headers: {
      Authorization: `Bearer ${GOOGLE_TEST_ACCOUNTS[accountName].token}`,
      'Content-Type': 'application/octet-stream'
    },
    method: 'PATCH'
  }
}
