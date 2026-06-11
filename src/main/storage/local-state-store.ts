import type { LocalState, ServerConfig, ServerSetupState } from '../../shared/domain'
import { readJsonFile, writeJsonFile } from './json-file-store'
import { DEFAULT_LOCAL_STATE, DEFAULT_SERVER_SETUP_STATE } from './storage-defaults'
import { StorageError } from './storage-error'
import { localStateFilePath } from './storage-paths'
import { isLegacyLocalState, isLocalState, isServerConfig } from './storage-validation'

type StoredLocalState = LocalState | Omit<LocalState, 'serverSetup'>
type LocalStateChanges = Partial<Pick<LocalState, 'serverConfig' | 'serverSetup'>>

export interface LocalStateSnapshot {
  localState: LocalState
  paths: {
    localStateFile: string
  }
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
  const localState = await readJsonFile<StoredLocalState>(
    localStateFilePath,
    DEFAULT_LOCAL_STATE,
    isStoredLocalState
  )

  if (isLocalState(localState)) {
    return localState
  }

  const migratedLocalState: LocalState = {
    ...localState,
    serverSetup: DEFAULT_SERVER_SETUP_STATE
  }

  await writeLocalState(migratedLocalState)

  return migratedLocalState
}

export function writeLocalState(localState: LocalState): Promise<void> {
  return writeJsonFile(localStateFilePath, localState, isLocalState)
}

export async function saveServerSetupState(serverSetup: ServerSetupState): Promise<LocalState> {
  return saveLocalStateChanges({ serverSetup })
}

export async function saveServerConfig(serverConfig: ServerConfig): Promise<LocalState> {
  if (!isServerConfig(serverConfig)) {
    throw new StorageError('Invalid server config payload.')
  }

  return saveLocalStateChanges({ serverConfig })
}

export async function saveServerSetupResult(
  serverConfig: ServerConfig,
  serverSetup: ServerSetupState
): Promise<LocalState> {
  if (!isServerConfig(serverConfig)) {
    throw new StorageError('Invalid server config payload.')
  }

  return saveLocalStateChanges({ serverConfig, serverSetup })
}

function isStoredLocalState(value: unknown): value is StoredLocalState {
  return isLocalState(value) || isLegacyLocalState(value)
}

async function saveLocalStateChanges(changes: LocalStateChanges): Promise<LocalState> {
  const localState = await readLocalState()
  const nextLocalState: LocalState = {
    ...localState,
    ...changes
  }

  await writeLocalState(nextLocalState)

  return nextLocalState
}
