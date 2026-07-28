import {
  CloudStorageProvider,
  GoogleDriveSetupStatus,
  type CloudStorageSettings
} from '../../../shared/cloud-storage.model'
import { ServerLockStatus, type ServerConfig, type ServerStorageSnapshot } from '../../../shared/domain'
import { isServerActiveStatus } from '../../../shared/server-runtime'
import { getServerRuntimeSnapshot } from '../../server-runtime/server-runtime-service'
import { getServerSyncSnapshot } from '../../server-sync/server-sync-service'
import { deleteGoogleDriveWorldFilesIfOwned } from '../adapters/google-drive-storage-adapter'
import { localStorageAdapter } from '../adapters/local-storage-adapter'
import { getActiveStorageAdapter } from '../adapters/storage-adapter-service'
import {
  readCloudStorageSettings,
  writeCloudStorageSettings
} from '../persistence/cloud-storage-settings-store'
import { readLocalState, resetConfiguredServer, saveServerConfig } from '../persistence/local-state-store'
import { backupServerFolder } from '../server-save/server-folder-backup'
import { StorageError } from './support/storage-error'
import { localServerFolderPath } from './support/storage-paths'

export async function getStorageSnapshot(): Promise<ServerStorageSnapshot> {
  return getServerSyncSnapshot()
}

export async function updateServerConfig(serverConfig: ServerConfig): Promise<ServerStorageSnapshot> {
  await saveServerConfig(serverConfig)

  return getStorageSnapshot()
}

export async function resetServerLock(): Promise<ServerStorageSnapshot> {
  const storageAdapter = await getActiveStorageAdapter()

  await storageAdapter.resetServerLock()

  return getStorageSnapshot()
}

export async function deleteConfiguredServer(): Promise<ServerStorageSnapshot> {
  const [settings, localState] = await Promise.all([readCloudStorageSettings(), readLocalState()])
  const ownerAccountId = settings.googleDrive.folder?.ownerAccountId
  const deletesGoogleDriveWorld =
    settings.activeProvider === CloudStorageProvider.GoogleDrive &&
    Boolean(ownerAccountId) &&
    ownerAccountId === localState.player?.id

  await assertServerCanBeRemoved(
    settings.activeProvider === CloudStorageProvider.Local || deletesGoogleDriveWorld
  )

  await backupServerFolder(localServerFolderPath, localState.serverConfig.name)
  await removeStoredServer(settings, deletesGoogleDriveWorld)
  await resetConfiguredServer()

  return getStorageSnapshot()
}

async function assertServerCanBeRemoved(requiresUnlockedStorage: boolean): Promise<void> {
  if (isServerActiveStatus(getServerRuntimeSnapshot().status)) {
    throw new StorageError('Cannot remove this server while it is running.')
  }

  if (!requiresUnlockedStorage) {
    return
  }

  const { serverLock } = await getStorageSnapshot()

  if (serverLock.status === ServerLockStatus.Locked) {
    throw new StorageError(
      `Cannot remove this server while ${serverLock.lockedBy.displayName} is hosting it.`
    )
  }
}

async function removeStoredServer(
  settings: CloudStorageSettings,
  deletesGoogleDriveWorld: boolean
): Promise<void> {
  if (settings.activeProvider === CloudStorageProvider.Local) {
    await localStorageAdapter.resetServerSaves()
    return
  }

  if (deletesGoogleDriveWorld) {
    await deleteGoogleDriveWorldFilesIfOwned()
  }

  await localStorageAdapter.resetServerSaves()
  await writeCloudStorageSettings({
    ...settings,
    activeProvider: CloudStorageProvider.Local,
    googleDrive: {
      status: GoogleDriveSetupStatus.NotConfigured,
      folder: null,
      errorMessage: null
    }
  })
}
