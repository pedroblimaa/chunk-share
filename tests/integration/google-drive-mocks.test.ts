import { describe, expect, it } from 'vitest'
import { GOOGLE_DRIVE_API_BASE_URL } from '../../src/main/cloud-storage/google-drive.model'
import {
  GOOGLE_TEST_ACCOUNTS,
  GOOGLE_TEST_IDS,
  googleDriveTestEnvironment
} from './support/google-drive-test-environment'

interface PermissionResponse {
  id: string
}

describe('Google Drive mocks', () => {
  it('models Picker authorization and revoked folder access', async () => {
    const ownerFilesResponse = await googleFetch('owner', `${GOOGLE_DRIVE_API_BASE_URL}/files`)
    const ownerFiles = (await ownerFilesResponse.json()) as { files: Array<{ id: string }> }

    expect(ownerFiles.files.map((file) => file.id)).toEqual([
      GOOGLE_TEST_IDS.controlFile,
      GOOGLE_TEST_IDS.worldFile
    ])

    const controlFileUrl = `${GOOGLE_DRIVE_API_BASE_URL}/files/${GOOGLE_TEST_IDS.controlFile}`
    expect((await googleFetch('friend', controlFileUrl)).status).toBe(404)

    const createPermissionResponse = await googleFetch(
      'owner',
      `${GOOGLE_DRIVE_API_BASE_URL}/files/${GOOGLE_TEST_IDS.folder}/permissions?sendNotificationEmail=false`,
      {
        body: JSON.stringify({
          emailAddress: GOOGLE_TEST_ACCOUNTS.friend.session.player.email,
          role: 'writer',
          type: 'user'
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST'
      }
    )
    const permission = (await createPermissionResponse.json()) as PermissionResponse

    expect(createPermissionResponse.status).toBe(200)
    expect(googleDriveTestEnvironment.lastPermissionNotificationEnabled).toBe(false)

    googleDriveTestEnvironment.setActiveAccount('friend')
    await googleDriveTestEnvironment.authorizeGoogleDriveFiles([
      GOOGLE_TEST_IDS.controlFile,
      GOOGLE_TEST_IDS.worldFile
    ])

    const authorizedFileResponse = await googleFetch('friend', controlFileUrl)
    const authorizedFile = (await authorizedFileResponse.json()) as {
      capabilities: { canEdit: boolean }
    }

    expect(authorizedFileResponse.status).toBe(200)
    expect(authorizedFile.capabilities.canEdit).toBe(true)

    const deletePermissionResponse = await googleFetch(
      'owner',
      `${GOOGLE_DRIVE_API_BASE_URL}/files/${GOOGLE_TEST_IDS.folder}/permissions/${permission.id}`,
      { method: 'DELETE' }
    )

    expect(deletePermissionResponse.status).toBe(204)
    expect((await googleFetch('friend', controlFileUrl)).status).toBe(404)
  })
})

function googleFetch(
  accountName: keyof typeof GOOGLE_TEST_ACCOUNTS,
  url: string,
  init: RequestInit = {}
): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${GOOGLE_TEST_ACCOUNTS[accountName].token}`,
      ...init.headers
    }
  })
}
