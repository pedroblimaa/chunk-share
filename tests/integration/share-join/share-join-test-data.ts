import { CloudStorageProvider, GoogleDriveSetupStatus } from '../../../src/shared/cloud-storage.model'
import {
  DEFAULT_APP_STATE,
  DEFAULT_CLOUD_STORAGE_SETTINGS,
  DEFAULT_LOCAL_STATE,
  createDefaultLocalWorldState
} from '../../../src/main/storage/core/support/storage-defaults'
import {
  writeAppState,
  writeCloudStorageSettings,
  writeLocalState
} from '../../../src/main/storage/persistence/local-state-store'
import {
  GOOGLE_TEST_ACCOUNTS,
  GOOGLE_TEST_IDS,
  googleDriveTestEnvironment,
  type GoogleTestAccountName
} from '../../support/google-drive/google-drive-test-environment'

export async function saveOwnerGoogleDriveWorld(): Promise<void> {
  googleDriveTestEnvironment.setActiveAccount('owner')
  const now = '2026-07-25T12:00:00.000Z'
  const world = {
    ...createDefaultLocalWorldState(GOOGLE_TEST_IDS.world, now),
    googleDrive: {
      configuredAt: now,
      folderId: GOOGLE_TEST_IDS.folder,
      ownerAccountId: GOOGLE_TEST_ACCOUNTS.owner.session.player.id,
      validatedAt: now,
      worldFileIds: null
    }
  }

  await writeAppState({
    ...DEFAULT_APP_STATE,
    player: GOOGLE_TEST_ACCOUNTS.owner.session.player,
    selectedWorldId: world.id,
    activeProvider: CloudStorageProvider.GoogleDrive,
    googleDrive: {
      errorMessage: null,
      status: GoogleDriveSetupStatus.Valid
    },
    worlds: [world]
  })
}

export async function saveFreshLocalAccount(accountName: GoogleTestAccountName): Promise<void> {
  googleDriveTestEnvironment.setActiveAccount(accountName)
  await writeAppState({
    ...DEFAULT_APP_STATE,
    player: GOOGLE_TEST_ACCOUNTS[accountName].session.player
  })
}

export async function saveConfiguredLocalAccount(accountName: GoogleTestAccountName): Promise<void> {
  googleDriveTestEnvironment.setActiveAccount(accountName)
  await writeLocalState({
    ...DEFAULT_LOCAL_STATE,
    player: GOOGLE_TEST_ACCOUNTS[accountName].session.player,
    serverSetup: {
      completedAt: '2026-07-25T12:00:00.000Z',
      errorMessage: null,
      status: 'ready'
    }
  })
  await writeCloudStorageSettings(DEFAULT_CLOUD_STORAGE_SETTINGS)
}
