import { join, resolve } from 'path'
import type { WorldId } from '../../../../shared/world'
import { isWorldId } from '../../../../shared/world'
import { StorageError } from './storage-error'

const DATA_ROOT = resolve(process.env.CHUNK_SHARE_DATA_ROOT ?? process.cwd())
const LOCAL_STORAGE_FOLDER_NAME = '.storage'
const SERVERS_FOLDER_NAME = '.servers'
const SERVER_BACKUPS_FOLDER_NAME = '.backups'
const LOCAL_STATE_FILE_NAME = 'localState.json'

const localStorageFolderPath = join(DATA_ROOT, LOCAL_STORAGE_FOLDER_NAME)
export const localStateFilePath = join(DATA_ROOT, LOCAL_STATE_FILE_NAME)
const worldServersRootPath = join(DATA_ROOT, SERVERS_FOLDER_NAME)
const worldStorageRootPath = localStorageFolderPath
const worldBackupsRootPath = join(DATA_ROOT, SERVER_BACKUPS_FOLDER_NAME)

export interface WorldPaths {
  serverFolder: string
  serverWorldFolder: string
  serverJarFile: string
  serverPropertiesFile: string
  serverEulaFile: string
  storageFolder: string
  storageControlFile: string
  storageWorldFile: string
  backupsFolder: string
}

export function getWorldPaths(worldId: WorldId): WorldPaths {
  if (!isWorldId(worldId)) {
    throw new StorageError('Invalid world ID.')
  }

  const serverFolder = join(worldServersRootPath, worldId)
  const storageFolder = join(worldStorageRootPath, worldId)

  return {
    serverFolder,
    serverWorldFolder: join(serverFolder, 'world'),
    serverJarFile: join(serverFolder, 'server.jar'),
    serverPropertiesFile: join(serverFolder, 'server.properties'),
    serverEulaFile: join(serverFolder, 'eula.txt'),
    storageFolder,
    storageControlFile: join(storageFolder, 'control.json'),
    storageWorldFile: join(storageFolder, 'world.zip'),
    backupsFolder: join(worldBackupsRootPath, worldId)
  }
}
