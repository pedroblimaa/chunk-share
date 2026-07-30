import { readFile } from 'fs/promises'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CloudStorageProvider,
  StorageProviderCopyPhase,
  StorageSwitchDataMode
} from '../../../src/shared/cloud-storage.model'
import { ServerLockStatus } from '../../../src/shared/domain'
import {
  getCloudStorageProviderSwitchPreview,
  setCloudStorageProvider
} from '../../../src/main/storage/core/cloud-storage-service'
import { createLocalStorageAdapter } from '../../../src/main/storage/adapters/local-storage-adapter'
import type { StorageAdapter } from '../../../src/main/storage/adapters/storage-adapter.model'
import { getSelectedWorldContext } from '../../../src/main/storage/core/world-context'
import { publishServerSave } from '../../../src/main/storage/server-save/server-save-publisher'
import {
  readCloudStorageSettings,
  writeCloudStorageSettings
} from '../../../src/main/storage/persistence/local-state-store'
import { saveOwnerGoogleDriveWorld } from '../share-join/share-join-test-data'
import {
  GOOGLE_TEST_IDS,
  googleDriveTestEnvironment
} from '../../support/google-drive/google-drive-test-environment'
import { createLocalTestWorld } from '../support/world-test-data'

vi.mock(
  '../../../src/main/auth/auth-service',
  () => import('../support/google-drive/google-auth-service-mock')
)

describe('storage provider switching', () => {
  beforeEach(async () => {
    await saveOwnerGoogleDriveWorld()
    const settings = await readCloudStorageSettings()

    await writeCloudStorageSettings({
      ...settings,
      googleDrive: {
        ...settings.googleDrive,
        folder: settings.googleDrive.folder
          ? {
              ...settings.googleDrive.folder,
              worldFileIds: {
                controlFileId: GOOGLE_TEST_IDS.controlFile,
                worldFileId: GOOGLE_TEST_IDS.worldFile
              }
            }
          : null
      }
    })
  })

  it('copies the current Google Drive world to local storage and activates it', async () => {
    const preview = await getCloudStorageProviderSwitchPreview(CloudStorageProvider.Local)
    const progress = vi.fn()

    const settings = await setCloudStorageProvider(
      {
        dataMode: StorageSwitchDataMode.CopyCurrentToTarget,
        expectedPreview: preview,
        provider: CloudStorageProvider.Local
      },
      progress
    )

    expect(settings.activeProvider).toBe(CloudStorageProvider.Local)
    expect(await readFile((await getSelectedWorldContext()).paths.storageWorldFile, 'utf8')).toBe(
      'test-world-zip'
    )
    await expect((await getLocalStorageAdapter()).readLatestSave()).resolves.toMatchObject({
      saveVersion: 1,
      serverName: 'Shared Test World'
    })
    expect(progress).toHaveBeenCalledWith({
      completedFiles: 1,
      phase: StorageProviderCopyPhase.Copying,
      totalFiles: 1
    })
    expect(progress).toHaveBeenLastCalledWith({
      completedFiles: 0,
      phase: StorageProviderCopyPhase.Finalizing,
      totalFiles: 0
    })
  })

  it('copies the current local world to Google Drive and activates it', async () => {
    await configureLocalSourceWithDriveTarget()
    await createLocalTestWorld()
    await publishServerSave()
    const localWorld = await readFile((await getSelectedWorldContext()).paths.storageWorldFile)
    const localLatestSave = await (await getLocalStorageAdapter()).readLatestSave()
    const preview = await getCloudStorageProviderSwitchPreview(CloudStorageProvider.GoogleDrive)

    const settings = await setCloudStorageProvider({
      dataMode: StorageSwitchDataMode.CopyCurrentToTarget,
      expectedPreview: preview,
      provider: CloudStorageProvider.GoogleDrive
    })

    expect(settings.activeProvider).toBe(CloudStorageProvider.GoogleDrive)
    expect(Buffer.from(requireDriveFileContent('world.zip'))).toEqual(localWorld)
    expect(JSON.parse(decodeDriveFileContent(requireDriveFileContent('control.json')))).toMatchObject({
      latestSave: localLatestSave,
      serverLock: { status: ServerLockStatus.Unlocked },
      storageMutation: null
    })
  })
})

async function configureLocalSourceWithDriveTarget(): Promise<void> {
  const settings = await readCloudStorageSettings()

  await writeCloudStorageSettings({
    ...settings,
    activeProvider: CloudStorageProvider.Local,
    googleDrive: {
      ...settings.googleDrive,
      folder: settings.googleDrive.folder
        ? {
            ...settings.googleDrive.folder,
            worldFileIds: null
          }
        : null
    }
  })
}

function requireDriveFileContent(fileName: string): string | Uint8Array {
  const content = googleDriveTestEnvironment.getFileContentByName(fileName)

  if (content === null) {
    throw new Error(`Expected Google Drive file ${fileName} to exist.`)
  }

  return content
}

function decodeDriveFileContent(content: string | Uint8Array): string {
  return typeof content === 'string' ? content : Buffer.from(content).toString('utf8')
}

async function getLocalStorageAdapter(): Promise<StorageAdapter> {
  return createLocalStorageAdapter(await getSelectedWorldContext())
}
