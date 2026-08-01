import { CloudStorageProvider, GoogleDriveSetupStatus } from '../../../shared/cloud-storage.model'
import { createGoogleDriveWorldFolder } from '../../cloud-storage/google-drive-service'
import type { WorldContext } from '../core/world-context'
import { createWorldContext, getSelectedWorldContext } from '../core/world-context'
import { StorageError } from '../core/support/storage-error'
import { readAppState, saveWorldGoogleDriveState } from '../persistence/local-state-store'
import { createGoogleDriveStorageAdapter } from './google-drive-storage-adapter'
import { createLocalStorageAdapter } from './local-storage-adapter'
import type { StorageAdapter } from './storage-adapter.model'

export async function getActiveStorageAdapter(context?: WorldContext): Promise<StorageAdapter> {
  const [appState, resolvedContext] = await Promise.all([
    readAppState(),
    context ? Promise.resolve(context) : getSelectedWorldContext()
  ])

  return getStorageAdapterForProvider(appState.activeProvider, resolvedContext)
}

export async function getOrCreateStorageContext(
  provider: CloudStorageProvider,
  context: WorldContext
): Promise<{ storageAdapter: StorageAdapter; worldContext: WorldContext }> {
  const appState = await readAppState()

  if (provider !== CloudStorageProvider.GoogleDrive || context.world.googleDrive) {
    return {
      storageAdapter: await getStorageAdapterForProvider(provider, context),
      worldContext: context
    }
  }

  if (appState.googleDrive.status !== GoogleDriveSetupStatus.Valid) {
    throw new StorageError('Google Drive storage is selected, but Google Drive is not configured or valid.')
  }

  const googleDrive = await createGoogleDriveWorldFolder(context.worldId)
  const world = await saveWorldGoogleDriveState(context.worldId, googleDrive)
  const worldContext = createWorldContext(world)

  return {
    storageAdapter: createGoogleDriveStorageAdapter(worldContext),
    worldContext
  }
}

export async function getStorageAdapterForProvider(
  provider: CloudStorageProvider,
  context?: WorldContext
): Promise<StorageAdapter> {
  const resolvedContext = context ?? (await getSelectedWorldContext())

  if (provider === CloudStorageProvider.Local) {
    return createLocalStorageAdapter(resolvedContext)
  }

  const appState = await readAppState()

  if (appState.googleDrive.status !== GoogleDriveSetupStatus.Valid || !resolvedContext.world.googleDrive) {
    throw new StorageError(
      'Google Drive storage is selected, but the Drive folder is not configured or valid.'
    )
  }

  return createGoogleDriveStorageAdapter(resolvedContext)
}
