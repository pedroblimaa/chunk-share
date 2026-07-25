import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ServerAvailability } from '../../../src/shared/dashboard'
import { CloudStorageProvider, GoogleDriveSetupStatus } from '../../../src/shared/cloud-storage.model'
import { joinGoogleDriveWorld } from '../../../src/main/cloud-storage/google-drive-join-service'
import { inviteGoogleDriveMember } from '../../../src/main/cloud-storage/google-drive-sharing-service'
import { readCloudStorageSettings } from '../../../src/main/storage/persistence/cloud-storage-settings-store'
import { saveFreshLocalAccount, saveOwnerGoogleDriveWorld } from './share-join-test-data'
import {
  GOOGLE_TEST_ACCOUNTS,
  GOOGLE_TEST_IDS,
  googleDriveTestEnvironment
} from '../support/google-drive/google-drive-test-environment'

vi.mock(
  '../../../src/main/auth/auth-service',
  () => import('../support/google-drive/google-auth-service-mock')
)

describe('Google Drive sharing and joining', () => {
  beforeEach(saveOwnerGoogleDriveWorld)

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

  it('activates the world from the link generated for an invited friend', async () => {
    const invitation = await inviteGoogleDriveMember(GOOGLE_TEST_ACCOUNTS.friend.session.player.email)
    await saveFreshLocalAccount('friend')

    const serverDisplayState = await joinGoogleDriveWorld(invitation.joinLink)

    expect(googleDriveTestEnvironment.getLastPickerFileIds()).toEqual([
      GOOGLE_TEST_IDS.controlFile,
      GOOGLE_TEST_IDS.worldFile
    ])

    const settings = await readCloudStorageSettings()
    expect(settings).toMatchObject({
      activeProvider: CloudStorageProvider.GoogleDrive,
      googleDrive: {
        errorMessage: null,
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
    expect(serverDisplayState).toMatchObject({
      minecraftVersion: '1.21.8',
      serverAvailability: ServerAvailability.RemoteAvailable,
      serverName: 'Shared Test World',
      serverType: 'Vanilla',
      signedInUser: {
        email: GOOGLE_TEST_ACCOUNTS.friend.session.player.email,
        id: GOOGLE_TEST_ACCOUNTS.friend.session.player.id
      }
    })
  })
})
