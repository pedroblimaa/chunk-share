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
  setCloudStorageProvider,
  setupGoogleDriveFolder
} from '../../../src/main/storage/core/cloud-storage-service'
import { createLocalStorageAdapter } from '../../../src/main/storage/adapters/local-storage-adapter'
import { createGoogleDriveStorageAdapter } from '../../../src/main/storage/adapters/google-drive-storage-adapter'
import { createGoogleDriveWorldFolder } from '../../../src/main/cloud-storage/google-drive-service'
import type { StorageAdapter } from '../../../src/main/storage/adapters/storage-adapter.model'
import { getSelectedWorldContext } from '../../../src/main/storage/core/world-context'
import { publishServerSave } from '../../../src/main/storage/server-save/server-save-publisher'
import {
  readAppState,
  readCloudStorageSettings,
  writeAppState,
  writeCloudStorageSettings
} from '../../../src/main/storage/persistence/local-state-store'
import { saveFreshLocalAccount, saveOwnerGoogleDriveWorld } from '../share-join/share-join-test-data'
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

  it('creates one root folder without assigning it to a world', async () => {
    await saveFreshLocalAccount('owner')

    const settings = await setupGoogleDriveFolder()

    expect(settings.googleDrive.rootFolderId).toMatch(/^created-drive-file-/)
    expect(settings.googleDrive.folder).toBeNull()
    const rootFolders = googleDriveTestEnvironment
      .listWorldFiles('owner', 'root')
      ?.filter((file) => file.mimeType === 'application/vnd.google-apps.folder')
    expect(rootFolders).toEqual([expect.objectContaining({ name: 'ChunkShare' })])
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

  it('creates a Drive folder when copying a local-only world to Google Drive', async () => {
    const appState = await readAppState()
    await writeAppState({ ...appState, activeProvider: CloudStorageProvider.Local })
    await createLocalTestWorld('00000000-0000-4000-8000-000000000055')
    await publishServerSave()
    const preview = await getCloudStorageProviderSwitchPreview(CloudStorageProvider.GoogleDrive)

    await setCloudStorageProvider({
      dataMode: StorageSwitchDataMode.CopyCurrentToTarget,
      expectedPreview: preview,
      provider: CloudStorageProvider.GoogleDrive
    })

    const context = await getSelectedWorldContext()
    expect(context.world.googleDrive).not.toBeNull()
    const rootFolderId = (await readCloudStorageSettings()).googleDrive.rootFolderId
    expect(rootFolderId).toBe(GOOGLE_TEST_IDS.folder)
    if (!rootFolderId) {
      throw new Error('Expected the Google Drive root folder to be configured.')
    }
    const childFolders = googleDriveTestEnvironment
      .listWorldFiles('owner', rootFolderId)
      ?.filter((file) => file.mimeType === 'application/vnd.google-apps.folder')
    expect(childFolders).toEqual([expect.objectContaining({ name: 'Integration Test World (00000000)' })])
    await expect(
      createGoogleDriveWorldFolder(rootFolderId, context.worldId, context.world.serverConfig.name)
    ).resolves.toMatchObject({ folderId: context.world.googleDrive?.folderId })
    await expect(createGoogleDriveStorageAdapter(context).readLatestSave()).resolves.toMatchObject({
      saveVersion: 1
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
