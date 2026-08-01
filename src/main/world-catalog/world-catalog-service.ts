import { stat } from 'fs/promises'
import { CloudStorageProvider, GoogleDriveSetupStatus } from '../../shared/cloud-storage.model'
import type { ServerStorageSnapshot } from '../../shared/domain'
import type { AppState, LocalWorldState } from '../../shared/world'
import { getServerSyncSnapshot } from '../server-sync/server-sync-service'
import { getStorageAdapterForProvider } from '../storage/adapters/storage-adapter-service'
import { StorageError } from '../storage/core/support/storage-error'
import { createWorldContext, type WorldContext } from '../storage/core/world-context'
import type { WorldOperationContext } from '../storage/core/world-operation-context'

export type WorldProviderStatus = 'available' | 'error' | 'missing'

export interface WorldCatalogInspection {
  error: StorageError | null
  isInstalled: boolean
  providerStatus: WorldProviderStatus
  storageSnapshot: ServerStorageSnapshot | null
  world: LocalWorldState
}

export async function inspectWorldCatalog(appState: AppState): Promise<WorldCatalogInspection[]> {
  return Promise.all(appState.worlds.map((world) => inspectWorld(appState, world)))
}

export function isWorldCatalogEntryVisible(inspection: WorldCatalogInspection): boolean {
  return inspection.isInstalled || inspection.providerStatus !== 'missing'
}

async function inspectWorld(appState: AppState, world: LocalWorldState): Promise<WorldCatalogInspection> {
  const context = createWorldContext(world)
  const isInstalled = await isWorldInstalled(context)

  if (!worldHasStorageProviderConfiguration(appState, world, appState.activeProvider)) {
    return createInspection(world, isInstalled, 'missing')
  }

  try {
    const operationContext: WorldOperationContext = {
      ...context,
      storageAdapter: await getStorageAdapterForProvider(appState.activeProvider, context)
    }
    const storageSnapshot = await getServerSyncSnapshot(operationContext)

    return {
      error: null,
      isInstalled,
      providerStatus: storageSnapshot.latestSave ? 'available' : 'missing',
      storageSnapshot,
      world
    }
  } catch (error) {
    if (!(error instanceof StorageError)) {
      throw error
    }

    return {
      error,
      isInstalled,
      providerStatus: 'error',
      storageSnapshot: null,
      world
    }
  }
}

function createInspection(
  world: LocalWorldState,
  isInstalled: boolean,
  providerStatus: WorldProviderStatus
): WorldCatalogInspection {
  return {
    error: null,
    isInstalled,
    providerStatus,
    storageSnapshot: null,
    world
  }
}

export function worldHasStorageProviderConfiguration(
  appState: AppState,
  world: LocalWorldState,
  provider: CloudStorageProvider
): boolean {
  if (provider === CloudStorageProvider.Local) {
    return true
  }

  return appState.googleDrive.status === GoogleDriveSetupStatus.Valid && world.googleDrive !== null
}

async function isWorldInstalled(context: WorldContext): Promise<boolean> {
  if (context.world.serverSetup.status !== 'ready') {
    return false
  }

  try {
    return (await stat(context.paths.serverFolder)).isDirectory()
  } catch (error) {
    if (isMissingPathError(error)) {
      return false
    }

    throw error
  }
}

function isMissingPathError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
