import { rm } from 'fs/promises'
import { join, resolve } from 'path'

const TEST_DATA_FOLDER = join('.test-data', String(process.pid))

export const integrationTestDataPath = resolve(TEST_DATA_FOLDER)

export function configureIntegrationTestStorage(): void {
  process.env.CHUNK_SHARE_LOCAL_STORAGE_FOLDER = join(TEST_DATA_FOLDER, 'storage')
  process.env.CHUNK_SHARE_SERVER_FOLDER = join(TEST_DATA_FOLDER, 'server')
  process.env.CHUNK_SHARE_SERVER_BACKUPS_FOLDER = join(TEST_DATA_FOLDER, 'backups')
  process.env.CHUNK_SHARE_LOCAL_STATE_FILE = join(TEST_DATA_FOLDER, 'localState.json')
  process.env.CHUNK_SHARE_CLOUD_STORAGE_SETTINGS_FILE = join(TEST_DATA_FOLDER, 'cloudStorageSettings.json')
}

export function cleanIntegrationTestStorage(): Promise<void> {
  return rm(integrationTestDataPath, { force: true, recursive: true })
}
