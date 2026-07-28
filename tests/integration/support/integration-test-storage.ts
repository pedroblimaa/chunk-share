import { rm } from 'fs/promises'
import { join, resolve } from 'path'

const TEST_DATA_FOLDER = join('.test-data', String(process.pid))

export const integrationTestDataPath = resolve(TEST_DATA_FOLDER)

export function configureIntegrationTestStorage(): void {
  process.env.CHUNK_SHARE_DATA_ROOT = TEST_DATA_FOLDER
}

export function cleanIntegrationTestStorage(): Promise<void> {
  return rm(integrationTestDataPath, { force: true, recursive: true })
}
