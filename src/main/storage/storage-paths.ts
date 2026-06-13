import { join } from 'path'

const PROJECT_ROOT = process.cwd()
const MOCK_CLOUD_FOLDER_NAME = process.env.CHUNK_SHARE_MOCK_CLOUD_FOLDER ?? '.mock-cloud'
const SERVER_FOLDER_NAME = process.env.CHUNK_SHARE_SERVER_FOLDER ?? '.chunkshare-server'
const SERVER_BACKUPS_FOLDER_NAME =
  process.env.CHUNK_SHARE_SERVER_BACKUPS_FOLDER ?? '.chunkshare-backups'
const LOCAL_STATE_FILE_NAME = process.env.CHUNK_SHARE_LOCAL_STATE_FILE ?? 'localState.json'

export const mockCloudFolderPath = join(PROJECT_ROOT, MOCK_CLOUD_FOLDER_NAME)
export const mockCloudVersionsFolderPath = join(mockCloudFolderPath, 'versions')
export const latestSaveFilePath = join(mockCloudFolderPath, 'latest.json')
export const serverLockFilePath = join(mockCloudFolderPath, 'lock.json')
export const managedServerFolderPath = join(PROJECT_ROOT, SERVER_FOLDER_NAME)
export const managedServerBackupsFolderPath = join(PROJECT_ROOT, SERVER_BACKUPS_FOLDER_NAME)
export const managedServerJarFilePath = join(managedServerFolderPath, 'server.jar')
export const managedServerPropertiesFilePath = join(managedServerFolderPath, 'server.properties')
export const managedServerEulaFilePath = join(managedServerFolderPath, 'eula.txt')
export const localStateFilePath = join(PROJECT_ROOT, LOCAL_STATE_FILE_NAME)
