import type { LocalWorldState, WorldId } from '../../../shared/world'
import { readAppState } from '../persistence/local-state-store'
import { StorageError } from './support/storage-error'
import { getWorldPaths, type WorldPaths } from './support/storage-paths'

export interface WorldContext {
  worldId: WorldId
  world: LocalWorldState
  paths: WorldPaths
}

export function createWorldContext(world: LocalWorldState): WorldContext {
  return {
    worldId: world.id,
    world,
    paths: getWorldPaths(world.id)
  }
}

export async function getWorldContext(worldId: WorldId): Promise<WorldContext> {
  const appState = await readAppState()
  const world = appState.worlds.find(({ id }) => id === worldId)

  if (!world) {
    throw new StorageError(`World ${worldId} was not found.`)
  }

  return createWorldContext(world)
}

export async function getSelectedWorldContext(): Promise<WorldContext> {
  const appState = await readAppState()

  if (!appState.selectedWorldId) {
    throw new StorageError('No world is selected.')
  }

  const world = appState.worlds.find(({ id }) => id === appState.selectedWorldId)

  if (!world) {
    throw new StorageError(`Selected world ${appState.selectedWorldId} was not found.`)
  }

  return createWorldContext(world)
}
