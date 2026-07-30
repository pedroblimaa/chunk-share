import { CloudStorageProvider, GoogleDriveSetupStatus } from '../../../shared/cloud-storage.model'
import type { WorldContext } from '../core/world-context'
import { getSelectedWorldContext } from '../core/world-context'
import { StorageError } from '../core/support/storage-error'
import { readAppState } from '../persistence/local-state-store'
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
