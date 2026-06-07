import type { LocalState, ServerConfig } from '../../shared/domain'
import { readJsonFile, writeJsonFile } from './json-file-store'
import { DEFAULT_LOCAL_STATE } from './storage-defaults'
import { StorageError } from './storage-error'
import { localStateFilePath } from './storage-paths'
import { isLocalState, isServerConfig } from './storage-validation'

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

export function readLocalState(): Promise<LocalState> {
  return readJsonFile(localStateFilePath, DEFAULT_LOCAL_STATE, isLocalState)
}

export function writeLocalState(localState: LocalState): Promise<void> {
  return writeJsonFile(localStateFilePath, localState, isLocalState)
}

export async function saveServerConfig(serverConfig: ServerConfig): Promise<LocalState> {
  if (!isServerConfig(serverConfig)) {
    throw new StorageError('Invalid server config payload.')
  }

  const localState = await readLocalState()
  const nextLocalState: LocalState = {
    ...localState,
    serverConfig
  }

  await writeLocalState(nextLocalState)

  return nextLocalState
}
