import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ServerAvailability } from '../../../src/shared/dashboard'
import { CloudStorageProvider, GoogleDriveSetupStatus } from '../../../src/shared/cloud-storage.model'
import { joinGoogleDriveWorld } from '../../../src/main/cloud-storage/google-drive-join-service'
import {
  inviteGoogleDriveMember,
  revokeGoogleDriveMember
} from '../../../src/main/cloud-storage/google-drive-sharing-service'
import { readCloudStorageSettings } from '../../../src/main/storage/persistence/cloud-storage-settings-store'
import { readLocalState } from '../../../src/main/storage/persistence/local-state-store'
import {
  saveConfiguredLocalAccount,
  saveFreshLocalAccount,
  saveOwnerGoogleDriveWorld
} from './share-join-test-data'
import {
  GOOGLE_TEST_ACCOUNTS,
  GOOGLE_TEST_IDS,
  googleDriveTestEnvironment
} from '../../support/google-drive/google-drive-test-environment'

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

  it('keeps a configured local world when joining is attempted', async () => {
    const invitation = await inviteGoogleDriveMember(GOOGLE_TEST_ACCOUNTS.friend.session.player.email)
    await saveConfiguredLocalAccount('friend')

    await expect(joinGoogleDriveWorld(invitation.joinLink)).rejects.toThrow(
      'Finish or remove the current server setup before joining another world.'
    )

    const [settings, localState] = await Promise.all([readCloudStorageSettings(), readLocalState()])
    expect(settings.activeProvider).toBe(CloudStorageProvider.Local)
    expect(localState.serverSetup.status).toBe('ready')
    expect(googleDriveTestEnvironment.getLastPickerFileIds()).toBeNull()
  })

  it.each(['not-a-join-link', `chunkshare://join?v=1&folderId=${GOOGLE_TEST_IDS.folder}`])(
    'rejects the invalid join link %s',
    async (joinLink) => {
      await expect(joinGoogleDriveWorld(joinLink)).rejects.toThrow()

      expect(googleDriveTestEnvironment.getLastPickerFileIds()).toBeNull()
    }
  )

  it('rejects the join link for an uninvited account', async () => {
    const invitation = await inviteGoogleDriveMember(GOOGLE_TEST_ACCOUNTS.friend.session.player.email)
    await saveFreshLocalAccount('uninvited')

    await expect(joinGoogleDriveWorld(invitation.joinLink)).rejects.toThrow(
      'Make sure you use an invited account.'
    )

    const settings = await readCloudStorageSettings()
    expect(settings).toEqual({
      activeProvider: CloudStorageProvider.Local,
      googleDrive: {
        errorMessage: null,
        folder: null,
        status: GoogleDriveSetupStatus.NotConfigured
      }
    })
  })

  it('prevents a revoked member from joining again with the same link', async () => {
    const invitation = await inviteGoogleDriveMember(GOOGLE_TEST_ACCOUNTS.friend.session.player.email)
    const permissionId = invitation.sharingState.members[0].permissionId

    await saveFreshLocalAccount('friend')
    await joinGoogleDriveWorld(invitation.joinLink)

    await saveOwnerGoogleDriveWorld()
    const revokeResult = await revokeGoogleDriveMember(permissionId)

    expect(revokeResult).toMatchObject({
      revokedMemberWasHosting: false,
      sharingState: { members: [] }
    })

    await saveFreshLocalAccount('friend')
    await expect(joinGoogleDriveWorld(invitation.joinLink)).rejects.toThrow(
      'Make sure you use an invited account.'
    )
  })
})
