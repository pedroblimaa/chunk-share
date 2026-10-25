import { join, resolve } from 'path'
import type { WorldId } from '../../../../shared/world'
import { isWorldId } from '../../../../shared/world'
import { StorageError } from './storage-error'

const DATA_ROOT = resolve(process.env.CHUNK_SHARE_DATA_ROOT ?? process.cwd())
const LOCAL_STORAGE_FOLDER_NAME = '.storage'
const SERVERS_FOLDER_NAME = '.servers'
const SERVER_BACKUPS_FOLDER_NAME = '.backups'
const LOCAL_STATE_FILE_NAME = 'localState.json'
const MINECRAFT_VERSION_PATTERN = /^[\w.-]+$/

const localStorageFolderPath = join(DATA_ROOT, LOCAL_STORAGE_FOLDER_NAME)
export const localStateFilePath = join(DATA_ROOT, LOCAL_STATE_FILE_NAME)
const worldServersRootPath = join(DATA_ROOT, SERVERS_FOLDER_NAME)
const worldStorageRootPath = localStorageFolderPath
const worldBackupsRootPath = join(DATA_ROOT, SERVER_BACKUPS_FOLDER_NAME)

export interface WorldPaths {
  serverFolder: string
  serverWorldFolder: string
  serverModsFolder: string
  serverConfigFolder: string
  fabricBaselineFile: string
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
    ...getServerFilePaths(serverFolder),
    storageFolder,
    storageControlFile: join(storageFolder, 'control.json'),
    storageWorldFile: join(storageFolder, 'world.zip'),
    backupsFolder: join(worldBackupsRootPath, worldId)
  }
}

export function getFabricGameJarFile(serverFolder: string, minecraftVersion: string): string {
  if (!MINECRAFT_VERSION_PATTERN.test(minecraftVersion)) {
    throw new StorageError('Invalid Minecraft version.')
  }

  return join(serverFolder, '.fabric', 'server', `${minecraftVersion}-server.jar`)
}

export function getServerFilePaths(
  serverFolder: string
): Pick<
  WorldPaths,
  | 'serverFolder'
  | 'serverWorldFolder'
  | 'serverJarFile'
  | 'serverModsFolder'
  | 'serverConfigFolder'
  | 'fabricBaselineFile'
  | 'serverPropertiesFile'
  | 'serverEulaFile'
> {
  return {
    serverFolder,
    serverWorldFolder: join(serverFolder, 'world'),
    serverModsFolder: join(serverFolder, 'mods'),
    serverConfigFolder: join(serverFolder, 'config'),
    fabricBaselineFile: join(serverFolder, '.fabric-baseline.json'),
    serverJarFile: join(serverFolder, 'server.jar'),
    serverPropertiesFile: join(serverFolder, 'server.properties'),
    serverEulaFile: join(serverFolder, 'eula.txt')
  }
}
