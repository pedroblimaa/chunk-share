import type { LocalState, ServerConfig, ServerSetupState } from '../../shared/domain'
import { readJsonFile, writeJsonFile } from './json-file-store'
import {
  DEFAULT_LOCAL_STATE,
  DEFAULT_SERVER_CONFIG,
  DEFAULT_SERVER_SETUP_STATE
} from './storage-defaults'
import { StorageError } from './storage-error'
import { localStateFilePath } from './storage-paths'
import { isLocalState, isServerConfig } from './storage-validation'

type LocalStateChanges = Partial<
  Pick<
    LocalState,
    'activeSessionId' | 'dirty' | 'localSaveVersion' | 'serverConfig' | 'serverSetup'
  >
>

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
  return readJsonFile(localStateFilePath, DEFAULT_LOCAL_STATE, isLocalState)
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

export function saveLocalSaveVersion(localSaveVersion: number | null): Promise<LocalState> {
  return saveLocalStateChanges({ localSaveVersion })
}

export function resetConfiguredServer(): Promise<LocalState> {
  return saveLocalStateChanges({
    activeSessionId: null,
    dirty: false,
    localSaveVersion: null,
    serverConfig: DEFAULT_SERVER_CONFIG,
    serverSetup: DEFAULT_SERVER_SETUP_STATE
  })
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
