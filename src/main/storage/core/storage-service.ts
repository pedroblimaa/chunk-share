import { CloudStorageProvider, GoogleDriveSetupStatus } from '../../../shared/cloud-storage.model'
import { ServerLockStatus, type ServerConfig, type ServerStorageSnapshot } from '../../../shared/domain'
import { isServerActiveStatus } from '../../../shared/server-runtime'
import { getServerRuntimeSnapshot } from '../../server-runtime/server-runtime-service'
import { getServerSyncSnapshot } from '../../server-sync/server-sync-service'
import { deleteGoogleDriveWorldFilesIfOwned } from '../adapters/google-drive-storage-adapter'
import { createLocalStorageAdapter } from '../adapters/local-storage-adapter'
import { getActiveStorageAdapter, getStorageAdapterForProvider } from '../adapters/storage-adapter-service'
import { deleteWorld, readAppState, saveServerConfig, writeAppState } from '../persistence/local-state-store'
import { backupServerFolder } from '../server-save/server-folder-backup'
import { StorageError } from './support/storage-error'
import { localServerFolderPath } from './support/storage-paths'
import { createWorldContext, type WorldContext } from './world-context'

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
  const appState = await readAppState()
  const world = appState.worlds.find(({ id }) => id === appState.selectedWorldId)

  if (!world) {
    throw new StorageError('No world is selected.')
  }

  const context = createWorldContext(world)
  const ownerAccountId = world.googleDrive?.ownerAccountId
  const deletesGoogleDriveWorld =
    appState.activeProvider === CloudStorageProvider.GoogleDrive &&
    Boolean(ownerAccountId) &&
    ownerAccountId === appState.player?.id

  await assertServerCanBeRemoved(
    appState.activeProvider,
    appState.activeProvider === CloudStorageProvider.Local || deletesGoogleDriveWorld,
    context
  )

  await backupServerFolder(localServerFolderPath, world.serverConfig.name)
  await removeStoredServer(appState.activeProvider, deletesGoogleDriveWorld, context)
  await deleteWorld(context.worldId)

  return getStorageSnapshot()
}

async function assertServerCanBeRemoved(
  activeProvider: CloudStorageProvider,
  requiresUnlockedStorage: boolean,
  context: WorldContext
): Promise<void> {
  if (isServerActiveStatus(getServerRuntimeSnapshot().status)) {
    throw new StorageError('Cannot remove this server while it is running.')
  }

  if (!requiresUnlockedStorage) {
    return
  }

  const storageAdapter = await getStorageAdapterForProvider(activeProvider, context)
  const serverLock = await storageAdapter.readServerLock()

  if (serverLock.status === ServerLockStatus.Locked) {
    throw new StorageError(
      `Cannot remove this server while ${serverLock.lockedBy.displayName} is hosting it.`
    )
  }
}

async function removeStoredServer(
  activeProvider: CloudStorageProvider,
  deletesGoogleDriveWorld: boolean,
  context: WorldContext
): Promise<void> {
  const localStorageAdapter = createLocalStorageAdapter(context)

  if (activeProvider === CloudStorageProvider.Local) {
    await localStorageAdapter.resetServerSaves()
    return
  }

  if (deletesGoogleDriveWorld) {
    await deleteGoogleDriveWorldFilesIfOwned(context)
  }

  await localStorageAdapter.resetServerSaves()
  const appState = await readAppState()
  await writeAppState({
    ...appState,
    activeProvider: CloudStorageProvider.Local,
    googleDrive: {
      status: GoogleDriveSetupStatus.NotConfigured,
      errorMessage: null
    }
  })
}
