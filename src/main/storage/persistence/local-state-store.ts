import { randomUUID } from 'crypto'
import type { CloudStorageSettings } from '../../../shared/cloud-storage.model'
import type { LocalState, Player, ServerConfig, ServerSetupState } from '../../../shared/domain'
import type { AppState, LocalWorldState, WorldId } from '../../../shared/world'
import {
  DEFAULT_APP_STATE,
  DEFAULT_LOCAL_STATE,
  createDefaultLocalWorldState
} from '../core/support/storage-defaults'
import { StorageError } from '../core/support/storage-error'
import { localStateFilePath } from '../core/support/storage-paths'
import { isAppState, isCloudStorageSettings, isServerConfig } from '../core/support/storage-validation'
import { readOrCreateJsonFile, writeJsonFile } from './json-file-store'

type WorldStateChanges = Partial<
  Pick<LocalWorldState, 'activeSessionId' | 'dirty' | 'localSaveVersion' | 'serverConfig' | 'serverSetup'>
>

export interface LocalStateSnapshot {
  localState: LocalState
  paths: {
    localStateFile: string
  }
}

export async function readAppState(): Promise<AppState> {
  return readOrCreateJsonFile(localStateFilePath, DEFAULT_APP_STATE, isAppState)
}

export function writeAppState(appState: AppState): Promise<void> {
  return writeJsonFile(localStateFilePath, appState, isAppState)
}

export async function readLocalStateSnapshot(): Promise<LocalStateSnapshot> {
  return {
    localState: await readLocalState(),
    paths: {
      localStateFile: localStateFilePath
    }
  }
}

export async function readLocalState(): Promise<LocalState> {
  const appState = await readAppState()
  const world = getSelectedWorld(appState)

  return toLocalState(appState.player, world)
}

export async function readWorldLocalState(worldId: WorldId): Promise<LocalState> {
  const appState = await readAppState()

  return toLocalState(appState.player, getWorld(appState, worldId))
}

export async function writeLocalState(localState: LocalState): Promise<void> {
  const appState = await readAppState()
  const world = getSelectedWorld(appState) ?? createDefaultLocalWorldState(randomUUID())
  const nextWorld = applyLocalState(world, localState)
  const worlds = appState.worlds.some(({ id }) => id === world.id)
    ? appState.worlds.map((currentWorld) => (currentWorld.id === world.id ? nextWorld : currentWorld))
    : [...appState.worlds, nextWorld]

  await writeAppState({
    ...appState,
    player: localState.player,
    selectedWorldId: world.id,
    worlds
  })
}

export async function createWorld(
  worldId: WorldId = randomUUID(),
  createdAt = new Date().toISOString()
): Promise<LocalWorldState> {
  const appState = await readAppState()

  if (appState.worlds.some(({ id }) => id === worldId)) {
    throw new StorageError(`World ${worldId} already exists.`)
  }

  const world = createDefaultLocalWorldState(worldId, createdAt)
  await writeAppState({
    ...appState,
    selectedWorldId: worldId,
    worlds: [...appState.worlds, world]
  })

  return world
}

export async function readOrCreateSelectedWorld(): Promise<LocalWorldState> {
  const appState = await readAppState()
  const selectedWorld = getSelectedWorld(appState)

  if (selectedWorld) {
    return selectedWorld
  }

  const world = createDefaultLocalWorldState(randomUUID())
  await writeAppState({
    ...appState,
    selectedWorldId: world.id,
    worlds: [...appState.worlds, world]
  })

  return world
}

export async function selectWorld(worldId: WorldId): Promise<LocalWorldState> {
  const appState = await readAppState()
  const world = getWorld(appState, worldId)

  await writeAppState({ ...appState, selectedWorldId: worldId })

  return world
}

export async function readWorld(worldId: WorldId): Promise<LocalWorldState> {
  return getWorld(await readAppState(), worldId)
}

export async function updateWorld(
  worldId: WorldId,
  update: (world: LocalWorldState) => LocalWorldState
): Promise<LocalWorldState> {
  const appState = await readAppState()
  const world = getWorld(appState, worldId)
  const nextWorld = update(world)

  if (nextWorld.id !== worldId) {
    throw new StorageError('A world update cannot change its ID.')
  }

  await writeAppState({
    ...appState,
    worlds: appState.worlds.map((currentWorld) => (currentWorld.id === worldId ? nextWorld : currentWorld))
  })

  return nextWorld
}

export async function deleteWorld(worldId: WorldId): Promise<void> {
  const appState = await readAppState()
  getWorld(appState, worldId)
  const worlds = appState.worlds.filter((world) => world.id !== worldId)

  await writeAppState({
    ...appState,
    selectedWorldId:
      appState.selectedWorldId === worldId ? (worlds[0]?.id ?? null) : appState.selectedWorldId,
    worlds
  })
}

export function saveWorldServerSetupState(
  worldId: WorldId,
  serverSetup: ServerSetupState
): Promise<LocalState> {
  return saveWorldChanges(worldId, { serverSetup })
}

export async function saveServerConfig(serverConfig: ServerConfig): Promise<LocalState> {
  if (!isServerConfig(serverConfig)) {
    throw new StorageError('Invalid server config payload.')
  }

  // TODO(multiple-worlds/catalog-ui): Update server settings by explicit world ID.
  return saveSelectedWorldChanges({ serverConfig })
}

export async function saveWorldServerSetupResult(
  worldId: WorldId,
  serverConfig: ServerConfig,
  serverSetup: ServerSetupState
): Promise<LocalState> {
  if (!isServerConfig(serverConfig)) {
    throw new StorageError('Invalid server config payload.')
  }

  return saveWorldChanges(worldId, {
    activeSessionId: null,
    dirty: false,
    localSaveVersion: null,
    serverConfig,
    serverSetup
  })
}

export async function saveWorldRestoredServerSetupResult(
  worldId: WorldId,
  serverConfig: ServerConfig,
  serverSetup: ServerSetupState
): Promise<LocalState> {
  if (!isServerConfig(serverConfig)) {
    throw new StorageError('Invalid server config payload.')
  }

  return saveWorldChanges(worldId, {
    activeSessionId: null,
    dirty: false,
    serverConfig,
    serverSetup
  })
}

export function saveLocalSaveVersion(localSaveVersion: number | null): Promise<LocalState> {
  // TODO(multiple-worlds/provider-reconciliation): Pass the reconciled world ID explicitly.
  return saveSelectedWorldChanges({ localSaveVersion })
}

export function saveWorldLocalSaveVersion(
  worldId: WorldId,
  localSaveVersion: number | null
): Promise<LocalState> {
  return saveWorldChanges(worldId, { localSaveVersion })
}

export function saveWorldActiveSessionId(
  worldId: WorldId,
  activeSessionId: string | null
): Promise<LocalState> {
  return saveWorldChanges(worldId, { activeSessionId })
}

export async function savePlayer(player: Player): Promise<LocalState> {
  const appState = await readAppState()
  await writeAppState({ ...appState, player })

  return toLocalState(player, getSelectedWorld(appState))
}

export async function clearPlayer(): Promise<LocalState> {
  const appState = await readAppState()
  await writeAppState({ ...appState, player: null })

  return toLocalState(null, getSelectedWorld(appState))
}

export async function resetConfiguredServer(): Promise<LocalState> {
  const appState = await readAppState()
  const selectedWorld = getSelectedWorld(appState)

  if (!selectedWorld) {
    return toLocalState(appState.player, null)
  }

  await deleteWorld(selectedWorld.id)

  return readLocalState()
}

export async function readCloudStorageSettings(): Promise<CloudStorageSettings> {
  const appState = await readAppState()
  const world = getSelectedWorld(appState)

  return {
    activeProvider: appState.activeProvider,
    googleDrive: {
      ...appState.googleDrive,
      folder: world?.googleDrive ?? null
    }
  }
}

export async function writeCloudStorageSettings(settings: CloudStorageSettings): Promise<void> {
  if (!isCloudStorageSettings(settings)) {
    throw new StorageError('Invalid cloud storage settings payload.')
  }

  const appState = await readAppState()
  const selectedWorld = getSelectedWorld(appState)
  const nextWorld = selectedWorld
    ? {
        ...selectedWorld,
        googleDrive: settings.googleDrive.folder
      }
    : null

  await writeAppState({
    ...appState,
    activeProvider: settings.activeProvider,
    googleDrive: {
      status: settings.googleDrive.status,
      errorMessage: settings.googleDrive.errorMessage
    },
    worlds: nextWorld
      ? appState.worlds.map((world) => (world.id === nextWorld.id ? nextWorld : world))
      : appState.worlds
  })
}

async function saveSelectedWorldChanges(changes: WorldStateChanges): Promise<LocalState> {
  let appState = await readAppState()
  let world = getSelectedWorld(appState)

  if (!world) {
    world = createDefaultLocalWorldState(randomUUID())
    appState = {
      ...appState,
      selectedWorldId: world.id,
      worlds: [...appState.worlds, world]
    }
  }

  const nextWorld = { ...world, ...changes }
  await writeAppState({
    ...appState,
    worlds: appState.worlds.map((currentWorld) =>
      currentWorld.id === nextWorld.id ? nextWorld : currentWorld
    )
  })

  return toLocalState(appState.player, nextWorld)
}

async function saveWorldChanges(worldId: WorldId, changes: WorldStateChanges): Promise<LocalState> {
  const appState = await readAppState()
  const world = getWorld(appState, worldId)
  const nextWorld = { ...world, ...changes }

  await writeAppState({
    ...appState,
    worlds: appState.worlds.map((currentWorld) => (currentWorld.id === worldId ? nextWorld : currentWorld))
  })

  return toLocalState(appState.player, nextWorld)
}

function getSelectedWorld(appState: AppState): LocalWorldState | null {
  if (!appState.selectedWorldId) {
    return null
  }

  return appState.worlds.find(({ id }) => id === appState.selectedWorldId) ?? null
}

function getWorld(appState: AppState, worldId: WorldId): LocalWorldState {
  const world = appState.worlds.find(({ id }) => id === worldId)

  if (!world) {
    throw new StorageError(`World ${worldId} was not found.`)
  }

  return world
}

function toLocalState(player: Player | null, world: LocalWorldState | null): LocalState {
  if (!world) {
    return { ...DEFAULT_LOCAL_STATE, player }
  }

  return {
    player,
    serverConfig: world.serverConfig,
    javaConfig: world.javaConfig,
    serverSetup: world.serverSetup,
    localSaveVersion: world.localSaveVersion,
    activeSessionId: world.activeSessionId,
    dirty: world.dirty
  }
}

function applyLocalState(world: LocalWorldState, localState: LocalState): LocalWorldState {
  return {
    ...world,
    serverConfig: localState.serverConfig,
    javaConfig: localState.javaConfig,
    serverSetup: localState.serverSetup,
    localSaveVersion: localState.localSaveVersion,
    activeSessionId: localState.activeSessionId,
    dirty: localState.dirty
  }
}
