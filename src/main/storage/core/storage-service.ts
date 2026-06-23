import {
  ServerLockStatus,
  type ServerConfig,
  type ServerStorageSnapshot
} from '../../../shared/domain'
import { getServerSyncSnapshot } from '../../server-sync/server-sync-service'
import { getActiveStorageAdapter } from '../adapters/storage-adapter-service'
import { resetConfiguredServer, saveServerConfig } from '../persistence/local-state-store'
import { backupServerFolder } from '../server-save/server-folder-backup'
import { StorageError } from './storage-error'
import { localServerFolderPath } from './storage-paths'

export async function getStorageSnapshot(): Promise<ServerStorageSnapshot> {
  return getServerSyncSnapshot()
}

export async function updateServerConfig(
  serverConfig: ServerConfig
): Promise<ServerStorageSnapshot> {
  await saveServerConfig(serverConfig)

  return getStorageSnapshot()
}

export async function resetServerLock(): Promise<ServerStorageSnapshot> {
  const storageAdapter = await getActiveStorageAdapter()

  await storageAdapter.resetServerLock()

  return getStorageSnapshot()
}

export async function deleteConfiguredServer(): Promise<ServerStorageSnapshot> {
  const storageSnapshot = await getStorageSnapshot()
  const { localState, serverLock } = storageSnapshot

  if (serverLock.status === ServerLockStatus.Locked) {
    throw new StorageError(
      `Cannot delete this server while ${serverLock.lockedBy.displayName} is hosting it.`
    )
  }

  const serverFolderPath = localState.serverConfig.serverFolderPath ?? localServerFolderPath

  await backupServerFolder(serverFolderPath, localState.serverConfig.name)
  const storageAdapter = await getActiveStorageAdapter()

  await storageAdapter.resetServerSaves()
  await resetConfiguredServer()

  return getStorageSnapshot()
}
