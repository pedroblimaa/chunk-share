import { join } from 'path'

const PROJECT_ROOT = process.cwd()
const MOCK_CLOUD_FOLDER_NAME = process.env.CHUNK_SHARE_MOCK_CLOUD_FOLDER ?? '.mock-cloud'
const LOCAL_STATE_FILE_NAME = process.env.CHUNK_SHARE_LOCAL_STATE_FILE ?? 'localState.json'

export const mockCloudFolderPath = join(PROJECT_ROOT, MOCK_CLOUD_FOLDER_NAME)
export const mockCloudVersionsFolderPath = join(mockCloudFolderPath, 'versions')
export const latestWorldFilePath = join(mockCloudFolderPath, 'latest.json')
export const serverLockFilePath = join(mockCloudFolderPath, 'lock.json')
export const localStateFilePath = join(PROJECT_ROOT, LOCAL_STATE_FILE_NAME)
