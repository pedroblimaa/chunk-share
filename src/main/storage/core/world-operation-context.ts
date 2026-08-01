import type { StorageAdapter } from '../adapters/storage-adapter.model'
import { getActiveStorageAdapter, getOrCreateStorageContext } from '../adapters/storage-adapter-service'
import { createWorld, readAppState, readOrCreateSelectedWorld } from '../persistence/local-state-store'
import { createWorldContext, getSelectedWorldContext, type WorldContext } from './world-context'

export interface WorldOperationContext extends WorldContext {
  storageAdapter: StorageAdapter
}

export async function getSelectedWorldOperationContext(): Promise<WorldOperationContext> {
  const worldContext = await getSelectedWorldContext()

  return resolveWorldOperationContext(worldContext)
}

export async function getOrCreateSelectedWorldOperationContext(): Promise<WorldOperationContext> {
  return resolvePublishingWorldOperationContext(createWorldContext(await readOrCreateSelectedWorld()))
}

export async function createNewWorldOperationContext(): Promise<WorldOperationContext> {
  return resolvePublishingWorldOperationContext(createWorldContext(await createWorld()))
}

export async function resolvePublishingWorldOperationContext(
  worldContext: WorldContext
): Promise<WorldOperationContext> {
  const appState = await readAppState()
  const resolved = await getOrCreateStorageContext(appState.activeProvider, worldContext)

  return {
    ...resolved.worldContext,
    storageAdapter: resolved.storageAdapter
  }
}

async function resolveWorldOperationContext(worldContext: WorldContext): Promise<WorldOperationContext> {
  return {
    ...worldContext,
    storageAdapter: await getActiveStorageAdapter(worldContext)
  }
}
