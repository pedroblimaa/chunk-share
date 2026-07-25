import { CloudStorageProvider, GoogleDriveSetupStatus } from '../../../src/shared/cloud-storage.model'
import {
  DEFAULT_CLOUD_STORAGE_SETTINGS,
  DEFAULT_LOCAL_STATE
} from '../../../src/main/storage/core/support/storage-defaults'
import { writeCloudStorageSettings } from '../../../src/main/storage/persistence/cloud-storage-settings-store'
import { writeLocalState } from '../../../src/main/storage/persistence/local-state-store'
import {
  GOOGLE_TEST_ACCOUNTS,
  GOOGLE_TEST_IDS,
  googleDriveTestEnvironment,
  type GoogleTestAccountName
} from '../support/google-drive/google-drive-test-environment'

export async function saveOwnerGoogleDriveWorld(): Promise<void> {
  googleDriveTestEnvironment.setActiveAccount('owner')
  await Promise.all([
    writeLocalState({
      ...DEFAULT_LOCAL_STATE,
      player: GOOGLE_TEST_ACCOUNTS.owner.session.player
    }),
    writeCloudStorageSettings({
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
  ])
}

export async function saveFreshLocalAccount(accountName: GoogleTestAccountName): Promise<void> {
  googleDriveTestEnvironment.setActiveAccount(accountName)
  await Promise.all([
    writeLocalState({
      ...DEFAULT_LOCAL_STATE,
      player: GOOGLE_TEST_ACCOUNTS[accountName].session.player
    }),
    writeCloudStorageSettings(DEFAULT_CLOUD_STORAGE_SETTINGS)
  ])
}

export async function saveConfiguredLocalAccount(accountName: GoogleTestAccountName): Promise<void> {
  googleDriveTestEnvironment.setActiveAccount(accountName)
  await Promise.all([
    writeLocalState({
      ...DEFAULT_LOCAL_STATE,
      player: GOOGLE_TEST_ACCOUNTS[accountName].session.player,
      serverSetup: {
        completedAt: '2026-07-25T12:00:00.000Z',
        errorMessage: null,
        status: 'ready'
      }
    }),
    writeCloudStorageSettings(DEFAULT_CLOUD_STORAGE_SETTINGS)
  ])
}
