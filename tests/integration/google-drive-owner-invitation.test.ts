import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CloudStorageProvider, GoogleDriveSetupStatus } from '../../src/shared/cloud-storage.model'
import { inviteGoogleDriveMember } from '../../src/main/cloud-storage/google-drive-sharing-service'
import {
  readCloudStorageSettings,
  writeCloudStorageSettings
} from '../../src/main/storage/persistence/cloud-storage-settings-store'
import {
  GOOGLE_TEST_ACCOUNTS,
  GOOGLE_TEST_IDS,
  googleDriveTestEnvironment
} from './support/google-drive-test-environment'

vi.mock('../../src/main/auth/auth-service', async () => {
  const { googleDriveTestEnvironment } = await import('./support/google-drive-test-environment')

  return {
    authorizeGoogleDriveFiles: (fileIds: string[]) =>
      googleDriveTestEnvironment.authorizeGoogleDriveFiles(fileIds),
    ensureGoogleDriveAuthSession: () => Promise.resolve(googleDriveTestEnvironment.getActiveSession())
  }
})

describe('Google Drive owner invitation', () => {
  beforeEach(async () => {
    googleDriveTestEnvironment.setActiveAccount('owner')
    await writeCloudStorageSettings({
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
    })
  })

  it('grants writer access and creates a link for the stable world files', async () => {
    const friendEmail = GOOGLE_TEST_ACCOUNTS.friend.session.player.email

    const result = await inviteGoogleDriveMember(friendEmail)

    expect(result.joinLink).toBe(
      `chunkshare://join?v=1&folderId=${GOOGLE_TEST_IDS.folder}` +
        `&controlFileId=${GOOGLE_TEST_IDS.controlFile}&worldFileId=${GOOGLE_TEST_IDS.worldFile}`
    )
    expect(result.sharingState.members).toEqual([
      {
        displayName: friendEmail,
        email: friendEmail,
        permissionId: 'friend-permission-1',
        role: 'writer'
      }
    ])
    expect(googleDriveTestEnvironment.writersCanShare).toBe(false)
    expect(googleDriveTestEnvironment.lastPermissionNotificationEnabled).toBe(false)

    const settings = await readCloudStorageSettings()
    expect(settings.googleDrive.folder?.worldFileIds).toEqual({
      controlFileId: GOOGLE_TEST_IDS.controlFile,
      worldFileId: GOOGLE_TEST_IDS.worldFile
    })
  })
})
