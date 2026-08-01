import type { StorageAdapter } from '../adapters/storage-adapter.model'
import { getActiveStorageAdapter } from '../adapters/storage-adapter-service'
import { readOrCreateSelectedWorld } from '../persistence/local-state-store'
import { createWorldContext, getSelectedWorldContext, type WorldContext } from './world-context'

export interface WorldOperationContext extends WorldContext {
  storageAdapter: StorageAdapter
}

export async function getSelectedWorldOperationContext(): Promise<WorldOperationContext> {
  const worldContext = await getSelectedWorldContext()

  return createWorldOperationContext(worldContext)
}

export async function getOrCreateSelectedWorldOperationContext(): Promise<WorldOperationContext> {
  return createWorldOperationContext(createWorldContext(await readOrCreateSelectedWorld()))
}

async function createWorldOperationContext(worldContext: WorldContext): Promise<WorldOperationContext> {
  return {
    ...worldContext,
    storageAdapter: await getActiveStorageAdapter(worldContext)
  }
}
