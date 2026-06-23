import { join } from 'path'

const PROJECT_ROOT = process.cwd()
const LOCAL_STORAGE_FOLDER_NAME = process.env.CHUNK_SHARE_LOCAL_STORAGE_FOLDER ?? '.storage'
const SERVER_FOLDER_NAME = process.env.CHUNK_SHARE_SERVER_FOLDER ?? '.server'
const SERVER_BACKUPS_FOLDER_NAME = process.env.CHUNK_SHARE_SERVER_BACKUPS_FOLDER ?? '.backups'
const LOCAL_STATE_FILE_NAME = process.env.CHUNK_SHARE_LOCAL_STATE_FILE ?? 'localState.json'
const CLOUD_STORAGE_SETTINGS_FILE_NAME =
  process.env.CHUNK_SHARE_CLOUD_STORAGE_SETTINGS_FILE ?? 'cloudStorageSettings.json'

export const localStorageFolderPath = join(PROJECT_ROOT, LOCAL_STORAGE_FOLDER_NAME)
export const localStorageVersionsFolderPath = join(localStorageFolderPath, 'versions')
export const latestSaveFilePath = join(localStorageFolderPath, 'latest.json')
export const serverLockFilePath = join(localStorageFolderPath, 'lock.json')
export const localServerFolderPath = join(PROJECT_ROOT, SERVER_FOLDER_NAME)
export const localServerBackupsFolderPath = join(PROJECT_ROOT, SERVER_BACKUPS_FOLDER_NAME)
export const localServerJarFilePath = join(localServerFolderPath, 'server.jar')
export const localServerPropertiesFilePath = join(localServerFolderPath, 'server.properties')
export const localServerEulaFilePath = join(localServerFolderPath, 'eula.txt')
export const localStateFilePath = join(PROJECT_ROOT, LOCAL_STATE_FILE_NAME)
export const cloudStorageSettingsFilePath = join(PROJECT_ROOT, CLOUD_STORAGE_SETTINGS_FILE_NAME)
